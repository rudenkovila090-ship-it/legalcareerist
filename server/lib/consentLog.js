// Журнал согласий на обработку персональных данных, полученных через формы сайта.
// Каждая отправка формы дописывается в data/consent-log.jsonl: когда, какая форма, какая редакция текста согласия,
// кто (имя и контакты, которые человек указал). По нему можно доказать, что человек согласился, и когда именно.
// При удалении данных по запросу (erasure.js) имя и контакты заменяются на отпечатки (sha256) — сам факт согласия остаётся,
// а кто это был, по журналу уже не прочесть; по телефону/почте человека его запись можно найти и подтвердить.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { normalizePhone } from './jsonStore.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'consent-log.jsonl')

/** Нормализованные «ключи человека»: по ним ищем одного и того же человека в разных хранилищах. */
export function personKeys({ phone, email, telegram, tgId } = {}) {
  const keys = new Set()
  const digits = normalizePhone(phone)
  if (digits.length >= 10) keys.add(`p:${digits}`)
  const mail = String(email ?? '').trim().toLowerCase()
  if (mail.includes('@')) keys.add(`e:${mail}`)
  const tg = String(telegram ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').toLowerCase()
  if (tg) keys.add(`t:${tg}`)
  if (tgId != null && String(tgId).trim()) keys.add(`i:${String(tgId).trim()}`)
  return keys
}

export const keyHash = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)

function readAll() {
  try {
    return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

function writeAll(entries) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''))
}

/** Записывает согласие (given=true) или отправку формы без отметки (given=false — устаревший клиент/обход формы). */
export function recordConsent({ form, version, given, name, phone, email, telegram, tgId, at = Date.now() }) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const entry = { at, form: String(form ?? '').slice(0, 80), version: String(version ?? '').slice(0, 20), given: given === true }
    if (name) entry.name = String(name).slice(0, 120)
    if (phone) entry.phone = String(phone).slice(0, 40)
    if (email) entry.email = String(email).slice(0, 120)
    if (telegram) entry.telegram = String(telegram).slice(0, 60)
    if (tgId != null) entry.tgId = String(tgId)
    fs.appendFileSync(FILE, `${JSON.stringify(entry)}\n`)
  } catch (err) {
    console.error('[consent] не удалось записать журнал согласий:', err.message)
  }
}

const entryKeys = (e) => personKeys({ phone: e.phone, email: e.email, telegram: e.telegram, tgId: e.tgId })

/** Сколько записей журнала относится к этому человеку. */
export function countConsentEntries(keys) {
  return readAll().filter((e) => [...entryKeys(e)].some((k) => keys.has(k))).length
}

/** Заменяет имя и контакты человека в журнале на отпечатки. Возвращает число изменённых записей. */
export function pseudonymizeConsent(keys) {
  const all = readAll()
  let changed = 0
  const next = all.map((e) => {
    const own = entryKeys(e)
    if (![...own].some((k) => keys.has(k))) return e
    changed += 1
    return { at: e.at, form: e.form, version: e.version, given: e.given, erasedAt: Date.now(), ids: [...own].map(keyHash) }
  })
  if (changed) writeAll(next)
  return changed
}

/** Удаляет записи старше граница (мс). Возвращает число удалённых. */
export function pruneConsentLog(beforeTs) {
  const all = readAll()
  const kept = all.filter((e) => e.at >= beforeTs)
  if (kept.length !== all.length) writeAll(kept)
  return all.length - kept.length
}

export function countOlderConsent(beforeTs) {
  return readAll().filter((e) => e.at < beforeTs).length
}
