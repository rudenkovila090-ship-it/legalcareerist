// Сводка дня как список дел: каждая цифра открывается кнопкой, у каждого дела есть действие, после которого оно исчезает из сводки.
// Цель админа: к концу дня все счётчики по нулям. Утром это «Сводка дня», вечером — «Итог дня» (тот же расчёт).
// Только тексты и кнопки: данные приходят аргументами, изменения делает index.js по нажатиям (callback «a:x:…»).
import { rub, who, planAmount, CANCEL_REASONS } from './adminCabinet.js'
import { mskDayKey } from './dailyReport.js'
import { dealsDueForReminder, stageOf } from './deals.js'
import { interestsDueForReminder, INTEREST_KINDS } from './interests.js'
import { normalizePhone } from './jsonStore.js'

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

// ---- Просрочка и «срок вышел»: кто и почему ----

/** Prodamus повторяет списание раз в 8 часов до 10 раз (около 3,3 суток): позже ждать оплату нечего, доступ пора закрывать. */
export const RETRY_DAYS = 4

export function isSnoozed(j, now) {
  return Boolean(j.snoozedUntil && j.snoozedUntil > now)
}

/** Активные подписчики, у которых время списания давно прошло, а оплаты нет. Бессрочные не в счёт. */
export function overdueJoins(joins, now) {
  return joins.filter((j) => j.status === 'active' && !j.lifetime && j.nextPaymentAt && j.nextPaymentAt < now - OVERDUE_GRACE_MS).sort((a, b) => a.nextPaymentAt - b.nextPaymentAt)
}

/** Отписанный (подписка отключена), у кого оплаченный срок уже вышел. Без даты следующего списания считаем сроком два дня после отписки. */
export function cancelledAccessOver(j, now) {
  if (j.status !== 'cancelled' || j.lifetime || !j.tgUserId) return false
  return (j.nextPaymentAt ?? (j.cancelledAt ?? 0) + 2 * DAY) < now - OVERDUE_GRACE_MS
}

/** Это тот же человек, что и в другой карточке: совпал Telegram id, телефон или почта. */
function samePerson(a, b) {
  const phone = (v) => normalizePhone(v)
  const mail = (v) => String(v ?? '').trim().toLowerCase()
  return Boolean((a.tgUserId && a.tgUserId === b.tgUserId) || (phone(a.phone) && phone(a.phone) === phone(b.phone)) || (mail(a.email) && mail(a.email) === mail(b.email)))
}

/** У человека есть другая действующая подписка (дубль карточки): из чата его исключать нельзя, достаточно закрыть лишнюю карточку. */
export function hasOtherActive(j, joins, now) {
  return joins.some((k) => k.token !== j.token && samePerson(j, k) && (k.lifetime || (k.status === 'active' && (!k.nextPaymentAt || k.nextPaymentAt >= now - OVERDUE_GRACE_MS))))
}

/**
 * Почему человек в просрочке. code: ended (срок вышел: разовая подписка закончилась, попытки Prodamus кончились или прошло больше
 * RETRY_DAYS, подписка отключена), failed (Prodamus пробовал списать, не вышло, попытки ещё идут), imported (дата из BotHelp, оплат в Prodamus
 * не было), silent (от Prodamus не пришло ничего).
 */
