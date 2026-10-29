// Сводка дня как список дел: каждая цифра открывается кнопкой, у каждого дела есть действие, после которого оно исчезает из сводки.
// Цель админа: к концу дня все счётчики по нулям. Утром это «Сводка дня», вечером — «Итог дня» (тот же расчёт).
// Только тексты и кнопки: данные приходят аргументами, изменения делает index.js по нажатиям (callback «a:x:…»).
import { rub, who, planAmount, CANCEL_REASONS } from './adminCabinet.js'
import { mskDayKey } from './dailyReport.js'
import { dealsDueForReminder, stageOf } from './deals.js'
import { interestsDueForReminder, INTEREST_KINDS } from './interests.js'

const MSK = 'Europe/Moscow'
const DAY = 24 * 3600 * 1000
const HOUR = 3600 * 1000
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))
const ruDateTime = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
const tgUrl = (telegram) => `https://t.me/${String(telegram).replace(/^@/, '')}`
const clip = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text)
const nameOf = (x) => (x.name && x.name !== '—' ? x.name : x.telegram || x.phone || 'без имени')
const daysAgo = (ts, now) => Math.max(0, Math.floor((now - ts) / DAY))

/** Время списания прошло больше чем на столько, а оплаты нет — подписка «просрочена» (Prodamus пробует снова через 8 часов). */
export const OVERDUE_GRACE_MS = 12 * HOUR
/** На сколько дней кнопка «Отложить» убирает просрочку из сводки. */
export const SNOOZE_DAYS = 3
/** Максимум дел в одном списке: остальные появятся, когда эти разберут. */
const MAX_ITEMS = 8

const menuRow = [{ text: '🏠 Меню', callback_data: 'a:menu' }]
const digestRow = [{ text: '🌅 К сводке дня', callback_data: 'a:x:digest' }, ...menuRow]

// ---- Просрочка: кто и почему ----

export function isSnoozed(j, now) {
  return Boolean(j.snoozedUntil && j.snoozedUntil > now)
}

/** Активные подписчики, у которых время списания давно прошло, а оплаты нет. Бессрочные не в счёт. */
export function overdueJoins(joins, now) {
  return joins.filter((j) => j.status === 'active' && !j.lifetime && j.nextPaymentAt && j.nextPaymentAt < now - OVERDUE_GRACE_MS).sort((a, b) => a.nextPaymentAt - b.nextPaymentAt)
}

/**
 * Почему человек в просрочке. code: ended (разовая подписка закончилась), failed (Prodamus пробовал списать, не вышло),
 * imported (дата перенесена из BotHelp, оплат в Prodamus не было), silent (от Prodamus не пришло ничего).
 */
export function overdueReason(j) {
  const due = j.nextPaymentAt
  const real = (j.payments ?? []).filter((p) => !p.estimated)
  const fail = j.lastChargeFailure
  if (j.oneTime) {
    return { code: 'ended', icon: '⏰', title: 'Срок разовой подписки закончился', text: `Разовая подписка (без автопродления) закончилась ${ruDateTime(due)}, продления нет.`, todo: 'Если человек не продлил — исключите его из чата или отпишите.' }
  }
  if (fail && fail.at >= due - HOUR) {
    const attempt = fail.attempt ? `попытка ${fail.attempt} из 10` : 'попытка не первая'
    return {
      code: 'failed',
      icon: '🟡',
      title: 'Списание не прошло',
      text: `Prodamus пробовал списать, не получилось${fail.error ? `: «${clip(fail.error, 80)}»` : ''} (${attempt}, последняя ${ruDateTime(fail.at)}). ${fail.last ? 'Больше попыток не будет.' : 'Он повторит сам, раз в 8 часов.'}`,
      todo: fail.last ? 'Попыток больше нет: напишите человеку, а если не платит — отпишите или исключите.' : 'Обычно это карта: человеку уже ушло предупреждение. Если не оплатит за пару дней — напишите.',
    }
  }
  if (j.importedFromBotHelp && real.length === 0) {
    return { code: 'imported', icon: '📥', title: 'Дата перенесена из BotHelp', text: 'Дату списания мы взяли из BotHelp, а оплат в Prodamus по этой карточке ещё не было. Возможно, человек платит по другой подписке, платил иначе или уже ушёл.', todo: 'Проверьте человека в Prodamus: платит — укажите дату следующего списания; ушёл — отпишите.' }
  }
  return { code: 'silent', icon: '❓', title: 'От Prodamus ничего не пришло', text: 'Время списания прошло, но Prodamus не прислал ни оплаты, ни ошибки списания. Возможно, подписку отключили, а уведомление не дошло, или оно задержалось.', todo: 'Откройте подписку в Prodamus: отключена — отпишите человека здесь; активна — подождите, потом напишите ему.' }
}

