// Дополнительные экраны кабинета администратора: амбассадоры, просрочки,
// удержание, финансовая сводка/прогноз/расходы, мероприятия, поиск человека,
// сводка дня и системное состояние. Только тексты и кнопки.
import { rub, who, planAmount, CANCEL_REASONS } from './adminCabinet.js'
import { mskDayKey } from './dailyReport.js'
import { EVENT_STATUSES } from './eventLeads.js'
import { hasTicketImage } from './ticketImage.js'
import { NOTIFY_OPTIONS } from './adminSettings.js'
import { reviewText } from './materialReviews.js'

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
    `Причина: ${j.cancelReasonText ? j.cancelReasonText : j.cancelReason ? CANCEL_REASONS[j.cancelReason] : 'не указана'}`,
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
    e.promo ? `🎟 Промокод: ${e.promo} (скидка ${rub(e.discount ?? 0)} от ${rub(e.basePrice ?? 0)})` : null,
    e.amount != null ? `💰 Оплачено: ${rub(e.amount)}` : null,
    e.name ? `👤 ${e.name}` : null,
    e.telegram ? `💬 Telegram: ${e.telegram}` : null,
    e.phone ? `📞 Телефон: ${e.phone}` : null,
    e.email ? `✉️ Почта: ${e.email}` : null,
    e.note ? `📝 ${e.note}` : null,
    `📅 ${ruDateTime(e.createdAt)} · 📣 ${e.source}`,
    e.howHeard ? `🗣 Откуда узнали: ${e.howHeard}` : null,
  ].filter((l) => l !== null)
  const st = (status, text) => ({ text, callback_data: `a:x:evst:${e.number}:${status}` })
  const keyboard = []
  if (e.kind === 'registration') {
    keyboard.push([{ text: '💳 Оплатил (указать сумму)', callback_data: `a:x:evpaid:${e.number}` }])
    // Билет-картинка есть у мероприятия, оплата отмечена, почта указана — можно выслать билет ещё раз (письмо не дошло, оплату отметили вручную)
    if ((e.status === 'paid' || e.status === 'attended') && e.email && hasTicketImage(e.eventSlug)) keyboard.push([{ text: '🎟 Выслать билет на почту', callback_data: `a:x:evticket:${e.number}` }])
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

// ---- Сводка дня и система ----

/** Экран «Уведомления»: что и как присылает бот администратору, с тумблерами. */
export function notificationsScreen(settings) {
  const lines = ['🔔 Уведомления', '', 'Всегда приходят сразу и со звуком: заявки с сайта, оплаты, отписки, предупреждения ⚠️.', 'Утренняя сводка в 9:00 — одно сообщение: списания, просрочка, заявки, дела на день и состояние системы. Под ним кнопки: каждое дело открывается списком с действиями. В 20:00 «Итог дня»: что осталось разобрать.', '']
  const keyboard = []
  for (const [key, opt] of Object.entries(NOTIFY_OPTIONS)) {
    lines.push(`${settings[key] ? '✅' : '▫️'} ${opt.title} — ${opt.hint}`)
    keyboard.push([{ text: `${settings[key] ? '✅' : '▫️'} ${opt.title}`.slice(0, 60), callback_data: `a:x:notif:${key}` }])
  }
  keyboard.push(back('⬅️ Система', 'a:x:sys'))
  return { text: lines.join('\n'), keyboard }
}

const starsLine = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`

/** Список отзывов о материалах: последние сверху, скрытые помечены. */
export function reviewsScreen(reviews, titleOf) {
  const list = [...reviews].sort((a, b) => b.createdAt - a.createdAt)
  const shown = list.filter((r) => !r.hidden)
  const avg = shown.length ? shown.reduce((acc, r) => acc + r.rating, 0) / shown.length : 0
  const lines = ['⭐ Отзывы о материалах', '', list.length ? `Всего: ${list.length} · показывается: ${shown.length}${shown.length ? ` · средняя оценка ${avg.toFixed(1).replace('.', ',')}` : ''}` : 'Отзывов пока нет. Покупатели оставляют их по ссылке из письма и из бота.']
  const keyboard = list.slice(0, 12).map((r) => [{ text: `${r.hidden ? '🙈' : starsLine(r.rating)} №${r.number} · ${titleOf(r.materialSlug)} · ${r.name}`.slice(0, 60), callback_data: `a:x:rvc:${r.number}` }])
  keyboard.push([{ text: '⬅️ Система', callback_data: 'a:x:sys' }, ...menuRow])
  return { text: lines.join('\n'), keyboard }
}

export function reviewCard(r, materialTitle) {
  const lines = [
    `⭐ Отзыв №${r.number}${r.hidden ? ' · скрыт' : ''}`,
    '',
    `Материал: ${materialTitle}`,
    `Оценка: ${starsLine(r.rating)} (${r.rating} из 5)`,
    reviewText(r) ? `💬 Отзыв: ${reviewText(r)}` : null,
    '',
    `👤 Имя на сайте: ${r.name}`,
    `📅 ${ruDateTime(r.createdAt)}${r.updatedAt ? ` · обновлён ${ruDateTime(r.updatedAt)}` : ''}`,
    r.hidden ? 'Сейчас не показывается на сайте.' : 'Сейчас показывается на сайте.',
  ].filter((l) => l !== null)
  return { text: lines.join('\n'), keyboard: [[{ text: r.hidden ? '👁 Показать на сайте' : '🙈 Скрыть с сайта', callback_data: `a:x:rvh:${r.number}` }], back('⬅️ К отзывам', 'a:x:rv')] }
}

export const PROMO_PROMPT = [
  '🎟 Новый промокод на билеты',
  '',
  'Отправьте одной строкой: КОД и скидка.',
  'Скидка в процентах: RESIDENT 20%',
  'Скидка в рублях: FRIEND 500',
  '',
  'Код — 3–32 букв или цифр, регистр не важен. Процент — от 1 до 95. Отменить — /cancel.',
].join('\n')

/** Экран промокодов на билеты: активные коды с числом оплат, кнопка удаления у каждого. */
export function promosScreen(promos, label) {
  const active = promos.filter((p) => p.active)
  const lines = ['🎟 Промокоды на билеты', '', active.length ? 'Действующие коды (скидка считается на сервере от цены билета):' : 'Промокодов пока нет. Без кода билет продаётся по полной цене.']
  for (const p of active) lines.push(`• ${p.code} — ${label(p)} · оплат с кодом: ${p.used ?? 0}`)
  const keyboard = [[{ text: '➕ Добавить промокод', callback_data: 'a:x:promonew' }]]
  for (const p of active) keyboard.push([{ text: `🗑 Удалить ${p.code}`.slice(0, 60), callback_data: `a:x:promodel:${p.number}` }])
  keyboard.push([{ text: '⬅️ Мероприятия', callback_data: 'a:sec:events' }, ...menuRow])
  return { text: lines.join('\n'), keyboard }
}

export function systemScreen(healthLines) {
  return {
    text: ['🛠 Система', '', ...healthLines].join('\n'),
    keyboard: [
      [{ text: '📌 Доработки', callback_data: 'a:x:todo' }, { text: '🔎 Проверить чат', callback_data: 'a:x:chatcheck' }],
      [{ text: '👤 Пользователи бота', callback_data: 'a:x:bots' }, { text: '🗣 Откуда узнали', callback_data: 'a:x:src:30' }],
      [{ text: '⭐ Отзывы о материалах', callback_data: 'a:x:rv' }, { text: '🔔 Уведомления', callback_data: 'a:x:notif' }],
      [{ text: '📣 Рассылки', callback_data: 'a:x:nl' }, { text: '💾 Резервная копия сейчас', callback_data: 'a:x:backup' }],
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
  'x:ambplus': 'Амбассадор: счётчик', 'x:ambdelok': 'Амбассадор удалён', 'input:ambassador': 'Амбассадор добавлен', 'x:cr': 'Причина отписки',
  'x:evst': 'Мероприятие: статус', 'input:event-paid': 'Мероприятие: оплата отмечена', remgo: 'Напоминания резидентам отправлены', 'x:backup': 'Резервная копия по запросу', 'x:grant': 'Выдан бессрочный доступ резидента', 'x:tdone': 'Доработка отмечена выполненной', 'input:todo': 'Доработка добавлена', 'x:kickok': 'Исключён из чата сообщества', 'k:pp': 'Сделка: предоплата получена', 'k:pf': 'Сделка: остаток получен', 's:vst': 'Вакансия: статус в учёте',
  'x:dgcon': 'Сводка дня: статус консультации', 'x:dgev': 'Сводка дня: заявка обработана', 'x:dgres': 'Сводка дня: резюме не нужно', 'x:dgint': 'Сводка дня: интересовавшийся', 'x:dgdeal': 'Сводка дня: сделка, действие сделано', 'x:dgcr': 'Сводка дня: причина отписки',
  'x:ovsnz': 'Просрочка: отложено', 'x:nlp': 'Рассылка: пауза или возобновление', 'x:nlgook': 'Рассылка: отправка запущена вручную', 'x:nlt': 'Рассылка: тест', 'x:ovcxlok': 'Просрочка: подписчик отписан', 'x:ovnok': 'Просрочка: напоминание об оплате отправлено', 'input:next-date': 'Просрочка: дата списания указана',
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

// ---- Карточка человека (как «Подписчик» в BotHelp) ----

/** Полная карточка пользователя бота: контакты, метки, UTM, промокод, дни, активность и связь с подпиской сообщества. */
export function userCard(u, join, tariffs, now) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || 'без имени'
  const utm = Object.entries(u.utm ?? {}).map(([k, v]) => `${k.replace('utm_', '')}: ${v}`).join(', ')
  const daysLeft = join?.status === 'active' && join.nextPaymentAt ? Math.ceil((join.nextPaymentAt - now) / DAY) : u.days
  const lines = [
    `👤 ${name}`,
    '',
    `Статус: ${u.blockedAt ? '🚫 заблокировал бота' : '🟢 подписан'}`,
    `Telegram ID: ${u.id}`,
    u.username ? `Аккаунт: ${u.username}` : null,
    u.botHelpCUserId ? `CUser ID (BotHelp): ${u.botHelpCUserId}` : null,
    `Первый контакт: ${u.createdAt ? ruDateTime(u.createdAt) : '—'}`,
    `Последний контакт: ${u.lastContactAt || u.lastSeenAt ? ruDateTime(u.lastContactAt ?? u.lastSeenAt) : '—'}`,
    `Диалогов: ${u.conversationsCount ?? 0}`,
    '',
    `📞 Телефон: ${u.phone || 'не указан'}`,
    `✉️ Почта: ${u.email || 'не указана'}`,
    `Согласие на обработку данных: ${u.consentAt ? ruDate(u.consentAt) : 'нет'}`,
    `Согласие на рассылку: ${u.mailingConsent === true ? 'да' : u.mailingConsent === false ? 'нет' : 'не отвечал'}`,
    '',
    `🏷 Метки: ${(u.tags ?? []).join(', ') || '—'}`,
    u.ref ? `Ref: ${u.ref}` : null,
    u.startParam ? `Start: ${u.startParam}` : null,
    utm ? `UTM: ${utm}` : null,
    u.promo ? `🎟 Промокод: ${u.promo}` : null,
    daysLeft != null ? `📆 Дни: ${daysLeft}` : null,
  ].filter((l) => l !== null)
  if (join) {
    lines.push('', `💳 Подписка сообщества: ${join.status === 'active' ? 'активна' : join.status === 'cancelled' ? 'отключена' : 'не оплачена'}${join.paid ? `, ${rub(planAmount(join, tariffs))}` : ''}${join.oneTime ? ' (разовая, 30 дней)' : ''}${join.nextPaymentAt && join.status === 'active' ? `, до ${ruDate(join.nextPaymentAt)}` : ''}${join.bonusDays ? `, бонус +${join.bonusDays} дн.` : ''}`)
  }
  const stats = [['Баллов', u.activityScore], ['Мероприятий', u.eventsCount], ['Реакций', u.reactionsCount], ['Комментариев', u.commentsCount]].filter(([, v]) => v != null && v !== '')
  if (u.levelName || stats.length) {
    lines.push('', `⚡ Уровень: ${u.levelName || '—'}${u.nextLevelName ? ` → ${u.nextLevelName}` : ''}${u.pointsToNextLevel != null ? ` (до следующего: ${u.pointsToNextLevel})` : ''}`, ...stats.map(([k, v]) => `• ${k}: ${v}`))
  }
  const keyboard = [
    [{ text: '✉️ Написать', url: u.username ? tgUrl(u.username) : `tg://user?id=${u.id}` }],
    ...(join?.lifetime ? [] : [[{ text: '🌟 Дать бессрочный доступ резидента', callback_data: `a:x:grant:${u.id}` }]]),
    back('⬅️ Пользователи бота', 'a:x:bots'),
  ]
  return { text: lines.join('\n'), keyboard }
}

