// Кабинет администратора в Telegram-боте: тексты экранов и кнопки. Ничего не
// знает про Telegram API и хранилище — получает карточки подписчиков и
// возвращает { text, keyboard }, чтобы это можно было проверять отдельно.
import { mskDayKey } from './dailyReport.js'

const MSK = 'Europe/Moscow'
const DAY = 24 * 3600 * 1000

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

const BACK_ROW = [{ text: '⬅️ Меню', callback_data: 'a:menu' }]

// Главное меню — блоки; внутри каждого блока свои кнопки и «⬅️ Меню».
export const MENU_KEYBOARD = [
  [
    { text: '⚖️ Кадры', callback_data: 'a:sec:kadry' },
    { text: '👥 Сообщество', callback_data: 'a:sec:community' },
  ],
  [
    { text: '🎟 Мероприятия', callback_data: 'a:sec:events' },
    { text: '💰 Финансы', callback_data: 'a:sec:finance' },
  ],
]

export const FINANCE_KEYBOARD = [
  [
    { text: '📊 Сегодня', callback_data: 'a:rep:today' },
    { text: 'Вчера', callback_data: 'a:rep:yesterday' },
  ],
  [
    { text: '7 дней', callback_data: 'a:rep:week' },
    { text: 'Месяц', callback_data: 'a:rep:month' },
  ],
  BACK_ROW,
]

export const COMMUNITY_KEYBOARD = [
  [
    { text: '👥 Подписчики', callback_data: 'a:subs' },
    { text: '⏭ Списания', callback_data: 'a:due' },
  ],
  [
    { text: '🔕 Отписались', callback_data: 'a:cancelled' },
    { text: '🔔 Напоминания', callback_data: 'a:rem' },
  ],
  [{ text: '🔌 Состояние системы', callback_data: 'a:status' }],
  BACK_ROW,
]

export function menuScreen() {
  return { text: '🛠 Кабинет администратора\n\nВыберите раздел:', keyboard: MENU_KEYBOARD }
}

const SECTIONS = {
  finance: { text: '💰 Финансы\n\nОтчёты по оплатам подписки за период:', keyboard: FINANCE_KEYBOARD },
  community: { text: '👥 Сообщество\n\nПодписчики, списания, отписки и напоминания:', keyboard: COMMUNITY_KEYBOARD },
  kadry: { text: '⚖️ Кадры\n\nРаздел пока пустой — наполним следующим шагом.', keyboard: [BACK_ROW] },
  events: { text: '🎟 Мероприятия\n\nРаздел пока пустой — наполним следующим шагом.', keyboard: [BACK_ROW] },
}

/** Экран раздела главного меню (finance / community / kadry / events). */
export function sectionScreen(name) {
  return SECTIONS[name] ?? menuScreen()
}

// Сумма, по которой человек сидит в сообществе, — то, что списывается за один
// период (последний платёж; если истории нет — цена тарифа с сайта).
function planAmount(join, tariffs) {
  return lastAmount(join) || tariffs[join.tariffId]?.price || 0
}

// Известные суммы: стандартные тарифы и скидочные (по промокодам амбассадоров
// и рекламы). Остальные суммы показываются отдельной строкой «другая сумма».
const DISCOUNT_PLANS = [350, 500, 530]
const STANDARD_PLANS = [
  { amount: 690, label: '1 месяц' },
  { amount: 1770, label: '3 месяца' },
  { amount: 3180, label: '6 месяцев' },
]

const BACK_TO_COMMUNITY = [{ text: '⬅️ Назад', callback_data: 'a:sec:community' }, { text: '🏠 Меню', callback_data: 'a:menu' }]

/** Активные резиденты, разложенные по сумме списания: Map(сумма → карточки). */
function activeByAmount(joins, tariffs) {
  const byAmount = new Map()
  for (const j of joins.filter((x) => x.status === 'active')) {
    const amount = planAmount(j, tariffs)
    if (!byAmount.has(amount)) byAmount.set(amount, [])
    byAmount.get(amount).push(j)
  }
  return byAmount
}

const KNOWN_AMOUNTS = [...DISCOUNT_PLANS, ...STANDARD_PLANS.map((p) => p.amount)]