export function overdueReason(j, now) {
  const due = j.nextPaymentAt
  const late = due ? now - due : 0
  const lateDays = daysAgo(due ?? now, now)
  const real = (j.payments ?? []).filter((p) => !p.estimated)
  const fail = j.lastChargeFailure && due && j.lastChargeFailure.at >= due - HOUR ? j.lastChargeFailure : null
  const ended = (text) => ({
    code: 'ended',
    icon: '🚪',
    title: 'Срок вышел, подписка не продлена',
    text,
    todo: 'Исключите человека из чата, если он там, или просто уберите из активных, если его уже нет. Если на самом деле он платит по другой подписке, проверьте его в Prodamus по телефону и укажите дату списания.',
  })
  if (j.status === 'cancelled') return ended(`Подписка отключена${j.cancelledAt ? ` ${ruDate(j.cancelledAt)}` : ''}, оплаченный срок вышел${due ? ` ${ruDate(due)}` : ''}, а человек всё ещё в чате.`)
  if (j.oneTime) return ended(`Разовая подписка (без автопродления) закончилась ${ruDate(due)}${lateDays ? ` (${lateDays} дн. назад)` : ''}, продления нет.`)
  if (fail?.last) return ended(`Prodamus пробовал списать${fail.error ? ` («${clip(fail.error, 80)}»)` : ''} и больше пробовать не будет. Время списания было ${ruDate(due)}.`)
  if (late >= RETRY_DAYS * DAY) {
    return ended(`Время списания было ${ruDate(due)} (${lateDays} дн. назад). Prodamus давно перестал пробовать (до 10 попыток за около 3 суток), оплаты нет${real.length ? '' : ', а по карточке нет ни одной настоящей оплаты в Prodamus (дата перенесена из BotHelp)'}.`)
  }
  if (fail) {
    const attempt = fail.attempt ? `попытка ${fail.attempt} из 10` : 'попытка не первая'
    return {
      code: 'failed',
      icon: '🟡',
      title: 'Списание не прошло',
      text: `Prodamus пробовал списать, не получилось${fail.error ? `: «${clip(fail.error, 80)}»` : ''} (${attempt}, последняя ${ruDateTime(fail.at)}). Он повторит сам, раз в 8 часов.`,
      todo: 'Обычно это карта: человеку уже ушло предупреждение. Если не оплатит за пару дней — напишите. Через 4 дня после срока бот переведёт его в «Срок вышел».',
    }
  }
  if (j.importedFromBotHelp && real.length === 0) {
    return { code: 'imported', icon: '📥', title: 'Дата перенесена из BotHelp', text: 'Дату списания мы взяли из BotHelp, а оплат в Prodamus по этой карточке ещё не было. Возможно, человек платит по другой подписке или уже ушёл.', todo: 'Проверьте человека в Prodamus по телефону: платит — укажите дату списания; не платит — через 4 дня после срока бот переведёт его в «Срок вышел».' }
  }
  return { code: 'silent', icon: '❓', title: 'От Prodamus ничего не пришло', text: 'Время списания прошло, но Prodamus не прислал ни оплаты, ни ошибки списания. Возможно, подписку отключили, а уведомление не дошло, или оно задержалось.', todo: 'Откройте подписку в Prodamus по телефону: отключена — отпишите человека здесь; активна — подождите. Через 4 дня после срока бот переведёт его в «Срок вышел».' }
}

/** Все, у кого срок вышел и доступ пора закрывать: просроченные активные и отписанные, которые всё ещё в чате (inChat выставляет ежедневная проверка чата). */
export function endedJoins(joins, now) {
  const active = overdueJoins(joins, now).filter((j) => overdueReason(j, now).code === 'ended')
  const leaks = joins.filter((j) => cancelledAccessOver(j, now) && j.inChat === true && !hasOtherActive(j, joins, now)).sort((a, b) => (a.nextPaymentAt ?? a.cancelledAt ?? 0) - (b.nextPaymentAt ?? b.cancelledAt ?? 0))
  return [...active, ...leaks]
}

/** Просрочены, но оплату ещё можно получить (попытки Prodamus идут или причина неясна). */
export function waitingJoins(joins, now) {
  return overdueJoins(joins, now).filter((j) => overdueReason(j, now).code !== 'ended')
}

/**
 * Что сделать с человеком, у которого срок вышел. mem — где он: in (в чате), out (нет в чате), admin (администратор чата), none (нет Telegram id),
 * unknown (Telegram не ответил). Действия: kick (исключить из чата, написать, отписать), close (убрать из активных, чат не трогать, ничего не писать),
 * mark (отписан и уже не в чате — только пометить), skip (не трогаем). Исключаем из чата только если нет другой действующей подписки.
 */
