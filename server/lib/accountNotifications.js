// Уведомления в кабинете («Вакансии → Уведомления»): ответ рекрутера, смена статуса отклика, ответ поддержки, кадровый резерв.
// Каждое уведомление — запись в ленте кабинета; копию в Telegram отправляет сервер (server/index.js, notifyAccount), если Telegram
// привязан и человек не отключил отправку. Хранится в data/account-notifications.json: { [логин]: { items, settings } }.
// До 100 уведомлений на человека, срок хранения — TERMS.notifications; попадает в «Мои данные»; стирается вместе с аккаунтом.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'account-notifications.json')
const MAX_ITEMS = 100
export const NOTIFICATIONS_TTL_MS = 365 * 24 * 3600 * 1000

/** Какие бывают уведомления: по виду выбирается значок и раздел, куда ведёт ссылка. */
export const NOTIFICATION_KINDS = ['chat_reply', 'application_status', 'support_reply', 'reserve']

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

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** Новое уведомление в ленту человека. link — путь внутри кабинета («/cabinet/chat?v=…»). Возвращает запись. */
export function addNotification(login, { kind, title, text, link }, now = Date.now()) {
  const data = load()
  const mine = data[login] ?? { items: [], settings: {} }
  const item = { id: crypto.randomBytes(6).toString('hex'), kind: NOTIFICATION_KINDS.includes(kind) ? kind : 'chat_reply', title: clip(title, 120), text: clip(text, 400), link: String(link ?? '').startsWith('/cabinet') ? String(link) : '/cabinet', at: now, readAt: null }
  mine.items = [item, ...mine.items].slice(0, MAX_ITEMS)
  data[login] = mine
  save(data)
  return item
}

/** Лента человека, новые сверху. */
export const listNotifications = (login) => load()[login]?.items ?? []

export const unreadNotifications = (login) => listNotifications(login).filter((n) => !n.readAt).length

/** Отмечает прочитанными: ids — список номеров, без списка — все. Возвращает, сколько отметили. */
export function markNotificationsRead(login, ids, now = Date.now()) {
  const data = load()
  const items = data[login]?.items
  if (!items) return 0
  const wanted = Array.isArray(ids) ? new Set(ids.map(String)) : null
  let n = 0
  for (const it of items) {
    if (!it.readAt && (!wanted || wanted.has(it.id))) {
      it.readAt = now
      n += 1
    }
  }
  if (n) save(data)
  return n
}

/** Настройки доставки: telegram — присылать копию уведомлений в Telegram-бота (по умолчанию да, если он привязан). */
export const getNotificationSettings = (login) => ({ telegram: load()[login]?.settings?.telegram !== false })

export function setNotificationSettings(login, { telegram }) {
  const data = load()
  const mine = data[login] ?? { items: [], settings: {} }
  if (typeof telegram === 'boolean') mine.settings = { ...mine.settings, telegram }
  data[login] = mine
  save(data)
  return getNotificationSettings(login)
}

/** Стирает уведомления и настройки человека. Возвращает число стёртых уведомлений. */
export function eraseNotifications(login) {
  const data = load()
  const n = data[login]?.items?.length ?? 0
  if (data[login]) {
    delete data[login]
    save(data)
  }
  return n
}

/** Уведомления старше срока хранения (для автоудаления по срокам). */
export function countOldNotifications(now = Date.now()) {
  return Object.values(load()).reduce((acc, m) => acc + m.items.filter((i) => i.at <= now - NOTIFICATIONS_TTL_MS).length, 0)
}

export function pruneNotifications(now = Date.now()) {
  const data = load()
  let n = 0
  for (const [login, m] of Object.entries(data)) {
    const keep = m.items.filter((i) => i.at > now - NOTIFICATIONS_TTL_MS)
    n += m.items.length - keep.length
    m.items = keep
    if (!keep.length && !Object.keys(m.settings ?? {}).length) delete data[login]
  }
  if (n) save(data)
  return n
}
