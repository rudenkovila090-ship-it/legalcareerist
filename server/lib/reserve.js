// Кадровый резерв: список кандидатов, которые оставили заявку на сайте
// (или добавлены вручную): ФИО, город, университет, должность и ссылка на резюме.
// Ссылку на резюме (Google Диск) админ прикрепляет сам из бота.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('reserve-candidates.json')

export const RESERVE_FIELDS = { name: 'ФИО', city: 'Город', university: 'Университет', position: 'Должность', resumeUrl: 'Ссылка на резюме' }

export function listReserve() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getReserveCandidate(number) {
  return listReserve().find((c) => c.number === Number(number)) ?? null
}

/** login — логин кабинета, если человек вступил сам из кабинета; consentAt — когда он дал согласие на хранение данных в резерве. */
export function createReserveCandidate({ name, city, university, position, telegram, phone, email, resumeUrl, source, utm, howHeard, login, consentAt }) {
  const number = listReserve().reduce((max, c) => Math.max(max, c.number), 0) + 1
  const token = store.create({ number, name: name || '', city: city || '', university: university || '', position: position || '', telegram: telegram || '', phone: phone || '', email: email || '', resumeUrl: resumeUrl || '', source: source || 'manual', utm: utm || 'без метки', howHeard: howHeard || '', ...(login ? { login } : {}), ...(consentAt ? { consentAt } : {}) })
  return { token, ...store.get(token) }
}

export function setReserveField(number, field, value) {
  if (!RESERVE_FIELDS[field]) return null
  const c = getReserveCandidate(number)
  return c ? store.update(c.token, (x) => ({ ...x, [field]: value })) : null
}

/** Резюме получено (кандидат прислал его владельцу в Telegram): кандидат уходит из дел «резюме не получено». */
export function markResumeReceived(number) {
  const c = getReserveCandidate(number)
  return c ? store.update(c.token, (x) => ({ ...x, resumeReceivedAt: Date.now() })) : null
}

export function deleteReserveCandidate(number) {
  const c = getReserveCandidate(number)
  if (!c) return false
  store.remove(c.token)
  return true
}

/** Человек сам меняет в кабинете то, что о нём в резерве (город, университет, желаемая должность). */
export function updateReserveCandidate(number, { city, university, position }) {
  const c = getReserveCandidate(number)
  if (!c) return null
  return store.update(c.token, (x) => ({ ...x, city: city ?? x.city, university: university ?? x.university, position: position ?? x.position }))
}

/** Продление: человек заново подтвердил согласие, срок хранения (TERMS.reserve) считается от этого момента. */
export function renewReserveCandidate(number, now = Date.now()) {
  const c = getReserveCandidate(number)
  return c ? store.update(c.token, (x) => ({ ...x, renewedAt: now, consentAt: now })) : null
}