export function planAction(j, mem, joins, now) {
  const other = hasOtherActive(j, joins, now)
  if (other && j.status === 'active') return { action: 'close', note: 'есть другая действующая подписка: убираю только лишнюю карточку, из чата не исключаю' }
  if (mem === 'in') return other ? { action: 'skip', note: 'есть другая действующая подписка' } : { action: 'kick', note: 'в чате: исключу и напишу, что подписка истекла' }
  if (mem === 'admin') return { action: 'skip', note: 'администратор чата: не трогаю' }
  if (mem === 'out') return j.status === 'active' ? { action: 'close', note: 'в чате его нет: убираю из активных, ничего не пишу' } : { action: 'mark', note: 'в чате его нет: просто отмечаю' }
  if (mem === 'none') return j.status === 'active' ? { action: 'close', note: 'Telegram неизвестен, в чат не вступал(а): убираю из активных' } : { action: 'skip', note: 'нет Telegram id' }
  return { action: 'skip', note: 'Telegram не ответил: проверю позже' }
}

const MEM_LABEL = { in: '✅ в чате', out: '❌ нет в чате', admin: '👑 администратор чата', none: 'Telegram неизвестен', unknown: '❓ проверить не удалось' }
const last4 = (phone) => String(phone ?? '').replace(/\D/g, '').slice(-4)
/** Подпись на кнопке: имя и последние цифры телефона, чтобы не перепутать людей с одинаковыми именами. */
const buttonName = (j) => `${nameOf(j)}${last4(j.phone) ? ` …${last4(j.phone)}` : ''}`

/** Контакты и подсказка, где искать человека в Prodamus. */
function contactLines(j) {
  const real = (j.payments ?? []).filter((p) => !p.estimated)
  const sub = real.at(-1)?.subscriptionId
  return [
    `👤 ${j.name && j.name !== '—' ? j.name : 'имя не указано'}`,
    j.phone ? `📞 ${j.phone}` : '📞 телефона в учёте нет',
    j.email ? `✉️ ${j.email}` : null,
    j.telegram ? `💬 ${j.telegram}` : null,
    j.tgUserId ? `🆔 Telegram id …${String(j.tgUserId).slice(-4)}` : null,
    `🔎 В Prodamus искать ${j.phone ? 'по телефону' : j.email ? 'по почте' : 'по номеру подписки'}${sub ? ` или по номеру подписки №${sub}` : ''}${j.prodamusProfileId ? ` (профиль ${j.prodamusProfileId})` : ''}`,
  ].filter((l) => l !== null)
}

const REASON_ORDER = ['failed', 'silent', 'imported']

/** Как назвать состояние подписки в списках: активна, просрочена (ждём оплату) или срок вышел. */
export function subscriptionLabel(j, now) {
  if (j.status !== 'active' || j.lifetime || !j.nextPaymentAt || j.nextPaymentAt >= now - OVERDUE_GRACE_MS) return 'активна'
  return overdueReason(j, now).code === 'ended' ? '🚪 срок вышел' : '⚠️ просрочена, ждём оплату'
}

