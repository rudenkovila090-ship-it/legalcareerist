import { basePriceEntitlement, retentionPlans } from './subscriptionPricing.js'
import { accessUntil } from './subscriptionAccess.js'

const DAY = 86400000
export function prepareRetentionOffer(join, now = Date.now()) {
  if (join.retentionOffer?.policy === 'monthly_500') return join.retentionOffer
  const base = basePriceEntitlement(join)
  if (base?.amount !== 690 || String(base.subscriptionId) !== '2854597' || join.lifetime || join.oneTime) return null
  const baseMinor = Math.round(base.amount * 100)
  return { version: 2, policy: 'monthly_500', baseMinor, amountMinor: 50000, baseSubscriptionId: String(base.subscriptionId),
    tariffId: base.tariffId, months: base.months, createdAt: now }
}

export function retentionOfferView(join, now = Date.now()) {
  const offer = join?.retentionOffer, end = accessUntil(join)
  if (!offer || join.status !== 'cancelled' || !join.cancellation?.confirmed || !end || (now < end - DAY && !offer.claimedAt && !offer.redeemedAt)) return null
  const plan = retentionPlans()[offer.baseSubscriptionId]
  if (!plan || plan.amountMinor !== offer.amountMinor || plan.months !== offer.months) return null
  return { amount: offer.amountMinor / 100, baseAmount: offer.baseMinor / 100,
    claimed: Boolean(offer.claimedAt), redeemed: Boolean(offer.redeemedAt), checkoutAt: end, canCheckout: now >= end }
}

export function matchingRetentionPayment(join, { subscriptionId, amount, paidAt }) {
  const offer = join.retentionOffer, approved = join.retentionCheckout
  if (!offer || !approved || String(approved.subscriptionId) !== String(subscriptionId) || Math.round(Number(amount) * 100) !== offer.amountMinor) return null
  return { amount: offer.amountMinor / 100, currency: 'RUB', subscriptionId: String(subscriptionId),
    tariffId: offer.tariffId, months: offer.months, confirmedAt: paidAt, source: 'confirmed_retention_payment' }
}

/** End-of-access notices are independent of charge reminders and acknowledge each channel. */
export function createAccessEndingReminders({ list, patch, send, now = Date.now }) {
  let running = false
  return async function deliver() {
    if (running) return
    running = true
    try {
      for (const join of list()) {
        const end = accessUntil(join), at = now()
        if (!join.paid || join.lifetime || join.status !== 'cancelled' || !join.cancellation?.confirmed || !end || at < end - DAY || at >= end) continue
        const notice = join.accessEndingNotice?.end === end ? join.accessEndingNotice : { end }
        const channels = { bot: Boolean(join.tgUserId) && !notice.botDone, mail: Boolean(join.email) && !notice.mailDone }
        if (!channels.bot && !channels.mail) continue
        let result
        try { result = await send(join, retentionOfferView(join, at), channels) } catch { continue }
        const current = list().find(j => j.token === join.token)
        if (!current || current.status !== 'cancelled' || accessUntil(current) !== end) continue
        patch(join.token, { accessEndingNotice: { ...notice, botDone: notice.botDone || result.bot === true,
          mailDone: notice.mailDone || result.mail === true, attemptedAt: at } })
      }
    } finally { running = false }
  }
}
