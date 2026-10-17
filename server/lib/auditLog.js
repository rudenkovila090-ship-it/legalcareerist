// Журнал действий админа в боте: кто и когда менял статусы, вносил данные.
// Только дописывается в data/audit.jsonl; в боте показываются последние записи.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'audit.jsonl')

export function logAction(chatId, action) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(FILE, `${JSON.stringify({ at: Date.now(), chatId: String(chatId), action })}\n`)
  } catch (err) {
    console.error('[audit] не удалось записать:', err.message)
  }
}

export function recentActions(limit = 25) {
  try {
    return fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).slice(-limit).map((l) => JSON.parse(l)).reverse()
  } catch {
    return []
  }
}
