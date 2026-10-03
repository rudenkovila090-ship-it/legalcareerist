// Пользователи бота (перенос воронки из BotHelp): кто запустил бота, метки
// («пользователь», «согласие»), согласие на обработку персональных данных.
// Ключ — Telegram id. Хранится в data/bot-users.json.
import fs from 'node:fs'
import path from 'node:path'
import { detectGender } from './gender.js'

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
export function touchBotUser(from, startParam) {
  const data = load()
  const id = String(from.id)
  const now = Date.now()
  const user = data[id] ?? { id, tags: [], createdAt: now, conversationsCount: 0 }
  user.firstName = from.first_name || user.firstName || ''
  user.lastName = from.last_name || user.lastName || ''
  user.username = from.username ? `@${from.username}` : user.username || ''
  user.lastSeenAt = now
  user.lastContactAt = now
  if (!user.gender) {
    const g = detectGender(user.firstName)
    if (g) user.gender = g
  }
  // Параметр из ссылки на бота (t.me/бот?start=...): запоминаем первый; «promo_КОД» заполняет промокод.
  if (startParam) {
    user.startParam = user.startParam || startParam
    const promo = String(startParam).match(/^promo_(.+)$/i)?.[1]
    if (promo && !user.promo) user.promo = promo
  }
  if (!user.tags.includes('пользователь')) user.tags.push('пользователь')
  data[id] = user
  save(data)
  return user
}

/** Считает начало диалога (/start): счётчик «диалогов» из карточки BotHelp. */
export function countConversation(tgId) {
  const data = load()
  const user = data[String(tgId)]
  if (!user) return null
  user.conversationsCount = (user.conversationsCount ?? 0) + 1
  save(data)
  return user
}

/** Загрузка карточки из выгрузки BotHelp: добавляет нового или дополняет существующего (согласия и метки не теряются). */
export function upsertImportedUser(record) {
  const data = load()
  const id = String(record.id)
  const existing = data[id]
  if (!existing) {
    data[id] = { ...record, id, tags: [...new Set(record.tags ?? [])], importedAt: Date.now() }
  } else {
    const merged = { ...record, ...existing }
    for (const [k, v] of Object.entries(record)) if ((existing[k] === undefined || existing[k] === '' || existing[k] === null) && v !== undefined && v !== '') merged[k] = v
    merged.tags = [...new Set([...(existing.tags ?? []), ...(record.tags ?? [])])]
    data[id] = merged
  }
  save(data)
  return { created: !existing }
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

/** Согласие/отказ от рассылки: ставит метку из BotHelp («согласен_на_рассылку_сообщений» / «не_согласен_на_рассылку_сообщений»). */
export function setMailingConsent(tgId, agreed) {
  const data = load()
  const user = data[String(tgId)]
  if (!user) return null
  user.mailingConsent = agreed
  user.mailingAnsweredAt = Date.now()
  const on = 'согласен_на_рассылку_сообщений'
  const off = 'не_согласен_на_рассылку_сообщений'
  user.tags = user.tags.filter((t) => t !== on && t !== off)
  user.tags.push(agreed ? on : off)
  save(data)
  return user
}

/** Дописывает контакты, которые человек оставил в боте (имя, телефон, почта). */
export function updateBotUser(tgId, fields) {
  const data = load()
  const user = data[String(tgId)]
  if (!user) return null
  for (const [k, v] of Object.entries(fields)) if (v) user[k] = v
  save(data)
  return user
}

/** Пол, выбранный человеком кнопкой (когда по имени определить не удалось). */
export function setGender(tgId, gender) {
  const data = load()
  const user = data[String(tgId)]
  if (!user || !['m', 'f'].includes(gender)) return null
  user.gender = gender
  save(data)
  return user
}