/** Список просрочки: сначала объяснение, потом люди по причинам; у каждого кнопка с карточкой. «Срок вышел» вынесено в отдельный список. */
export function overdueScreen(joins, tariffs, now) {
  const all = waitingJoins(joins, now)
  const snoozed = all.filter((j) => isSnoozed(j, now))
  const list = all.filter((j) => !isSnoozed(j, now))
  const endedCount = endedJoins(joins, now).filter((j) => !isSnoozed(j, now)).length
  const endedRow = endedCount ? [[{ text: `🚪 Срок вышел · ${endedCount}`, callback_data: 'a:x:dg:end' }]] : []
  const backRows = [...endedRow, [{ text: '⬅️ Сообщество', callback_data: 'a:sec:community' }, ...digestRow]]
  if (!list.length) {
    const tail = snoozed.length ? `\n\nОтложено: ${snoozed.length} (вернутся в сводку, когда срок отсрочки выйдет).` : ''
    const ended = endedCount ? `\n\n🚪 Отдельно: у ${endedCount} срок вышел, их доступ пора закрыть (кнопка ниже).` : ''
    return { text: `✅ Просроченных списаний, по которым ещё можно получить оплату, нет.${tail}${ended}`, keyboard: backRows }
  }
  const lines = [
    `⚠️ Просрочено, ждём оплату: ${list.length}${snoozed.length ? ` (ещё отложено: ${snoozed.length})` : ''}`,
    '',
    `Время списания прошло больше 12 часов назад, а оплаты нет. Prodamus повторяет попытку каждые 8 часов до 10 раз (около 3 суток), поэтому в первые дни это чаще всего «карта отказала». Сумма под вопросом: ${rub(list.reduce((acc, j) => acc + planAmount(j, tariffs), 0))}.${endedCount ? `\n🚪 Кому срок уже вышел (${endedCount}), вынесены в отдельный список.` : ''}`,
  ]
  const groups = new Map(REASON_ORDER.map((code) => [code, []]))
  for (const j of list) groups.get(overdueReason(j, now).code).push(j)
  let shown = 0
  const keyboard = []
  for (const code of REASON_ORDER) {
    const members = groups.get(code)
    if (!members.length) continue
    const sample = overdueReason(members[0], now)
    lines.push('', `${sample.icon} ${sample.title} — ${members.length}`)
    for (const j of members) {
      if (shown >= 12) break
      shown += 1
      const days = daysAgo(j.nextPaymentAt, now)
      lines.push(`• ${nameOf(j)} · 📞 ${j.phone || 'телефона нет'}${j.telegram ? ` · ${j.telegram}` : ''} · ${rub(planAmount(j, tariffs))} · ждали ${ruDate(j.nextPaymentAt)}${days ? ` (${days} дн. назад)` : ''}`)
      if (keyboard.length < 12) keyboard.push([{ text: `${sample.icon} ${buttonName(j)} · ${rub(planAmount(j, tariffs))}`.slice(0, 60), callback_data: `a:x:ovc:${j.token}` }])
    }
  }
  if (list.length > shown) lines.push('', `…и ещё ${list.length - shown}: появятся, когда разберёте этих.`)
  lines.push('', 'Нажмите на человека: в карточке причина, телефон для проверки в Prodamus и что можно сделать.')
  return { text: lines.join('\n'), keyboard: [...keyboard, ...backRows] }
}

/** Список «Срок вышел»: кто, когда вышел срок, в чате ли он, что с ним сделает бот. membership — Map(token → mem). */
export function endedScreen(joins, tariffs, now, membership = new Map()) {
  const all = endedJoins(joins, now)
  const snoozed = all.filter((j) => isSnoozed(j, now))
  const list = all.filter((j) => !isSnoozed(j, now))
  const backRows = [[{ text: '⬅️ К просрочке', callback_data: 'a:x:over' }, ...digestRow]]
  if (!list.length) return { text: `✅ «Срок вышел»: всё разобрано, закрывать доступ некому.${snoozed.length ? `\n\nОтложено: ${snoozed.length}.` : ''}`, keyboard: backRows }
  const memOf = (j) => membership.get(j.token) ?? (j.tgUserId ? 'unknown' : 'none')
  const plans = list.map((j) => ({ join: j, mem: memOf(j), ...planAction(j, memOf(j), joins, now) }))
  const lines = [
    `🚪 Срок вышел, пора закрыть доступ: ${list.length}${snoozed.length ? ` (ещё отложено: ${snoozed.length})` : ''}`,
    '',
    'Это люди, чей оплаченный срок закончился, а подписка не продлена. Бот сам проверил в Telegram, есть ли человек в чате сообщества.',
    '',
  ]
  const keyboard = []
  for (const { join: j, mem, action, note } of plans.slice(0, 12)) {
    const end = j.nextPaymentAt ?? j.cancelledAt
    const days = end ? daysAgo(end, now) : 0
    lines.push(`• ${nameOf(j)} · 📞 ${j.phone || 'телефона нет'}${j.telegram ? ` · ${j.telegram}` : ''} · ${rub(planAmount(j, tariffs))}`, `   срок вышел ${end ? ruDate(end) : 'давно'}${days ? ` (${days} дн. назад)` : ''} · ${MEM_LABEL[mem]}${j.status === 'cancelled' ? ' · отписан(а)' : ''}`, `   → ${note}`)
    if (keyboard.length < 10) keyboard.push([{ text: `${action === 'kick' ? '🚪' : '📂'} ${buttonName(j)}`.slice(0, 60), callback_data: `a:x:ovc:${j.token}` }])
  }
  if (plans.length > 12) lines.push('', `…и ещё ${plans.length - 12}: появятся, когда разберёте этих.`)
  const doable = plans.filter((p) => p.action !== 'skip').length
  const kicks = plans.filter((p) => p.action === 'kick').length
  const batch = doable ? [[{ text: `✅ Закрыть всем (${doable}${kicks ? `, исключить из чата: ${kicks}` : ''})`, callback_data: 'a:x:endall' }]] : []
  lines.push('', doable ? 'Нажмите «Закрыть всем»: сначала покажу список, что именно сделаю, и спрошу подтверждение. Или откройте человека по кнопке.' : 'Сейчас ничего сделать нельзя (см. пометки). Откройте человека по кнопке.')
  return { text: lines.join('\n'), keyboard: [...batch, ...keyboard, ...backRows] }
}

