// Аккаунты резидентов в личном кабинете на сайте: вход по почте и паролю. Записи — data/accounts.json (id → запись).
// Пароль человек задаёт сам по ссылке из письма (так нельзя занять чужую почту: пароль ставит тот, кто читает письмо).
// Ссылка одноразовая, живёт 24 часа (подтверждение почты) или 2 часа (восстановление); на сервере только её sha256.
// Для остальных хранилищ кабинета (профиль, документы, согласия) аккаунт — это логин «u:<id>».
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { hashPassword, verifyPassword, checkNewPassword, DUMMY_HASH } from './password.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'accounts.json')

export const ACTIVATE_TTL_MS = 24 * 3600 * 1000
export const RESET_TTL_MS = 2 * 3600 * 1000
const MAIL_GAP_MS = 60 * 1000 // письмо для одного адреса не чаще раза в минуту
const FAIL_LIMIT = 8 // неудачных входов подряд на одну почту
const FAIL_WINDOW_MS = 15 * 60 * 1000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const normEmail = (v) => String(v ?? '').trim().toLowerCase()
export const validEmail = (v) => {
  const e = normEmail(v)
  return e.length <= 120 && EMAIL_RE.test(e)
}

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
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, FILE)
}

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex')
// управляющие символы заменяются пробелом (\s их не покрывает), затем пробелы схлопываются
const cleanName = (v) => [...String(v ?? '')].map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim().slice(0, 80)

export const getAccount = (id) => load()[id] ?? null
export const listAccounts = () => Object.values(load())
export const findByEmail = (email) => {
  const e = normEmail(email)
  return e ? listAccounts().find((a) => a.email === e) ?? null : null
}
/** Подтверждённый аккаунт с паролем: только он может входить. */
export const isActive = (a) => Boolean(a?.passwordHash && a.verifiedAt && !a.deletedAt)

function newId(data) {
  for (;;) {
    const id = crypto.randomBytes(8).toString('hex')
    if (!data[id]) return id
  }
}

/** Выдаёт одноразовую ссылку-токен вида <id>.<секрет>; в записи остаётся только хэш секрета. */
function issue(data, account, purpose, now) {
  const secret = crypto.randomBytes(32).toString('hex')
  account.pending = { hash: sha(secret), purpose, expiresAt: now + (purpose === 'reset' ? RESET_TTL_MS : ACTIVATE_TTL_MS) }
  account.lastMailAt = now
  data[account.id] = account
  save(data)
  return `${account.id}.${secret}`
}

/**
 * Регистрация: заводит запись (или находит существующую) и выдаёт ссылку для письма.
 * Возвращает { sent: false } (слишком часто, письмо не нужно) или { sent: true, token, purpose, account }:
 * purpose 'activate' — подтвердить почту и задать пароль; 'reset' — у этой почты уже есть аккаунт, ссылка задаёт новый пароль.
 */
export function startRegistration({ email, name, consentAt, consentVersion, marketing, marketingVersion }, now = Date.now()) {
  const e = normEmail(email)
  if (!validEmail(e)) return { error: 'bad_email' }
  const data = load()
  let account = Object.values(data).find((a) => a.email === e)
  if (account && now - (account.lastMailAt ?? 0) < MAIL_GAP_MS) return { sent: false }
  if (!account) {
    account = { id: newId(data), email: e, name: cleanName(name), createdAt: now, consentAt: consentAt ?? now, consentVersion: consentVersion ?? null, marketing: Boolean(marketing), marketingAt: marketing ? now : null, marketingVersion: marketing ? marketingVersion ?? null : null }
  } else if (!isActive(account)) {
    // регистрация не была завершена: обновляем имя и согласия по последней отправленной форме
    Object.assign(account, { name: cleanName(name) || account.name, consentAt: consentAt ?? now, consentVersion: consentVersion ?? account.consentVersion, marketing: Boolean(marketing), marketingAt: marketing ? now : null, marketingVersion: marketing ? marketingVersion ?? null : null })
  }
  const purpose = isActive(account) ? 'reset' : 'activate'
  const token = issue(data, account, purpose, now)
  return { sent: true, token, purpose, account }
}

/** «Забыли пароль»: ссылка есть только у подтверждённого аккаунта. null — аккаунта нет или письмо слишком частое. */
export function startReset(email, now = Date.now()) {
  const data = load()
  const e = normEmail(email)
  const account = Object.values(data).find((a) => a.email === e)
  if (!isActive(account) || now - (account.lastMailAt ?? 0) < MAIL_GAP_MS) return null
  const token = issue(data, account, 'reset', now)
  return { token, purpose: 'reset', account }
}

