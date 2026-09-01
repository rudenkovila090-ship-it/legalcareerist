// Заявки на подписку сообщества: token → { tariffId, name, phone, email,
// telegram, paid, tgUserId, createdAt }. Живёт с момента "выбрал тариф на
// сайте" до момента "получил ссылку на сообщество в боте".
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('pending-joins.json')

export function createPendingJoin({ tariffId, name, phone, email, telegram }) {
  return store.create({ tariffId, name, phone, email, telegram, tgUserId: null })
}

export function getPendingJoin(token) {
  return store.get(token)
}

export function setTgUserId(token, tgUserId) {
  return store.setField(token, 'tgUserId', tgUserId)
}

/**
 * Находит неоплаченную заявку с таким телефоном (и, если известен —
 * именно тем тарифом, чтобы не перепутать при нескольких заявках подряд
 * с одного номера) и помечает оплаченной. Среди совпадений берёт самую свежую.
 */
export function markPaidByPhone(phone, tariffId) {
  return store.markPaidByPhone(phone, tariffId ? (v) => v.tariffId === tariffId : undefined)
}
