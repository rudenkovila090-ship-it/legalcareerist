// Дополнительные экраны кабинета администратора: амбассадоры, просрочки,
// удержание, финансовая сводка/прогноз/расходы, мероприятия, поиск человека,
// сводка дня и системное состояние. Только тексты и кнопки.
import { rub, who, planAmount, ruDay, CANCEL_REASONS } from './adminCabinet.js'
import { mskDayKey } from './dailyReport.js'
import { EVENT_STATUSES } from './eventLeads.js'
import { dealsDueForReminder, dealPayments } from './deals.js'
import { interestsDueForReminder } from './interests.js'

const MSK = 'Europe/Moscow'
const DAY = 24 * 3600 * 1000
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))
const ruDateTime = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
const monthOf = (ts) => mskDayKey(ts).slice(0, 7)
const menuRow = [{ text: '🏠 Меню', callback_data: 'a:menu' }]
const back = (text, data) => [{ text, callback_data: data }, ...menuRow]
const tgUrl = (telegram) => `https://t.me/${String(telegram).replace(/^@/, '')}`

export function monthKeyFor(which, now) {
  const cur = monthOf(now)
  if (which !== 'prev') return cur
  const [y, m] = cur.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const monthTitle = (key) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${key}-15T12:00:00Z`)).replace(/\s*г\.$/, '')

// ---- Амбассадоры ----

export const AMBASSADOR_PROMPT = [
  '🌟 Новый амбассадор',
  '',
  'Отправьте одним сообщением, каждая строка — отдельное поле:',
  '1. Имя',
  '2. Telegram',
  '3. Телефон',
  '4. Промокод',
  '5. Заметка (например, где ведёт блог)',
  '',
  'Ненужное поле — «-». Отмена — /cancel.',
].join('\n')

export function ambassadorsScreen(list) {
  const keyboard = [[{ text: '➕ Добавить амбассадора', callback_data: 'a:x:ambnew' }]]
  const back_ = back('⬅️ Сообщество', 'a:sec:community')
  if (!list.length) return { text: '🌟 Амбассадоров пока нет.\n\nАмбассадоры — юристы-блогеры с бесплатным членством, которые приводят людей по своему промокоду.', keyboard: [...keyboard, back_] }
  const total = list.reduce((acc, a) => acc + (a.referred ?? 0), 0)
  const lines = [`🌟 Амбассадоры: ${list.length} · привели всего ${total} чел.`, '', ...list.map((a) => `№${a.number} · ${a.name || 'без имени'}${a.promo ? ` · промокод ${a.promo}` : ''} · с ${ruDate(a.startedAt)} · привёл(а): ${a.referred ?? 0}`)]
  for (const a of list.slice(0, 30)) keyboard.push([{ text: `№${a.number} · ${a.name || 'без имени'} · ${a.referred ?? 0}`.slice(0, 60), callback_data: `a:x:ambcard:${a.number}` }])
  keyboard.push(back_)
  return { text: lines.join('\n'), keyboard }
}

export function ambassadorCard(a) {
  const lines = [
    `🌟 Амбассадор №${a.number} · ${a.name || 'без имени'}`,
    '',
    'Бесплатное членство в сообществе',
    `📅 С ${ruDate(a.startedAt)}`,
    a.promo ? `🎟 Промокод: ${a.promo}` : null,
    a.telegram ? `💬 Telegram: ${a.telegram}` : null,
    a.phone ? `📞 Телефон: ${a.phone}` : null,
    a.note ? `📝 ${a.note}` : null,
    `👥 Привёл(а) человек: ${a.referred ?? 0}`,
  ].filter((l) => l !== null)
  const keyboard = [
    [{ text: '➕ Привёл(а) +1', callback_data: `a:x:ambplus:${a.number}:1` }, { text: '➖ −1', callback_data: `a:x:ambplus:${a.number}:-1` }],
    ...(a.telegram ? [[{ text: '✉️ Написать', url: tgUrl(a.telegram) }]] : []),
    [{ text: '🗑 Удалить', callback_data: `a:x:ambdel:${a.number}` }],
    back('⬅️ К амбассадорам', 'a:x:amb'),
  ]
  return { text: lines.join('\n'), keyboard }
}

// ---- Просрочено, удержание, причины отписок ----

/** Активные подписчики, у которых время списания прошло больше 12 часов назад, а оплата не зафиксирована. */
export function overdueScreen(joins, tariffs, now) {
  const list = joins.filter((j) => j.status === 'active' && j.nextPaymentAt && j.nextPaymentAt < now - 12 * 3600 * 1000).sort((a, b) => a.nextPaymentAt - b.nextPaymentAt)
  const backRow = back('⬅️ Сообщество', 'a:sec:community')
  if (!list.length) return { text: '⚠️ Просроченных списаний нет — у всех активных подписчиков оплата зафиксирована вовремя.', keyboard: [backRow] }
  const lines = [`⚠️ Списание не прошло или не дошло до нас: ${list.length}`, '', 'Время списания прошло, а новой оплаты нет:', '']
  for (const j of list) {
    const days = Math.floor((now - j.nextPaymentAt) / DAY)
    lines.push(`• ${who(j)} — ${rub(planAmount(j, tariffs)) } · ждали ${ruDate(j.nextPaymentAt)}${days ? ` (${days} дн. назад)` : ''}`)
  }
  lines.push('', 'Стоит написать человеку и проверить платёж в Prodamus.')
  const keyboard = list.slice(0, 10).map((j) => {
    const label = (j.name && j.name !== '—' ? j.name : j.telegram || j.phone || 'без имени').slice(0, 24)
    return [...(j.telegram ? [{ text: `✉️ ${label}`, url: tgUrl(j.telegram) }] : []), { text: `🚪 Исключить: ${label}`, callback_data: `a:x:kick:${j.token}` }]
  })
  return { text: lines.join('\n'), keyboard: [...keyboard, backRow] }
}

/** Удержание: сколько людей продлили, сколько ушли, сколько платежей в среднем. */
export function retentionScreen(joins) {
  const subs = joins.filter((j) => j.paid && (j.payments ?? []).some((p) => !p.estimated))
  const paymentsOf = (j) => (j.payments ?? []).filter((p) => !p.estimated).length
  const renewed = subs.filter((j) => paymentsOf(j) >= 2 || (j.payments ?? []).some((p) => p.kind === 'renewal'))
  const cancelled = subs.filter((j) => j.status === 'cancelled')
  const active = subs.filter((j) => j.status === 'active')
  const avg = subs.length ? subs.reduce((acc, j) => acc + paymentsOf(j), 0) / subs.length : 0
  const pct = (n) => (subs.length ? `${Math.round((n / subs.length) * 100)}%` : '—')
  const lines = [
    '📈 Удержание в сообществе',
    '',
    `Всего оплативших: ${subs.length}`,
    `🟢 Сейчас активны: ${active.length} (${pct(active.length)})`,
    `🔁 Продлили хотя бы раз: ${renewed.length} (${pct(renewed.length)})`,
    `🔕 Отписались: ${cancelled.length} (${pct(cancelled.length)})`,
    `💳 В среднем платежей на человека: ${avg.toFixed(1).replace('.', ',')}`,
  ]
  if (!subs.length) lines.push('', 'Данных пока нет — они появятся, когда в учёте будут оплаты.')
  return { text: lines.join('\n'), keyboard: [back('⬅️ Сообщество', 'a:sec:community')] }
}

/** Карточка отписавшегося с кнопками выбора причины. */
export function cancelCard(j) {
  const lines = [
    `🔕 ${who(j)}`,
    j.cancelledAt ? `Отписался: ${ruDateTime(j.cancelledAt)}` : null,
    j.email ? `✉️ ${j.email}` : null,
    `Причина: ${j.cancelReason ? CANCEL_REASONS[j.cancelReason] : 'не указана'}`,
    '',
    'Выберите причину — она попадёт в сводку отписок:',
  ].filter((l) => l !== null)
  const keyboard = [
    [{ text: CANCEL_REASONS.price, callback_data: `a:x:cr:${j.token}:price` }, { text: CANCEL_REASONS.time, callback_data: `a:x:cr:${j.token}:time` }],
    [{ text: CANCEL_REASONS.content, callback_data: `a:x:cr:${j.token}:content` }, { text: CANCEL_REASONS.other, callback_data: `a:x:cr:${j.token}:other` }],
    ...(j.telegram ? [[{ text: '✉️ Написать', url: tgUrl(j.telegram) }]] : []),
    ...(j.tgUserId ? [[{ text: '🚪 Исключить из чата сообщества', callback_data: `a:x:kick:${j.token}` }]] : []),
    back('⬅️ К отпискам', 'a:cancelled'),
  ]
  return { text: lines.join('\n'), keyboard }
}

// ---- Финансы: сводка, прогноз, расходы ----

/** Выручка по направлениям за месяц и прибыль после расходов. */
export function financeSummary(data, monthKey) {
  const inMonth = (ts) => Boolean(ts) && monthOf(ts) === monthKey
  const community = data.joins.flatMap((j) => j.payments ?? []).filter((p) => !p.estimated && inMonth(p.at)).reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const kadry = data.deals.flatMap((d) => dealPayments(d)).filter((p) => inMonth(p.at)).reduce((acc, p) => acc + p.amount, 0)
  const materials = (data.purchases ?? []).filter((p) => p.amount != null && inMonth(p.paidAt)).reduce((acc, p) => acc + p.amount, 0)
  const consult = data.consultations.filter((c) => c.status === 'done' && inMonth(c.statusAt)).reduce((acc, c) => acc + (Number(c.total) || 0), 0)
  const events = data.eventLeads.filter((e) => e.kind === 'registration' && e.amount != null && inMonth(e.statusAt)).reduce((acc, e) => acc + e.amount, 0)
  const income = community + kadry + consult + events + materials
  const monthExpenses = data.expenses.filter((e) => inMonth(e.at))
  const spent = monthExpenses.reduce((acc, e) => acc + e.amount, 0)
  const lines = [
    `🧾 Финансы — ${monthTitle(monthKey)}`,
    '',
    `👥 Подписки сообщества: ${rub(community)}`,
    `⚖️ Кадровое агентство: ${rub(kadry)}`,
    `🎯 Карьерные консультации: ${rub(consult)}`,
    `🎟 Мероприятия: ${rub(events)}`,
    `📚 Материалы (маркетплейс): ${rub(materials)}`,
    `Выручка всего: ${rub(income)}`,
    '',
    `💸 Расходы: ${rub(spent)}`,
    `💰 Прибыль: ${rub(income - spent)}`,
    '',
    'Покупки материалов считаются с момента обновления — прежние суммы не сохранялись.',
  ]
  return { text: lines.join('\n'), keyboard: [[{ text: 'Прошлый месяц', callback_data: 'a:x:fsum:prev' }, { text: 'Текущий', callback_data: 'a:x:fsum:cur' }], [{ text: '📎 Выгрузить месяц (CSV)', callback_data: `a:x:csv:${monthKey === monthOf(Date.now()) ? 'cur' : 'prev'}` }], [{ text: '💸 Расходы', callback_data: 'a:x:fexp' }], back('⬅️ Финансы', 'a:sec:finance')] }
}

/** Прогноз на 30 дней: списания подписчиков и ожидаемая выручка по сделкам. */
export function forecastScreen(joins, deals, tariffs, now) {
  const due = joins.filter((j) => j.status === 'active' && j.nextPaymentAt && j.nextPaymentAt <= now + 30 * DAY)
  const community = due.reduce((acc, j) => acc + planAmount(j, tariffs), 0)
  const pipeline = deals.filter((d) => d.status === 'active')
  const dealsSum = pipeline.reduce((acc, d) => acc + (Number(d.expectedFee) || 0), 0)
  const lines = [
    '🔮 Прогноз на 30 дней',
    '',
    `👥 Списания подписчиков: ${due.length} на ${rub(community)}`,
    `⚖️ Сделки в работе: ${pipeline.length}, ожидаемая выручка ${rub(dealsSum)}`,
    `Итого ожидаем: ${rub(community + dealsSum)}`,
    '',
    'Прогноз по подпискам — если все продлят; по сделкам — сумма из расчёта заказчика, реальная выручка появится после завершения.',
  ]
  return { text: lines.join('\n'), keyboard: [back('⬅️ Финансы', 'a:sec:finance')] }
}

export const EXPENSE_PROMPT = [
  '💸 Новый расход',
  '',
  'Отправьте одним сообщением: сумма, категория и комментарий. Например:',
  '5000 реклама ВК за сентябрь',
  '1200 комиссия',
  '',
  'Отмена — /cancel.',
].join('\n')

export function expensesScreen(list, monthKey) {
  const inMonth = list.filter((e) => monthOf(e.at) === monthKey)
  const byCategory = new Map()
  for (const e of inMonth) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  const total = inMonth.reduce((acc, e) => acc + e.amount, 0)
  const lines = [`💸 Расходы — ${monthTitle(monthKey)}: ${rub(total)}`]
  if (byCategory.size) lines.push('', ...[...byCategory].map(([c, sum]) => `• ${c} — ${rub(sum)}`))
  const recent = [...inMonth].sort((a, b) => b.at - a.at).slice(0, 10)
  if (recent.length) lines.push('', 'Последние:', ...recent.map((e) => `№${e.number} · ${ruDate(e.at)} · ${rub(e.amount)} · ${e.category}${e.note ? ` — ${e.note}` : ''}`))
  else lines.push('', 'Расходов за этот месяц нет.')
  const keyboard = [[{ text: '➕ Добавить расход', callback_data: 'a:x:fexpnew' }]]
  for (const e of recent.slice(0, 5)) keyboard.push([{ text: `🗑 №${e.number} · ${rub(e.amount)} · ${e.category}`.slice(0, 60), callback_data: `a:x:fexpdel:${e.number}` }])
  keyboard.push(back('⬅️ Финансы', 'a:sec:finance'))
  return { text: lines.join('\n'), keyboard }
}

/** Разбор «5000 реклама ВК за сентябрь» → { amount, category, note } или null. */
export function parseExpense(text) {
  const m = text.trim().match(/^(\d[\d\s.,]*)\s*(?:₽|(?:р\.?|руб\.?)(?=\s|$))?\s*(.*)$/i)
  if (!m) return null
  const amount = Number(m[1].replace(/\s/g, '').replace(',', '.'))
  if (!(amount > 0)) return null
  const rest = m[2].trim()
  const [category, ...note] = rest.split(/\s+/)
  return { amount, category: category || 'прочее', note: note.join(' ') }
}

// ---- Мероприятия ----

const eventKey = (e) => String(e.eventSlug || `t${[...e.eventTitle].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16)}`).slice(0, 40)
const leadTitle = (e) => `№${e.number} · ${e.name || 'без имени'}`

export function eventRegistrationsScreen(leads) {
  const regs = leads.filter((e) => e.kind === 'registration')
  const backRow = back('⬅️ Мероприятия', 'a:sec:events')
  if (!regs.length) return { text: '🎟 Регистраций на мероприятия пока нет.\n\nОни появятся здесь после регистраций на сайте.', keyboard: [backRow] }
  const groups = new Map()
  for (const e of regs) {
    const key = eventKey(e)
    if (!groups.has(key)) groups.set(key, { title: e.eventTitle || e.eventSlug || 'Мероприятие', list: [] })
    groups.get(key).list.push(e)
  }
  const lines = [`🎟 Регистрации: ${regs.length}`, '']
  const keyboard = []
  for (const [key, g] of groups) {
    const paid = g.list.filter((e) => e.status === 'paid' || e.status === 'attended')
    const revenue = g.list.reduce((acc, e) => acc + (e.amount ?? 0), 0)
    lines.push(`• ${g.title} — ${g.list.length}, оплатили ${paid.length}, выручка ${rub(revenue)}`)
    keyboard.push([{ text: `${g.title} · ${g.list.length}`.slice(0, 60), callback_data: `a:x:evone:${key}` }])
  }
  keyboard.push(backRow)
  return { text: lines.join('\n'), keyboard }
}

export function eventScreen(leads, key) {
  const list = leads.filter((e) => e.kind === 'registration' && eventKey(e) === key).sort((a, b) => b.createdAt - a.createdAt)
  const backRow = back('⬅️ К регистрациям', 'a:x:evreg')
  if (!list.length) return { text: 'Мероприятие не найдено.', keyboard: [backRow] }
  const revenue = list.reduce((acc, e) => acc + (e.amount ?? 0), 0)
  const lines = [`🎟 ${list[0].eventTitle || list[0].eventSlug} — ${list.length} чел., выручка ${rub(revenue)}`, '', ...list.map((e) => `${EVENT_STATUSES[e.status].split(' ')[0]} ${leadTitle(e)} · ${e.tariff || 'тариф?'} · ${[e.telegram, e.phone].filter(Boolean).join(' ')}${e.amount != null ? ` · ${rub(e.amount)}` : ''}`)]
  const keyboard = list.slice(0, 30).map((e) => [{ text: `${EVENT_STATUSES[e.status].split(' ')[0]} ${leadTitle(e)}`.slice(0, 60), callback_data: `a:x:evcard:${e.number}` }])
  keyboard.push(backRow)
  return { text: lines.join('\n'), keyboard }
}

export function eventLeadCard(e) {
  const lines = [
    `${e.kind === 'registration' ? '🎟 Регистрация' : '📨 Заявка'} ${leadTitle(e)}`,
    `Статус: ${EVENT_STATUSES[e.status]}`,
    '',
    e.eventTitle ? `📌 ${e.eventTitle}` : null,
    e.tariff ? `🎫 Тариф: ${e.tariff}` : null,
    e.company ? `🏢 Компания: ${e.company}` : null,
    e.amount != null ? `💰 Оплачено: ${rub(e.amount)}` : null,
    e.name ? `👤 ${e.name}` : null,
    e.telegram ? `💬 Telegram: ${e.telegram}` : null,
    e.phone ? `📞 Телефон: ${e.phone}` : null,
    e.email ? `✉️ Почта: ${e.email}` : null,
    e.note ? `📝 ${e.note}` : null,
    `📅 ${ruDateTime(e.createdAt)} · 📣 ${e.source}`,
  ].filter((l) => l !== null)
  const st = (status, text) => ({ text, callback_data: `a:x:evst:${e.number}:${status}` })
  const keyboard = []
  if (e.kind === 'registration') {
    keyboard.push([{ text: '💳 Оплатил (указать сумму)', callback_data: `a:x:evpaid:${e.number}` }])
    keyboard.push([st('attended', '✅ Пришёл'), st('cancelled', '❌ Отменил')])
    if (e.status !== 'registered') keyboard.push([st('registered', '↩️ Вернуть в зарегистрированные')])
  } else {
    keyboard.push([e.status === 'done' ? st('new', '↩️ Вернуть в новые') : st('done', '✅ Обработана')])
  }
  if (e.telegram) keyboard.push([{ text: '✉️ Написать', url: tgUrl(e.telegram) }])
  keyboard.push(back(e.kind === 'registration' ? '⬅️ К регистрациям' : '⬅️ К заявкам', e.kind === 'registration' ? 'a:x:evreg' : 'a:x:evreq'))
  return { text: lines.join('\n'), keyboard }
}

export function eventRequestsScreen(leads) {
  const list = leads.filter((e) => e.kind === 'request').sort((a, b) => b.createdAt - a.createdAt)
  const backRow = back('⬅️ Мероприятия', 'a:sec:events')
  if (!list.length) return { text: '📨 Заявок партнёров и организаторов пока нет.', keyboard: [backRow] }
  const labels = { event_partner_application: 'партнёр', partner_application: 'партнёр', event_submission: 'своё мероприятие', event_order: 'под ключ' }
  const lines = [`📨 Заявки: ${list.length}, новых ${list.filter((e) => e.status === 'new').length}`, '', ...list.slice(0, 30).map((e) => `${EVENT_STATUSES[e.status].split(' ')[0]} ${leadTitle(e)} · ${labels[e.formType] ?? e.formType}${e.company ? ` · ${e.company}` : ''} · ${ruDate(e.createdAt)}`)]
  const keyboard = list.slice(0, 30).map((e) => [{ text: `${EVENT_STATUSES[e.status].split(' ')[0]} ${leadTitle(e)}${e.company ? ` · ${e.company}` : ''}`.slice(0, 60), callback_data: `a:x:evcard:${e.number}` }])
  keyboard.push(backRow)
  return { text: lines.join('\n'), keyboard }
}

export function eventsMonthSummary(leads, which, now) {
  const key = monthKeyFor(which, now)
  const inMonth = (ts) => Boolean(ts) && monthOf(ts) === key
  const regs = leads.filter((e) => e.kind === 'registration' && inMonth(e.createdAt))
  const reqs = leads.filter((e) => e.kind === 'request' && inMonth(e.createdAt))
  const revenue = leads.filter((e) => e.amount != null && inMonth(e.statusAt)).reduce((acc, e) => acc + e.amount, 0)
  const lines = [`📊 Мероприятия — итоги: ${monthTitle(key)}`, '', `🎟 Новых регистраций: ${regs.length}`, `💳 Оплат отмечено: ${leads.filter((e) => e.amount != null && inMonth(e.statusAt)).length} на ${rub(revenue)}`, `📨 Заявок партнёров и организаторов: ${reqs.length}`]
  return { text: lines.join('\n'), keyboard: [[{ text: 'Прошлый месяц', callback_data: 'a:x:evmonth:prev' }, { text: 'Текущий', callback_data: 'a:x:evmonth' }], back('⬅️ Мероприятия', 'a:sec:events')] }
}

// ---- Поиск человека ----

export const FIND_PROMPT = '🔍 Найти человека\n\nОтправьте ник в Telegram, телефон (хотя бы 4 последние цифры), почту или часть фамилии. Отмена — /cancel.'

/** Ищет человека по всем разделам кабинета; возвращает текст и кнопки открытия карточек. */
export function searchScreen(query, data, tariffs) {
  const q = query.trim().toLowerCase().replace(/^@/, '')
  const digits = q.replace(/\D/g, '')
  const match = (o) => {
    if (!q) return false
    const text = [o.name, o.telegram, o.email, o.company].filter(Boolean).join(' ').toLowerCase().replace(/@/g, '')
    if (text.includes(q)) return true
    const phone = String(o.phone ?? '').replace(/\D/g, '')
    return digits.length >= 4 && phone.includes(digits)
  }
  const lines = [`🔍 Поиск: «${query.trim()}»`, '']
  const keyboard = []
  let found = 0
  const section = (title, items, line, button) => {
    if (!items.length) return
    found += items.length
    lines.push(title)
    for (const it of items.slice(0, 5)) {
      lines.push(`• ${line(it)}`)
      if (button && keyboard.length < 15) keyboard.push([button(it)])
    }
    if (items.length > 5) lines.push(`  …и ещё ${items.length - 5}`)
    lines.push('')
  }
  section('👥 Подписка сообщества', data.joins.filter(match), (j) => `${who(j)} — ${j.status === 'active' ? 'активна' : j.status === 'cancelled' ? 'отписан(а)' : 'не оплачена'}${j.paid ? `, ${rub(planAmount(j, tariffs))}` : ''}${j.firstPaidAt ? `, с ${ruDate(j.firstPaidAt)}` : ''}${j.nextPaymentAt && j.status === 'active' ? `, след. списание ${ruDay(j.nextPaymentAt)}` : ''}`)
  section('⚖️ Сделки', data.deals.filter(match), (d) => `№${d.number} · ${d.company || d.name} · этап ${d.stage}${d.status !== 'active' ? ` (${d.status === 'done' ? 'завершена' : 'закрыта'})` : ''}`, (d) => ({ text: `Сделка №${d.number} · ${d.company || d.name}`.slice(0, 60), callback_data: `a:k:deal:${d.number}` }))
  section('📥 Отклики на вакансии', data.applications.filter(match), (a) => `№${a.number} · ${a.name} → ${a.vacancyTitle || a.vacancySlug} · ${ruDate(a.createdAt)}`)
  section('🎯 Консультации', data.consultations.filter(match), (c) => `№${c.number} · ${c.name} · ${c.total != null ? rub(c.total) : 'вопрос'} · ${ruDate(c.createdAt)}`, (c) => ({ text: `Консультация №${c.number} · ${c.name}`.slice(0, 60), callback_data: `a:s:con:${c.number}` }))
  section('📇 Интересовались', data.interests.filter(match), (i) => `№${i.number} · ${i.name} · ${i.kind === 'community' ? 'сообщество' : i.kind === 'vacancy' ? 'вакансия' : 'консультация'} · ${ruDate(i.contactedAt)}`, (i) => ({ text: `Интерес №${i.number} · ${i.name}`.slice(0, 60), callback_data: `a:s:icard:${i.number}` }))
  section('🗃 Кадровый резерв', data.reserve.filter(match), (c) => `№${c.number} · ${c.name} · ${c.city || '—'} · ${c.position || '—'}`, (c) => ({ text: `Резерв №${c.number} · ${c.name}`.slice(0, 60), callback_data: `a:s:rcard:${c.number}` }))
  section('🎟 Мероприятия', data.eventLeads.filter(match), (e) => `№${e.number} · ${e.name} · ${e.eventTitle || e.formType} · ${EVENT_STATUSES[e.status]}`, (e) => ({ text: `Мероприятие №${e.number} · ${e.name}`.slice(0, 60), callback_data: `a:x:evcard:${e.number}` }))
  section('🌟 Амбассадоры', data.ambassadors.filter(match), (a) => `№${a.number} · ${a.name}${a.promo ? ` · ${a.promo}` : ''}`, (a) => ({ text: `Амбассадор №${a.number} · ${a.name}`.slice(0, 60), callback_data: `a:x:ambcard:${a.number}` }))
  if (!found) lines.push('Ничего не найдено. Попробуйте ник, часть фамилии или последние цифры телефона.')
  keyboard.push([{ text: '🔍 Искать ещё', callback_data: 'a:x:find' }, ...menuRow])
  return { text: lines.join('\n'), keyboard }
}

// ---- Сводка дня и система ----

/** Утренняя сводка: что требует внимания сегодня. healthLines — строки проверки системы. */
export function digestScreen(data, tariffs, now, healthLines = []) {
  const today = mskDayKey(now)
  const yesterday = mskDayKey(now - DAY)
  const chargesToday = data.joins.filter((j) => j.status === 'active' && j.nextPaymentAt && mskDayKey(j.nextPaymentAt) === today)
  const overdue = data.joins.filter((j) => j.status === 'active' && j.nextPaymentAt && j.nextPaymentAt < now - 12 * 3600 * 1000)
  const cancelledYesterday = data.joins.filter((j) => j.cancelledAt && mskDayKey(j.cancelledAt) === yesterday)
  const dealsDue = dealsDueForReminder(now)
  const interestsDue = interestsDueForReminder(now)
  const newConsults = data.consultations.filter((c) => c.status === 'new')
  const noResume = data.reserve.filter((c) => !c.resumeUrl)
  const newRequests = data.eventLeads.filter((e) => e.kind === 'request' && e.status === 'new')
  const lines = [
    `🌅 Сводка дня · ${ruDate(now)}`,
    '',
    `⏭ Списаний сегодня: ${chargesToday.length}${chargesToday.length ? ` на ${rub(chargesToday.reduce((acc, j) => acc + planAmount(j, tariffs), 0))}` : ''}`,
    `⚠️ Просрочено: ${overdue.length}`,
    `🔕 Отписались вчера: ${cancelledYesterday.length}`,
    `⚖️ Сделки, по которым пора действовать: ${dealsDue.length}${dealsDue.length ? ` (${dealsDue.slice(0, 5).map((d) => `№${d.number}`).join(', ')})` : ''}`,
    `📇 Написать интересовавшимся: ${interestsDue.length}`,
    `🎯 Новых консультаций без ответа: ${newConsults.length}`,
    `🗃 Кандидатов резерва без ссылки на резюме: ${noResume.length}`,
    `📨 Новых заявок по мероприятиям: ${newRequests.length}`,
  ]
  if (healthLines.length) lines.push('', '🩺 Система:', ...healthLines)
  return { text: lines.join('\n'), keyboard: [[{ text: '⚠️ Просрочено', callback_data: 'a:x:over' }, { text: '⚖️ Сделки', callback_data: 'a:k:list' }], menuRow] }
}

export function systemScreen(healthLines) {
  return {
    text: ['🛠 Система', '', ...healthLines].join('\n'),
    keyboard: [
      [{ text: '💾 Резервная копия сейчас', callback_data: 'a:x:backup' }],
      [{ text: '🧾 Журнал действий', callback_data: 'a:x:audit' }, { text: '🌅 Сводка дня', callback_data: 'a:x:digest' }],
      menuRow,
    ],
  }
}

const ACTION_LABELS = {
  'k:adv': 'Сделка: следующий этап', 'k:back': 'Сделка: возврат на этап', 'k:q1': 'Сделка: лид квалифицирован', 'k:q0': 'Сделка: лид не квалифицирован',
  'k:lost': 'Сделка: закрыта', 'k:reopen': 'Сделка: возвращена в работу', 'k:revok': 'Сделка: принята ожидаемая выручка', 'input:revenue': 'Сделка: выручка записана',
  'input:newdeal': 'Сделка создана вручную', 's:cst': 'Консультация: статус', 's:idone': 'Интерес: написали', 's:iclose': 'Интерес: неактуально', 's:isnooze': 'Интерес: отложено',
  'input:interest': 'Интерес записан', 's:rdelok': 'Кандидат резерва удалён', 'input:reserve-field': 'Кандидат резерва изменён', 'input:reserve-new': 'Кандидат резерва добавлен',
  'x:ambplus': 'Амбассадор: счётчик', 'x:ambdelok': 'Амбассадор удалён', 'input:ambassador': 'Амбассадор добавлен', 'x:cr': 'Причина отписки', 'x:fexpdel': 'Расход удалён',
  'input:expense': 'Расход добавлен', 'x:evst': 'Мероприятие: статус', 'input:event-paid': 'Мероприятие: оплата отмечена', remgo: 'Напоминания резидентам отправлены', 'x:backup': 'Резервная копия по запросу', 'x:kickok': 'Исключён из чата сообщества', 'k:pp': 'Сделка: предоплата получена', 'k:pf': 'Сделка: остаток получен', 's:vst': 'Вакансия: статус в учёте',
}

export function auditScreen(actions) {
  const lines = ['🧾 Журнал действий (последние 25)', '']
  if (!actions.length) lines.push('Пока пусто.')
  for (const a of actions) {
    const [, ...rest] = String(a.action).split(':')
    const key = String(a.action).startsWith('input:') ? String(a.action).split(':').slice(0, 2).join(':') : rest.slice(0, 2).join(':') || String(a.action)
    const id = String(a.action).startsWith('input:') ? String(a.action).split(':')[2] : rest[2]
    lines.push(`${ruDateTime(a.at)} · ${ACTION_LABELS[key] ?? ACTION_LABELS[rest[0]] ?? a.action}${id && /^\d+$/.test(id) ? ` №${id}` : ''}${a.chatId ? ` · чат ${a.chatId}` : ''}`)
  }
  return { text: lines.join('\n'), keyboard: [back('⬅️ Система', 'a:x:sys')] }
}
