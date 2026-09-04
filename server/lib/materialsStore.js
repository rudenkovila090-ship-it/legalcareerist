// Заявки на покупку материалов маркетплейса (по аналогии со store.js для
// сообщества, но без бота — доступ выдаётся прямо на странице личного
// кабинета по токену из ссылки).
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('material-purchases.json')

export function createPendingPurchase({ materialSlug, name, phone, email }) {
  return store.create({ materialSlug, name, phone, email })
}

export function getPurchase(token) {
  return store.get(token)
}

/** Находит самую свежую неоплаченную заявку с таким телефоном и помечает оплаченной. */
export function markPurchasePaidByPhone(phone) {
  return store.markPaidByPhone(phone)
}
