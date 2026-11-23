// Мероприятия: регистрации на билеты и заявки (партнёры, организаторы, заказ
// мероприятия под ключ). Регистрация ведётся статусами, оплата отмечается
// вручную с суммой — чтобы видеть выручку по мероприятию.
import { createJsonStore } from './jsonStore.js'
import { newTicketDelivery } from './eventTicketDelivery.js'

const store = createJsonStore('event-leads.json')

export const EVENT_STATUSES = { registered: '🆕 Зарегистрирован', paid: '💳 Оплатил', attended: '✅ Пришёл', cancelled: '❌ Отменил', new: '🆕 Новая', done: '✅ Обработана' }

export function listEventLeads() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getEventLead(number) {
  return listEventLeads().find((e) => e.number === Number(number)) ?? null
}

/** kind: 'registration' (билет на мероприятие) или 'request' (партнёр/организатор/заказ). */
export function createEventLead({ kind, formType, eventSlug, eventTitle, tariff, name, phone, email, telegram, company, note, source, howHeard }) {
  const number = listEventLeads().reduce((max, e) => Math.max(max, e.number), 0) + 1
  const token = store.create({ number, kind, formType, eventSlug: eventSlug || '', eventTitle: eventTitle || '', tariff: tariff || '', name: name || '', phone: phone || '', email: email || '', telegram: telegram || '', company: company || '', note: note || '', source: source || 'без метки', howHeard: howHeard || '', status: kind === 'registration' ? 'registered' : 'new', amount: null })
  return { token, ...store.get(token) }
}

export function setEventLeadStatus(number, status, amount) {
  if (!EVENT_STATUSES[status]) return null
  const e = getEventLead(number)
  return e ? store.update(e.token, (x) => ({ ...x, status, statusAt: Date.now(), ...(amount != null ? { amount } : {}), ...(status === 'paid' && x.kind === 'registration' ? { paidAt: x.paidAt ?? Date.now(), ticketDelivery: x.ticketDelivery ?? newTicketDelivery() } : {}) })) : null
}

/** Оплата билета: статус «Оплатил», сумма и номер платежа Prodamus. Повторный вебхук ничего не меняет (duplicate). */
export function markEventLeadPaid(number, amount, paymentRef) {
  const e = getEventLead(number)
  if (!e) return null
  if (e.status === 'paid' || e.status === 'attended') return { ...e, duplicate: true }
  return store.update(e.token, (x) => ({ ...x, status: 'paid', statusAt: Date.now(), paidAt: Date.now(), amount: amount ?? x.amount, paymentRef: paymentRef || x.paymentRef || '', ticketDelivery: newTicketDelivery() }))
}

export function setEventLeadField(number, key, value) {
  const e = getEventLead(number)
  return e ? store.update(e.token, (x) => ({ ...x, [key]: value })) : null
}

/** Bind the unguessable ticket token to the private Telegram account that opened it. */
export function bindEventLeadTelegram(token, chatId) {
  const lead = store.get(token)
  if (!lead || lead.kind !== 'registration' || !/^\d{5,16}$/.test(String(chatId))) return { error: 'unknown_ticket' }
  if (lead.tgUserId && String(lead.tgUserId) !== String(chatId)) return { error: 'telegram_conflict' }
  return store.update(token, x => ({ ...x, tgUserId: String(chatId) }))
}
