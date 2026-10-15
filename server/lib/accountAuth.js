// Вход в личный кабинет на сайте (/cabinet). Пока кабинет в разработке, входит один человек — администратор проекта,
// который пользуется кабинетом как клиент сервиса. Логин и хэш пароля лежат только в server/.env (ACCOUNT_LOGIN,
// ACCOUNT_PASSWORD_HASH — готовит scripts/setup-account.sh); пароль нигде не хранится, в репозиторий ничего не попадает.
// Не настроено — вход отключён (503), остальные посетители видят «раздел в разработке».
// Сессии: случайный токен у браузера, на сервере — только его sha256 и срок (account-sessions.json), поэтому после
// перезапуска сервера (деплоя) вход сохраняется.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'account-sessions.json')
export const SESSION_MS = 30 * 24 * 3600 * 1000
const SCRYPT = { N: 16384, r: 8, p: 1 }

/** Хэш пароля вида scrypt.<соль>.<ключ> (base64url — без символов, которые ломают .env). */
export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const key = crypto.scryptSync(String(password), salt, 64, SCRYPT)
  return `scrypt.${salt.toString('base64url')}.${key.toString('base64url')}`
}

export function verifyPassword(password, stored) {
  const [alg, s, k] = String(stored ?? '').split('.')
  if (alg !== 'scrypt' || !s || !k) return false
  const expected = Buffer.from(k, 'base64url')
  const key = crypto.scryptSync(String(password), Buffer.from(s, 'base64url'), expected.length, SCRYPT)
  return key.length === expected.length && crypto.timingSafeEqual(key, expected)
}

// Хэш-пустышка: при неверном логине пароль всё равно проверяется, чтобы по времени ответа нельзя было угадать логин.
const DUMMY = hashPassword(crypto.randomBytes(8).toString('hex'))
const digest = (v) => crypto.createHash('sha256').update(String(v)).digest()
const sameText = (a, b) => crypto.timingSafeEqual(digest(a), digest(b))

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
  const token = crypto.randomBytes(32).toString('hex')
  const data = load()
  for (const [k, s] of Object.entries(data)) if (s.expiresAt <= now) delete data[k]
  data[tokenKey(token)] = { login: cfg.login, createdAt: now, expiresAt: now + SESSION_MS }
  save(data)
  return { token, expiresAt: now + SESSION_MS }
}

/** Сессия по токену из заголовка Authorization: Bearer … или null. Если логин в окружении сменили — старые сессии не действуют. */
export function sessionFor(token, env = process.env, now = Date.now()) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const cfg = accountConfig(env)
  const s = load()[tokenKey(token)]
  if (!cfg || !s || s.expiresAt <= now || s.login !== cfg.login) return null
  return s
}

export function logout(token) {
  if (!token) return
  const data = load()
  if (data[tokenKey(token)]) {
    delete data[tokenKey(token)]
    save(data)
  }
}

/** Все сессии отзываются (например, после смены пароля скриптом). */
export function revokeAll() {
  save({})
}

/** Токен из заголовка запроса. */
export const bearer = (req) => String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
