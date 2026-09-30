// Мероприятия: регистрации на билеты и заявки (партнёры, организаторы, заказ
// мероприятия под ключ). Регистрация ведётся статусами, оплата отмечается
// вручную с суммой — чтобы видеть выручку по мероприятию.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('event-leads.json')

export const EVENT_STATUSES = { registered: '🆕 Зарегистрирован', paid: '💳 Оплатил', attended: '✅ Пришёл', cancelled: '❌ Отменил', new: '🆕 Новая', done: '✅ Обработана' }

export function listEventLeads() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getEventLead(number) {
  return listEventLeads().find((e) => e.number === Number(number)) ?? null
}

/** kind: 'registration' (билет на мероприятие) или 'request' (партнёр/организатор/заказ). */
export function createEventLead({ kind, formType, eventSlug, eventTitle, tariff, name, phone, email, telegram, company, note, source }) {
  const number = listEventLeads().reduce((max, e) => Math.max(max, e.number), 0) + 1
  const token = store.create({ number, kind, formType, eventSlug: eventSlug || '', eventTitle: eventTitle || '', tariff: tariff || '', name: name || '', phone: phone || '', email: email || '', telegram: telegram || '', company: company || '', note: note || '', source: source || 'без метки', status: kind === 'registration' ? 'registered' : 'new', amount: null })
  return { token, ...store.get(token) }
}

export function setEventLeadStatus(number, status, amount) {
  if (!EVENT_STATUSES[status]) return null
  const e = getEventLead(number)
  return e ? store.update(e.token, (x) => ({ ...x, status, statusAt: Date.now(), ...(amount != null ? { amount } : {}) })) : null
}
