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

// source — подпись источника по UTM-меткам (см. lib/utm.js): по ней в боте видно,
// из какой соцсети пришли просмотры и отклики на вакансию.
function bump(slug, field, source) {
  const data = load()
  const entry = data[slug] ?? { views: 0, applications: 0 }
  entry[field] += 1
  if (source) {
    entry.sources = entry.sources ?? {}
    entry.sources[source] = entry.sources[source] ?? { views: 0, applications: 0 }
    entry.sources[source][field] += 1
  }
  data[slug] = entry
  save(data)
  return { views: entry.views, applications: entry.applications }
}

export function incrementView(slug, source) {
  return bump(slug, 'views', source)
}

export function incrementApplication(slug, source) {
  return bump(slug, 'applications', source)
}

/** Счётчики всех вакансий: { slug: { views, applications, sources } } — для кабинета в боте. */
export function allVacancyStats() {
  return load()
}
