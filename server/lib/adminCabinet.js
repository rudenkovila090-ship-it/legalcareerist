// Кабинет администратора в Telegram-боте: тексты экранов и кнопки. Ничего не
// знает про Telegram API и хранилище — получает карточки подписчиков и
// возвращает { text, keyboard }, чтобы это можно было проверять отдельно.
import { mskDayKey } from './dailyReport.js'

const MSK = 'Europe/Moscow'
const DAY = 24 * 3600 * 1000
const MAX_LINES = 40

const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
const ruDay = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit' }).format(new Date(ts))
const who = (j) => [j.name && j.name !== '—' ? j.name : null, j.telegram || null, j.phone || null].filter(Boolean).join(', ') || 'контакты не указаны'

function tariffLabel(join, tariffs) {
  const last = join.payments?.at(-1)
  return tariffs[join.tariffId]?.period ?? last?.subscriptionName ?? 'другой тариф'
}

function lastAmount(join) {
  return Number(join.payments?.at(-1)?.amount) || 0
}

/** Обрезает длинный список, чтобы сообщение влезло в лимит Telegram (4096 символов). */
function limited(lines) {
  if (lines.length <= MAX_LINES) return lines
  return [...lines.slice(0, MAX_LINES), `…и ещё ${lines.length - MAX_LINES}`]
}

export const MENU_KEYBOARD = [
  [
    { text: '📊 Сегодня', callback_data: 'a:rep:today' },
    { text: 'Вчера', callback_data: 'a:rep:yesterday' },
    { text: '7 дней', callback_data: 'a:rep:week' },
    { text: 'Месяц', callback_data: 'a:rep:month' },
  ],
  [
    { text: '👥 Подписчики', callback_data: 'a:subs' },
    { text: '⏭ Списания', callback_data: 'a:due' },
  ],
  [
    { text: '🔕 Отписались', callback_data: 'a:cancelled' },
    { text: '🔔 Напоминания', callback_data: 'a:rem' },
  ],
  [{ text: '🔌 Состояние системы', callback_data: 'a:status' }],
]

export function menuScreen() {
  return { text: '🛠 Кабинет администратора\n\nВыберите, что показать:', keyboard: MENU_KEYBOARD }
}

/** Активные подписчики по тарифам, у каждого — дата следующего списания. */
export function subscribersScreen(joins, tariffs) {
  const active = joins.filter((j) => j.status === 'active')
  if (!active.length) return { text: '👥 Активных подписчиков пока нет.', keyboard: MENU_KEYBOARD }

  const groups = new Map()
  for (const j of active) {
    const label = tariffLabel(j, tariffs)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(j)
  }
  const lines = [`👥 Активных подписчиков: ${active.length}`]
  for (const [label, list] of groups) {
    lines.push('', `${label} — ${list.length}`)
    const sorted = [...list].sort((a, b) => (a.nextPaymentAt ?? Infinity) - (b.nextPaymentAt ?? Infinity))
    for (const j of sorted) lines.push(`• ${who(j)}${j.nextPaymentAt ? ` — списание ${ruDay(j.nextPaymentAt)}` : ''}`)
  }
  return { text: limitedText(lines), keyboard: MENU_KEYBOARD }
}

function limitedText(lines) {
  // Ограничение по числу строк внутри групп: общий список режем целиком.
  return limited(lines).join('\n')
}

/** Списания на ближайшие 14 дней по датам. */
export function dueScreen(joins, now) {
  const from = mskDayKey(now)
  const to = mskDayKey(now + 14 * DAY)
  const due = joins
    .filter((j) => j.status === 'active' && j.nextPaymentAt && mskDayKey(j.nextPaymentAt) >= from && mskDayKey(j.nextPaymentAt) <= to)
    .sort((a, b) => a.nextPaymentAt - b.nextPaymentAt)
  if (!due.length) return { text: '⏭ В ближайшие 14 дней списаний нет.', keyboard: MENU_KEYBOARD }

  const total = due.reduce((acc, j) => acc + lastAmount(j), 0)
  const lines = [`⏭ Списания на 14 дней: ${due.length} · ~${rub(total)}`]
  let day = ''
  for (const j of due) {
    const key = mskDayKey(j.nextPaymentAt)
    if (key !== day) {
      day = key
      lines.push('', `${ruDay(j.nextPaymentAt)}:`)
    }
    lines.push(`• ${who(j)} — ${lastAmount(j) ? rub(lastAmount(j)) : 'сумма неизвестна'}`)
  }
  return { text: limitedText(lines), keyboard: MENU_KEYBOARD }
}

