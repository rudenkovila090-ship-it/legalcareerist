// Чат с рекрутером в кабинете: отдельная переписка по каждой вакансии, чтобы разговоры не путались. Сообщение человека уходит
// админу в Telegram-бота с названием вакансии; админ отвечает обычным ответом (Reply) на это сообщение, и ответ появляется в
// чате этой вакансии (по нему же человеку приходит уведомление). Ключ — логин кабинета и адрес вакансии (slug).
// Хранится в data/recruiter-chat.json: { [логин]: { [slug]: { title, messages, seenAt, adminMsgIds } } }; сообщений не больше
// 200 в переписке, переписок не больше 30 на человека. Срок хранения — TERMS.support после последнего сообщения; попадает в
// «Мои данные»; стирается вместе с аккаунтом.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'recruiter-chat.json')
export const MAX_TEXT = 2000
const MAX_MESSAGES = 200
const MAX_THREADS = 30
const MAX_ADMIN_IDS = 100
export const RECRUITER_TTL_MS = 365 * 24 * 3600 * 1000

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
const unreadOf = (t) => t.messages.filter((m) => m.from === 'recruiter' && m.at > (t.seenAt ?? 0)).length

/** Переписки человека: по одной на вакансию, свежие сверху. */
export function listThreads(login) {
  const mine = load()[login] ?? {}
  return Object.entries(mine)
    .map(([slug, t]) => ({ slug, title: t.title || slug, last: t.messages.at(-1) ?? null, count: t.messages.length, unread: unreadOf(t) }))
    .sort((a, b) => (b.last?.at ?? 0) - (a.last?.at ?? 0))
}

/** Переписка по одной вакансии: { messages, unread } — unread: ответы рекрутера, которых человек ещё не видел. */
export function getThread(login, slug) {
  const t = load()[login]?.[slug]
  return { title: t?.title ?? '', messages: t?.messages ?? [], unread: t ? unreadOf(t) : 0 }
}

/** Непрочитанные ответы рекрутера во всех вакансиях. */
export const unreadTotal = (login) => listThreads(login).reduce((n, t) => n + t.unread, 0)

/** Человек открыл переписку: ответы до этого момента считаются прочитанными. */
export function markSeen(login, slug, now = Date.now()) {
  const data = load()
  const t = data[login]?.[slug]
  if (!t) return
  t.seenAt = now
  save(data)
}

function add(login, slug, title, from, text, now) {
  const body = cleanText(text)
  if (!body) return { error: 'empty' }
  const data = load()
  const mine = data[login] ?? {}
  if (!mine[slug] && Object.keys(mine).length >= MAX_THREADS) return { error: 'too_many_threads' }
  const t = mine[slug] ?? { title: title || slug, messages: [], adminMsgIds: [] }
  if (title) t.title = title
  const message = { id: crypto.randomBytes(6).toString('hex'), from, text: body, at: now }
  t.messages = [...t.messages, message].slice(-MAX_MESSAGES)
  mine[slug] = t
  data[login] = mine
  save(data)
  return { message }
}

/** Сообщение человека по вакансии (title — название вакансии для админа и списка). */
export const addUserMessage = (login, slug, title, text, now = Date.now()) => add(login, slug, title, 'user', text, now)

/** Ответ рекрутера (Reply админа в боте). */
export const addRecruiterReply = (login, slug, text, now = Date.now()) => add(login, slug, '', 'recruiter', text, now)

/** Запоминает номер сообщения-уведомления в чате админа: ответ на него (Reply) попадёт в переписку по этой вакансии. */
export function linkAdminMessage(login, slug, tgMessageId) {
  if (!login || !slug || !tgMessageId) return
  const data = load()
  const t = data[login]?.[slug]
  if (!t) return
  t.adminMsgIds = [...(t.adminMsgIds ?? []), Number(tgMessageId)].slice(-MAX_ADMIN_IDS)
  save(data)
}

/** Чья переписка по номеру сообщения-уведомления в чате админа: { login, slug, title } или null. */
export function threadByAdminMessage(tgMessageId) {
  const id = Number(tgMessageId)
  if (!id) return null
  for (const [login, mine] of Object.entries(load())) {
    for (const [slug, t] of Object.entries(mine)) if ((t.adminMsgIds ?? []).includes(id)) return { login, slug, title: t.title || slug }
  }
  return null
}

/** Все переписки человека целиком — для выгрузки «Мои данные». */
export const exportThreads = (login) => Object.entries(load()[login] ?? {}).map(([slug, t]) => ({ slug, title: t.title || slug, messages: t.messages }))

/** Стирает переписки человека. Возвращает число стёртых сообщений. */
export function eraseThreads(login) {
  const data = load()
  const n = Object.values(data[login] ?? {}).reduce((acc, t) => acc + t.messages.length, 0)
  if (data[login]) {
    delete data[login]
    save(data)
  }
  return n
}

/** Переписки, где последнее сообщение старше срока (для автоудаления по срокам хранения). */
function expiredThreads(data, now) {
  const out = []
  for (const [login, mine] of Object.entries(data)) for (const [slug, t] of Object.entries(mine)) if (lastAt(t) <= now - RECRUITER_TTL_MS) out.push([login, slug])
  return out
}
export const countOldThreads = (now = Date.now()) => expiredThreads(load(), now).length

export function pruneThreads(now = Date.now()) {
  const data = load()
  const old = expiredThreads(data, now)
  for (const [login, slug] of old) {
    delete data[login][slug]
    if (!Object.keys(data[login]).length) delete data[login]
  }
  if (old.length) save(data)
  return old.length
}