const REASON_ORDER = ['failed', 'silent', 'imported', 'ended']

/** Список просрочки: сначала объяснение, потом люди по причинам; у каждого кнопка с карточкой. */
export function overdueScreen(joins, tariffs, now) {
  const all = overdueJoins(joins, now)
  const snoozed = all.filter((j) => isSnoozed(j, now))
  const list = all.filter((j) => !isSnoozed(j, now))
  const backRows = [[{ text: '⬅️ Сообщество', callback_data: 'a:sec:community' }, ...digestRow]]
  if (!list.length) {
    const tail = snoozed.length ? `\n\nОтложено: ${snoozed.length} (вернутся в сводку, когда срок отсрочки выйдет).` : ''
    return { text: `✅ Просроченных списаний нет — всё разобрано.${tail}`, keyboard: backRows }
  }
  const lines = [
    `⚠️ Просрочено: ${list.length}${snoozed.length ? ` (ещё отложено: ${snoozed.length})` : ''}`,
    '',
    `Время списания прошло больше 12 часов назад, а оплаты нет. Prodamus повторяет попытку каждые 8 часов до 10 раз (около 3 суток), поэтому в первые дни это чаще всего «карта отказала». Сумма под вопросом: ${rub(list.reduce((acc, j) => acc + planAmount(j, tariffs), 0))}.`,
  ]
  const groups = new Map(REASON_ORDER.map((code) => [code, []]))
  for (const j of list) groups.get(overdueReason(j).code).push(j)
  let shown = 0
  const keyboard = []
  for (const code of REASON_ORDER) {
    const members = groups.get(code)
    if (!members.length) continue
    const sample = overdueReason(members[0])
    lines.push('', `${sample.icon} ${sample.title} — ${members.length}`)
    for (const j of members) {
      if (shown >= 12) break
      shown += 1
      const days = daysAgo(j.nextPaymentAt, now)
      lines.push(`• ${who(j)} · ${rub(planAmount(j, tariffs))} · ждали ${ruDate(j.nextPaymentAt)}${days ? ` (${days} дн. назад)` : ''}`)
      if (keyboard.length < 12) keyboard.push([{ text: `${sample.icon} ${nameOf(j)} · ${rub(planAmount(j, tariffs))}`.slice(0, 60), callback_data: `a:x:ovc:${j.token}` }])
    }
  }
  if (list.length > shown) lines.push('', `…и ещё ${list.length - shown}: появятся, когда разберёте этих.`)
  lines.push('', 'Нажмите на человека: в карточке причина и что можно сделать (написать, указать дату, отложить, отписать).')
  return { text: lines.join('\n'), keyboard: [...keyboard, ...backRows] }
}

