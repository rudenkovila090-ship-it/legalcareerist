// Простое файловое хранилище заявок на подписку сообщества (пока без БД —
// заявок немного, JSON-файл достаточно; заменить на настоящую БД, когда
// появится полная логика напоминаний/автосписаний из ТЗ).
// Запись живёт с момента "выбрал тариф на сайте" до момента "получил
// ссылку на сообщество в боте": token → { tariffId, name, phone, telegram,
// paid, tgUserId, createdAt }.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'pending-joins.json')

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

export function createPendingJoin({ tariffId, name, phone, telegram }) {
  const token = crypto.randomBytes(12).toString('hex')
  const data = load()
  data[token] = { tariffId, name, phone, telegram, paid: false, tgUserId: null, createdAt: Date.now() }
  save(data)
  return token
}

export function getPendingJoin(token) {
  return load()[token] ?? null
}

export function setTgUserId(token, tgUserId) {
  const data = load()
  if (!data[token]) return null
  data[token].tgUserId = tgUserId
  save(data)
  return data[token]
}

/** Находит первую неоплаченную заявку с таким телефоном и помечает оплаченной. */
export function markPaidByPhone(phone) {
  if (!phone) return null
  const data = load()
  const entry = Object.entries(data).find(([, v]) => v.phone === phone && !v.paid)
  if (!entry) return null
  const [token, value] = entry
  value.paid = true
  save(data)
  return { token, ...value }
}
