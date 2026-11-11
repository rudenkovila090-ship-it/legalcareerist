import { paidUntil, accessPeriodEnded, hasAccess } from './subscriptionAccess.js'
import { normalizePhone } from './jsonStore.js'

export function sameSubscriber(a, b) {
  // Shared contact information cannot override two distinct Telegram identities.
  if (a.tgUserId && b.tgUserId) return String(a.tgUserId) === String(b.tgUserId)
  const mail = v => String(v ?? '').trim().toLowerCase()
  return Boolean((a.tgUserId && String(a.tgUserId) === String(b.tgUserId)) ||
    (normalizePhone(a.phone) && normalizePhone(a.phone) === normalizePhone(b.phone)) ||
    (mail(a.email) && mail(a.email) === mail(b.email)))
}

// An undated second paid card needs an administrator's check before kicking.
export function protectedByOtherCard(join, joins, now) {
  return joins.some(other => other.token !== join.token && sameSubscriber(join, other) &&
    (hasAccess(other, now) || (other.paid && ['active', 'cancelled'].includes(other.status) && paidUntil(other) === null)))
}

/** Dependency injection keeps actual Telegram calls out of the tests. */
export function createAccessExpiryWorker({ list, membership, remove, releaseBan, patch, reconcile, restoreAccess, now = Date.now }) {
  let running = false, cursor = 0
  return async function process() {
    if (running) return []
    running = true
    const completed = []
    try {
      // A successful renewal can arrive after removal but before unban completed.
      // Repair only our own unfinished unban, including for newly active cards.
      if (releaseBan) for (const join of list().filter(j => j.accessUnbanPending && !(j.offboardingHoldUntil > now()))) {
        if (await releaseBan(join)) patch(join.token, { accessUnbanPending: undefined })
      }
      const eligible = list().filter(j => ['active', 'cancelled'].includes(j.status) &&
        !(j.offboardingHoldUntil > now()) &&
        accessPeriodEnded(j, now()) && j.accessClosedFor !== paidUntil(j))
      const start=eligible.length?cursor%eligible.length:0
      const candidates=[...eligible.slice(start),...eligible.slice(0,start)].slice(0,100)
      cursor=eligible.length?(start+candidates.length)%eligible.length:0
      for (const candidate of candidates) {
        const mem = candidate.tgUserId ? await membership(candidate.tgUserId) : 'none'
        // Payment may arrive while getChatMember is in flight: re-read before removal.
        const joins = list()
        const join = joins.find(j => j.token === candidate.token)
        if (!join || !accessPeriodEnded(join, now()) || join.accessClosedFor === paidUntil(join) ||
            join.offboardingHoldUntil > now() ||
            protectedByOtherCard(join, joins, now()) || !['in', 'out', 'none'].includes(mem)) continue
        // Already absent residents require no provider action or repeated review.
        if (mem === 'out') {
          patch(join.token, { accessClosedFor: paidUntil(join), accessClosedAt: now(), inChat: false,
            billingReview: join.billingReview ? { ...join.billingReview, state: 'resolved', holdUntil: 0, resolvedAt: now() } : undefined })
          completed.push(join.token)
          continue
        }
        if (reconcile && !await reconcile(join)) continue
        const checked = list().find(j => j.token === join.token)
        if (!checked || !accessPeriodEnded(checked, now()) || paidUntil(checked) !== paidUntil(join) || protectedByOtherCard(checked, list(), now())) continue
        if ((mem === 'in' || join.accessUnbanPending) && !await remove(join)) continue
        // Confirm no payment entered while Telegram removal was in flight.
        if (reconcile && !await reconcile(checked)) {
          if (mem === 'in') await restoreAccess?.(checked.tgUserId)
          continue
        }
        const current = list().find(j => j.token === join.token)
        if (current && !accessPeriodEnded(current, now()) && mem === 'in') await restoreAccess?.(current.tgUserId)
        if (current && accessPeriodEnded(current, now()) && paidUntil(current) === paidUntil(join)) {
          patch(join.token, { accessClosedFor: paidUntil(join), accessClosedAt: now(), inChat: false })
          completed.push(join.token)
        }
      }
      return completed
    } finally { running = false }
  }
}
