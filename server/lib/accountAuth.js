// Вход в личный кабинет на сайте (/cabinet): администратор проекта (логин и хэш пароля в server/.env) и резиденты
// с аккаунтами (lib/accountUsers.js, вход по почте и паролю). Сессия резидента хранится под логином «u:<id аккаунта>».
// Администратор пользуется кабинетом как клиент сервиса. Логин и хэш пароля лежат только в server/.env (ACCOUNT_LOGIN,
// ACCOUNT_PASSWORD_HASH — готовит scripts/setup-account.sh); пароль нигде не хранится, в репозиторий ничего не попадает.
// Не настроено — вход отключён (503), остальные посетители видят «раздел в разработке».
// Сессии: случайный токен у браузера, на сервере — только его sha256 и срок (account-sessions.json), поэтому после
// перезапуска сервера (деплоя) вход сохраняется.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.js'
import { getAccount, isActive } from './accountUsers.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'account-sessions.json')
export const SESSION_MS = 30 * 24 * 3600 * 1000
export { hashPassword, verifyPassword }

const DUMMY = DUMMY_HASH
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest()
export const sameText = (a, b) => crypto.timingSafeEqual(digest(a), digest(b))

/** Настройки входа из окружения или null, если вход не настроен. */
export function accountConfig(env = process.env) {
  const login = String(env.ACCOUNT_LOGIN ?? '').trim()
  const hash = String(env.ACCOUNT_PASSWORD_HASH ?? '').trim()
  if (!login || !hash) return null
  return { login, hash, tgId: String(env.ACCOUNT_TG_ID || env.TELEGRAM_ADMIN_CHAT_ID || ''), name: String(env.ACCOUNT_NAME ?? '').trim(), email: String(env.ACCOUNT_EMAIL ?? '').trim(), phone: String(env.ACCOUNT_PHONE ?? '').trim() }
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
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
}

const tokenKey = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

/** Проверка логина и пароля. Возвращает { token, expiresAt } или { error: 'not_configured' | 'bad_credentials' }. */
export function login(loginInput, password, env = process.env, now = Date.now()) {
  const cfg = accountConfig(env)
  if (!cfg) return { error: 'not_configured' }
  const loginOk = sameText(String(loginInput ?? '').trim(), cfg.login)
  const passOk = verifyPassword(String(password ?? ''), loginOk ? cfg.hash : DUMMY)
  if (!(loginOk && passOk)) return { error: 'bad_credentials' }
  return startSession(cfg.login, now)
}

/** Новая сессия на 30 дней для логина (администратор или «u:<id>»): токен у браузера, на сервере только его sha256. */
export function startSession(loginName, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('hex')
  const data = load()
  for (const [k, s] of Object.entries(data)) if (s.expiresAt <= now) delete data[k]
  data[tokenKey(token)] = { login: loginName, createdAt: now, expiresAt: now + SESSION_MS }
  save(data)
  return { token, expiresAt: now + SESSION_MS }
}

/** Сессия по токену из заголовка Authorization: Bearer … или null. Если логин в окружении сменили — старые сессии не действуют. */
export function sessionFor(token, env = process.env, now = Date.now()) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const cfg = accountConfig(env)
  const s = load()[tokenKey(token)]
  if (!s || s.expiresAt <= now) return null
  if (cfg && s.login === cfg.login) return s
  // резидент: сессия живёт, пока есть подтверждённый аккаунт (его удаляют по запросу на удаление данных)
  if (String(s.login).startsWith('u:')) {
    const account = getAccount(String(s.login).slice(2))
    if (account && isActive(account)) return s
  }
  return null
}

/** Закрывает все сессии одного логина (смена пароля, удаление аккаунта); except — токен, который оставить. */
export function revokeFor(loginName, exceptToken = '') {
  const data = load()
  const keep = exceptToken ? tokenKey(exceptToken) : ''
  let changed = false
  for (const [k, s] of Object.entries(data)) {
    if (s.login === loginName && k !== keep) {
      delete data[k]
      changed = true
    }
  }
  if (changed) save(data)
}

export function logout(token) {
  if (!token) return
  const data = load()
  if (data[tokenKey(token)]) {
    delete data[tokenKey(token)]
    save(data)
  }
}

/** Отзывает входы администратора (смена пароля скриптом, удаление его данных); входы резидентов («u:<id>») остаются. */
export function revokeAdminSessions() {
  const data = load()
  for (const [k, s] of Object.entries(data)) if (!String(s.login).startsWith('u:')) delete data[k]
  save(data)
}

/** Токен из заголовка запроса. */
export const bearer = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
