// Реальные (не демо) счётчики по мероприятию — просмотры страницы и
// переходы к регистрации (клик по внешней ссылке организатора ИЛИ отправка
// внутренней формы регистрации — оба считаются одним счетчиком «переходы к
// регистрации», это конверсионная метрика, а не просто просмотр). Тот же
// принцип простого файлового хранилища, что у vacancyStats.js.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'event-stats.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

function bump(slug, field) {
  const data = load()
  const entry = data[slug] ?? { views: 0, registrations: 0 }
  entry[field] += 1
  data[slug] = entry
  save(data)
  return entry
}

export function incrementEventView(slug) {
  return bump(slug, 'views')
}

export function incrementEventRegistration(slug) {
  return bump(slug, 'registrations')
}

export function getEventStats(slug) {
  return load()[slug] ?? { views: 0, registrations: 0 }
}