/** Карточка просрочившего: причина, что известно, что пришло от Prodamus и кнопки решения. events — [{ at, label }] из журнала вебхуков. */
export function overdueCard(j, tariffs, now, events = []) {
  const r = overdueReason(j)
  const real = (j.payments ?? []).filter((p) => !p.estimated)
  const last = real.at(-1)
  const sub = last?.subscriptionId ?? null
  const days = daysAgo(j.nextPaymentAt, now)
  const lines = [
    `⚠️ Просрочка · ${who(j)}`,
    '',
    `${r.icon} ${r.title}`,
    r.text,
    '',
    `💳 Тариф: ${rub(planAmount(j, tariffs))}${j.oneTime ? ', разовая' : ', с автопродлением'}${sub ? ` · подписка Prodamus №${sub}` : ''}`,
    `📅 Ждали списание: ${ruDateTime(j.nextPaymentAt)}${days ? ` (${days} дн. назад)` : ''}`,
    last ? `💰 Оплат учтено: ${real.length}, последняя ${ruDate(last.at)} на ${last.amount ? rub(last.amount) : 'неизвестную сумму'}` : '💰 Настоящих оплат в Prodamus по этой карточке нет',
    j.joinedAt ? `✅ В чате с ${ruDate(j.joinedAt)}` : j.tgUserId ? '⚪ В чат по ссылке ещё не вступал(а)' : null,
    j.tgUserId ? '🤖 Бот запускал(а): уведомления доходят' : '🤖 Бот не запускал(а): написать можно только по нику или почте',
    isSnoozed(j, now) ? `⏰ Отложено до ${ruDate(j.snoozedUntil)}` : null,
  ].filter((l) => l !== null)
  if (events.length) lines.push('', 'Что присылал Prodamus по этому человеку:', ...events.map((e) => `• ${ruDateTime(e.at)} — ${e.label}`))
  else lines.push('', 'Prodamus по этому человеку ничего не присылал (в журнале вебхуков пусто).')
  lines.push('', `👉 ${r.todo}`)
  const t = j.token
  const keyboard = []
  const first = []
  if (j.telegram) first.push({ text: '✉️ Написать', url: tgUrl(j.telegram) })
  if (r.code === 'failed' || r.code === 'silent') first.push({ text: '🔔 Напомнить об оплате', callback_data: `a:x:ovn:${t}` })
  if (first.length) keyboard.push(first)
  keyboard.push([{ text: '📅 Указать дату списания', callback_data: `a:x:ovdate:${t}` }, { text: `⏰ Отложить на ${SNOOZE_DAYS} дня`, callback_data: `a:x:ovsnz:${t}` }])
  keyboard.push([{ text: '🔕 Отписать (карточка неактуальна)', callback_data: `a:x:ovcxl:${t}` }])
  if (j.tgUserId) keyboard.push([{ text: '🚪 Исключить из чата сообщества', callback_data: `a:x:kick:${t}` }])
  keyboard.push([{ text: '⬅️ К просрочке', callback_data: 'a:x:over' }, ...digestRow])
  return { text: lines.join('\n'), keyboard }
}

// ---- Что считается делом ----

/**
 * Все дела и справочные цифры дня. Дела (open) закрываются действием в боте, справочные (info) просто показывают, что происходит.
 * Консультации и мероприятия «пропадают» из счётчика, когда у них меняется статус; резюме — когда прикреплено или отмечено «не нужно».
 */
