import crypto from 'node:crypto'
import fs from 'node:fs'
import { paidUntil, accessUntil } from './subscriptionAccess.js'
import { normalizePhone } from './jsonStore.js'
import { HmacHelper } from './hmac.js'

const HOUR = 3600000
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const date = value => {
  const s = String(value || '').trim()
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + '+03:00' : s)
}
const id = value => /^\d+$/.test(String(value || '')) ? String(value) : null
export const prodamusEventId = body => HmacHelper.create(body, 'subscription-event-id-v2')

export function createProdamusReplay({file, trustedFrom, isApplied, appliedKeys, apply, processing = () => false}) {
  let running = false
  return async () => {
    if (running || processing()) return false
    running = true
    try {
      let text
      try { text = fs.readFileSync(file, 'utf8') } catch (e) { if (e.code === 'ENOENT') return true; throw Error('payment_journal_unreadable') }
      const known = appliedKeys?.()
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let record
        try { record = JSON.parse(line) } catch { throw Error('payment_journal_unreadable') }
        if (!record.body?.subscription || !(record.verified === true || (trustedFrom > 0 && record.receivedAt >= trustedFrom))) continue
        if (!(Number(record.receivedAt) > 0)) continue
        const key = prodamusEventId(record.body)
        if (known ? known.has(key) : isApplied(key)) continue
        if (processing()) return false
        await apply(record.body, record.receivedAt)
        known?.add(key)
      }
      return true
    } finally { running = false }
  }
}

// Called only after the webhook signature has been checked by the API.
export function verifiedChargeFailure(join, body, now = Date.now()) {
  const sub = body.subscription || {}, dueAt = paidUntil(join), eventAt = date(body.date)
  if (!dueAt || (Number.isFinite(eventAt) && (eventAt < Number(join.lastPaidAt || 0) || eventAt < dueAt - HOUR))) return null
  const code = String(sub.error_code || body.error_code || '').toLowerCase()
  const error = [typeof sub.error === 'object' ? sub.error?.message : sub.error || body.error, code].filter(Boolean).join(' / ').slice(0, 300)
  const key = hash([sub.id, sub.profile_id, body.date, sub.current_attempt, sub.last_attempt, sub.date_next_payment, code, error])
  const previous = join.lastChargeFailure || {}
  if ((previous.seenKeys || []).includes(key)) return null
  const current = previous.dueAt === dueAt ? previous : {}
  const at = Number.isFinite(eventAt) ? eventAt : now
  const nextAttempt = date(sub.date_next_payment)
  const bound = Number.isFinite(eventAt) || (Number.isFinite(nextAttempt) && nextAttempt >= dueAt)
  const blocked = /card[_\s-]*temporary[_\s-]*blocked/i.test(code + ' ' + error)
  let blockedUntil = Number(current.blockedUntil) || 0
  if (blocked && (!blockedUntil || at >= blockedUntil)) blockedUntil = at + 72 * HOUR
  return { at: now, eventAt: at, dueAt, subscriptionId: id(sub.id), verified: true, periodBound: bound,
    attempt: Number(sub.current_attempt || body.attempt) || null, last: String(sub.last_attempt).toLowerCase() === 'yes',
    error, code, blockedUntil, eventKey: key, seenKeys: [...(previous.seenKeys || []), key].slice(-32) }
}

export function verifiedProviderState(join, body, now = Date.now()) {
  const sub = body.subscription || {}, dueAt = paidUntil(join)
  const flags = ['active', 'active_user', 'active_manager'].filter(k => sub[k] !== undefined && sub[k] !== '')
  if (!dueAt || !flags.length) return null
  const eventAt = date(body.date)
  if ((Number.isFinite(eventAt) ? eventAt : now) < Number(join.lastPaidAt || 0)) return null
  const key = hash([sub.id, sub.profile_id, body.date, sub.action_code, sub.active, sub.active_user, sub.active_manager, sub.date_next_payment])
  if ((join.billingProvider?.seenKeys || []).includes(key)) return null
  return { period: dueAt, planId: id(sub.id), inactive: flags.some(k => String(sub[k]) === '0'),
    verified: true, observedAt: now, eventAt: Number.isFinite(eventAt) ? eventAt : now,
    source: 'signed_webhook', seenKeys: [...(join.billingProvider?.seenKeys || []), key].slice(-32) }
}

