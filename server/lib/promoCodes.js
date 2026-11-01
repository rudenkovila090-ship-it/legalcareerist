// Промокоды на билеты мероприятий: скидка в процентах или в рублях. Цену со скидкой всегда считает сервер —
// клиент присылает только код. Коды заводит админ в боте («Мероприятия → 🎟 Промокоды»).
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('promo-codes.json')

/** Код без регистра и пробелов: «Resident 2026» → «RESIDENT2026». */
export const normCode = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')

export function listPromos() {
  return store.all().sort((a, b) => a.number - b.number)
}

/** Разбор ввода админа: «RESIDENT 20%» (процент) или «FRIEND 500» / «FRIEND 500 ₽» (рубли). null — не разобрал. */
export function parsePromoInput(text) {
  const m = String(text ?? '').trim().match(/^(\S+)\s+(\d{1,6})\s*(%|₽|р\.?|руб\.?)?$/i)
  if (!m) return null
  const code = normCode(m[1])
  const value = Number(m[2])
  const kind = m[3] === '%' ? 'percent' : 'fixed'
  if (!/^[A-ZА-ЯЁ0-9_-]{3,32}$/.test(code)) return null
  if (kind === 'percent' && (value < 1 || value > 95)) return null
  if (kind === 'fixed' && value < 1) return null
  return { code, kind, value }
}

/** Добавляет промокод. Возвращает { promo } или { error: 'exists' }. */
export function addPromo({ code, kind, value }) {
  if (listPromos().some((p) => p.code === code && p.active)) return { error: 'exists' }
  const number = listPromos().reduce((max, p) => Math.max(max, p.number), 0) + 1
  const token = store.create({ number, code, kind, value, used: 0, active: true })
  return { promo: { token, ...store.get(token) } }
}

// Коды, которые должны быть всегда (заведены по просьбе владельца). Если код уже есть — в том числе выключенный
// админом в боте — не трогаем: выключенный не воскресает после перезапуска.
const BUILT_IN = [{ code: normCode('KillMe50'), kind: 'percent', value: 50 }]

export function ensureBuiltInPromos() {
  for (const p of BUILT_IN) {
    if (!store.all().some((x) => x.code === p.code)) addPromo(p)
  }
}

export function removePromo(number) {
  const p = listPromos().find((x) => x.number === Number(number))
  if (!p) return false
  store.update(p.token, (x) => ({ ...x, active: false, removedAt: Date.now() }))
  return true
}

export function findPromo(code) {
  const c = normCode(code)
  return c ? (listPromos().find((p) => p.active && p.code === c) ?? null) : null
}

/** Цена со скидкой: { price, discount }. Итог не ниже 1 ₽ (Prodamus не принимает нулевую оплату). */
export function applyPromo(price, promo) {
  const raw = promo.kind === 'percent' ? Math.round((price * promo.value) / 100) : promo.value
  const final = Math.max(1, price - raw)
  return { price: final, discount: price - final }
}

export function markPromoUsed(code) {
  const p = findPromo(code)
  if (p) store.update(p.token, (x) => ({ ...x, used: (x.used ?? 0) + 1 }))
}

export const promoLabel = (p) => (p.kind === 'percent' ? `−${p.value}%` : `−${p.value} ₽`)
