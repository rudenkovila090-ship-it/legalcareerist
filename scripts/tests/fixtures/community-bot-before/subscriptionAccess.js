// Paid time and complimentary retry access are separate; money history is never extended.
const DAY = 86400000
export function graceDays() {
  const value = Number(process.env.SUBSCRIPTION_GRACE_DAYS?.trim() || 4)
  return Number.isFinite(value) && value >= 0 && value <= 30 ? value : 4
}
export function paidUntil(join) {
  const value = join?.nextPaymentAt ?? join?.endsAt
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

export function hasAccess(join, now = Date.now()) {
  if (!join) return false
  if (join.lifetime) return true
  return Boolean(join.paid && ['active', 'cancelled'].includes(join.status) && accessUntil(join) > now)
}

export function accessUntil(join) {
  const until = paidUntil(join)
  if (until === null) return null
  if (join.manualAccessClosedFor === until) return until
  const review = join.billingReview?.period === until && join.billingReview.state === 'pending' ? Number(join.billingReview.holdUntil) || 0 : 0
  if (join.status === 'cancelled' && join.cancellation?.confirmed) return Math.max(until, Number(join.cancellation.accessUntil) || 0, Number(join.recoveryAccessUntil) || 0, review)
  const blocked = join.lastChargeFailure?.verified && join.lastChargeFailure.dueAt === until ? Number(join.lastChargeFailure.blockedUntil) || 0 : 0
  return Math.max(until + graceDays() * DAY, Number(join.transitionAccessUntil) || 0, Number(join.recoveryAccessUntil) || 0, blocked, review)
}

export function inGrace(join, now = Date.now()) {
  return Boolean(!join?.lifetime && hasAccess(join, now) && paidUntil(join) <= now)
}

export function accessPeriodEnded(join, now = Date.now()) {
  return Boolean(join?.paid && !join.lifetime && accessUntil(join) !== null && accessUntil(join) <= now)
}

export function paidPeriodEnded(join, now = Date.now()) {
  const until = paidUntil(join)
  return Boolean(join?.paid && !join.lifetime && until !== null && until <= now)
}

export const preciseMoscowTime = (timestamp) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date(timestamp)) + ' (мск)'