export function collectDayTasks(data, tariffs, now) {
  const today = mskDayKey(now)
  const yesterday = mskDayKey(now - DAY)
  const joins = data.joins
  const overdueAll = overdueJoins(joins, now)
  const cancelledRecent = joins.filter((j) => j.cancelledAt && [today, yesterday].includes(mskDayKey(j.cancelledAt)))
  const chargesToday = joins.filter((j) => j.status === 'active' && !j.lifetime && j.nextPaymentAt && mskDayKey(j.nextPaymentAt) === today)
  const paidToday = []
  for (const j of joins) for (const p of j.payments ?? []) if (!p.estimated && p.at && mskDayKey(p.at) === today && p.kind === 'renewal') paidToday.push({ join: j, payment: p })
  const firstToday = []
  for (const j of joins) for (const p of j.payments ?? []) if (!p.estimated && p.at && mskDayKey(p.at) === today && p.kind === 'first') firstToday.push({ join: j, payment: p })
  return {
    info: { chargesToday, paidToday, firstToday, cancelledRecent },
    open: {
      overdue: overdueAll.filter((j) => !isSnoozed(j, now)),
      snoozed: overdueAll.filter((j) => isSnoozed(j, now)),
      cancelNoReason: cancelledRecent.filter((j) => !j.cancelReason && !j.cancelReasonText),
      deals: dealsDueForReminder(now),
      interests: interestsDueForReminder(now),
      consults: data.consultations.filter((c) => c.status === 'new'),
      resume: data.reserve.filter((c) => !c.resumeUrl && !c.resumeSkipped),
      requests: data.eventLeads.filter((e) => e.kind === 'request' && e.status === 'new'),
    },
  }
}

export function openCount(tasks) {
  const o = tasks.open
  return o.overdue.length + o.cancelNoReason.length + o.deals.length + o.interests.length + o.consults.length + o.resume.length + o.requests.length
}

const mark = (n) => (n ? '👉' : '✅')

