// Привязка Telegram к кабинету на сайте. Человек пишет боту /link, бот присылает короткий код, человек вводит код в кабинете
// (раздел «Telegram-бот»). Так кабинет узнаёт его Telegram id и находит подписку и карточку в боте без совпадения почт.
// Код одноразовый, живёт 10 минут, на сервере хранится только его sha256 (data/telegram-link-codes.json).
// На одного человека в Telegram — один действующий код: новый /link отменяет прежний.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'telegram-link-codes.json')

export const CODE_TTL_MS = 10 * 60 * 1000
// 31 знак без похожих (нет 0, 1, O, I, L): код читают с экрана и набирают руками. 8 знаков ≈ 40 бит.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

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

/** Код как вводит человек: любой регистр, пробелы и дефисы не важны. null — это не похоже на код. */
export function normalizeCode(raw) {
  const code = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((ch) => ALPHABET.includes(ch)) ? code : null
}

/** Новый код для Telegram id (показывается как XXXX-XXXX). Прежние коды этого человека и просроченные чужие удаляются. */
export function issueCode(tgUserId, now = Date.now()) {
  const tg = String(tgUserId)
  const data = load()
  for (const [k, r] of Object.entries(data)) if (r.expiresAt <= now || r.tgUserId === tg) delete data[k]
  const code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')
  data[sha(code)] = { tgUserId: tg, createdAt: now, expiresAt: now + CODE_TTL_MS }
  save(data)
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** Проверяет код и гасит его. Возвращает Telegram id, который попросил код, или null (неверный, использованный, просроченный). */
export function consumeCode(raw, now = Date.now()) {
  const code = normalizeCode(raw)
  if (!code) return null
  const data = load()
  const record = data[sha(code)]
  if (!record) return null
  delete data[sha(code)]
  save(data)
  return record.expiresAt > now ? record.tgUserId : null
}