/** Подтверждение пакетного закрытия: что будет сделано с каждым. plan — [{ join, mem, action, note }]. */
export function endedPlanScreen(plan) {
  const by = (action) => plan.filter((p) => p.action === action)
  const row = (p) => `• ${nameOf(p.join)} · 📞 ${p.join.phone || 'телефона нет'}`
  const lines = ['🚪 Подтвердите закрытие доступа', '']
  if (by('kick').length) lines.push(`Исключу из чата и напишу «подписка истекла, можно продлить» (${by('kick').length}):`, ...by('kick').map(row), '')
  if (by('close').length) lines.push(`Уберу из активных, из чата не трогаю, ничего не пишу (${by('close').length}):`, ...by('close').map(row), '')
  if (by('mark').length) lines.push(`Только отмечу (их уже нет в чате) (${by('mark').length}):`, ...by('mark').map(row), '')
  if (by('skip').length) lines.push(`Пропущу (${by('skip').length}):`, ...by('skip').map((p) => `${row(p)} — ${p.note}`), '')
  lines.push('Исключённый человек сможет вернуться сам, оплатив подписку. Перед подтверждением можно проверить оплату каждого в Prodamus по телефону.')
  return { text: lines.join('\n'), keyboard: [[{ text: '✅ Да, выполнить', callback_data: 'a:x:endok' }, { text: 'Отмена', callback_data: 'a:x:dg:end' }]] }
}

/**
 * Карточка просрочившего или «срок вышел»: причина, контакты для проверки в Prodamus, что известно, что присылал Prodamus и кнопки решения.
 * events — [{ at, label }] из журнала вебхуков. extra.membership — где человек (in/out/admin/none/unknown), extra.plan — planAction.
 */