/** Сводка дня (утром) и итог дня (вечером): цифры, пометки «разобрано/осталось» и кнопка на каждое дело. */
export function digestScreen(data, tariffs, now, healthLines = [], { evening = false } = {}) {
  const tasks = collectDayTasks(data, tariffs, now)
  const { chargesToday, paidToday, firstToday, cancelledRecent } = tasks.info
  const o = tasks.open
  const left = openCount(tasks)
  const sum = (list, f) => list.reduce((acc, x) => acc + f(x), 0)
  const lines = [evening ? `🏁 Итог дня · ${ruDate(now)}` : `🌅 Сводка дня · ${ruDate(now)}`, '']
  lines.push(left ? `Осталось разобрать: ${left}. Нажмите на кнопку под сообщением — откроется список с действиями.` : '🎉 Всё разобрано: открытых дел нет.')
  lines.push('')
  const chargeLine = chargesToday.length ? `${chargesToday.length} на ${rub(sum(chargesToday, (j) => planAmount(j, tariffs)))}` : '0'
  lines.push(`⏭ Списаний сегодня: ${chargeLine}${paidToday.length ? `, уже прошло ${paidToday.length} на ${rub(sum(paidToday, (x) => Number(x.payment.amount) || 0))}` : ''}`)
  lines.push(`${mark(o.overdue.length)} Просрочено: ${o.overdue.length}${o.snoozed.length ? ` (отложено: ${o.snoozed.length})` : ''}`)
  lines.push(`${mark(o.cancelNoReason.length)} Отписались вчера и сегодня: ${cancelledRecent.length}${o.cancelNoReason.length ? `, без причины: ${o.cancelNoReason.length}` : ''}`)
  lines.push(`${mark(o.deals.length)} Сделки, по которым пора действовать: ${o.deals.length}${o.deals.length ? ` (${o.deals.slice(0, 5).map((d) => `№${d.number}`).join(', ')})` : ''}`)
  lines.push(`${mark(o.interests.length)} Написать интересовавшимся: ${o.interests.length}`)
  lines.push(`${mark(o.consults.length)} Новых консультаций без ответа: ${o.consults.length}`)
  lines.push(`${mark(o.resume.length)} Кандидатов резерва без ссылки на резюме: ${o.resume.length}`)
  lines.push(`${mark(o.requests.length)} Новых заявок по мероприятиям: ${o.requests.length}`)
  if (evening) {
    const waiting = chargesToday.filter((j) => j.nextPaymentAt < now)
    lines.push('', '💳 Деньги за день:', `• Новых оплат: ${firstToday.length}${firstToday.length ? ` на ${rub(sum(firstToday, (x) => Number(x.payment.amount) || 0))}` : ''}`, `• Продлений: ${paidToday.length}${paidToday.length ? ` на ${rub(sum(paidToday, (x) => Number(x.payment.amount) || 0))}` : ''}`)
    if (waiting.length) lines.push(`• Время списания прошло, оплаты нет: ${waiting.length} на ${rub(sum(waiting, (j) => planAmount(j, tariffs)))} — Prodamus повторит попытку; если не выйдет, они завтра попадут в «Просрочено»`)
    else lines.push('• Все списания дня прошли или ещё впереди')
  }
  if (o.deals.length || o.interests.length) {
    lines.push('', '📋 Что сделать сегодня:')
    for (const d of o.deals.slice(0, 5)) lines.push(`• Сделка №${d.number} · ${d.company || d.name || 'без названия'} — этап ${d.stage}: ${stageOf(d.stage).todo}`)
    if (o.deals.length > 5) lines.push(`• …и ещё сделок: ${o.deals.length - 5}`)
    for (const i of o.interests.slice(0, 5)) lines.push(`• Написать: ${i.name || i.telegram || i.phone || `№${i.number}`} — интересовался(лась): ${i.note || INTEREST_KINDS[i.kind] || i.kind}`)
    if (o.interests.length > 5) lines.push(`• …и ещё интересовавшихся: ${o.interests.length - 5}`)
  }
  const openTodos = (data.todos ?? []).filter((t) => !t.done)
  if (openTodos.length) lines.push('', `📌 Доработок в работе: ${openTodos.length}`, ...openTodos.slice(0, 4).map((t) => `• ${t.text}`), ...(openTodos.length > 4 ? ['• …остальные — в «Система → Доработки»'] : []))
  if (healthLines.length && !evening) lines.push('', '🩺 Система:', ...healthLines)

  const buttons = []
  const add = (n, text, data) => {
    if (n) buttons.push({ text: `${text} · ${n}`, callback_data: data })
  }
  add(o.overdue.length, '⚠️ Просрочено', 'a:x:over')
  add(o.consults.length, '🎯 Консультации', 'a:x:dg:con')
  add(o.requests.length, '📨 Заявки мероприятий', 'a:x:dg:ev')
  add(o.resume.length, '🗃 Резюме', 'a:x:dg:res')
  add(o.interests.length, '📇 Написать', 'a:x:dg:int')
  add(o.deals.length, '⚖️ Сделки', 'a:x:dg:deal')
  add(o.cancelNoReason.length, '🔕 Причины отписок', 'a:x:dg:cxl')
  const keyboard = []
  for (let i = 0; i < buttons.length; i += 2) keyboard.push(buttons.slice(i, i + 2))
  keyboard.push([{ text: '⏭ Списания сегодня', callback_data: 'a:x:dg:chg' }, { text: '🔄 Обновить', callback_data: 'a:x:digest' }])
  keyboard.push(menuRow)
  return { text: lines.join('\n'), keyboard }
}

// ---- Списки дел ----

const doneScreen = (title) => ({ text: `✅ ${title}: всё разобрано.`, keyboard: [digestRow] })
const more = (list) => (list.length > MAX_ITEMS ? [`…и ещё ${list.length - MAX_ITEMS}: появятся, когда разберёте эти.`] : [])

