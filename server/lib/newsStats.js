// Реальный (не демо) счётчик просмотров новостей — по аналогии с
// articleStats.js/vacancyStats.js: простое файловое хранилище, ключ — slug новости.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'news-stats.json')

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

export function incrementNewsView(slug) {
  const data = load()
  const entry = data[slug] ?? { views: 0 }
  entry.views += 1
  data[slug] = entry
  save(data)
  return entry
}

export function getNewsViews(slug) {
  const data = load()
  return data[slug]?.views ?? 0
}