function byToken(data, rawToken, now) {
  const [id, secret] = String(rawToken ?? '').split('.')
  if (!/^[0-9a-f]{16}$/.test(id ?? '') || !/^[0-9a-f]{64}$/.test(secret ?? '')) return null
  const account = data[id]
  const p = account?.pending
  if (!p || p.expiresAt <= now) return null
  const a = Buffer.from(sha(secret))
  const b = Buffer.from(p.hash)
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? account : null
}

/** Что за ссылка: { purpose, email } для страницы «задайте пароль» или null, если ссылка недействительна. */
export function peekToken(rawToken, now = Date.now()) {
  const account = byToken(load(), rawToken, now)
  return account ? { purpose: account.pending.purpose, email: account.email, name: account.name } : null
}

/** Задаёт пароль по ссылке из письма: подтверждает почту и гасит ссылку. { account } или { error }. */
export function consumeToken(rawToken, password, now = Date.now()) {
  const data = load()
  const account = byToken(data, rawToken, now)
  if (!account) return { error: 'bad_token' }
  const bad = checkNewPassword(password, account.email)
  if (bad) return { error: bad }
  account.passwordHash = hashPassword(password)
  account.verifiedAt ??= now
  account.passwordChangedAt = now
  account.fails = []
  delete account.pending
  data[account.id] = account
  save(data)
  return { account }
}

/** Вход по почте и паролю. { account } или { error: 'bad_credentials' | 'too_many_attempts' }. */
export function verifyLogin(email, password, now = Date.now()) {
  const data = load()
  const e = normEmail(email)
  const account = Object.values(data).find((a) => a.email === e)
  const fails = (account?.fails ?? []).filter((t) => now - t < FAIL_WINDOW_MS)
  if (account && fails.length >= FAIL_LIMIT) return { error: 'too_many_attempts' }
  // пароль проверяется всегда (для неизвестной почты и неподтверждённого аккаунта — по пустышке), чтобы время ответа не выдавало, есть ли такой человек
  const ok = verifyPassword(String(password ?? ''), isActive(account) ? account.passwordHash : DUMMY_HASH)
  if (account && isActive(account) && ok) {
    account.fails = []
    account.lastLoginAt = now
    data[account.id] = account
    save(data)
    return { account }
  }
  if (account) {
    account.fails = [...fails, now]
    data[account.id] = account
    save(data)
  }
  return { error: 'bad_credentials' }
}

/** Смена пароля вошедшим: нужен текущий. */
export function changePassword(id, current, next, now = Date.now()) {
  const data = load()
  const account = data[id]
  if (!isActive(account) || !verifyPassword(String(current ?? ''), account.passwordHash)) return { error: 'bad_credentials' }
  const bad = checkNewPassword(next, account.email)
  if (bad) return { error: bad }
  account.passwordHash = hashPassword(next)
  account.passwordChangedAt = now
  data[id] = account
  save(data)
  return { ok: true }
}

/** Согласие на рекламные сообщения (включить и отозвать можно в любой момент). */
export function setMarketing(id, value, now = Date.now()) {
  const data = load()
  if (!data[id]) return null
  data[id].marketing = Boolean(value)
  data[id].marketingAt = now
  save(data)
  return data[id]
}

/** Привязка Telegram: по ней находятся подписка и карточка в боте (позже: код из бота). */
export function setTelegram(id, tgUserId) {
  const data = load()
  if (!data[id]) return null
  data[id].tgUserId = String(tgUserId)
  save(data)
  return data[id]
}

/** Удаление аккаунта (по запросу на удаление данных). */
export function deleteAccount(id) {
  const data = load()
  if (!data[id]) return false
  delete data[id]
  save(data)
  return true
}

/** Данные вошедшего в том же виде, что у администратора (login, tgId, name, email, phone): с ними работают все разделы кабинета. */
export function contextOf(account) {
  return {
    login: `u:${account.id}`,
    tgId: account.tgUserId ?? '',
    name: account.name || account.email,
    email: account.email,
    phone: '', // телефон не подтверждён, по нему чужие записи не подтягиваем
    consentAt: account.consentAt ?? null,
    marketing: typeof account.marketing === 'boolean' ? account.marketing : null,
    marketingAt: account.marketingAt ?? null,
  }
}