/** Списания сегодня: кто уже заплатил, кого ждём. Только справка. */
export function chargesTodayScreen(data, tariffs, now) {
  const { chargesToday, paidToday } = collectDayTasks(data, tariffs, now).info
  if (!chargesToday.length && !paidToday.length) return { text: '⏭ Сегодня списаний нет.', keyboard: [digestRow] }
  const lines = ['⏭ Списания сегодня', '']
  for (const { join, payment } of paidToday) lines.push(`✅ ${ruDateTime(payment.at).slice(-5)} · ${who(join)} · ${payment.amount ? rub(payment.amount) : '—'} — прошло`)
  for (const j of [...chargesToday].sort((a, b) => a.nextPaymentAt - b.nextPaymentAt)) {
    const late = j.nextPaymentAt < now
    lines.push(`${late ? '⏳' : '🕒'} ${ruDateTime(j.nextPaymentAt).slice(-5)} · ${who(j)} · ${rub(planAmount(j, tariffs))} — ${late ? 'время прошло, оплату ещё ждём (Prodamus повторит попытку)' : 'впереди'}`)
  }
  lines.push('', 'Ничего делать не нужно: если оплата не придёт, человек завтра окажется в «Просрочено» с причиной.')
  return { text: lines.join('\n'), keyboard: [digestRow] }
}

/** Новые консультации: пояснение, почему они «без ответа», и кнопки статуса прямо в списке. */
export function consultTasksScreen(consultations, now) {
  const list = consultations.filter((c) => c.status === 'new').sort((a, b) => a.createdAt - b.createdAt)
  if (!list.length) return doneScreen('Консультации')
  const lines = [
    `🎯 Новые консультации без ответа: ${list.length}`,
    '',
    'Статус «Новая» ставится при заявке и меняется только вручную: бот не видит, что вы уже ответили человеку в Telegram или по телефону. Ответили — нажмите «В работу» или «Выполнена»; заявка ненастоящая — «Отмена».',
    '',
  ]
  const keyboard = []
  for (const c of list.slice(0, MAX_ITEMS)) {
    const age = daysAgo(c.createdAt, now)
    lines.push(`• №${c.number} · ${c.name || 'без имени'} · ${c.kind === 'question' ? 'вопрос' : c.total != null ? rub(c.total) : 'заказ'} · заявка ${ruDateTime(c.createdAt)}${age ? ` (${age} дн. назад)` : ''}`, `   ${clip((c.services ?? []).join('; ') || '—', 120)}${c.telegram ? ` · ${c.telegram}` : c.phone ? ` · ${c.phone}` : ''}`)
    keyboard.push([{ text: `📂 №${c.number} ${c.name || ''}`.slice(0, 60), callback_data: `a:s:con:${c.number}` }, ...(c.telegram ? [{ text: '✉️', url: tgUrl(c.telegram) }] : [])])
    keyboard.push(['in_progress', 'done', 'cancelled'].map((status) => ({ text: { in_progress: '🔄 В работу', done: '✅ Выполнена', cancelled: '❌ Отмена' }[status], callback_data: `a:x:dgcon:${c.number}:${status}` })))
  }
  lines.push(...more(list))
  return { text: lines.join('\n'), keyboard: [...keyboard, digestRow] }
}

/** Заявки мероприятий (партнёры, организаторы): открыть, отметить «обработана» или написать. */
export function requestTasksScreen(leads, now) {
  const list = leads.filter((e) => e.kind === 'request' && e.status === 'new').sort((a, b) => a.createdAt - b.createdAt)
  if (!list.length) return doneScreen('Заявки по мероприятиям')
  const labels = { event_partner_application: 'партнёр', partner_application: 'партнёр', event_submission: 'своё мероприятие', event_order: 'под ключ' }
  const lines = [`📨 Новые заявки по мероприятиям: ${list.length}`, 'Ответили или решили вопрос — нажмите «Обработана».', '']
  const keyboard = []
  for (const e of list.slice(0, MAX_ITEMS)) {
    const age = daysAgo(e.createdAt, now)
    lines.push(`• №${e.number} · ${e.name || 'без имени'} · ${labels[e.formType] ?? e.formType}${e.company ? ` · ${e.company}` : ''} · ${ruDate(e.createdAt)}${age ? ` (${age} дн. назад)` : ''}`, ...(e.note ? [`   ${clip(e.note.replace(/\s+/g, ' '), 140)}`] : []))
    keyboard.push([{ text: `📂 №${e.number} ${e.name || ''}`.slice(0, 40), callback_data: `a:x:evcard:${e.number}` }, ...(e.telegram ? [{ text: '✉️', url: tgUrl(e.telegram) }] : []), { text: '✅ Обработана', callback_data: `a:x:dgev:${e.number}` }])
  }
  lines.push(...more(list))
  return { text: lines.join('\n'), keyboard: [...keyboard, digestRow] }
}

