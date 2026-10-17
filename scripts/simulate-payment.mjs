// Имитация оплаты материала БЕЗ денег: отправляет боту такое же подписанное уведомление, какое присылает Prodamus.
// Нужно, чтобы проверить всю цепочку: выдача файла в Telegram, письмо с PDF, сообщение админу.
// Сначала в боте или на сайте нажмите «оплатить» (создастся заявка на покупку), потом запустите:
//   bash /var/www/legalcareerist/scripts/simulate-payment.sh
// Тестовая оплата помечена (order_id TEST-…) и в финансы не попадает.
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { HmacHelper } from '../server/lib/hmac.js'

const ROOT = path.join(import.meta.dirname, '..', 'server')
const KEY = process.env.PRODAMUS_MATERIALS_SECRET_KEY || process.env.PRODAMUS_SECRET_KEY
const PORT = process.env.PORT || 3001
const MAX_AGE_MS = 3 * 3600 * 1000

if (!KEY) {
  console.log('❌ Не найден секретный ключ Prodamus в server/.env')
  process.exit(1)
}

let purchases = {}
try {
  purchases = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'material-purchases.json'), 'utf8'))
} catch {
  // файла ещё нет
}
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'material-catalog.json'), 'utf8'))
const titleOf = (slug) => catalog.find((m) => m.slug === slug)?.title ?? slug
const priceOf = (slug) => catalog.find((m) => m.slug === slug)?.price ?? 490

const candidates = Object.entries(purchases)
  .map(([token, p]) => ({ token, ...p }))
  .filter((p) => !p.paid && Date.now() - p.createdAt < MAX_AGE_MS)
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, 5)

if (!candidates.length) {
  console.log('Нет неоплаченных заявок за последние 3 часа.')
  console.log('Сначала в боте (Маркетплейс → материал → оплатить) или на сайте (страница материала → «Перейти к оплате») создайте заявку, потом запустите скрипт снова.')
  process.exit(0)
}

// Построчное чтение ввода: работает и в терминале, и при вставке нескольких строк сразу.
const rl = readline.createInterface({ input: process.stdin })
const lines = rl[Symbol.asyncIterator]()
const ask = async (question) => {
  process.stdout.write(question)
  const { value } = await lines.next()
  return value ?? ''
}
console.log('Неоплаченные заявки на материалы (новые сверху):')
candidates.forEach((p, i) => {
  const when = new Date(p.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  console.log(`  ${i + 1}) ${when} · ${titleOf(p.materialSlug)} · ${p.name || 'без имени'} · ${p.tgUserId ? `Telegram id ${p.tgUserId}` : p.phone || ''}${p.email ? ` · ${p.email}` : ''}`)
})
const pick = (await ask(`Какую «оплатить»? Номер [1]: `)).trim() || '1'
const chosen = candidates[Number(pick) - 1]
if (!chosen) {
  console.log('❌ Нет такого номера.')
  process.exit(1)
}
let email = chosen.email || ''
if (!email) email = (await ask('Почта для письма с PDF (как будто её ввёл покупатель на странице оплаты), Enter — без письма: ')).trim()
console.log(`\nИмитирую оплату: «${titleOf(chosen.materialSlug)}» для ${chosen.name || 'без имени'}${chosen.tgUserId ? ` (Telegram ${chosen.tgUserId})` : ''}${email ? `, письмо на ${email}` : ''}.`)
console.log('Покупателю реально уйдут файл и письмо. Деньги не списываются, в финансы это не попадёт.')
const ok = (await ask('Продолжить? Введите «да»: ')).trim().toLowerCase()
rl.close()
if (ok !== 'да' && ok !== 'yes') {
  console.log('Отменено.')
  process.exit(0)
}

const body = {
  payment_status: 'success',
  order_id: `TEST-${Date.now()}`,
  sum: `${priceOf(chosen.materialSlug)}.00`,
  date: new Date().toISOString(),
  ...(chosen.phone ? { customer_phone: chosen.phone } : {}),
  ...(email ? { customer_email: email } : {}),
  ...(chosen.tgUserId ? { tg_user_id: String(chosen.tgUserId) } : {}),
  products: [{ name: titleOf(chosen.materialSlug), price: `${priceOf(chosen.materialSlug)}`, quantity: '1' }],
}
const res = await fetch(`http://127.0.0.1:${PORT}/api/prodamus/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Sign: HmacHelper.create(body, KEY) },
  body: JSON.stringify(body),
})
console.log(res.ok ? '✅ Уведомление принято ботом. Через несколько секунд проверьте:' : `❌ Бот ответил ${res.status}. Пришлите мне эту строку.`)
if (res.ok) {
  console.log('  • файл в Telegram (если покупка из бота) или кнопку «Скачать PDF» на странице покупки (если с сайта);')
  console.log('  • письмо с PDF на почту (папка «Спам» тоже);')
  console.log('  • на рабочий аккаунт: «🧪 ТЕСТ: имитация оплаты материала» со статусом письма.')
}
