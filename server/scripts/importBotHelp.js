// Перенос подписчиков из выгрузки BotHelp (CSV «Подписчики → Экспорт»).
//   node scripts/importBotHelp.js файл.csv --dry   — только посчитать, что будет сделано
//   node scripts/importBotHelp.js файл.csv         — записать
// Для каждого человека создаётся карточка пользователя бота: Telegram id, имя, метки, UTM, ref, промокод,
// дни, поля активности (баллы, уровень и т. д.), даты контактов. Резиденты (метка «резидент_сообщества»
// с оставшимися днями) заводятся ещё и в учёт сообщества, чтобы бот узнал их и показал кабинет резидента.
// Повторный запуск безопасен: существующие данные не затираются.
import fs from 'node:fs'
import { upsertImportedUser, listBotUsers } from '../lib/botUsers.js'
import { listJoins, createImportedJoin } from '../lib/store.js'

const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) {
  console.error('Укажите файл: node scripts/importBotHelp.js выгрузка.csv [--dry]')
  process.exit(1)
}

function parseCsv(text) {
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
    else if (ch === ';') {
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

const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
const header = rows.shift().map((h) => h.trim())
const idx = Object.fromEntries(header.map((h, i) => [h, i]))
const get = (r, key) => String(r[idx[key]] ?? '').trim()
const num = (v) => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v))
const sec = (v) => (num(v) ? num(v) * 1000 : undefined)
const DAY = 86400000
const now = Date.now()

let users = 0
let created = 0
let residents = 0
let residentsSkipped = 0
const tagCount = new Map()
const knownTg = new Set(listJoins().map((j) => String(j.tgUserId ?? '')))

for (const r of rows) {
  const id = get(r, 'id')
  if (!id) continue
  const tags = get(r, 'User tags').split(';').map((t) => t.trim()).filter(Boolean)
  tags.forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1))
  const days = num(get(r, 'дни'))
  const record = {
    id,
    firstName: get(r, 'first_name'),
    lastName: get(r, 'last_name'),
    name: get(r, 'name'),
    phone: get(r, 'phone'),
    email: get(r, 'email'),
    tags,
    createdAt: sec(get(r, 'first_contact_at')) ?? now,
    lastContactAt: sec(get(r, 'last_contact_at')),
    conversationsCount: num(get(r, 'conversations_count')),
    botHelpCUserId: get(r, 'CUser_ID'),
    ref: get(r, 'ref'),
    startParam: get(r, 'start_param'),
    utm: Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].map((k) => [k, get(r, k)]).filter(([, v]) => v)),
    promo: get(r, 'Промокод'),
    days,
    activityScore: num(get(r, 'activity_score')),
    commentsCount: num(get(r, 'comments_count')),
    eventsCount: num(get(r, 'events_count')),
    reactionsCount: num(get(r, 'reactions_count')),
    levelName: get(r, 'level_name'),
    nextLevelName: get(r, 'next_level_name'),
    nextLevelScore: num(get(r, 'next_level_score')),
    pointsToNextLevel: num(get(r, 'points_to_next_level')),
    // Ответ на вопрос о рассылке возможен только после согласия на обработку данных — значит, согласие было.
    ...(tags.includes('согласен_на_рассылку_сообщений') ? { mailingConsent: true } : {}),
    ...(tags.includes('не_согласен_на_рассылку_сообщений') ? { mailingConsent: false } : {}),
    ...(tags.some((t) => t.endsWith('_на_рассылку_сообщений')) ? { consentAt: sec(get(r, 'first_contact_at')) ?? now } : {}),
  }
  for (const k of Object.keys(record)) if (record[k] === undefined || record[k] === '' || (Array.isArray(record[k]) && !record[k].length) || (typeof record[k] === 'object' && !Array.isArray(record[k]) && !Object.keys(record[k]).length)) delete record[k]
  users += 1
  if (!dry) created += upsertImportedUser(record).created ? 1 : 0

  if (tags.includes('резидент_сообщества')) {
    if (!days || days <= 0 || knownTg.has(id)) {
      residentsSkipped += 1
      continue
    }
    residents += 1
    if (!dry) {
      const oneTime = tags.includes('подписка_350')
      const nextPaymentAt = now + days * DAY
      createImportedJoin({ tgUserId: id, name: get(r, 'name'), amount: oneTime ? 350 : null, oneTime, nextPaymentAt, firstPaidAt: oneTime ? nextPaymentAt - 30 * DAY : null, phone: get(r, 'phone'), email: get(r, 'email') })
      knownTg.add(id)
    }
  }
}

console.log(`Строк в файле: ${rows.length}, людей: ${users}${dry ? '' : `, новых карточек пользователей бота: ${created}`}`)
console.log(`Резидентов ${dry ? 'будет заведено' : 'заведено'} в учёт сообщества: ${residents} (пропущено: ${residentsSkipped} — нет оставшихся дней или уже в учёте)`)
console.log('Метки:', [...tagCount].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} — ${n}`).join('; '))
if (!dry) console.log(`Всего пользователей бота сейчас: ${listBotUsers().length}`)