/** Кандидаты резерва без резюме: прикрепить ссылку или отметить, что резюме не нужно. */
export function resumeTasksScreen(reserve) {
  const list = reserve.filter((c) => !c.resumeUrl && !c.resumeSkipped).sort((a, b) => a.createdAt - b.createdAt)
  if (!list.length) return doneScreen('Кандидаты резерва')
  const lines = [`🗃 Кандидаты резерва без ссылки на резюме: ${list.length}`, 'Прикрепите ссылку (например, с Google Диска) или нажмите «Не нужно», если резюме не требуется.', '']
  const keyboard = []
  for (const c of list.slice(0, MAX_ITEMS)) {
    lines.push(`• №${c.number} · ${c.name || 'без имени'} · ${c.city || 'город?'} · ${c.position || 'должность?'} · заявка ${ruDate(c.createdAt)}`)
    keyboard.push([{ text: `🔗 №${c.number} ${c.name || ''}`.slice(0, 36), callback_data: `a:x:dgresurl:${c.number}` }, ...(c.telegram ? [{ text: '✉️', url: tgUrl(c.telegram) }] : []), { text: '🙅 Не нужно', callback_data: `a:x:dgres:${c.number}` }])
  }
  lines.push(...more(list))
  return { text: lines.join('\n'), keyboard: [...keyboard, digestRow] }
}

/** Интересовавшиеся, которым пора написать: написал(а), через неделю, неактуально. */
export function interestTasksScreen(now) {
  const list = interestsDueForReminder(now)
  if (!list.length) return doneScreen('Интересовавшиеся')
  const lines = [`📇 Написать интересовавшимся: ${list.length}`, 'Написали человеку — «Написал(а)». Рано — «Через неделю». Не актуально — «Неактуально».', '']
  const keyboard = []
  for (const i of list.slice(0, MAX_ITEMS)) {
    lines.push(`• №${i.number} · ${i.name || i.telegram || i.phone || 'без имени'} · ${INTEREST_KINDS[i.kind] ?? i.kind} · обращался ${ruDate(i.contactedAt)}${i.remindCount ? ` · напоминаний было ${i.remindCount}` : ''}`, ...(i.note ? [`   ❓ ${clip(i.note.replace(/\s+/g, ' '), 140)}`] : []))
    keyboard.push([{ text: `📂 №${i.number} ${i.name || ''}`.slice(0, 30), callback_data: `a:s:icard:${i.number}` }, ...(i.telegram ? [{ text: '✉️', url: tgUrl(i.telegram) }] : [])])
    keyboard.push([{ text: '✅ Написал(а)', callback_data: `a:x:dgint:${i.number}:done` }, { text: '⏰ Через неделю', callback_data: `a:x:dgint:${i.number}:snooze` }, { text: '🚫 Неактуально', callback_data: `a:x:dgint:${i.number}:close` }])
  }
  lines.push(...more(list))
  return { text: lines.join('\n'), keyboard: [...keyboard, digestRow] }
}