export function expiryBillingDecision(join) {
  join ||= {}
  const period = paidUntil(join)
  const payments = [...(join.payments || [])].filter(p => !p.estimated && Number(p.amount) > 0).sort((a, b) => Number(b.at) - Number(a.at))
  const real = payments[0]
  const failure = join.lastChargeFailure
  const state = join.billingProvider
  const sameFailure = failure?.verified && failure.dueAt === period && failure.periodBound
  const sameState = state?.verified && state.period === period && state.observedAt >= Number(join.lastPaidAt || 0)
  const planId = id(real?.subscriptionId) || (sameState ? id(state.planId) : null) || (sameFailure ? id(failure.subscriptionId) : null)
  const plans = new Map()
  for (const payment of payments) if (id(payment.subscriptionId)) plans.set(String(payment.subscriptionId), Math.max(plans.get(String(payment.subscriptionId)) || 0, Number(payment.at) || 0))
  if (planId && !plans.has(planId)) plans.set(planId, Number(join.lastPaidAt) || 0)
  const closure = join.billingClosure
  const remaining = [...plans].filter(([plan, lastPayment]) => {
    const stopped = join.billingStops?.[plan]
    const stopAt = Math.max(Number(stopped?.confirmedAt) || 0, Number(join.cancellation?.confirmedAt) || 0, Number(closure?.confirmedAt) || 0)
    if (sameState && state.planId === plan && !state.inactive && state.observedAt > stopAt) return true
    if (sameState && state.planId === plan && state.inactive) return false
    if (stopped?.confirmedAt >= lastPayment) return false
    if (closure?.state === 'stopped' && (closure.planIds || [closure.planId]).includes(plan) &&
      (closure.confirmedAt >= lastPayment || (join.status === 'cancelled' && join.cancellation?.source === 'automatic_nonpayment' && plan === planId))) return false
    if (join.cancellation?.confirmed && ['bot', 'website', 'owner', 'automatic_nonpayment'].includes(join.cancellation.source) &&
      join.cancellation.confirmedAt >= lastPayment && (join.status === 'cancelled' || plan !== planId) && (!join.cancellation.planIds || join.cancellation.planIds.includes(plan))) return false
    if (join.recoveryProviderStoppedAt >= lastPayment && ['owner_confirmed_completion', 'provider_check'].includes(join.recoveryProviderStopSource)) return false
    return true
  }).map(([plan]) => plan)
  const info = { planId, planIds: remaining, allPlanIds: [...plans.keys()] }
  if (!join.paid || join.lifetime || !period) return { ...info, allowed: false, reason: 'paid_date_unknown' }
  if (!plans.size && join.oneTime && ['owner', 'provider_one_time'].includes(join.oneTimeConfirmed?.source) && !join.importedFromBotHelp && real && !real.subscriptionId && !join.prodamusProfileId) return { ...info, allowed: true, stopped: true, oneTime: true }
  if (!plans.size) return { ...info, allowed: false, reason: 'provider_plan_unknown' }
  if (!remaining.length) return { ...info, allowed: true, stopped: true }
  const cancellationEvidence = (sameState && state.inactive) || (join.status === 'cancelled' && join.cancellation?.confirmed && ['bot', 'website', 'owner', 'automatic_nonpayment'].includes(join.cancellation.source))
  if (!sameFailure && !cancellationEvidence) return { ...info, allowed: false, reason: 'nonpayment_not_verified' }
  return { ...info, allowed: true, stopped: false }
}

// Accepted positive webhooks without a recorded payment prevent cancellation and removal.
export function createPendingPaymentGuard({ list, file, trustedFrom = 0, processing = () => false }) {
  let signature, pending = []
  return async join => {
    if (processing()) return 'payment_processing'
    let stat
    try { stat = fs.statSync(file) } catch (e) { if (e.code === 'ENOENT') return null; return 'payment_journal_unreadable' }
    const key = stat.size + ':' + stat.mtimeMs + ':' + list().reduce((n, j) => n + (j.payments || []).length, 0)
    if (signature !== key) {
      const recorded = new Set(list().flatMap(j => (j.payments || []).filter(p => !p.estimated).map(p => p.orderKey).filter(Boolean)))
      const found = []
      let text
      try { text = fs.readFileSync(file, 'utf8') } catch { return 'payment_journal_unreadable' }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let record
        try { record = JSON.parse(line) } catch { return 'payment_journal_unreadable' }
        if (!(record.verified === true || (trustedFrom > 0 && record.receivedAt >= trustedFrom))) continue
        const b = record.body, sub = b?.subscription
        if (b?.payment_status !== 'success' || !sub) continue
        const order = String(b.order_id || '') || (sub.profile_id && sub.payment_num ? `sub:${sub.id}:${sub.profile_id}:${sub.payment_num}` : '')
        if (order && recorded.has(order)) continue
        // Some accepted legacy payloads have no provider order number. Compare
        // the actual recorded payment, never treat an already credited charge as pending forever.
        if (!order) {
          const at = date(b.date), amount = Number(b.sum ?? sub.cost)
          const credited = Number.isFinite(at) && amount > 0 && list().some(j =>
            ((b.tg_user_id && String(b.tg_user_id) === String(j.tgUserId || '')) ||
             (sub.profile_id && String(sub.profile_id) === String(j.prodamusProfileId || '')) ||
             (normalizePhone(b.customer_phone || b.phone) && normalizePhone(b.customer_phone || b.phone) === normalizePhone(j.phone)) ||
             (b.customer_email && String(b.customer_email).toLowerCase() === String(j.email || '').toLowerCase())) &&
            (j.payments || []).some(p => !p.estimated && Number(p.at) === at && Number(p.amount) === amount && String(p.subscriptionId || '') === String(sub.id || '')))
          if (credited) continue
        }
        found.push({ tg: String(b.tg_user_id || ''), profile: String(sub.profile_id || ''), phone: normalizePhone(b.customer_phone || b.phone), email: String(b.customer_email || '').toLowerCase(), at: date(b.date) })
      }
      pending = found; signature = key
    }
    const match = pending.some(p => (!Number.isFinite(p.at) || p.at >= Number(join.lastPaidAt || 0)) &&
      ((p.tg && p.tg === String(join.tgUserId || '')) || (p.profile && p.profile === String(join.prodamusProfileId || '')) ||
       (p.phone && p.phone === normalizePhone(join.phone)) || (p.email && p.email === String(join.email || '').toLowerCase())))
    return match ? 'unprocessed_payment' : null
  }
}

