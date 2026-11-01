// Загрузка истории платежей из выгрузки Prodamus (CSV) в учёт сообщества.
//   node scripts/importPayments.js файл.csv --dry     — только показать, что будет сделано
//   node scripts/importPayments.js файл.csv           — записать в учёт
// Колонки находятся по названиям (русским или английским): номер заказа, дата, сумма,
// телефон, почта, ФИО, Telegram, статус, название подписки, номер платежа.
// Импортируются только успешные платежи по подпискам (билеты, материалы и возвраты пропускаются). Даты — московское время.
// Повторный запуск того же файла ничего не дублирует (платёж узнаётся по «ID заказа», как в вебхуке Prodamus).
// Подписчика находит по Telegram id (колонка tg_user_id, её ставит BotHelp в ссылку оплаты), телефону, почте, нику.
// Уже заведённые карточки не портит: бессрочные не трогает, срок окончания не сокращает, отключённые остаются отключёнными.
//   --only-linked  — платежи тех, кого в боте нет, не загружать (не создавать карточки «без Telegram»); так безопаснее для старых платежей
import fs from 'node:fs'
import { findJoinForPayment, createOrphanJoin, recordPayment, setJoinField } from '../lib/store.js'

const file = process.argv[2]
const dry = process.argv.includes('--dry')
const onlyLinked = process.argv.includes('--only-linked')
if (!file) {
  console.error('Укажите файл: node scripts/importPayments.js выгрузка.csv [--dry] [--only-linked]')
  process.exit(1)
}

const ALIASES = {
  order: ['id заказа', 'номер заказа', '№ заказа', 'заказ', 'order_id', 'order', 'номер', 'id'],
  tgUserId: ['tg_user_id'],
  date: ['дата платежа', 'дата оплаты', 'дата', 'date', 'время'],
  sum: ['сумма платежа', 'сумма', 'sum', 'amount', 'стоимость'],
  phone: ['телефон', 'phone', 'customer_phone'],
  email: ['email', 'e-mail', 'почта', 'customer_email'],
  name: ['фио', 'имя', 'name', 'клиент', 'покупатель'],
  telegram: ['telegram', 'телеграм', 'тг', 'ник'],
  status: ['статус', 'status', 'payment_status'],
  subscription: ['название подписки', 'подписка', 'subscription', 'список товаров', 'товар', 'наименование', 'product'],
  paymentNum: ['номер платежа', 'payment_num'],
}

function parseCsv(text) {
  const first = text.split('\n')[0]
  const delimiter = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

function parseDate(value) {
  const t = String(value ?? '').trim()
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return Date.parse(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '12').padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}+03:00`)
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(.*)$/)
  if (m) return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '12'}:${m[5] ?? '00'}:${m[6] ?? '00'}${/[+-]\d{2}:\d{2}|Z/.test(m[7]) ? m[7].trim() : '+03:00'}`)
  return NaN
}

function addMonths(ts, months) {
  const d = new Date(ts)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) d.setDate(0)
  return d.getTime()
}

const PLANS = { 690: { id: '1m', months: 1 }, 1770: { id: '3m', months: 3 }, 3180: { id: '6m', months: 6 } }

const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
const header = rows.shift().map((h) => h.trim().toLowerCase())
const col = {}
for (const [key, names] of Object.entries(ALIASES)) {
  const idx = names.map((n) => header.indexOf(n)).find((i) => i >= 0)
  if (idx !== undefined) col[key] = idx
}
console.log('Найденные колонки:', Object.entries(col).map(([k, i]) => `${k} = «${header[i]}»`).join(', '))
for (const need of ['date', 'sum']) {
  if (col[need] === undefined) {
    console.error(`Не нашёл колонку «${need}». Заголовки в файле: ${header.join(' | ')}`)
    process.exit(1)
  }
}

const SUCCESS = /успеш|оплач|совершен|получен|выплач|success|paid/
const FAILED = /возвращ|отмен|ошиб|отклонен|refund|cancel|fail/
const NOT_SUBSCRIPTION = /билет|мероприят|лонглист|гайд|материал/

