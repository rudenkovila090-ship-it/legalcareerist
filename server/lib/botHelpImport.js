// Перенос людей из выгрузки BotHelp (CSV «Подписчики → Экспорт», разделитель «;») в бота: карточки пользователей, метки,
// согласия на рассылку и — самое важное — подписки: кому сколько дней доступа осталось. Работает и из скрипта
// (scripts/importBotHelp.js), и из бота: админ присылает файл с подписью /import, бот показывает, что будет сделано, и ждёт кнопку.
//
// Кто считается резидентом (получает подписку с остатком дней):
//   • «активный» — дней больше нуля и есть метка «резидент_сообщества», «оплатил_подписку_…» или персональная цена
//     («подписка_350», «подписка_500»);
//   • «бессрочный» — дней больше 3650 (в BotHelp так помечены основатели): подписка до 2045 года, как у остальных бессрочных;
//   • «на проверку» — дни есть, но ни одной метки оплаты нет: сами не заводим, админ решает кнопкой.
// Повторная загрузка безопасна: подписки, по которым уже были настоящие оплаты в боте, не трогаются;
// подписки, заведённые прежним импортом, обновляются по новой выгрузке.
import { upsertImportedUser, listBotUsers } from './botUsers.js'
import { listJoins, createImportedJoin, createLifetimeJoin, setJoinField } from './store.js'

const DAY = 24 * 3600 * 1000
const LIFETIME_END = Date.parse('2045-12-31T12:00:00+03:00')
const LIFETIME_DAYS = 3650

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ';') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
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

const num = (v) => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v))
const sec = (v) => (num(v) ? num(v) * 1000 : undefined)
/** Telegram id — только цифры, до 11 знаков; 16-значные id в выгрузке принадлежат другому каналу. */
export const isTelegramId = (id) => /^\d{5,11}$/.test(id)

const PAID_TAG = /^оплатил_подписку/
const PERSONAL_PRICE_TAGS = ['подписка_350', 'подписка_500']
const hasPaymentTag = (tags) => tags.includes('резидент_сообщества') || tags.some((t) => PAID_TAG.test(t)) || PERSONAL_PRICE_TAGS.some((t) => tags.includes(t))

/** Что за подписка у человека по строке выгрузки. */
export function classify({ tags, days }) {
  if (!days || days <= 0) return tags.includes('резидент_сообщества') ? 'expired' : 'none'
  if (days > LIFETIME_DAYS) return 'lifetime'
  return hasPaymentTag(tags) ? 'active' : 'review'
}

/** Разбирает файл и считает, что будет сделано. Ничего не записывает. */
export function planImport(csvText, now = Date.now()) {
  const rows = parseCsv(csvText)
  if (rows.length < 2) throw new Error('В файле нет строк с данными')
  const header = rows.shift().map((h) => h.trim())
  if (!header.includes('id') || !header.includes('User tags')) throw new Error('Это не выгрузка BotHelp: нет колонок «id» и «User tags»')
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  const get = (r, key) => String(r[idx[key]] ?? '').trim()

  const existingUsers = new Set(listBotUsers().map((u) => String(u.id)))
  const plan = { now, rows: rows.length, nonTelegram: 0, duplicates: 0, people: [], newUsers: 0, existingUsers: 0, kinds: { active: 0, lifetime: 0, review: 0, expired: 0, none: 0 }, agreed: 0, declined: 0, undecided: 0, noDaysColumn: !header.includes('дни') }
  const seen = new Set()

  for (const r of rows) {
    const id = get(r, 'id')
    if (!isTelegramId(id)) {
      plan.nonTelegram += 1
      continue
    }
    if (seen.has(id)) {
      plan.duplicates += 1
      continue
    }
    seen.add(id)
    const tags = get(r, 'User tags').split(';').map((t) => t.trim()).filter(Boolean)
    const days = num(get(r, 'дни'))
    const kind = classify({ tags, days })
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
    plan.people.push({ id, kind, days, tags, name: get(r, 'name') || [get(r, 'first_name'), get(r, 'last_name')].filter(Boolean).join(' '), phone: get(r, 'phone'), email: get(r, 'email'), record })
    plan.kinds[kind] += 1
    if (existingUsers.has(id)) plan.existingUsers += 1
    else plan.newUsers += 1
    if (tags.includes('согласен_на_рассылку_сообщений') && !tags.includes('не_согласен_на_рассылку_сообщений')) plan.agreed += 1
    else if (tags.includes('не_согласен_на_рассылку_сообщений')) plan.declined += 1
    else plan.undecided += 1
  }
  plan.review = plan.people.filter((p) => p.kind === 'review')
  return plan
}

/** Подпись для списка «на проверку»: имя с инициалом фамилии, остаток дней и метки — без контактов. */
export function reviewLine(p) {
  const parts = String(p.name).split(/\s+/).filter(Boolean)
  const short = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || 'без имени'
  return `${short} — ${p.days} дн.${p.tags.length ? ` (${p.tags.filter((t) => t !== 'пользователь').join(', ') || 'без меток'})` : ''}`
}

