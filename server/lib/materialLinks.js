// Личная ссылка на купленный материал: случайный токен, действует 7 дней. Ссылка уходит покупателю в письме после оплаты;
// по ссылке на сайте открывается страница /materials/download?token=… с кнопкой «Скачать PDF».
// На сервере хранится только sha256 токена (data/material-links.json): по файлу сами ссылки не восстановить.
// Ссылка привязана к покупке: если покупку стёрли (удаление данных по запросу), ссылка перестаёт открываться.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'material-links.json')

export const LINK_TTL_MS = 7 * 24 * 3600 * 1000
/** Записи с давно истёкшим сроком убираем при выдаче новой ссылки. */
const KEEP_EXPIRED_MS = 30 * 24 * 3600 * 1000

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex')

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  fs.renameSync(tmp, FILE)
}

/** Токен как его присылают в адресе: 48 шестнадцатеричных знаков. */
export const looksLikeLinkToken = (v) => /^[0-9a-f]{48}$/i.test(String(v ?? ''))

/** Новая личная ссылка на покупку: { token, expiresAt }. Прежние ссылки на эту покупку продолжают действовать до своего срока. */
export function issueMaterialLink(purchaseToken, now = Date.now()) {
  const data = load()
  for (const [k, r] of Object.entries(data)) if (r.expiresAt <= now - KEEP_EXPIRED_MS) delete data[k]
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = now + LINK_TTL_MS
  data[sha(token)] = { purchaseToken, createdAt: now, expiresAt }
  save(data)
  return { token, expiresAt }
}

/** Что за ссылка: { purchaseToken, expiresAt } или { error: 'not_found' | 'expired' }. */
export function resolveMaterialLink(token, now = Date.now()) {
  if (!looksLikeLinkToken(token)) return { error: 'not_found' }
  const record = load()[sha(String(token).toLowerCase())]
  if (!record) return { error: 'not_found' }
  if (record.expiresAt <= now) return { error: 'expired', expiresAt: record.expiresAt }
  return { purchaseToken: record.purchaseToken, expiresAt: record.expiresAt }
}
