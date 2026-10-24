// Отложенные уведомления «заявка без оплаты»: вместо мгновенного сообщения о каждом, кто нажал «Перейти к оплате»,
// ждём N минут. Оплатил — уведомления не будет вовсе (придёт сообщение об оплате); не оплатил — одно сообщение «не завершили оплату».
import fs from 'node:fs'
import path from 'node:path'
import { normalizePhone } from './jsonStore.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'pending-notices.json')

export const PENDING_MINUTES = Number(process.env.PENDING_NOTICE_MINUTES) || 30

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return []
  }
}

function save(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(list))
}

const lower = (v) => String(v ?? '').trim().toLowerCase().replace(/^@/, '')

/** Ставит уведомление в очередь. match — по чему оплату узнаем: phone/email/telegram или eventNumber (регистрация на мероприятие). */
export function queuePending({ kind, text, keyboard, phone, email, telegram, eventNumber }) {
  const list = load()
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, due: Date.now() + PENDING_MINUTES * 60 * 1000, text, keyboard: keyboard ?? null, phone: normalizePhone(phone), email: lower(email), telegram: lower(telegram), eventNumber: eventNumber ?? null })
  save(list)
}

/** Оплата пришла — убираем отложенные уведомления этого человека (по телефону, почте, нику или номеру регистрации). Возвращает, сколько убрали. */
export function cancelPending({ kind, phone, email, telegram, eventNumber }) {
  const list = load()
  const p = normalizePhone(phone)
  const e = lower(email)
  const t = lower(telegram)
  const keep = list.filter((x) => {
    if (kind && x.kind !== kind) return true
    const same = (eventNumber != null && x.eventNumber === eventNumber) || (p && x.phone && x.phone === p) || (e && x.email && x.email === e) || (t && x.telegram && x.telegram === t)
    return !same
  })
  if (keep.length !== list.length) save(keep)
  return list.length - keep.length
}

/** Забирает из очереди уведомления, срок которых вышел. */
export function takeDuePending(now = Date.now()) {
  const list = load()
  const due = list.filter((x) => x.due <= now)
  if (due.length) save(list.filter((x) => x.due > now))
  return due
}
