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

export function createReserveCandidate({ name, city, university, position, telegram, phone, email, resumeUrl, source, utm }) {
  const number = listReserve().reduce((max, c) => Math.max(max, c.number), 0) + 1
  const token = store.create({ number, name: name || '', city: city || '', university: university || '', position: position || '', telegram: telegram || '', phone: phone || '', email: email || '', resumeUrl: resumeUrl || '', source: source || 'manual', utm: utm || 'без метки' })
  return { token, ...store.get(token) }
}

export function setReserveField(number, field, value) {
  if (!RESERVE_FIELDS[field]) return null
  const c = getReserveCandidate(number)
  return c ? store.update(c.token, (x) => ({ ...x, [field]: value })) : null
}

export function deleteReserveCandidate(number) {
  const c = getReserveCandidate(number)
  if (!c) return false
  store.remove(c.token)
  return true
}