/** Пользователи бота: сколько всего, по согласиям и меткам; кнопки — поиск по метке. */
export function botUsersScreen(users) {
  const tagCount = new Map()
  for (const u of users) for (const t of u.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  const lines = [
    `👤 Пользователи бота: ${users.length}`,
    `Согласие на обработку данных: ${users.filter((u) => u.consentAt).length}`,
    `Согласны на рассылку: ${users.filter((u) => u.mailingConsent === true).length}, отказались: ${users.filter((u) => u.mailingConsent === false).length}`,
    '',
    'Метки:',
    ...[...tagCount].sort((a, b) => b[1] - a[1]).map(([t, n]) => `• ${t} — ${n}`),
  ]
  return { text: lines.join('\n'), keyboard: [back('⬅️ Система', 'a:x:sys')] }
}

// ---- Доработки (список задач) ----

export const TODO_PROMPT = '📌 Новая доработка\n\nОтправьте текст одним сообщением. Отмена — /cancel.'

export function todosScreen(todos) {
  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done).slice(-3)
  const lines = [`📌 Доработки: в работе ${open.length}`, '', ...(open.length ? open.map((t) => `${t.number}. ${t.text}`) : ['Всё сделано 🎉'])]
  if (done.length) lines.push('', 'Недавно выполнено:', ...done.map((t) => `✅ ${t.number}. ${t.text}`))
  const keyboard = []
  for (const t of open.slice(0, 20)) keyboard.push([{ text: `✅ Готово: ${t.number}. ${t.text}`.slice(0, 60), callback_data: `a:x:tdone:${t.number}` }])
  keyboard.push([{ text: '➕ Добавить доработку', callback_data: 'a:x:tnew' }], back('⬅️ Система', 'a:x:sys'))
  return { text: lines.join('\n'), keyboard }
}

/** Проверка доступа бота к чату сообщества: администратор ли он и есть ли права приглашать и исключать. */
export function chatCheckScreen(info) {
  const ok = (v) => (v ? '✅' : '❌')
  const lines = ['🔎 Чат сообщества', '']
  if (info.error) lines.push(`⚠️ ${info.error}`)
  else {
    lines.push(`Чат: ${info.title || '—'} (${info.type || '—'}), id ${info.chatId}`, `Бот: @${info.botUsername}`, `Статус бота в чате: ${info.status}`)
    if (info.status === 'administrator') {
      lines.push(`${ok(info.canInvite)} приглашать пользователей / одобрять заявки`, `${ok(info.canRestrict)} исключать участников`, `${ok(info.canManage)} управлять чатом`)
      if (!info.canInvite) lines.push('', 'Включите боту право «Приглашать пользователей», иначе заявки не будут одобряться.')
      if (!info.canRestrict) lines.push('', 'Право «Блокировать пользователей» нужно для исключения участников по окончании подписки.')
    } else lines.push('', '❌ Бот не администратор — добавьте его администратором чата.')
  }
  return { text: lines.join('\n'), keyboard: [back('⬅️ Система', 'a:x:sys')] }
}
