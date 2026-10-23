// Пароли: хэш scrypt (соль внутри строки), проверка за постоянное время и правила для нового пароля.
// Вынесено из accountAuth.js, чтобы им пользовались и вход администратора, и аккаунты резидентов (accountUsers.js).
import crypto from 'node:crypto'

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

// Хэш-пустышка: при неверном логине пароль всё равно проверяется, чтобы по времени ответа нельзя было угадать,
// есть ли такой человек.
export const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'))

// Самые частые пароли длиной от 10 знаков (короче 10 отсекает длина). Список короткий нарочно: главная защита — длина, хэш scrypt
// и лимит неудачных входов; здесь отсекается то, что подбирают первым.
const COMMON = new Set([
  '1234567890', '0123456789', '12345678910', '123456789012', '1234567890123', '9876543210', '0987654321',
  'qwertyuiop', 'qwerty1234', 'qwerty12345', 'qwerty123456', 'qwertyqwerty', 'asdfghjkl1', 'zxcvbnm123',
  'password12', 'password123', 'password1234', 'password12345', 'password123456', 'passw0rd123', 'pa$$word123',
  '1q2w3e4r5t', '1q2w3e4r5t6y', '1qaz2wsx3edc', 'q1w2e3r4t5', 'qazwsxedc123',
  'iloveyou12', 'iloveyou123', 'adminadmin', 'administrator', 'letmein1234', 'welcome1234', 'abcdefghij', 'abc1234567',
  'йцукенгшщз', 'парольпароль', 'пароль1234', 'пароль12345', 'qwerty1234567',
])

/** Правила нового пароля: от 10 знаков, не слишком простой, не равен почте. Возвращает код ошибки или null. */
export function checkNewPassword(password, email = '') {
  const p = String(password ?? '')
  if (p.length < 10) return 'password_short'
  if (p.length > 200) return 'password_long'
  if (COMMON.has(p.toLowerCase()) || /^(.{1,4})\1+$/.test(p)) return 'password_weak'
  if (email && p.toLowerCase() === String(email).toLowerCase()) return 'password_weak'
  return null
}