function planTitle(amount) {
  const standard = STANDARD_PLANS.find((p) => p.amount === amount)
  if (standard) return `${rub(amount)} · ${standard.label}`
  return DISCOUNT_PLANS.includes(amount) ? `${rub(amount)}/мес · со скидкой` : amount ? rub(amount) : 'сумма неизвестна'
}

/**
 * Резиденты по тарифам: количество по каждой сумме и кнопки, по которым
 * открывается подробный список людей (planScreen).
 */
export function subscribersScreen(joins, tariffs) {
  const byAmount = activeByAmount(joins, tariffs)
  const total = [...byAmount.values()].reduce((acc, list) => acc + list.length, 0)
  const count = (amount) => byAmount.get(amount)?.length ?? 0
  const otherCount = [...byAmount.entries()].filter(([amount]) => !KNOWN_AMOUNTS.includes(amount)).reduce((acc, [, list]) => acc + list.length, 0)

  const lines = [
    `👥 Резидентов сейчас: ${total}`,
    '',
    '🏷 Месяц со скидкой',
    ...DISCOUNT_PLANS.map((amount) => `• ${rub(amount)}/мес — ${count(amount)} чел.`),
    '',
    '💳 Обычные тарифы',
    ...STANDARD_PLANS.map(({ amount, label }) => `• ${rub(amount)} · ${label} — ${count(amount)} чел.`),
  ]
  if (otherCount) lines.push('', `❔ Другие суммы — ${otherCount} чел.`)
  lines.push('', 'Нажмите на тариф, чтобы увидеть людей:')

  const btn = (amount) => ({ text: `${rub(amount)} · ${count(amount)}`, callback_data: `a:plan:${amount}` })
  const keyboard = [DISCOUNT_PLANS.map(btn), STANDARD_PLANS.map((p) => btn(p.amount))]
  if (otherCount) keyboard.push([{ text: `Другие суммы · ${otherCount}`, callback_data: 'a:plan:other' }])
  keyboard.push(BACK_TO_COMMUNITY)
  return { text: lines.join('\n'), keyboard }
}

const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))

/**
 * Подробный список резидентов одного тарифа (key — сумма или "other"):
 * ФИО, ник в Telegram, телефон, почта, дата начала подписки. Дата рождения
 * показывается, только если она есть в карточке — на сайте её пока не спрашиваем.
 */
export function planScreen(joins, tariffs, key) {
  const byAmount = activeByAmount(joins, tariffs)
  const isOther = key === 'other'
  const amount = Number(key)
  const list = isOther
    ? [...byAmount.entries()].filter(([a]) => !KNOWN_AMOUNTS.includes(a)).flatMap(([, l]) => l)
    : byAmount.get(amount) ?? []
  const title = isOther ? 'Другие суммы' : planTitle(amount)
  const keyboard = [[{ text: '⬅️ К тарифам', callback_data: 'a:subs' }, { text: '🏠 Меню', callback_data: 'a:menu' }]]
  if (!list.length) return { text: `📋 ${title}\n\nНа этом тарифе сейчас никого нет.`, keyboard }

  const lines = [`📋 ${title} — ${list.length} чел.`]
  const sorted = [...list].sort((a, b) => (a.firstPaidAt ?? a.createdAt ?? 0) - (b.firstPaidAt ?? b.createdAt ?? 0))
  sorted.forEach((j, i) => {
    const started = j.firstPaidAt ?? j.createdAt
    const payments = (j.payments ?? []).filter((p) => !p.estimated).length
    lines.push(
      '',
      `${i + 1}. ${j.name && j.name !== '—' ? j.name : 'Имя не указано'}`,
      ...(j.birthDate ? [`   Дата рождения: ${j.birthDate}`] : []),
      `   Telegram: ${j.telegram || 'не указан'}`,
      `   Телефон: ${j.phone || 'не указан'}`,
      `   Почта: ${j.email || 'не указана'}`,
      `   Подписка с: ${started ? ruDate(started) : 'дата неизвестна'}${payments ? ` · оплат: ${payments}` : ''}`,
      ...(isOther ? [`   Сумма списания: ${planAmount(j, tariffs) ? rub(planAmount(j, tariffs)) : 'неизвестна'}`] : []),
      ...(j.nextPaymentAt ? [`   Следующее списание: ${ruDate(j.nextPaymentAt)}`] : []),
    )
  })
  return { text: lines.join('\n'), keyboard }
}

