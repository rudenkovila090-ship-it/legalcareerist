import { paidUntil, accessUntil } from './subscriptionAccess.js'

export const CANCELLATION_REASONS = { price: 'Дорого', time: 'Нет времени', content: 'Не подошёл формат', payment: 'Проблема с оплатой', other: 'Другое' }
export function cancellationReason(value, code) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (code && !Object.hasOwn(CANCELLATION_REASONS, code)) return null
  if ((!code || code === 'other') && !text) return null
  return { code: code || 'other', text: code && code !== 'other' ? CANCELLATION_REASONS[code] : text }
}

// A voluntary cancellation adds no new grace. Keep an already granted retry window.
export function voluntaryAccessEnd(join, now = Date.now()) {
  const end = paidUntil(join)
  if (!end) return null
  return Math.max(end, Number(join.transitionAccessUntil) || 0, Number(join.accessBonusUntil) || 0,
    end <= now ? accessUntil(join) || 0 : 0)
}
