// One paid-period rule for the website, Telegram and expiry jobs.
// Prodamus retry attempts do not extend the period already paid for.
export function paidUntil(join) {
  const value = join?.nextPaymentAt ?? join?.endsAt
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

export function hasAccess(join, now = Date.now()) {
  if (!join) return false
  if (join.lifetime) return true
  return Boolean(join.paid && ['active', 'cancelled'].includes(join.status) && paidUntil(join) > now)
}

export function paidPeriodEnded(join, now = Date.now()) {
  const until = paidUntil(join)
  return Boolean(join?.paid && !join.lifetime && until !== null && until <= now)
}

export const preciseMoscowTime = (timestamp) => new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date(timestamp)) + ' (мск)'
