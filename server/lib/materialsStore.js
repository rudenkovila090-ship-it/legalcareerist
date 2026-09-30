// Заявки на покупку материалов маркетплейса (по аналогии со store.js для
// сообщества, но без бота — доступ выдаётся прямо на странице личного
// кабинета по токену из ссылки).
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('material-purchases.json')

export function createPendingPurchase({ materialSlug, name, phone, email, tgUserId }) {
  return store.create({ materialSlug, name, phone, email, ...(tgUserId ? { tgUserId: String(tgUserId) } : {}) })
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

export function listPurchases() {
  return store.all()
}

/** Покупка из бота: находит самую свежую неоплаченную заявку этого Telegram-пользователя и помечает оплаченной. */
export function markPurchasePaidByTg(tgUserId) {
  const entry = store.all().filter((p) => String(p.tgUserId ?? '') === String(tgUserId) && !p.paid).sort((a, b) => b.createdAt - a.createdAt)[0]
  if (!entry) return null
  return store.update(entry.token, (x) => ({ ...x, paid: true }))
}

/** Оплаченная покупка этого материала у пользователя бота (для кнопки «Уже приобрёл»). */
export function findPaidPurchase(tgUserId, materialSlug) {
  return store.all().find((p) => String(p.tgUserId ?? '') === String(tgUserId) && p.paid && p.materialSlug === materialSlug) ?? null
}