export function overdueCard(j, tariffs, now, events = [], extra = {}) {
  const r = overdueReason(j, now)
  const real = (j.payments ?? []).filter((p) => !p.estimated)
  const last = real.at(-1)
  const sub = last?.subscriptionId ?? null
  const end = j.nextPaymentAt ?? j.cancelledAt
  const days = end ? daysAgo(end, now) : 0
  const mem = extra.membership
  const lines = [
    `${r.code === 'ended' ? '🚪 Срок вышел' : '⚠️ Просрочка'} · ${nameOf(j)}`,
    '',
    ...contactLines(j),
    '',
    `${r.icon} ${r.title}`,
    r.text,
    '',
    `💳 Тариф: ${rub(planAmount(j, tariffs))}${j.oneTime ? ', разовая' : ', с автопродлением'}${sub ? ` · подписка Prodamus №${sub}` : ''}`,
    end ? `📅 ${j.status === 'cancelled' ? 'Оплаченный срок вышел' : 'Ждали списание'}: ${ruDateTime(end)}${days ? ` (${days} дн. назад)` : ''}` : null,
    last ? `💰 Оплат учтено: ${real.length}, последняя ${ruDate(last.at)} на ${last.amount ? rub(last.amount) : 'неизвестную сумму'}` : '💰 Настоящих оплат в Prodamus по этой карточке нет',
    mem ? `💬 Сообщество: ${MEM_LABEL[mem]}${j.joinedAt ? `, вступил(а) ${ruDate(j.joinedAt)}` : ''}` : j.joinedAt ? `✅ В чате с ${ruDate(j.joinedAt)}` : j.tgUserId ? '⚪ В чат по ссылке ещё не вступал(а)' : null,
    j.tgUserId ? '🤖 Бот запускал(а): уведомления доходят' : '🤖 Бот не запускал(а): написать можно только по нику или почте',
    isSnoozed(j, now) ? `⏰ Отложено до ${ruDate(j.snoozedUntil)}` : null,
  ].filter((l) => l !== null)
  if (events.length) lines.push('', 'Что присылал Prodamus по этому человеку:', ...events.map((e) => `• ${ruDateTime(e.at)} — ${e.label}`))
  else lines.push('', 'Prodamus по этому человеку ничего не присылал (в журнале вебхуков пусто).')
  if (extra.plan?.note) lines.push('', `👉 ${extra.plan.note}`)
  lines.push('', `ℹ️ ${r.todo}`)
  const t = j.token
  const keyboard = []
  const first = []
  if (j.telegram) first.push({ text: '✉️ Написать', url: tgUrl(j.telegram) })
  if (r.code === 'failed' || r.code === 'silent') first.push({ text: '🔔 Напомнить об оплате', callback_data: `a:x:ovn:${t}` })
  if (first.length) keyboard.push(first)
  if (r.code === 'ended') {
    const action = extra.plan?.action
    if (action === 'kick') keyboard.push([{ text: '🚪 Исключить из чата и отписать', callback_data: `a:x:kick:${t}` }])
    else if (action === 'close') keyboard.push([{ text: '🔕 Убрать из активных', callback_data: `a:x:ovcxl:${t}` }])
    else if (action === 'mark') keyboard.push([{ text: '✅ Его нет в чате: закрыть', callback_data: `a:x:endone:${t}` }])
    if (j.status === 'active') keyboard.push([{ text: '📅 Он платит: указать дату списания', callback_data: `a:x:ovdate:${t}` }])
    keyboard.push([{ text: `⏰ Отложить на ${SNOOZE_DAYS} дня`, callback_data: `a:x:ovsnz:${t}` }])
    keyboard.push([{ text: '⬅️ К списку «Срок вышел»', callback_data: 'a:x:dg:end' }, ...digestRow])
    return { text: lines.join('\n'), keyboard }
  }
  keyboard.push([{ text: '📅 Указать дату списания', callback_data: `a:x:ovdate:${t}` }, { text: `⏰ Отложить на ${SNOOZE_DAYS} дня`, callback_data: `a:x:ovsnz:${t}` }])
  keyboard.push([{ text: '🔕 Отписать (карточка неактуальна)', callback_data: `a:x:ovcxl:${t}` }])
  keyboard.push([{ text: '⬅️ К просрочке', callback_data: 'a:x:over' }, ...digestRow])
  return { text: lines.join('\n'), keyboard }
}

// ---- Что считается делом ----

/**
 * Все дела и справочные цифры дня. Дела (open) закрываются действием в боте, справочные (info) просто показывают, что происходит.
 * Консультации и мероприятия «пропадают» из счётчика, когда у них меняется статус; резюме — когда прикреплено или отмечено «не нужно».
 */
/** Кандидат резерва, чьё резюме ещё не получено: нет ссылки и не отмечено «получено» (resumeSkipped — старая отметка «не нужно»). */
export const resumeWaiting = (c) => !c.resumeUrl && !c.resumeReceivedAt && !c.resumeSkipped

