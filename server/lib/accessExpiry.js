import { paidUntil, paidPeriodEnded, hasAccess } from './subscriptionAccess.js'
import { normalizePhone } from './jsonStore.js'

export function sameSubscriber(a, b) {
  const mail = v => String(v ?? '').trim().toLowerCase()
  return Boolean((a.tgUserId && String(a.tgUserId) === String(b.tgUserId)) ||
    (normalizePhone(a.phone) && normalizePhone(a.phone) === normalizePhone(b.phone)) ||
    (mail(a.email) && mail(a.email) === mail(b.email)))
}

// An undated second paid card needs an administrator's check before kicking.
export function protectedByOtherCard(join, joins, now) {
  return joins.some(other => other.token !== join.token && sameSubscriber(join, other) &&
    (hasAccess(other, now) || (other.paid && other.status === 'active' && paidUntil(other) === null)))
}

/** Dependency injection keeps actual Telegram calls out of the tests. */
export function createAccessExpiryWorker({ list, membership, remove, releaseBan, patch, now = Date.now }) {
  let running = false
  return async function process() {
    if (running) return []
    running = true
    const completed = []
    try {
      // A successful renewal can arrive after removal but before unban completed.
      // Repair only our own unfinished unban, including for newly active cards.
      if (releaseBan) for (const join of list().filter(j => j.accessUnbanPending)) {
        if (await releaseBan(join)) patch(join.token, { accessUnbanPending: undefined })
      }
      const candidates = list().filter(j => ['active', 'cancelled'].includes(j.status) &&
        paidPeriodEnded(j, now()) && j.accessClosedFor !== paidUntil(j)).slice(0, 100)
      for (const candidate of candidates) {
        const mem = candidate.tgUserId ? await membership(candidate.tgUserId) : 'none'
        // Payment may arrive while getChatMember is in flight: re-read before removal.
        const joins = list()
        const join = joins.find(j => j.token === candidate.token)
        if (!join || !paidPeriodEnded(join, now()) || join.accessClosedFor === paidUntil(join) ||
            protectedByOtherCard(join, joins, now()) || !['in', 'out', 'none'].includes(mem)) continue
        if ((mem === 'in' || join.accessUnbanPending) && !await remove(join)) continue
        // Expiry changes access, never the Prodamus subscription or payment history.
        const current = list().find(j => j.token === join.token)
        if (current && paidPeriodEnded(current, now()) && paidUntil(current) === paidUntil(join)) {
          patch(join.token, { accessClosedFor: paidUntil(join), accessClosedAt: now(), inChat: false })
          completed.push(join.token)
        }
      }
      return completed
    } finally { running = false }
  }
}
