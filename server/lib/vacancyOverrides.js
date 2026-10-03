// Ручной статус вакансии в учёте бота (закрыта/открыта). Каталог сайта не меняется:
// пометка нужна, чтобы в боте не путать вакансии в работе и закрытые.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'vacancy-overrides.json')

export function vacancyOverrides() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function setVacancyStatus(slug, status) {
  const all = vacancyOverrides()
  all[slug] = status
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2))
}