export function collectDayTasks(data, tariffs, now) {
  const today = mskDayKey(now)
  const yesterday = mskDayKey(now - DAY)
  const joins = data.joins
  const waitingAll = waitingJoins(joins, now)
  const endedAll = endedJoins(joins, now)
  const cancelledRecent = joins.filter((j) => j.cancelledAt && [today, yesterday].includes(mskDayKey(j.cancelledAt)))
  const chargesToday = joins.filter((j) => j.status === 'active' && !j.lifetime && j.nextPaymentAt && mskDayKey(j.nextPaymentAt) === today)
  const paidToday = []
  for (const j of joins) for (const p of j.payments ?? []) if (!p.estimated && p.at && mskDayKey(p.at) === today && p.kind === 'renewal') paidToday.push({ join: j, payment: p })
  const firstToday = []
  for (const j of joins) for (const p of j.payments ?? []) if (!p.estimated && p.at && mskDayKey(p.at) === today && p.kind === 'first') firstToday.push({ join: j, payment: p })
  return {
    info: { chargesToday, paidToday, firstToday, cancelledRecent },
    open: {
      overdue: waitingAll.filter((j) => !isSnoozed(j, now)),
      ended: endedAll.filter((j) => !isSnoozed(j, now)),
      snoozed: waitingAll.filter((j) => isSnoozed(j, now)),
      snoozedEnded: endedAll.filter((j) => isSnoozed(j, now)),
      cancelNoReason: cancelledRecent.filter((j) => !j.cancelReason && !j.cancelReasonText),
      deals: dealsDueForReminder(now),
      interests: interestsDueForReminder(now),
      consults: data.consultations.filter((c) => c.status === 'new'),
      resume: data.reserve.filter(resumeWaiting),
      requests: data.eventLeads.filter((e) => e.kind === 'request' && e.status === 'new'),
    },
  }
}

