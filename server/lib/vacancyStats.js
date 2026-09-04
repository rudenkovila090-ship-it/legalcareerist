// Реальные (не демо) счётчики по вакансии: сколько раз открыли страницу и
// сколько раз отправили отклик. Простое файловое хранилище — по аналогии
// с остальными server/lib/*.js store'ами, но ключ здесь не токен заявки,
// а slug вакансии, и значения — счётчики, а не запись с paid-флагом,
// поэтому под общий createJsonStore (jsonStore.js) это не подходит.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'vacancy-stats.json')

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
  const entry = data[slug] ?? { views: 0, applications: 0 }
  entry[field] += 1
  data[slug] = entry
  save(data)
  return entry
}

export function incrementView(slug) {
  return bump(slug, 'views')
}

export function incrementApplication(slug) {
  return bump(slug, 'applications')
}
