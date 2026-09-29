// Заказы карьерной консультации (и вопросы «помогите выбрать услугу»): запись
// со сквозным номером и статусом, чтобы вести их в боте — что заказано, на какую
// сумму, взято ли в работу и выполнено ли.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('consultation-orders.json')

export const CONSULTATION_STATUSES = {
  new: '🆕 Новая',
  in_progress: '🔄 В работе',
  done: '✅ Выполнена',
  cancelled: '❌ Отменена',
}

export function listConsultations() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getConsultation(number) {
  return listConsultations().find((c) => c.number === Number(number)) ?? null
}

/** kind: 'order' (выбраны услуги) или 'question' (вопрос без выбора услуг). */
export function createConsultation({ kind, services, promo, total, name, phone, email, telegram, source }) {
  const number = listConsultations().reduce((max, c) => Math.max(max, c.number), 0) + 1
  const token = store.create({ number, kind, services: services ?? [], promo: promo || '', total: total ?? null, name: name || '', phone: phone || '', email: email || '', telegram: telegram || '', source: source || 'без метки', status: 'new', statusAt: Date.now() })
  return { token, ...store.get(token) }
}

export function setConsultationStatus(number, status) {
  if (!CONSULTATION_STATUSES[status]) return null
  const c = getConsultation(number)
  return c ? store.update(c.token, (x) => ({ ...x, status, statusAt: Date.now() })) : null
}