const isEstimated = (j) => Array.isArray(j.payments) && j.payments.length > 0 && j.payments.every((p) => p.estimated)

/**
 * Записывает людей и их подписки. includeReview — завести подпиской и тех, кто «на проверку».
 * Возвращает счётчики для отчёта админу.
 */
export function applyImport(plan, { includeReview = false, now = plan.now ?? Date.now() } = {}) {
  const done = { usersCreated: 0, usersUpdated: 0, subsCreated: 0, subsRefreshed: 0, subsKept: 0, lifetime: 0, review: 0 }
  const joinsByTg = new Map()
  for (const j of listJoins()) if (j.tgUserId) joinsByTg.set(String(j.tgUserId), [...(joinsByTg.get(String(j.tgUserId)) ?? []), j])

  for (const p of plan.people) {
    done.usersCreated += upsertImportedUser(p.record).created ? 1 : 0
    const kind = p.kind === 'review' && includeReview ? 'active' : p.kind
    if (p.kind === 'review' && !includeReview) done.review += 1
    if (kind !== 'active' && kind !== 'lifetime') continue

    const mine = joinsByTg.get(p.id) ?? []
    if (kind === 'lifetime') {
      if (mine.some((j) => j.lifetime)) {
        done.subsKept += 1
        continue
      }
      createLifetimeJoin({ tgUserId: p.id, name: p.name, telegram: '', startAt: p.record.createdAt, endsAt: LIFETIME_END })
      done.lifetime += 1
      continue
    }

    const oneTime = PERSONAL_PRICE_TAGS.some((t) => p.tags.includes(t))
    const nextPaymentAt = now + p.days * DAY
    const imported = mine.find((j) => j.importedFromBotHelp && isEstimated(j))
    if (imported) {
      // Подписка с прошлого импорта, настоящих оплат по ней в боте не было — берём срок из новой выгрузки.
      setJoinField(imported.token, 'nextPaymentAt', nextPaymentAt)
      setJoinField(imported.token, 'status', 'active')
      setJoinField(imported.token, 'oneTime', oneTime || undefined)
      done.subsRefreshed += 1
    } else if (mine.length) {
      done.subsKept += 1 // у человека уже есть карточка с настоящими оплатами или бессрочная — не перезаписываем
    } else {
      const amount = p.tags.includes('подписка_350') ? 350 : p.tags.includes('подписка_500') ? 500 : null
      createImportedJoin({ tgUserId: p.id, name: p.name, amount, oneTime, nextPaymentAt, firstPaidAt: oneTime ? nextPaymentAt - 30 * DAY : null, phone: p.phone, email: p.email })
      done.subsCreated += 1
    }
  }
  return done
}

const ru = (n) => Number(n).toLocaleString('ru-RU')

/** Текст предпросмотра для админа. */
export function planSummary(plan) {
  const k = plan.kinds
  const lines = [
    '📥 Выгрузка BotHelp: проверка перед загрузкой',
    '',
    `Строк в файле: ${ru(plan.rows)}, людей с Telegram id: ${ru(plan.people.length)}`,
    `Карточек пользователей: новых ${ru(plan.newUsers)}, уже есть ${ru(plan.existingUsers)}`,
    '',
    `Подписки с оставшимися днями: ${ru(k.active)}${k.lifetime ? `, бессрочных: ${k.lifetime}` : ''}`,
  ]
  if (k.review) lines.push(`На проверку (дни есть, меток оплаты нет): ${k.review}`)
  if (k.expired) lines.push(`Подписка закончилась (метка резидента, дней нет): ${k.expired}`)
  lines.push('', `Рекламные рассылки: согласны ${ru(plan.agreed)}, отказались ${ru(plan.declined)}, не отвечали ${ru(plan.undecided)}`)
  if (plan.nonTelegram) lines.push(`Пропущено ${plan.nonTelegram}: id не в формате Telegram (другой канал) — боту они недоступны`)
  if (plan.duplicates) lines.push(`Повторов id: ${plan.duplicates} (взята первая строка)`)
  if (plan.noDaysColumn) lines.push('', '⚠️ В файле нет колонки «дни» — подписки заведены не будут. Выгрузите файл с полем «дни».')
  if (k.review) {
    lines.push('', 'На проверку:', ...plan.review.slice(0, 15).map((p) => `• ${reviewLine(p)}`))
    if (plan.review.length > 15) lines.push(`…и ещё ${plan.review.length - 15}`)
  }
  return lines.join('\n')
}

export function doneSummary(done) {
  return [
    '✅ Выгрузка загружена',
    '',
    `Карточек пользователей: создано ${ru(done.usersCreated)}`,
    `Подписок заведено: ${ru(done.subsCreated)}, обновлено по новой выгрузке: ${ru(done.subsRefreshed)}, оставлено без изменений: ${ru(done.subsKept)}`,
    done.lifetime ? `Бессрочных: ${done.lifetime}` : null,
    done.review ? `Не заведено «на проверку»: ${done.review}` : null,
  ].filter(Boolean).join('\n')
}
