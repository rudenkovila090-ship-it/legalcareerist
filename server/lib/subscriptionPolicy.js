import { paidUntil } from './subscriptionAccess.js'
import { priceEntitlement } from './subscriptionPricing.js'

/** Additive rollout metadata only; no payment, status or paid-date changes. */
export function prepareSubscriptionPolicy(cards, previous, now, days) {
  const activatedAt = Number(previous?.activatedAt) || now
  const first = !previous?.activatedAt
  const stats = { locked: 0, unknownPlan: 0, unknownDate: 0, transition: 0, missingTelegram: 0 }
  const next = Object.fromEntries(Object.entries(cards).map(([token, original]) => {
    const j = { ...original }
    if (!j.paid || j.lifetime) return [token, j]
    const entitlement = priceEntitlement(j)
    if (entitlement && !j.priceLock) { j.priceLock = entitlement; stats.locked++ }
    if (!entitlement?.subscriptionId) stats.unknownPlan++
    if (!j.tgUserId) stats.missingTelegram++
    const end = paidUntil(j)
    if (!end) stats.unknownDate++
    if (first && end && end <= now && !j.accessClosedAt && (['active', 'cancelled'].includes(j.status) || j.inChat === true)) {
      j.transitionAccessUntil = Math.max(Number(j.transitionAccessUntil) || 0, activatedAt + days * 86400000)
      stats.transition++
    }
    return [token, j]
  }))
  return { cards: next, policy: { version: 1, activatedAt, graceDays: days, autoExcludeEnabled: true }, stats }
}
