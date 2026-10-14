// Проверка платёжных ссылок второго бота без самого бота.
//   node bot2/scripts/make-link.mjs                     — список подписок и что продаётся
//   node bot2/scripts/make-link.mjs 3m --tg 123456789   — подписанная ссылка на оплату тарифа «3m» (не обращается к Prodamus)
//   node bot2/scripts/make-link.mjs 3m --tg 123456789 --short   — то же, но запросить у Prodamus короткую ссылку на страницу оплаты
// Секретный ключ и домен берутся из bot2/.env (или из переменных окружения).
import fs from 'node:fs'
import path from 'node:path'
import { TARIFFS } from '../lib/tariffs.js'
import { buildSubscriptionLink, createPaymentLink, settings } from '../lib/prodamus.js'

const envFile = path.join(import.meta.dirname, '..', '.env')
if (fs.existsSync(envFile)) process.loadEnvFile(envFile)

const [id, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}

if (!id) {
  const s = settings()
  console.log(`Платёжная страница: ${s.domain} · ключ ${s.key ? 'задан' : 'НЕ ЗАДАН'} · уведомления: ${s.notificationUrl}\n`)
  for (const [key, t] of Object.entries(TARIFFS)) console.log(`${t.sale ? '✅ продаётся' : '⏸ только узнаётся'}  ${key.padEnd(7)} ID ${t.subscription}  ${String(t.price).padStart(5)} ₽ / ${t.days} дн.  ${t.label}`)
  process.exit(0)
}

const params = { tariffId: id, tgUserId: flag('tg'), phone: flag('phone'), email: flag('email'), name: flag('name') }
try {
  console.log(rest.includes('--short') ? await createPaymentLink(params) : buildSubscriptionLink(params))
} catch (err) {
  console.error('Ошибка:', err.message)
  process.exit(1)
}