/** Сделки, по которым пора действовать: открыть карточку или отметить «сделал(а)» (следующее напоминание — через срок этапа). */
export function dealTasksScreen(now) {
  const list = dealsDueForReminder(now)
  if (!list.length) return doneScreen('Сделки')
  const lines = [`⚖️ Сделки, по которым пора действовать: ${list.length}`, 'Сделали то, что нужно по этапу, — нажмите «Сделал(а)», бот напомнит снова через срок этапа.', '']
  const keyboard = []
  for (const d of list.slice(0, MAX_ITEMS)) {
    lines.push(`• №${d.number} · ${d.company || d.name || 'без названия'} — этап ${d.stage} «${stageOf(d.stage).name}»: ${stageOf(d.stage).todo}`)
    keyboard.push([{ text: `📂 Сделка №${d.number}`, callback_data: `a:k:deal:${d.number}` }, { text: '✅ Сделал(а)', callback_data: `a:x:dgdeal:${d.number}` }])
  }
  lines.push(...more(list))
  return { text: lines.join('\n'), keyboard: [...keyboard, digestRow] }
}

/** Недавние отписки без причины: открыть человека и выбрать причину. */
export function cancelTasksScreen(joins, now) {
  const today = mskDayKey(now)
  const yesterday = mskDayKey(now - DAY)
  const list = joins.filter((j) => j.cancelledAt && [today, yesterday].includes(mskDayKey(j.cancelledAt)) && !j.cancelReason && !j.cancelReasonText).sort((a, b) => a.cancelledAt - b.cancelledAt)
  if (!list.length) return doneScreen('Причины отписок')
  const lines = [`🔕 Отписались вчера и сегодня, причина не указана: ${list.length}`, 'Причина попадает в статистику отписок. Выберите, что вы знаете о человеке; не знаете — «Другое».', '']
  const keyboard = []
  for (const j of list.slice(0, MAX_ITEMS)) {
    lines.push(`• ${who(j)} · отписался ${ruDateTime(j.cancelledAt)}`)
    keyboard.push([{ text: `${nameOf(j)} · указать причину`.slice(0, 60), callback_data: `a:x:dgcrp:${j.token}` }])
  }
  lines.push(...more(list))
  return { text: lines.join('\n'), keyboard: [...keyboard, digestRow] }
}

/** Выбор причины отписки для человека; после выбора бот возвращает в список причин. */
export function cancelReasonPicker(j) {
  const r = (code) => ({ text: CANCEL_REASONS[code], callback_data: `a:x:dgcr:${j.token}:${code}` })
  return {
    text: [`🔕 ${who(j)}`, j.cancelledAt ? `Отписался: ${ruDateTime(j.cancelledAt)}` : null, j.email ? `✉️ ${j.email}` : null, '', 'Почему человек отписался?'].filter((l) => l !== null).join('\n'),
    keyboard: [[r('price'), r('time')], [r('content'), r('other')], [{ text: '⬅️ К списку', callback_data: 'a:x:dg:cxl' }, ...menuRow]],
  }
}

/** Подтверждение отписки карточки (без исключения из чата и без сообщения человеку). */
export function unsubscribeConfirm(j) {
  return {
    text: `🔕 Отписать ${who(j)}?\n\nКарточка перестанет считаться активной и уйдёт из «Просрочено». Из чата человека не исключаем и ничего ему не отправляем. Если он потом оплатит, подписка включится сама.`,
    keyboard: [[{ text: '✅ Да, отписать', callback_data: `a:x:ovcxlok:${j.token}` }, { text: 'Отмена', callback_data: `a:x:ovc:${j.token}` }]],
  }
}

/** Подтверждение ручного напоминания об оплате: показываем текст, который уйдёт человеку. */
export function nudgeConfirm(j, text) {
  return {
    text: `🔔 Отправить ${who(j)} напоминание об оплате (бот${j.email ? ' и почта' : ''})?\n\n———\n${text}\n———`,
    keyboard: [[{ text: '✅ Отправить', callback_data: `a:x:ovnok:${j.token}` }, { text: 'Отмена', callback_data: `a:x:ovc:${j.token}` }]],
  }
}

export const NEXT_DATE_PROMPT = (j) => `📅 ${who(j)}\n\nКогда у человека следующее списание? Отправьте дату: ДД.ММ или ДД.ММ.ГГГГ (например, 02.11). Отмена — /cancel.`