const ruTime = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
const ruDayTime = (ts) => `${ruDay(ts)} в ${ruTime(ts)}`

const DUE_KEYBOARD = [
  [
    { text: '📅 На 14 дней', callback_data: 'a:due14' },
    { text: '🔄 Обновить', callback_data: 'a:due' },
  ],
  ...COMMUNITY_KEYBOARD,
]

/** Списания: сегодня, завтра, послезавтра — с точным временем (МСК) или на 14 дней без времени. */
export function dueScreen(joins, now, tariffs = {}, horizonDays = 2) {
  const dayKeys = Array.from({ length: horizonDays + 1 }, (_, i) => mskDayKey(now + i * DAY))
  const due = joins
    .filter((j) => j.status === 'active' && j.nextPaymentAt && dayKeys.includes(mskDayKey(j.nextPaymentAt)))
    .sort((a, b) => a.nextPaymentAt - b.nextPaymentAt)

  const titles = ['Сегодня', 'Завтра', 'Послезавтра']
  const total = due.reduce((acc, j) => acc + planAmount(j, tariffs), 0)
  const lines = [horizonDays > 2 ? `⏭ Списания на ${horizonDays} дней: ${due.length} · ~${rub(total)}` : `⏭ Списания на 3 дня: ${due.length} · ~${rub(total)}`, '']
  dayKeys.forEach((key, i) => {
    const list = due.filter((j) => mskDayKey(j.nextPaymentAt) === key)
    const title = horizonDays > 2 ? ruDay(now + i * DAY) : `${titles[i]}, ${ruDay(now + i * DAY)}`
    if (!list.length) {
      if (horizonDays <= 2) lines.push(`${title} — списаний нет`, '')
      return
    }
    lines.push(`${title} — ${list.length} · ${rub(list.reduce((acc, j) => acc + planAmount(j, tariffs), 0))}`)
    for (const j of list) {
      const passed = j.nextPaymentAt < now
      const amount = planAmount(j, tariffs)
      lines.push(`• ${horizonDays > 2 ? '' : `${ruTime(j.nextPaymentAt)} — `}${who(j)} — ${amount ? rub(amount) : 'сумма неизвестна'}${passed ? ' ⚠️ время прошло, оплата не зафиксирована' : ''}`)
    }
    lines.push('')
  })
  if (!due.length && horizonDays > 2) lines.push('Списаний нет.')
  lines.push('Время — московское, как указано в Prodamus.')
  return { text: lines.join('\n'), keyboard: DUE_KEYBOARD }
}

/** Отписки: кто, когда (день и время) и на каком тарифе сидел. */
export function cancelledScreen(joins, tariffs = {}) {
  const list = joins.filter((j) => j.status === 'cancelled').sort((a, b) => (b.cancelledAt ?? 0) - (a.cancelledAt ?? 0))
  if (!list.length) return { text: '🔕 Отписавшихся нет.', keyboard: COMMUNITY_KEYBOARD }
  const lines = [`🔕 Отписались от сообщества: ${list.length}`, '']
  for (const j of list) {
    const amount = planAmount(j, tariffs)
    const plan = STANDARD_PLANS.find((p) => p.amount === amount)?.label ?? (DISCOUNT_PLANS.includes(amount) ? 'со скидкой' : tariffLabel(j, tariffs))
    lines.push(`• ${who(j)}`, `   ${j.cancelledAt ? ruDayTime(j.cancelledAt) : 'дата неизвестна'} · тариф: ${amount ? `${rub(amount)}, ` : ''}${plan}`)
  }
  lines.push('', 'Время — московское, момент, когда мы получили уведомление от Prodamus.')
  return { text: lines.join('\n'), keyboard: COMMUNITY_KEYBOARD }
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
      [{ text: '⬅️ Назад', callback_data: 'a:sec:community' }],
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
  return { text: lines.join('\n'), keyboard }
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
