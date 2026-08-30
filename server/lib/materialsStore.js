// Файловое хранилище заявок на покупку материалов маркетплейса (по
// аналогии с server/lib/store.js для сообщества, но без бота — доступ
// выдаётся прямо на странице личного кабинета по токену из ссылки).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'material-purchases.json')

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

export function createPendingPurchase({ materialSlug, name, phone, email }) {
  const token = crypto.randomBytes(12).toString('hex')
  const data = load()
  data[token] = { materialSlug, name, phone, email, paid: false, createdAt: Date.now() }
  save(data)
  return token
}

export function getPurchase(token) {
  return load()[token] ?? null
}

/** Находит самую свежую неоплаченную заявку с таким телефоном и помечает оплаченной. */
export function markPurchasePaidByPhone(phone) {
  if (!phone) return null
  const data = load()
  const matches = Object.entries(data)
    .filter(([, v]) => v.phone === phone && !v.paid)
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
  const entry = matches[0]
  if (!entry) return null
  const [token, value] = entry
  value.paid = true
  save(data)
  return { token, ...value }
}