export function createExpiryBillingSync({ get, patch, stop, pendingPayment, notifyReview, stopOnExpiry = false, now = Date.now }) {
  return async function reconcile(candidate) {
    let join = get(candidate.token)
    if (!join || paidUntil(join) !== paidUntil(candidate) || paidUntil(join) > now()) return false
    const period = paidUntil(join)
    const review = async reason => {
      join = get(candidate.token)
      if (!join || paidUntil(join) !== period) return false
      const previous = join.billingReview?.period === period ? join.billingReview : {}
      const holdUntil = now() + (reason === 'payment_processing' ? 60000 : 6 * HOUR)
      patch(join.token, { billingReview: { ...previous, period, policy: stopOnExpiry ? 'stop_before_removal' : 'access_only', state: 'pending', reason, checkedAt: now(), holdUntil } })
      if (reason !== 'payment_processing' && (previous.reason !== reason || !previous.notifiedAt) && (!previous.notifyTriedAt || now() - previous.notifyTriedAt >= HOUR)) {
        patch(join.token, { billingReview: { ...get(join.token).billingReview, notifyTriedAt: now() } })
        if (await notifyReview?.(get(join.token), reason).catch(() => false)) patch(join.token, { billingReview: { ...get(join.token).billingReview, notifiedAt: now() } })
      }
      return false
    }
    let problem = await pendingPayment(join)
    if (problem) return review(problem)
    if (!/^\d{5,16}$/.test(String(join.tgUserId || ''))) return review('telegram_id_unknown')
    // Membership expiry never withdraws recurring-payment consent. A bank retry
    // or an unknown legacy provider plan must not terminate a resident's contract.
    if (!stopOnExpiry) {
      if (join.billingReview?.period === period) patch(join.token, { billingReview: { ...join.billingReview, state: 'resolved', resolvedAt: now(), holdUntil: 0 } })
      return true
    }
    const decision = expiryBillingDecision(join)
    if (!decision.allowed) return review(decision.reason)
    if (!decision.stopped) {
      for (const plan of decision.planIds) {
        let result
        try { result = await stop(join, plan) } catch { return review('provider_unavailable') }
        if (!result?.ok) return review('provider_stop_unconfirmed')
        join = get(candidate.token)
        if (!join) return false
        patch(join.token, { billingStops: { ...join.billingStops, [plan]: { confirmedAt: now(), source: 'provider_api' } } })
        join = get(candidate.token)
        // A payment during the bank request retains all paid rights.
        if (paidUntil(join) !== period || paidUntil(join) > now()) {
          if (expiryBillingDecision(join).planId === plan) {
            patch(join.token, { status: 'cancelled', billingClosure: { period: paidUntil(join), planId: plan, planIds: [plan], state: 'stopped', confirmedAt: now(), source: 'provider_api_paid_race' },
              cancellation: { confirmed: true, source: 'automatic_nonpayment', planIds: [plan], confirmedAt: now(), accessUntil: paidUntil(join) } })
          }
          await notifyReview?.(get(join.token), 'payment_during_stop').catch(() => false)
          return false
        }
        const waiting = await pendingPayment(join)
        if (waiting) return review(waiting)
      }
      patch(join.token, { status: 'cancelled', billingClosure: { period, planId: decision.planId, planIds: decision.allPlanIds, state: 'stopped', confirmedAt: now(), source: 'provider_api' },
        cancellation: { confirmed: true, source: 'automatic_nonpayment', planIds: decision.allPlanIds, confirmedAt: now(), accessUntil: accessUntil(join) } })
    } else if (!join.billingClosure || join.billingClosure.period !== period) {
      patch(join.token, { billingClosure: { period, planId: decision.planId || null, planIds: decision.allPlanIds, state: 'stopped', confirmedAt: now(), source: decision.oneTime ? 'one_time_payment' : 'prior_confirmation' } })
    }
    join = get(candidate.token)
    problem = await pendingPayment(join)
    if (problem) return review(problem)
    if (join.billingReview?.period === period) patch(join.token, { billingReview: { ...join.billingReview, state: 'resolved', resolvedAt: now(), holdUntil: 0 } })
    return true
  }
}
