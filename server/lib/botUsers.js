// Пользователи бота (перенос воронки из BotHelp): кто запустил бота, метки
// («пользователь», «согласие»), согласие на обработку персональных данных.
// Ключ — Telegram id. Хранится в data/bot-users.json.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'bot-users.json')

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

export function listBotUsers() {
  return Object.values(load())
}

export function getBotUser(tgId) {
  return load()[String(tgId)] ?? null
}

/** Запись при запуске бота: создаёт пользователя с меткой «пользователь» или обновляет имя. */
export function touchBotUser(from) {
  const data = load()
  const id = String(from.id)
  const now = Date.now()
  const user = data[id] ?? { id, tags: [], createdAt: now }
  user.firstName = from.first_name || user.firstName || ''
  user.lastName = from.last_name || user.lastName || ''
  user.username = from.username ? `@${from.username}` : user.username || ''
  user.lastSeenAt = now
  if (!user.tags.includes('пользователь')) user.tags.push('пользователь')
  data[id] = user
  save(data)
  return user
}

export function addTag(tgId, tag) {
  const data = load()
  const user = data[String(tgId)]
  if (!user) return null
  if (!user.tags.includes(tag)) user.tags.push(tag)
  save(data)
  return user
}

/** Согласие на обработку персональных данных («Ознакомлен и согласен»). */
export function giveConsent(tgId) {
  const data = load()
  const user = data[String(tgId)]
  if (!user) return null
  user.consentAt = user.consentAt ?? Date.now()
  if (!user.tags.includes('согласие')) user.tags.push('согласие')
  save(data)
  return user
}
