// «Интересовались»: люди, которые написали в поддержку и спросили про карьерную
// консультацию или вакансию, но заявки на сайте не оставили. Админ записывает
// такого человека в боте, а через неделю бот напоминает написать ему снова.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('interests.json')
export const REMIND_AFTER_DAYS = 7
const DAY = 24 * 3600 * 1000

export const INTEREST_KINDS = { consultation: '🎯 Карьерная консультация', vacancy: '💼 Вакансия / отклик' }

export function listInterests() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getInterest(number) {
  return listInterests().find((i) => i.number === Number(number)) ?? null
}

/** contactedAt — когда человек обращался (по умолчанию сейчас); напоминание — через неделю после обращения, но не раньше чем сейчас. */
export function createInterest({ kind, name, telegram, phone, email, note, contactedAt }) {
  const now = Date.now()
  const at = contactedAt ?? now
  const number = listInterests().reduce((max, i) => Math.max(max, i.number), 0) + 1
  const token = store.create({ number, kind, name: name || '', telegram: telegram || '', phone: phone || '', email: email || '', note: note || '', contactedAt: at, status: 'waiting', remindAt: Math.max(at + REMIND_AFTER_DAYS * DAY, now), remindCount: 0 })
  return { token, ...store.get(token) }
}

function update(number, fn) {
  const i = getInterest(number)
  return i ? store.update(i.token, fn) : null
}

/** Человеку написали — закрываем напоминание. */
export function markInterestDone(number) {
  return update(number, (i) => ({ ...i, status: 'done', remindAt: null, doneAt: Date.now() }))
}

export function closeInterest(number) {
  return update(number, (i) => ({ ...i, status: 'closed', remindAt: null, doneAt: Date.now() }))
}

export function snoozeInterest(number, days = REMIND_AFTER_DAYS) {
  return update(number, (i) => ({ ...i, status: 'waiting', remindAt: Date.now() + days * DAY }))
}

export function interestsDueForReminder(now) {
  return listInterests().filter((i) => i.status === 'waiting' && i.remindAt && i.remindAt <= now)
}

export function markInterestReminded(number, nextAt) {
  return update(number, (i) => ({ ...i, remindCount: (i.remindCount ?? 0) + 1, remindAt: nextAt }))
}