/** Кто отключил подписку — с датой, чтобы можно было написать и спросить причину. */
export function cancelledScreen(joins) {
  const list = joins.filter((j) => j.status === 'cancelled').sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0))
  if (!list.length) return { text: '🔕 Отписавшихся нет.', keyboard: MENU_KEYBOARD }
  const lines = [`🔕 Отключили подписку: ${list.length}`, '']
  for (const j of list) lines.push(`• ${who(j)}${j.cancelledAt ? ` — ${ruDay(j.cancelledAt)}` : ''}`)
  return { text: limitedText(lines), keyboard: MENU_KEYBOARD }
}

/**
 * Кому напомнить о списании через `days` дней: активные подписчики, у которых
 * дата следующего списания попадает на этот день. Получатели, которым мы уже
 * писали про эту дату (remindedFor), пропускаются. Без tgUserId написать
 * нельзя — бот не может первым начать диалог, поэтому таких считаем отдельно.
 */
export function reminderTargets(joins, now, days) {
  const day = mskDayKey(now + days * DAY)
  const due = joins.filter((j) => j.status === 'active' && j.nextPaymentAt && mskDayKey(j.nextPaymentAt) === day)
  const fresh = due.filter((j) => j.remindedFor !== j.nextPaymentAt)
  return {
    day,
    reachable: fresh.filter((j) => j.tgUserId),
    unreachable: fresh.filter((j) => !j.tgUserId),
    alreadySent: due.length - fresh.length,
  }
}

export function reminderMenuScreen() {
  return {
    text: '🔔 Напоминания подписчикам\n\nБот напишет тем, у кого скоро списание и кто уже общался с ботом. Сначала покажу, кому уйдёт.',
    keyboard: [
      [
        { text: 'Списание завтра', callback_data: 'a:rem:1' },
        { text: 'Через 3 дня', callback_data: 'a:rem:3' },
      ],
      [{ text: '⬅️ Меню', callback_data: 'a:menu' }],
    ],
  }
}

export function reminderPreviewScreen(joins, now, days) {
  const t = reminderTargets(joins, now, days)
  const title = days === 1 ? 'завтра' : `через ${days} дня`
  const lines = [`🔔 Списание ${title}`, '']
  if (!t.reachable.length && !t.unreachable.length) {
    lines.push(t.alreadySent ? `Всем (${t.alreadySent}) уже напоминали.` : 'На эту дату списаний нет.')
    return { text: lines.join('\n'), keyboard: [[{ text: '⬅️ Назад', callback_data: 'a:rem' }]] }
  }
  if (t.reachable.length) {
    lines.push(`Напомню (${t.reachable.length}):`)
    for (const j of t.reachable) lines.push(`• ${who(j)} — ${rub(lastAmount(j))}`)
  }
  if (t.unreachable.length) {
    lines.push('', `Не могу написать — не нажимали Start у бота (${t.unreachable.length}), напомните вручную:`)
    for (const j of t.unreachable) lines.push(`• ${who(j)} — ${rub(lastAmount(j))}`)
  }
  if (t.alreadySent) lines.push('', `Уже напоминали: ${t.alreadySent}`)
  const keyboard = []
  if (t.reachable.length) keyboard.push([{ text: `✅ Отправить (${t.reachable.length})`, callback_data: `a:remgo:${days}` }])
  keyboard.push([{ text: '⬅️ Назад', callback_data: 'a:rem' }])
  return { text: limitedText(lines), keyboard }
}

/** Текст напоминания подписчику. */
export function reminderMessage(join, supportHandle) {
  const name = join.name && join.name !== '—' ? join.name.split(' ')[1] ?? join.name.split(' ')[0] : null
  const amount = lastAmount(join)
  return [
    `${name ? `${name}, здравствуйте` : 'Здравствуйте'}! Напоминаем: ${ruDay(join.nextPaymentAt)} по вашей подписке на сообщество «Карьерный юрист» пройдёт очередное списание${amount ? ` — ${rub(amount)}` : ''}.`,
    '',
    `Если планы изменились или есть вопросы — напишите нам: ${supportHandle}`,
  ].join('\n')
}
