// Чат поддержки в кабинете: переписка человека со службой поддержки. Сообщение человека уходит админу в Telegram-бота;
// админ отвечает обычным ответом (Reply) на это сообщение, и ответ появляется в чате кабинета (а человеку приходит письмо
// и сообщение в Telegram, если он привязан). Ключ — логин кабинета («u:<id>» или логин администратора).
// Хранится в data/support-chat.json: сообщения (не больше 200 на человека), время, когда человек последний раз открывал чат,
// и номера сообщений-уведомлений в чате админа (по ним ответ находит нужную переписку).
// Срок хранения — TERMS.support после последнего сообщения; попадает в «Мои данные»; стирается вместе с аккаунтом.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'support-chat.json')
export const MAX_TEXT = 2000
const MAX_MESSAGES = 200
const MAX_ADMIN_IDS = 100
export const SUPPORT_TTL_MS = 365 * 24 * 3600 * 1000

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

const cleanText = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT)
const lastAt = (t) => t.messages.at(-1)?.at ?? 0

/** Переписка человека: { messages: [{ id, from: 'user' | 'support', text, at }], unread } — unread: ответы поддержки, которых он ещё не видел. */
export function getThread(login) {
  const t = load()[login]
  const messages = t?.messages ?? []
  const seenAt = t?.seenAt ?? 0
  return { messages, unread: messages.filter((m) => m.from === 'support' && m.at > seenAt).length }
}

export const unreadCount = (login) => getThread(login).unread

/** Человек открыл чат: ответы до этого момента считаются прочитанными. */
export function markSeen(login, now = Date.now()) {
  const data = load()
  if (!data[login]) return
  data[login].seenAt = now
  save(data)
}

function add(login, from, text, now) {
  const body = cleanText(text)
  if (!body) return { error: 'empty' }
  const data = load()
  const t = data[login] ?? { messages: [], adminMsgIds: [] }
  const message = { id: crypto.randomBytes(6).toString('hex'), from, text: body, at: now }
  t.messages = [...t.messages, message].slice(-MAX_MESSAGES)
  data[login] = t
  save(data)
  return { message }
}

/** Сообщение человека. */
export const addUserMessage = (login, text, now = Date.now()) => add(login, 'user', text, now)

/** Ответ поддержки (с админского аккаунта в боте). */
export const addSupportReply = (login, text, now = Date.now()) => add(login, 'support', text, now)

/** Запоминает номер сообщения-уведомления в чате админа: ответ на него (Reply) попадёт в переписку этого человека. */
export function linkAdminMessage(login, tgMessageId) {
  if (!login || !tgMessageId) return
  const data = load()
  const t = data[login]
  if (!t) return
  t.adminMsgIds = [...(t.adminMsgIds ?? []), Number(tgMessageId)].slice(-MAX_ADMIN_IDS)
  save(data)
}

/** Чья переписка по номеру сообщения-уведомления в чате админа, или null. */
export function loginByAdminMessage(tgMessageId) {
  const id = Number(tgMessageId)
  if (!id) return null
  return Object.entries(load()).find(([, t]) => (t.adminMsgIds ?? []).includes(id))?.[0] ?? null
}

/** Стирает переписку человека. Возвращает число стёртых сообщений. */
export function eraseThread(login) {
  const data = load()
  const n = data[login]?.messages?.length ?? 0
  if (data[login]) {
    delete data[login]
    save(data)
  }
  return n
}

/** Переписки, где последнее сообщение старше срока (для автоудаления по срокам хранения). */
const expired = (data, now) => Object.entries(data).filter(([, t]) => lastAt(t) <= now - SUPPORT_TTL_MS)
export const countOldThreads = (now = Date.now()) => expired(load(), now).length

export function pruneThreads(now = Date.now()) {
  const data = load()
  const old = expired(data, now)
  for (const [login] of old) delete data[login]
  if (old.length) save(data)
  return old.length
}
