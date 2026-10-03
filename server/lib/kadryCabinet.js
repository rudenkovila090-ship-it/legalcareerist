// Раздел «Кадры» кабинета администратора: сделки с работодателями. Только
// тексты и кнопки (как adminCabinet.js) — данные приходят готовыми.
import { STAGES, LAST_STAGE, stageOf, PREPAY_PCT, prepayAmount, dealPayments, dealReceived } from './deals.js'
import { mskDayKey } from './dailyReport.js'

const MSK = 'Europe/Moscow'
const DAY = 24 * 3600 * 1000

const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))
const monthOf = (ts) => mskDayKey(ts).slice(0, 7)

const BACK_ROW = [
  { text: '⬅️ Работодатели', callback_data: 'a:sec:employers' },
  { text: '🏠 Меню', callback_data: 'a:menu' },
]

export const KADRY_KEYBOARD = [
  [
    { text: '🗂 Активные сделки', callback_data: 'a:k:list' },
    { text: '📈 Воронка', callback_data: 'a:k:funnel' },
  ],
  [
    { text: '➕ Новая сделка', callback_data: 'a:k:new' },
    { text: '✅ Закрытые', callback_data: 'a:k:closed' },
  ],
  [
    { text: '💵 Итоги месяца', callback_data: 'a:k:month:cur' },
    { text: 'Прошлый месяц', callback_data: 'a:k:month:prev' },
  ],
  [{ text: '⬅️ Кадры', callback_data: 'a:sec:kadry' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
]

/** Верхний уровень раздела «Кадры»: работодатели (сделки) и соискатели. */
export function kadryTop() {
  return {
    text: '⚖️ Кадры\n\nВыберите направление:',
    keyboard: [
      [
        { text: '🏢 Работодатели', callback_data: 'a:sec:employers' },
        { text: '🎓 Соискатели', callback_data: 'a:sec:seekers' },
      ],
      [{ text: '⬅️ Меню', callback_data: 'a:menu' }],
    ],
  }
}

export function kadrySection() {
  return { text: '🏢 Работодатели — сделки\n\nЗаявки на рекрутинг с сайта становятся сделками с номером и проходят 8 этапов. Бот напоминает, что делать на каждом этапе.', keyboard: KADRY_KEYBOARD }
}

const PAYMENT_KINDS = { prepay: 'предоплата', final: 'остаток', total: 'выручка' }
const dealTitle = (d) => `№${d.number} · ${d.company || d.name || 'без названия'}`
const dealButton = (d) => ({ text: `${dealTitle(d)} · этап ${d.stage}`.slice(0, 60), callback_data: `a:k:deal:${d.number}` })

function statusLine(d) {
  if (d.status === 'done') return '✅ Завершена'
  if (d.status === 'lost') return `❌ Закрыта${d.lostReason ? ` (${d.lostReason})` : ''}`
  return '🟢 В работе'
}

/** Карточка сделки с кнопками действий. */
export function dealCard(d, now = Date.now()) {
  const stage = stageOf(d.stage)
  const days = Math.max(0, Math.floor((now - d.stageEnteredAt) / DAY))
  const qual = d.qualified === true ? 'квалифицирован' : d.qualified === false ? 'не квалифицирован' : 'ещё не определена'
  const lines = [
    `🗂 Сделка ${dealTitle(d)}`,
    statusLine(d),
    '',
    d.status === 'active' ? `Этап ${stage.id} из ${LAST_STAGE}: ${stage.name} (${days === 0 ? 'сегодня' : `${days} дн.`}, с ${ruDate(d.stageEnteredAt)})` : `Этап при закрытии: ${stage.id} — ${stage.name}`,
    `Квалификация лида: ${qual}`,
    '',
    d.request ? `🔍 Кого ищем: ${d.request}` : null,
    d.company ? `🏢 Компания: ${d.company}` : null,
    d.name ? `👤 ФИО: ${d.name}` : null,
    d.phone ? `📞 Телефон: ${d.phone}` : null,
    d.email ? `✉️ Почта: ${d.email}` : null,
    d.telegram ? `💬 Telegram: ${d.telegram}` : null,
    `📅 Заявка: ${ruDate(d.createdAt)}`,
    d.expectedFee ? `💵 Ожидаемая выручка: ${rub(d.expectedFee)} (предоплата ${PREPAY_PCT}% — ${rub(prepayAmount(d))}, остаток — ${rub(d.expectedFee - prepayAmount(d))})` : null,
    d.revenue != null ? `💰 Получено: ${rub(dealReceived(d))}${d.expectedFee && dealReceived(d) < d.expectedFee ? `, осталось ${rub(d.expectedFee - dealReceived(d))}` : ''}` : null,
    ...dealPayments(d).map((p) => `   • ${PAYMENT_KINDS[p.kind] ?? 'оплата'} ${rub(p.amount)} — ${ruDate(p.at)}`),
    ...(d.details ?? []).filter((x) => !/^(Кого ищем|Ищем|Итого)/i.test(x)).map((x) => `• ${x}`),
  ].filter((l) => l !== null)
  if (d.status === 'active') lines.push('', `📋 Что сделать: ${stage.todo}`)

  const keyboard = []
  // Оплаты: предоплата и остаток одной кнопкой, если известна ожидаемая сумма
  const received = dealReceived(d)
  const payRows = []
  if (d.expectedFee && !dealPayments(d).some((p) => p.kind === 'prepay' || p.kind === 'total')) payRows.push([{ text: `💰 Предоплата получена (${rub(prepayAmount(d))})`, callback_data: `a:k:pp:${d.number}` }])
  else if (d.expectedFee && received < d.expectedFee) payRows.push([{ text: `💰 Остаток получен (${rub(d.expectedFee - received)})`, callback_data: `a:k:pf:${d.number}` }])
  if (d.status === 'active') {
    if (d.stage === 1 && d.qualified === null) {
      keyboard.push([
        { text: '✅ Квалифицирован', callback_data: `a:k:q1:${d.number}` },
        { text: '🚫 Не квалифицирован', callback_data: `a:k:q0:${d.number}` },
      ])
    }
    const next = STAGES.find((s) => s.id === d.stage + 1)
    keyboard.push([{ text: next ? `➡️ Этап ${next.id}: ${next.name}` : '✅ Завершить сделку', callback_data: `a:k:adv:${d.number}` }])
    keyboard.push(...payRows)
    keyboard.push([{ text: '📨 Шаблон сообщения заказчику', callback_data: `a:k:tpl:${d.number}` }])
    const row = []
    if (d.stage > 1) row.push({ text: `⬅️ Вернуть на этап ${d.stage - 1}`, callback_data: `a:k:back:${d.number}` })
    row.push({ text: '✏️ Выручка вручную', callback_data: `a:k:rev:${d.number}` })
    keyboard.push(row)
    keyboard.push([{ text: '❌ Закрыть сделку', callback_data: `a:k:lost:${d.number}` }])
  } else {
    if (d.status === 'done' && d.revenue == null && d.expectedFee) keyboard.push([{ text: `✅ Принять ${rub(d.expectedFee)}`, callback_data: `a:k:revok:${d.number}` }])
    keyboard.push(...payRows)
    keyboard.push([{ text: '✏️ Указать выручку вручную', callback_data: `a:k:rev:${d.number}` }])
    keyboard.push([{ text: '↩️ Вернуть в работу', callback_data: `a:k:reopen:${d.number}` }])
  }
  keyboard.push([{ text: '⬅️ К сделкам', callback_data: 'a:k:list' }, { text: '🏠 Меню', callback_data: 'a:menu' }])
  return { text: lines.join('\n'), keyboard }
}

/** Активные сделки списком кнопок (по одной на строку). */
export function activeDealsScreen(deals) {
  const active = deals.filter((d) => d.status === 'active')
  if (!active.length) return { text: '🗂 Активных сделок нет.\n\nНовые заявки на рекрутинг с сайта появятся здесь сами; можно завести сделку вручную.', keyboard: [[{ text: '➕ Новая сделка', callback_data: 'a:k:new' }], BACK_ROW] }
  const shown = active.slice(0, 30)
  const keyboard = shown.map((d) => [dealButton(d)])
  keyboard.push(BACK_ROW)
  const lines = [`🗂 Активных сделок: ${active.length}`, '', ...shown.map((d) => `• ${dealTitle(d)} — ${stageOf(d.stage).name}`), '', 'Нажмите на сделку, чтобы открыть:']
  return { text: lines.join('\n'), keyboard }
}

/** Воронка: сколько сделок на каждом этапе. */
export function funnelScreen(deals) {
  const active = deals.filter((d) => d.status === 'active')
  const pipeline = active.reduce((acc, d) => acc + (Number(d.expectedFee) || 0), 0)
  const lines = [`📈 Воронка: в работе ${active.length}${pipeline ? ` · ожидаемая выручка ${rub(pipeline)}` : ''}`, '']
  const keyboard = []
  for (const s of STAGES) {
    const n = active.filter((d) => d.stage === s.id).length
    lines.push(`${s.id}. ${s.name} — ${n}`)
    if (n) keyboard.push([{ text: `${s.id}. ${s.name} · ${n}`, callback_data: `a:k:stage:${s.id}` }])
  }
  keyboard.push(BACK_ROW)
  return { text: lines.join('\n'), keyboard }
}

export function stageScreen(deals, stageId) {
  const list = deals.filter((d) => d.status === 'active' && d.stage === stageId)
  const stage = stageOf(stageId)
  const keyboard = list.map((d) => [dealButton(d)])
  keyboard.push([{ text: '⬅️ К воронке', callback_data: 'a:k:funnel' }, { text: '🏠 Меню', callback_data: 'a:menu' }])
  return { text: `📈 Этап ${stage.id}: ${stage.name} — ${list.length}\n\n${list.length ? list.map((d) => `• ${dealTitle(d)}${d.request ? ` — ${d.request}` : ''}`).join('\n') : 'Сделок на этом этапе нет.'}`, keyboard }
}

export function closedScreen(deals) {
  const closed = deals.filter((d) => d.status !== 'active').sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 25)
  if (!closed.length) return { text: '✅ Закрытых сделок пока нет.', keyboard: [BACK_ROW] }
  const keyboard = closed.map((d) => [{ text: `${d.status === 'done' ? '✅' : '❌'} ${dealTitle(d)}`.slice(0, 60), callback_data: `a:k:deal:${d.number}` }])
  keyboard.push(BACK_ROW)
  const lines = ['✅ Закрытые сделки (последние 25):', '', ...closed.map((d) => `${d.status === 'done' ? '✅' : '❌'} ${dealTitle(d)}${dealReceived(d) ? ` — ${rub(dealReceived(d))}` : ''}${d.status === 'lost' && d.lostReason ? ` (${d.lostReason})` : ''}`)]
  return { text: lines.join('\n'), keyboard }
}

/** Ключ месяца «ГГГГ-ММ» для «текущий» / «прошлый» по Москве. */
export function monthKeyFor(which, now) {
  const cur = monthOf(now)
  if (which !== 'prev') return cur
  const [y, m] = cur.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Итоги месяца по кадровому агентству: заявки, закрытые сделки, выручка. */
export function monthSummary(deals, monthKey) {
  const inMonth = (ts) => Boolean(ts) && monthOf(ts) === monthKey
  const title = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-15T12:00:00Z`)).replace(/\s*г\.$/, '')

  const created = deals.filter((d) => inMonth(d.createdAt))
  const qualified = created.filter((d) => d.qualified === true).length
  const unqualified = created.filter((d) => d.qualified === false).length
  const done = deals.filter((d) => d.status === 'done' && inMonth(d.closedAt))
  const lost = deals.filter((d) => d.status === 'lost' && inMonth(d.closedAt))
  const incomeIn = (d) => dealPayments(d).filter((p) => inMonth(p.at)).reduce((acc, p) => acc + p.amount, 0)
  const paid = deals.filter((d) => incomeIn(d) > 0)
  const revenue = paid.reduce((acc, d) => acc + incomeIn(d), 0)
  const active = deals.filter((d) => d.status === 'active')
  const pipeline = active.reduce((acc, d) => acc + (Number(d.expectedFee) || 0), 0)
  const awaiting = deals.filter((d) => d.status === 'done' && dealReceived(d) === 0)
  const unpaid = deals.filter((d) => d.status !== 'lost' && d.expectedFee && dealReceived(d) > 0 && dealReceived(d) < d.expectedFee)

  const lines = [
    `💵 Кадры — итоги: ${title}`,
    '',
    `💰 Выручка за месяц: ${rub(revenue)} (сделок с выручкой: ${paid.length})`,
    ...paid.map((d) => `   • ${dealTitle(d)} — ${rub(incomeIn(d))}`),
    '',
    `🆕 Новых заявок: ${created.length} (квалифицированных: ${qualified}, неквалифицированных: ${unqualified})`,
    `✅ Завершено сделок: ${done.length}`,
    `❌ Закрыто без результата: ${lost.length}`,
    '',
    `🟢 Сейчас в работе: ${active.length}${pipeline ? ` · ожидаемая выручка ${rub(pipeline)}` : ''}`,
  ]
  if (unpaid.length) lines.push('', `⏳ Ждём остаток по сделкам: ${unpaid.map((d) => `№${d.number} (${rub(d.expectedFee - dealReceived(d))})`).join(', ')}`)
  if (awaiting.length) lines.push('', `⚠️ Завершены, но выручка не указана: ${awaiting.map((d) => `№${d.number}`).join(', ')}`)
  return { text: lines.join('\n'), keyboard: [[{ text: 'Прошлый месяц', callback_data: 'a:k:month:prev' }, { text: 'Текущий', callback_data: 'a:k:month:cur' }], BACK_ROW] }
}

/** Напоминание по сделке — что нужно сделать на текущем этапе. */
export function dealReminder(d) {
  const stage = stageOf(d.stage)
  const next = STAGES.find((s) => s.id === d.stage + 1)
  const lines = [`🔔 Напоминание · сделка ${dealTitle(d)}`, `Этап ${stage.id} из ${LAST_STAGE}: ${stage.name}`, '']
  if (d.request) lines.push(`🔍 ${d.request}`)
  lines.push(`📋 Что сделать: ${stage.todo}`)
  if (d.stage === 1 && d.qualified === null) lines.push('', '❓ Лид ещё не квалифицирован — отметьте в карточке.')
  if (d.stage === LAST_STAGE) lines.push('', 'Если испытательный срок пройден — завершите сделку и укажите выручку.')
  const keyboard = [
    [{ text: next ? `➡️ Этап ${next.id}: ${next.name}` : '✅ Завершить сделку', callback_data: `a:k:adv:${d.number}` }],
    [{ text: '📂 Открыть сделку', callback_data: `a:k:deal:${d.number}` }],
  ]
  return { text: lines.join('\n'), keyboard }
}

export const NEW_DEAL_PROMPT = [
  '➕ Новая сделка',
  '',
  'Отправьте одним сообщением, каждая строка — отдельное поле:',
  '1. Компания',
  '2. ФИО',
  '3. Телефон',
  '4. Почта',
  '5. Telegram',
  '6. Кого ищем',
  '',
  'Ненужное поле оставьте пустой строкой или поставьте «-». Для отмены отправьте /cancel.',
].join('\n')

/** Шаблоны сообщений заказчику по этапам — готовый текст, который остаётся скопировать и отправить. */
export function dealTemplate(d) {
  const hello = `Здравствуйте${d.name ? `, ${d.name}` : ''}!`
  const position = d.request || 'сотрудника'
  const company = d.company ? ` («${d.company}»)` : ''
  const texts = {
    1: `${hello}\n\nСпасибо за заявку на подбор: ${position}${company}. Чтобы начать, пришлите, пожалуйста, ответы на короткий бриф:\n1. Задачи и зона ответственности сотрудника\n2. Требования к опыту и образованию\n3. Вилка зарплаты и формат работы (офис, гибрид, удалённо)\n4. График и условия (оформление, бонусы, ДМС)\n5. Сроки: когда сотрудник должен выйти\n6. Что важно, кроме опыта: качества и ценности команды\n\nЕсли удобнее, созвонимся — напишите, когда вам подходит.`,
    2: `${hello}\n\nПо подбору: ${position}${company} направляем на согласование:\n• договор на оказание услуг\n• счёт на оплату предоплаты\n• сформированный заказ и текст вакансии\n\nПосле подписания договора и оплаты предоплаты (${PREPAY_PCT}%) переходим к поиску. Если есть замечания по документам или тексту вакансии — напишите, поправим.`,
    3: `${hello}\n\nПредставляем план работ по подбору: ${position}${company}.\n1. Где ищем: каналы поиска и профильные сообщества\n2. Как отбираем: скрининг резюме и интервью\n3. Сроки: первые кандидаты — через ___ дней\n4. Отчётность: раз в неделю присылаем отчёт о проделанной работе\n\nЕсли что-то стоит скорректировать — напишите, учтём до старта.`,
    4: `${hello}\n\nЕженедельный отчёт по подбору: ${position}${company}.\n• Просмотрено резюме: ___\n• Связались с кандидатами: ___\n• Ответили и заинтересовались: ___\n• Прошли скрининг: ___\n• Планы на следующую неделю: ___\n\nЕсли по вакансии что-то изменилось — сообщите, скорректируем поиск.`,
    5: `${hello}\n\nЕженедельный отчёт: скрининг и интервью, ${position}${company}.\n• Проведено интервью: ___\n• Подходят по требованиям: ___\n• Ключевые наблюдения: ___\n• Готовим к передаче вам: ___\n\nПодробности по кандидатам направим вместе с резюме.`,
    6: `${hello}\n\nПередаём вам отобранных кандидатов на позицию ${position}${company}. В сообщении резюме и краткая рекомендация по каждому.\n\nПодскажите, пожалуйста, кого приглашаете на собеседование и когда вам удобно — мы согласуем время с кандидатами.`,
    7: `${hello}\n\nКак прошли собеседования по позиции ${position}${company}? Будем благодарны за обратную связь по каждому кандидату: что понравилось, что нет, кого выбираете. Если нужна ещё одна волна кандидатов — скажите.`,
    8: `${hello}\n\nСотрудник вышел на позицию ${position}${company} — поздравляем! Испытательный срок 30 дней. Если по ходу будут вопросы или потребуется помощь — пишите. По окончании срока пришлём акт и счёт на остаток (${100 - PREPAY_PCT}%).`,
  }
  return texts[d.stage] ?? texts[1]
}

export const TEMPLATE_INTRO = (d) => `📨 Шаблон для заказчика · сделка №${d.number}, этап ${d.stage}: ${stageOf(d.stage).name}\n\nСкопируйте следующее сообщение, дополните прочерки и отправьте:`
