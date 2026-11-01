// Хэш пароля для входа в личный кабинет. Логин и пароль берутся из переменных окружения ACC_LOGIN и ACC_PW
// (их передаёт scripts/setup-account.sh — так пароль не попадает в историю команд и список процессов).
// Печатает две строки для server/.env: ACCOUNT_LOGIN=… и ACCOUNT_PASSWORD_HASH=…
import { hashPassword } from '../lib/accountAuth.js'

const login = String(process.env.ACC_LOGIN ?? '').trim()
const password = String(process.env.ACC_PW ?? '')
if (!/^[A-Za-z0-9._-]{3,40}$/.test(login)) {
  console.error('Логин: 3–40 знаков, латиница, цифры, точка, дефис, подчёркивание')
  process.exit(1)
}
if (password.length < 12) {
  console.error('Пароль слишком короткий: нужно не меньше 12 знаков')
  process.exit(1)
}
console.log(`ACCOUNT_LOGIN=${login}`)
console.log(`ACCOUNT_PASSWORD_HASH=${hashPassword(password)}`)
