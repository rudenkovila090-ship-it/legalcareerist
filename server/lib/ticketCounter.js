// Сквозной номер заявки (Контакты/Поддержка) — растёт с 1, а не случайное
// число, чтобы админу было легче ориентироваться. Тот же файловый паттерн
// хранения, что и у vacancyStats.js.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'ticket-counter.json')

export function nextTicketNumber() {
  let last = 0
  try {
    last = JSON.parse(fs.readFileSync(FILE, 'utf8')).last ?? 0
  } catch {
    last = 0
  }
  const next = last + 1
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify({ last: next }, null, 2))
  return next
}
