// Отклики соискателей на вакансии: каждый отклик — запись со сквозным номером,
// контактами, источником (UTM) и списком приложенных документов. Счётчики
// откликов по вакансиям ведёт vacancyStats.js, здесь — сами отклики для списков в боте.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('candidate-applications.json')

export function listApplications() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function createApplication({ vacancySlug, vacancyTitle, name, phone, email, telegram, source, documents, howHeard }) {
  const number = listApplications().reduce((max, a) => Math.max(max, a.number), 0) + 1
  const token = store.create({ number, vacancySlug, vacancyTitle: vacancyTitle || '', name: name || '', phone: phone || '', email: email || '', telegram: telegram || '', source: source || 'без метки', howHeard: howHeard || '', documents: documents ?? [] })
  return { token, ...store.get(token) }
}

// ---- Путь отклика (виден человеку в кабинете: «Вакансии → Мои отклики») ----
// Статус меняет админ кнопками в боте (карточка отклика) или сам человек, отозвав отклик. Прежние отклики без статуса считаются «Отправлен».
export const APPLICATION_STATUSES = {
  sent: 'Отправлен',
  forwarded: 'Передан работодателю',
  interview: 'Собеседование',
  offer: 'Оффер',
  rejected: 'Отказ',
  withdrawn: 'Отозван',
}
/** Шаги пути по порядку; отказ и отзыв — концы пути вне этой цепочки. */
export const APPLICATION_STEPS = ['sent', 'forwarded', 'interview', 'offer']

export const statusOf = (a) => (APPLICATION_STATUSES[a?.status] ? a.status : 'sent')

export function getApplication(number) {
  return listApplications().find((a) => a.number === Number(number)) ?? null
}

/** Меняет статус отклика и дописывает его в историю. Возвращает обновлённый отклик или null (нет такого или статус неизвестен). */
export function setApplicationStatus(number, status, now = Date.now()) {
  if (!APPLICATION_STATUSES[status]) return null
  const a = getApplication(number)
  if (!a) return null
  return store.update(a.token, (rec) => ({ ...rec, status, statusAt: now, history: [...(rec.history ?? [{ status: 'sent', at: rec.createdAt }]), { status, at: now }].slice(-20) }))
}
