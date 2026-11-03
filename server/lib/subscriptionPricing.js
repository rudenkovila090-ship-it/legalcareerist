// Provider plan IDs must never be repriced. Publish a NEW plan ID for a future price increase.
export const HISTORICAL_PLANS = {
  '2854597': { tariffId: '1m', price: 690, months: 1 },
  '3005286': { tariffId: '3m', price: 1770, months: 3 },
  '3005289': { tariffId: '6m', price: 3180, months: 6 },
  '2611878': { tariffId: null, price: 350, months: 1 },
  '2611880': { tariffId: null, price: 500, months: 1 },
  '2854589': { tariffId: null, price: 1350, months: 3 },
  '2854592': { tariffId: null, price: 2520, months: 6 },
  '2854598': { tariffId: null, price: 4200, months: 12 },
}

export function basePriceEntitlement(join) {
  if (!join?.paid || join.lifetime) return null
  if (join.priceLock?.amount > 0) {
    const plan = HISTORICAL_PLANS[join.priceLock.subscriptionId]
    if (plan && plan.price !== join.priceLock.amount) return { ...join.priceLock, subscriptionId: null, needsProviderPlanReview: true }
    return join.priceLock
  }
  const first = [...(join.payments || [])].filter(p => Number(p.amount) > 0).sort((a, b) => Number(a.at) - Number(b.at))[0]
  if (!first) return null
  let subscriptionId = first.subscriptionId ? String(first.subscriptionId) : null
  if (!subscriptionId) {
    const matches = Object.entries(HISTORICAL_PLANS).filter(([, p]) => p.price === Number(first.amount))
    if (matches.length === 1) subscriptionId = matches[0][0]
  }
  const known = HISTORICAL_PLANS[subscriptionId]
  const mismatch = known && known.price !== Number(first.amount)
  return { amount: Number(first.amount), currency: 'RUB', subscriptionId: mismatch ? null : subscriptionId, needsProviderPlanReview: Boolean(mismatch), tariffId: first.tariffId || join.tariffId || known?.tariffId || null,
    months: known?.months || null, recordedAt: Number(first.at) || join.firstPaidAt || null, source: first.estimated ? 'imported_record' : 'confirmed_payment' }
}

export function priceEntitlement(join) {
  if (!join?.paid || join.lifetime) return null
  const retained = join.retentionPrice
  return retained?.confirmedAt && retained.amount > 0 && retained.subscriptionId ? retained : basePriceEntitlement(join)
}

/** Existing provider plan, selected by the owner: monthly 690 -> monthly 500. */
export function retentionPlans() {
  return { '2854597': { subscriptionId: '2611880', amountMinor: 50000, months: 1 } }
}

export function lockedAmount(join, fallback = 0) {
  return priceEntitlement(join)?.amount || fallback
}
