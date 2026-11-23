import fs from 'node:fs'
import path from 'node:path'
import { ticketPaymentNumber } from '../../server/lib/eventTicketDelivery.js'

/** Owner report contains registration numbers and counts, never tokens or buyer contacts. */
export function auditEventTickets(root) {
  const file = path.join(root, 'data/event-leads.json')
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  if (!data || Array.isArray(data) || typeof data !== 'object') throw Error('invalid_event_storage')
  const relevant = Object.values(data).filter(l => l.kind === 'registration' && ['dzhazovyy-vecher-dlya-yuristov-2', 'yuridicheskaya-noch-dzhaza-2'].includes(l.eventSlug))
  const paid = relevant.filter(l => ['paid', 'attended'].includes(l.status))
  const counts = channel => Object.fromEntries(['sent', 'pending', 'retry', 'waiting', 'uncertain', 'sending', 'legacy_unknown'].map(state => [state, paid.filter(l => (l.ticketDelivery?.[channel]?.state ?? 'legacy_unknown') === state).length]))
  const accepted = new Set();let malformedJournalLines = 0
  const journal = path.join(root, 'data/prodamus-webhooks.jsonl')
  if (fs.existsSync(journal)) for (const line of fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean)) {
    try {
      const r = JSON.parse(line)
      if (r.verified === true && r.body?.payment_status === 'success' && !r.body.subscription) {
        const n = ticketPaymentNumber(r.body)
        if (n !== null) accepted.add(n)
      }
    } catch { malformedJournalLines++ }
  }
  return {
    registrations: relevant.length, paid: paid.length, email: counts('email'), telegram: counts('telegram'),
    paidWithoutDeliveryHistory: paid.filter(l => !l.ticketDelivery).map(l => l.number),
    paidDeliveryNeedsReview: paid.filter(l => ['uncertain', 'sending'].some(s => [l.ticketDelivery?.email?.state, l.ticketDelivery?.telegram?.state].includes(s))).map(l => l.number),
    signedPaymentNotCredited: relevant.filter(l => accepted.has(l.number) && !['paid', 'attended'].includes(l.status)).map(l => l.number),
    malformedJournalLines,
  }
}
