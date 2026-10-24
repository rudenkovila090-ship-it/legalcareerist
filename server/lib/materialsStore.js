// Заявки на покупку материалов маркетплейса (по аналогии со store.js для сообщества). Покупка идёт на сайте;
// файл покупатель получает по личной ссылке из письма (materialLinks.js).
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

export function listPurchases() {
  return store.all()
}
