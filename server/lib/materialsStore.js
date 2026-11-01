// Заявки на покупку материалов маркетплейса (по аналогии со store.js для сообщества). Покупка идёт на сайте;
// файл покупатель получает по личной ссылке из письма (materialLinks.js).
// Бесплатные материалы живут в том же файле, но с признаком free: без телефона, без оплаты и без суммы — в финансы они не попадают.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('material-purchases.json')

export function createPendingPurchase({ materialSlug, name, phone, email, howHeard, consentAt, marketingAt }) {
  return store.create({ materialSlug, name, phone, email, howHeard: howHeard || '', ...(consentAt ? { consentAt } : {}), ...(marketingAt ? { marketingAt } : {}) })
}

export function getPurchase(token) {
  return store.get(token)
}

/** Находит самую свежую неоплаченную заявку с таким телефоном и помечает оплаченной. */
export function markPurchasePaidByPhone(phone) {
  return store.markPaidByPhone(phone)
}

/** Сумма и время оплаты — чтобы разовые покупки попадали в финансы. */
export function recordPurchasePayment(token, amount) {
  store.setField(token, 'amount', amount)
  store.setField(token, 'paidAt', Date.now())
}

/**
 * Бесплатная выдача: запись без оплаты, только почта (и имя, если назвали). Один человек на один материал — одна запись:
 * повторный запрос обновляет её, а письмо со свежей ссылкой уходит снова. Возвращает токен записи (к нему привязываются ссылки и отзыв).
 */
export function grantFreeMaterial({ materialSlug, name, email, howHeard, consentAt, marketingAt }) {
  const mail = String(email ?? '').trim().toLowerCase()
  const now = Date.now()
  const existing = store.all().find((p) => p.free && p.materialSlug === materialSlug && String(p.email ?? '').toLowerCase() === mail && !p.anonymizedAt)
  if (existing) {
    store.update(existing.token, (rec) => ({ ...rec, name: name || rec.name, grantedAt: now, grants: (rec.grants ?? 1) + 1 }))
    return existing.token
  }
  return store.create({ materialSlug, name: name || '', email: String(email).trim(), howHeard: howHeard || '', free: true, grantedAt: now, grants: 1, ...(consentAt ? { consentAt } : {}), ...(marketingAt ? { marketingAt } : {}) })
}

/** Доступ к файлу есть у оплатившего покупателя и у получившего бесплатный материал; обезличенная запись доступа не даёт. */
export const hasMaterialAccess = (p) => Boolean(p && !p.anonymizedAt && (p.paid || p.free))

export function listPurchases() {
  return store.all()
}
