// Отклики соискателей на вакансии: каждый отклик — запись со сквозным номером,
// контактами, источником (UTM) и списком приложенных документов. Счётчики
// откликов по вакансиям ведёт vacancyStats.js, здесь — сами отклики для списков в боте.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('candidate-applications.json')

export function listApplications() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function createApplication({ vacancySlug, vacancyTitle, name, phone, email, telegram, source, documents }) {
  const number = listApplications().reduce((max, a) => Math.max(max, a.number), 0) + 1
  const token = store.create({ number, vacancySlug, vacancyTitle: vacancyTitle || '', name: name || '', phone: phone || '', email: email || '', telegram: telegram || '', source: source || 'без метки', documents: documents ?? [] })
  return { token, ...store.get(token) }
}