let skippedNotPaid = 0
let skippedOther = 0
const parsed = rows.map((r) => {
  const get = (k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim())
  return { order: get('order'), paidAt: parseDate(get('date')), amount: Number(get('sum').replace(/\s/g, '').replace(',', '.')), phone: get('phone'), email: get('email'), name: get('name'), telegram: get('telegram'), tgUserId: get('tgUserId'), status: get('status').toLowerCase(), subscription: get('subscription'), paymentNum: Number(get('paymentNum')) || null }
})
const items = parsed
  .filter((it) => {
    const paid = (!it.status || SUCCESS.test(it.status)) && !FAILED.test(it.status)
    if (!paid) skippedNotPaid += 1
    return paid
  })
  .filter((it) => it.amount > 0 && !Number.isNaN(it.paidAt))
  .filter((it) => {
    const other = /^ev-/i.test(it.order) || NOT_SUBSCRIPTION.test(it.subscription.toLowerCase())
    if (other) skippedOther += 1
    return !other
  })
  .sort((a, b) => a.paidAt - b.paidAt)

let added = 0
let skipped = 0
let created = 0
let unlinked = 0
let lifetimeSkipped = 0
for (const it of items) {
  const plan = PLANS[Math.round(it.amount)]
  const tariffId = plan?.id ?? null
  const subscriptionName = plan ? null : it.subscription ? `${it.subscription} · ${Math.round(it.amount)} ₽` : `Скидочный тариф ${Math.round(it.amount)} ₽`
  const computedNext = addMonths(it.paidAt, plan?.months ?? 1)
  const contact = { phone: it.phone, email: it.email, telegram: it.telegram, tgUserId: it.tgUserId }
  let match = findJoinForPayment({ ...contact, tariffId: null })
  if (match?.join.lifetime) {
    lifetimeSkipped += 1
    continue
  }
  if (!match && onlyLinked) {
    unlinked += 1
    continue
  }
  if (dry) {
    if (!match) created += 1
    else if (match.join.payments?.some((p) => p.orderKey && p.orderKey === it.order)) skipped += 1
    else added += 1
    continue
  }
  if (!match) {
    match = { join: { token: createOrphanJoin({ tariffId, name: it.name || '—', phone: it.phone, email: it.email, telegram: it.telegram }) } }
    created += 1
  }
  const before = match.join
  // Срок не сокращаем: у перенесённых из BotHelp он считается по оставшимся дням и может быть дальше, чем «последняя оплата + месяц».
  const nextPaymentAt = Math.max(computedNext, Number(before.nextPaymentAt) || 0)
  const result = recordPayment(match.join.token, { tariffId, amount: it.amount, paidAt: it.paidAt, orderKey: it.order || `import-${it.paidAt}-${it.amount}-${it.phone || it.email}`, nextPaymentAt, tgUserId: it.tgUserId || undefined, paymentNum: it.paymentNum, subscriptionName })
  if (before.status && before.status !== 'active') setJoinField(before.token, 'status', before.status) // отключённая подписка остаётся отключённой
  if (result?.duplicate) skipped += 1
  else added += 1
}
const notes = [skippedNotPaid ? `не оплачены или возвращены: ${skippedNotPaid}` : '', skippedOther ? `билеты, материалы: ${skippedOther}` : '', unlinked ? `без карточки в боте (--only-linked): ${unlinked}` : '', lifetimeSkipped ? `у бессрочных: ${lifetimeSkipped}` : ''].filter(Boolean)
const tail = notes.length ? ` Пропущено: ${notes.join('; ')}.` : ''
console.log(dry ? `Проверено платежей: ${items.length}. Были бы добавлены: ${added}, уже в учёте: ${skipped}, новых карточек: ${created}.${tail} Ничего не записано.` : `Готово. Добавлено платежей: ${added}, уже были в учёте: ${skipped}, новых подписчиков: ${created}.${tail}`)