export function openCount(tasks) {
  const o = tasks.open
  return o.overdue.length + o.ended.length + o.cancelNoReason.length + o.deals.length + o.interests.length + o.consults.length + o.resume.length + o.requests.length
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
  lines.push(`${mark(o.overdue.length)} Просрочено, ждём оплату: ${o.overdue.length}${o.snoozed.length ? ` (отложено: ${o.snoozed.length})` : ''}`)
  lines.push(`${mark(o.ended.length)} Срок вышел, пора закрыть доступ: ${o.ended.length}${o.snoozedEnded.length ? ` (отложено: ${o.snoozedEnded.length})` : ''}`)
  lines.push(`${mark(o.cancelNoReason.length)} Отписались вчера и сегодня: ${cancelledRecent.length}${o.cancelNoReason.length ? `, без причины: ${o.cancelNoReason.length}` : ''}`)
  lines.push(`${mark(o.deals.length)} Сделки, по которым пора действовать: ${o.deals.length}${o.deals.length ? ` (${o.deals.slice(0, 5).map((d) => `№${d.number}`).join(', ')})` : ''}`)
  lines.push(`${mark(o.interests.length)} Написать интересовавшимся: ${o.interests.length}`)
  lines.push(`${mark(o.consults.length)} Новых консультаций без ответа: ${o.consults.length}`)
  lines.push(`${mark(o.resume.length)} Кандидатов резерва, чьё резюме ещё не получено: ${o.resume.length}`)
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
  add(o.ended.length, '🚪 Срок вышел', 'a:x:dg:end')
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

/** Кандидаты резерва: резюме присылают владельцу в Telegram, здесь его достаточно отметить полученным. */
export function resumeTasksScreen(reserve) {
  const list = reserve.filter(resumeWaiting).sort((a, b) => a.createdAt - b.createdAt)
  if (!list.length) return doneScreen('Кандидаты резерва')
  const lines = [`🗃 Резюме кандидатов резерва ещё не получено: ${list.length}`, 'Пришло резюме в Telegram — нажмите «Получено», кандидат уйдёт из списка.', '']
  const keyboard = []
  for (const c of list.slice(0, MAX_ITEMS)) {
    lines.push(`• №${c.number} · ${c.name || 'без имени'} · ${c.city || 'город?'} · ${c.position || 'должность?'} · заявка ${ruDate(c.createdAt)}${c.telegram ? ` · ${c.telegram}` : ''}${c.phone ? ` · ${c.phone}` : ''}`)
    keyboard.push([{ text: `✅ Получено: ${c.name || `№${c.number}`}`.slice(0, 50), callback_data: `a:x:dgres:${c.number}` }, { text: '📂', callback_data: `a:s:rcard:${c.number}` }])
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

/**
 * Сверка сообщества и чата: сколько людей в чате по данным Telegram и как это раскладывается по карточкам. staff — администраторы чата
 * (бот, официальный аккаунт и т. д.), cards — [{ join, mem }] активные и бессрочные карточки с признаком, в чате ли человек.
 */
export function chatAuditScreen({ total, staff, cards, joins, now }) {
  const backRow = [{ text: '⬅️ Сообщество', callback_data: 'a:sec:community' }, ...menuRow]
  const staffIds = new Set(staff.map((s) => s.id))
  const endedSet = new Set(endedJoins(joins, now).map((j) => j.token))
  const waitingSet = new Set(waitingJoins(joins, now).map((j) => j.token))
  const isStaff = (c) => c.join.tgUserId && staffIds.has(String(c.join.tgUserId))
  const real = cards.filter((c) => !isStaff(c))
  const lifetime = real.filter((c) => c.join.lifetime)
  const paying = real.filter((c) => !c.join.lifetime)
  const ok = paying.filter((c) => !endedSet.has(c.join.token) && !waitingSet.has(c.join.token))
  const waiting = paying.filter((c) => waitingSet.has(c.join.token))
  const ended = paying.filter((c) => endedSet.has(c.join.token))
  const inChat = (list) => list.filter((c) => c.mem === 'in' || c.mem === 'admin').length
  const outChat = (list) => list.filter((c) => c.mem === 'out').length
  const unknown = (list) => list.filter((c) => c.mem !== 'in' && c.mem !== 'admin' && c.mem !== 'out').length
  const cancelledInChat = joins.filter((j) => j.status === 'cancelled' && j.inChat === true && !j.lifetime).length
  const split = (list) => `в чате ${inChat(list)}, не в чате ${outChat(list)}${unknown(list) ? `, не проверить ${unknown(list)}` : ''}`
  const humans = total == null ? null : total - staff.length
  const knownInChat = inChat(lifetime) + inChat(paying)
  const free = humans == null ? null : humans - knownInChat - cancelledInChat
  const lines = [
    '🧮 Сверка сообщества и чата',
    '',
    total == null ? '⚠️ Telegram не назвал число участников чата (бот должен быть администратором).' : `В чате Telegram: ${total}`,
    ...(total == null ? [] : [`   служебные (администраторы и боты): ${staff.length}${staff.length ? ` — ${staff.map((s) => s.name).join(', ')}` : ''}`, `   остальные люди: ${humans}`]),
    '',
    `Карточки со статусом «активна» в учёте: ${paying.length}${lifetime.length ? ` + бессрочных ${lifetime.length}` : ''}`,
    `   ✅ оплата в порядке: ${ok.length} (${split(ok)})`,
    `   ⚠️ просрочено, ждём оплату: ${waiting.length} (${split(waiting)})`,
    `   🚪 срок вышел, уже не платят: ${ended.length} (${split(ended)})`,
    ...(lifetime.length ? [`   ♾ бессрочные: ${lifetime.length} (${split(lifetime)})`] : []),
    cancelledInChat ? `Отписались, но ещё в чате: ${cancelledInChat}` : null,
    free == null ? null : `Остальные в чате (бесплатные участники и те, кого нет в учёте): ${free}`,
    '',
    'Платящими считайте строку «оплата в порядке»: у остальных оплаты сейчас нет.',
  ].filter((l) => l !== null)
  const notIn = [...ok, ...waiting].filter((c) => c.mem === 'out' || c.mem === 'none')
  if (notIn.length) {
    lines.push('', 'Оплата идёт, но в чате их нет:')
    for (const c of notIn.slice(0, 10)) lines.push(`• ${nameOf(c.join)} · 📞 ${c.join.phone || 'телефона нет'}${c.join.telegram ? ` · ${c.join.telegram}` : ''} · ${c.mem === 'none' ? 'Telegram id неизвестен' : 'не вступил(а) или вышел(ла)'}`)
    if (notIn.length > 10) lines.push(`…и ещё ${notIn.length - 10}`)
  }
  const keyboard = []
  if (waiting.length) keyboard.push([{ text: `⚠️ Просрочено · ${waiting.length}`, callback_data: 'a:x:over' }])
  if (ended.length) keyboard.push([{ text: `🚪 Срок вышел · ${ended.length}`, callback_data: 'a:x:dg:end' }])
  keyboard.push([{ text: '🔄 Пересчитать', callback_data: 'a:x:chataud' }])
  keyboard.push(backRow)
  return { text: lines.join('\n'), keyboard }
}
