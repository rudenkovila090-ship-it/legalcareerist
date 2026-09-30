// Раздел «Кадры → Соискатели» кабинета администратора: вакансии в работе
// (просмотры, отклики, источники по UTM) и заказы карьерной консультации.
// Только тексты и кнопки — данные приходят готовыми.
import { CONSULTATION_STATUSES } from './consultations.js'
import { mskDayKey } from './dailyReport.js'
import { INTEREST_KINDS, interestGroup } from './interests.js'
import { RESERVE_FIELDS } from './reserve.js'

const MSK = 'Europe/Moscow'
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))
const ruDateTime = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

const BACK_ROW = [
  { text: '⬅️ Соискатели', callback_data: 'a:sec:seekers' },
  { text: '🏠 Меню', callback_data: 'a:menu' },
]

export const SEEKERS_KEYBOARD = [
  [
    { text: '💼 Вакансии', callback_data: 'a:s:vacs' },
    { text: '📥 Последние отклики', callback_data: 'a:s:apps' },
  ],
  [
    { text: '🎯 Консультации', callback_data: 'a:s:cons' },
    { text: '📊 Итоги месяца', callback_data: 'a:s:month:cur' },
  ],
  [
    { text: '🗃 Кадровый резерв', callback_data: 'a:s:rlist' },
    { text: '➕ Записать интерес', callback_data: 'a:s:inew' },
  ],
  [{ text: '📇 Интересовались', callback_data: 'a:s:ilist' }],
  [{ text: '⬅️ Кадры', callback_data: 'a:sec:kadry' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
]

export function seekersSection() {
  return { text: '🎓 Соискатели\n\nВакансии в работе с откликами и источниками, а также заказы карьерной консультации.', keyboard: SEEKERS_KEYBOARD }
}

const FORMATS = { office: 'офис', remote: 'удалённо', hybrid: 'гибрид' }
const EMPLOYMENTS = { full: 'полная занятость', part: 'частичная занятость', project: 'проектная работа' }

function salaryLabel(v) {
  if (v.salaryFrom && v.salaryTo) return `${rub(v.salaryFrom)} – ${rub(v.salaryTo)}`
  if (v.salaryFrom) return `от ${rub(v.salaryFrom)}`
  if (v.salaryTo) return `до ${rub(v.salaryTo)}`
  return 'не указана'
}

/**
 * Вакансии для бота: каталог сайта + счётчики (просмотры/отклики/источники) +
 * вакансии, которых нет в каталоге, но по ним были отклики. key — номер
 * вакансии (если есть) или slug: то, что уходит в callback_data кнопок.
 */
export function buildVacancyViews(catalog, stats, applications, siteUrl) {
  const bySlug = new Map()
  for (const v of catalog) bySlug.set(v.slug, { ...v })
  for (const a of applications) {
    if (a.vacancySlug && !bySlug.has(a.vacancySlug)) bySlug.set(a.vacancySlug, { slug: a.vacancySlug, number: null, title: a.vacancyTitle || a.vacancySlug, status: 'unknown' })
  }
  return [...bySlug.values()].map((v) => {
    const st = stats[v.slug] ?? {}
    return {
      ...v,
      key: String(v.number ?? v.slug),
      url: `${siteUrl}/vacancies/${v.slug}`,
      views: st.views ?? 0,
      applications: st.applications ?? 0,
      sources: st.sources ?? {},
    }
  })
}

const vacTitle = (v) => `${v.number ? `№${v.number} · ` : ''}${v.title}`

export function vacanciesScreen(vacancies) {
  if (!vacancies.length) return { text: '💼 Вакансий пока нет.\n\nОни появятся здесь после публикации на сайте (список обновляется при каждом деплое).', keyboard: [BACK_ROW] }
  const open = vacancies.filter((v) => v.status !== 'closed')
  const closed = vacancies.filter((v) => v.status === 'closed')
  const ordered = [...open, ...closed]
  const lines = [`💼 Вакансии: в работе ${open.length}${closed.length ? `, закрыто ${closed.length}` : ''}`, '', ...ordered.map((v) => `• ${vacTitle(v)} — откликов: ${v.applications}, просмотров: ${v.views}${v.status === 'closed' ? ' (закрыта)' : ''}`), '', 'Нажмите на вакансию:']
  const keyboard = ordered.slice(0, 30).map((v) => [{ text: `${v.status === 'closed' ? '🔒 ' : ''}${vacTitle(v)} · ${v.applications} откл.`.slice(0, 60), callback_data: `a:s:vac:${v.key}` }])
  keyboard.push(BACK_ROW)
  return { text: lines.join('\n'), keyboard }
}

export function vacancyCard(v) {
  const sources = Object.entries(v.sources).sort((a, b) => b[1].applications - a[1].applications || b[1].views - a[1].views).slice(0, 8)
  const conversion = v.views ? `${Math.round((v.applications / v.views) * 1000) / 10}%` : '—'
  const lines = [
    `💼 ${vacTitle(v)}`,
    v.status === 'closed' ? '🔒 Вакансия закрыта' : v.status === 'unknown' ? '❔ Нет в каталоге сайта' : '🟢 В работе',
    v.technicalExample ? '⚙️ Технический пример (не реальное предложение)' : null,
    '',
    v.company ? `🏢 Компания: ${v.company}` : null,
    v.city ? `📍 ${v.city}${v.format ? `, ${FORMATS[v.format] ?? v.format}` : ''}${v.employment ? `, ${EMPLOYMENTS[v.employment] ?? v.employment}` : ''}` : null,
    `💵 Зарплата: ${salaryLabel(v)}`,
    v.publishedAt ? `📅 Опубликована: ${ruDate(v.publishedAt)}` : null,
    `🔗 ${v.url}`,
    '',
    `📥 Откликов: ${v.applications}`,
    `👁 Просмотров: ${v.views} · конверсия в отклик: ${conversion}`,
  ].filter((l) => l !== null)
  if (sources.length) {
    lines.push('', '📣 Источники (UTM):')
    for (const [name, s] of sources) lines.push(`• ${name} — просмотров ${s.views}, откликов ${s.applications}`)
  }
  const keyboard = [
    [{ text: `📥 Отклики (${v.applications})`, callback_data: `a:s:vapps:${v.key}` }],
    [{ text: '🔗 Открыть на сайте', url: v.url }],
    [{ text: '⬅️ К вакансиям', callback_data: 'a:s:vacs' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
  ]
  return { text: lines.join('\n'), keyboard }
}

function applicationLines(a, withVacancy) {
  const docs = a.documents?.length ? `📎 ${a.documents.join(', ')}` : null
  return [
    `№${a.number} · ${ruDateTime(a.createdAt)} · ${a.name || 'без имени'}`,
    withVacancy ? `   Вакансия: ${a.vacancyTitle || a.vacancySlug}` : null,
    `   ${[a.telegram, a.phone, a.email].filter(Boolean).join(' · ') || 'контакты не указаны'}`,
    `   Источник: ${a.source}`,
    docs ? `   ${docs}` : null,
  ].filter(Boolean)
}

export function vacancyApplicationsScreen(v, applications) {
  const keyboard = [[{ text: '⬅️ К вакансии', callback_data: `a:s:vac:${v.key}` }, { text: '🏠 Меню', callback_data: 'a:menu' }]]
  const list = applications.filter((a) => a.vacancySlug === v.slug).sort((a, b) => b.createdAt - a.createdAt)
  if (!list.length) return { text: `📥 ${vacTitle(v)}\n\nПодробных откликов пока нет${v.applications ? ` (счётчик показывает ${v.applications} — они пришли до запуска учёта откликов)` : ''}.`, keyboard }
  return { text: [`📥 Отклики на «${vacTitle(v)}» — ${list.length}`, '', ...list.flatMap((a) => [...applicationLines(a, false), ''])].join('\n'), keyboard }
}

export function recentApplicationsScreen(applications) {
  const keyboard = [BACK_ROW]
  const list = [...applications].sort((a, b) => b.createdAt - a.createdAt).slice(0, 15)
  if (!list.length) return { text: '📥 Откликов пока нет.', keyboard }
  return { text: [`📥 Последние отклики (${list.length} из ${applications.length})`, '', ...list.flatMap((a) => [...applicationLines(a, true), ''])].join('\n'), keyboard }
}

// ---- Карьерные консультации ----

const consTitle = (c) => `№${c.number} · ${c.name || 'без имени'}`

export function consultationsScreen(orders) {
  if (!orders.length) return { text: '🎯 Заказов карьерной консультации пока нет.', keyboard: [BACK_ROW] }
  const count = (status) => orders.filter((c) => c.status === status).length
  const sumOf = (status) => orders.filter((c) => c.status === status).reduce((acc, c) => acc + (Number(c.total) || 0), 0)
  const lines = [
    `🎯 Карьерные консультации: всего ${orders.length}`,
    '',
    ...Object.entries(CONSULTATION_STATUSES).map(([status, label]) => `${label} — ${count(status)}${status === 'done' || status === 'in_progress' ? ` · ${rub(sumOf(status))}` : ''}`),
  ]
  const open = orders.filter((c) => c.status === 'new' || c.status === 'in_progress').sort((a, b) => b.createdAt - a.createdAt)
  const recentDone = orders.filter((c) => c.status === 'done' || c.status === 'cancelled').sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
  const shown = [...open.slice(0, 20), ...recentDone]
  lines.push('', open.length ? 'Требуют внимания — нажмите, чтобы открыть:' : 'Активных заказов нет. Последние закрытые:')
  const keyboard = shown.map((c) => [{ text: `${CONSULTATION_STATUSES[c.status].split(' ')[0]} ${consTitle(c)} · ${c.kind === 'question' ? 'вопрос' : c.total != null ? rub(c.total) : 'заказ'}`.slice(0, 60), callback_data: `a:s:con:${c.number}` }])
  keyboard.push(BACK_ROW)
  return { text: lines.join('\n'), keyboard }
}

export function consultationCard(c) {
  const lines = [
    `🎯 Консультация ${consTitle(c)}`,
    `Статус: ${CONSULTATION_STATUSES[c.status]} (с ${ruDateTime(c.statusAt)})`,
    `📅 Заявка: ${ruDateTime(c.createdAt)}`,
    '',
    c.kind === 'question' ? '💬 Вопрос без выбора услуг:' : '🧾 Выбранные услуги:',
    ...c.services.map((s) => `• ${s}`),
    c.promo ? `🎟 Промокод: ${c.promo}` : null,
    c.total != null ? `💰 Итого: ${rub(c.total)}` : null,
    '',
    c.name ? `👤 ФИО: ${c.name}` : null,
    c.telegram ? `💬 Telegram: ${c.telegram}` : null,
    c.phone ? `📞 Телефон: ${c.phone}` : null,
    c.email ? `✉️ Почта: ${c.email}` : null,
    `📣 Источник: ${c.source}`,
  ].filter((l) => l !== null)
  const set = (status, text) => ({ text, callback_data: `a:s:cst:${c.number}:${status}` })
  const keyboard = []
  if (c.status === 'new') keyboard.push([set('in_progress', '🔄 Взять в работу')])
  if (c.status === 'new' || c.status === 'in_progress') keyboard.push([set('done', '✅ Выполнена'), set('cancelled', '❌ Отменена')])
  if (c.status === 'done' || c.status === 'cancelled') keyboard.push([set('new', '↩️ Вернуть в новые')])
  keyboard.push([{ text: '⬅️ К консультациям', callback_data: 'a:s:cons' }, { text: '🏠 Меню', callback_data: 'a:menu' }])
  return { text: lines.join('\n'), keyboard }
}

function monthKey(which, now) {
  const cur = mskDayKey(now).slice(0, 7)
  if (which !== 'prev') return cur
  const [y, m] = cur.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Итоги месяца по соискателям: отклики по вакансиям и источникам, консультации и их сумма. */
export function seekersMonthSummary(applications, orders, which, now = Date.now(), reserve = []) {
  const key = monthKey(which, now)
  const inMonth = (ts) => Boolean(ts) && mskDayKey(ts).slice(0, 7) === key
  const title = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${key}-15T12:00:00Z`)).replace(/\s*г\.$/, '')

  const apps = applications.filter((a) => inMonth(a.createdAt))
  const byVacancy = new Map()
  const bySource = new Map()
  for (const a of apps) {
    const name = a.vacancyTitle || a.vacancySlug
    byVacancy.set(name, (byVacancy.get(name) ?? 0) + 1)
    bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1)
  }
  const created = orders.filter((c) => inMonth(c.createdAt))
  const orderKind = created.filter((c) => c.kind !== 'question')
  const done = orders.filter((c) => c.status === 'done' && inMonth(c.statusAt))
  const revenue = done.reduce((acc, c) => acc + (Number(c.total) || 0), 0)

  const lines = [
    `📊 Соискатели — итоги: ${title}`,
    '',
    `📥 Откликов на вакансии: ${apps.length}`,
    ...[...byVacancy].sort((a, b) => b[1] - a[1]).map(([name, n]) => `   • ${name} — ${n}`),
  ]
  if (bySource.size) lines.push('', '📣 По источникам:', ...[...bySource].sort((a, b) => b[1] - a[1]).map(([name, n]) => `   • ${name} — ${n}`))
  lines.push('', `🗃 Новых кандидатов в кадровом резерве: ${reserve.filter((c) => inMonth(c.createdAt)).length} (всего в резерве: ${reserve.length})`)
  lines.push(
    '',
    `🎯 Заявок на консультации: ${created.length} (заказов услуг: ${orderKind.length}, вопросов: ${created.length - orderKind.length})`,
    `✅ Выполнено консультаций: ${done.length} на ${rub(revenue)}`,
    `⏳ Сейчас в работе или новых: ${orders.filter((c) => c.status === 'new' || c.status === 'in_progress').length}`,
  )
  return { text: lines.join('\n'), keyboard: [[{ text: 'Прошлый месяц', callback_data: 'a:s:month:prev' }, { text: 'Текущий', callback_data: 'a:s:month:cur' }], BACK_ROW] }
}

// ---- «Интересовались»: обращения в поддержку без заявки на сайте ----

const INTEREST_STATUS = { waiting: '⏳ Ждёт напоминания', done: '✅ Написали', closed: '🚫 Неактуально' }
const intTitle = (i) => `№${i.number} · ${i.name || 'без имени'}`

export const INTEREST_KIND_KEYBOARD = [
  [{ text: INTEREST_KINDS.consultation, callback_data: 'a:s:ikind:consultation' }],
  [{ text: INTEREST_KINDS.vacancy, callback_data: 'a:s:ikind:vacancy' }],
  BACK_ROW,
]

export function interestPrompt(kind) {
  const what = kind === 'community' ? 'вступление в сообщество' : INTEREST_KINDS[kind]
  return [
    `➕ Записать интерес: ${what}`,
    '',
    'Отправьте одним сообщением, каждая строка — отдельное поле:',
    '1. Имя или ФИО',
    '2. Telegram (например @ivan)',
    '3. Телефон',
    '4. Когда обращался — ДД.ММ или ДД.ММ.ГГГГ (или «-», если сегодня)',
    '5. Что спрашивал (можно несколькими строками)',
    '',
    'Ненужное поле — «-». Бот напомнит написать этому человеку через неделю после обращения. Отмена — /cancel.',
  ].join('\n')
}

const GROUP_BACK = {
  seekers: [{ text: '⬅️ Соискатели', callback_data: 'a:sec:seekers' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
  community: [{ text: '⬅️ Сообщество', callback_data: 'a:sec:community' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
}
const kindLabel = (i) => (i.kind === 'vacancy' ? 'вакансия' : i.kind === 'community' ? 'сообщество' : 'консультация')

/** group: 'seekers' (консультации и вакансии) или 'community' (вступление в сообщество). */
export function interestsScreen(all, group = 'seekers') {
  const list = all.filter((i) => interestGroup(i) === group)
  const waiting = list.filter((i) => i.status === 'waiting').sort((a, b) => a.remindAt - b.remindAt)
  const other = list.filter((i) => i.status !== 'waiting').sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 5)
  const add = group === 'community' ? 'a:s:ikind:community' : 'a:s:inew'
  const keyboard = [[{ text: '➕ Записать интерес', callback_data: add }]]
  const back = GROUP_BACK[group]
  const topic = group === 'community' ? 'вступлением в сообщество' : 'консультацией или вакансией'
  if (!list.length) return { text: `📇 Пока никого не записано.\n\nЕсли кто-то написал в поддержку и спросил про ${group === 'community' ? 'вступление в сообщество' : 'консультацию или вакансию'} — запишите, бот напомнит через неделю.`, keyboard: [...keyboard, back] }
  const lines = [`📇 Интересовались ${topic}: ждут напоминания ${waiting.length}, всего ${list.length}`, '']
  for (const i of [...waiting, ...other]) {
    lines.push(`${INTEREST_STATUS[i.status].split(' ')[0]} ${intTitle(i)} · ${kindLabel(i)} · обращался ${ruDate(i.contactedAt)}${i.status === 'waiting' ? ` · напомню ${ruDate(i.remindAt)}` : ''}`)
    keyboard.push([{ text: `${INTEREST_STATUS[i.status].split(' ')[0]} ${intTitle(i)}`.slice(0, 60), callback_data: `a:s:icard:${i.number}` }])
  }
  keyboard.push(back)
  return { text: lines.join('\n'), keyboard }
}

export function interestCard(i, { reminder = false } = {}) {
  const lines = [
    reminder ? `🔔 Напишите этому человеку · ${intTitle(i)}` : `📇 ${intTitle(i)}`,
    reminder ? 'Он ранее интересовался — возможно, что-то изменилось.' : `Статус: ${INTEREST_STATUS[i.status]}`,
    '',
    `Интерес: ${INTEREST_KINDS[i.kind]}`,
    `📅 Обращался: ${ruDate(i.contactedAt)}`,
    i.name ? `👤 ${i.name}` : null,
    i.telegram ? `💬 Telegram: ${i.telegram}` : null,
    i.phone ? `📞 Телефон: ${i.phone}` : null,
    i.email ? `✉️ Почта: ${i.email}` : null,
    i.note ? `❓ Запрос: ${i.note}` : null,
    i.remindCount ? `Напоминаний было: ${i.remindCount}` : null,
  ].filter((l) => l !== null)
  const keyboard = []
  if (i.status === 'waiting') {
    keyboard.push([{ text: '✅ Написал(а)', callback_data: `a:s:idone:${i.number}` }, { text: '⏰ Ещё через неделю', callback_data: `a:s:isnooze:${i.number}` }])
    keyboard.push([{ text: '🚫 Неактуально', callback_data: `a:s:iclose:${i.number}` }])
  } else {
    keyboard.push([{ text: '↩️ Вернуть в ожидание', callback_data: `a:s:isnooze:${i.number}` }])
  }
  keyboard.push([{ text: '⬅️ К списку', callback_data: `a:s:ilist:${interestGroup(i)}` }, { text: '🏠 Меню', callback_data: 'a:menu' }])
  return { text: lines.join('\n'), keyboard }
}

// ---- Кадровый резерв ----

const resTitle = (c) => `№${c.number} · ${c.name || 'без имени'}`

function reserveLine(c) {
  return `${resTitle(c)} · ${c.city || 'город?'} · ${c.university || 'вуз?'} · ${c.position || 'должность?'}${c.resumeUrl ? ' · 🔗 резюме' : ''}`
}

/** Список кандидатов резерва: последние сверху; кнопки — карточки. */
export function reserveListScreen(list) {
  const keyboard = [[{ text: '➕ Добавить кандидата', callback_data: 'a:s:rnew' }]]
  if (!list.length) return { text: '🗃 Кадровый резерв пока пуст.\n\nКандидаты появятся здесь сами после заявок на сайте, можно добавить вручную.', keyboard: [...keyboard, BACK_ROW] }
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt)
  const shown = sorted.slice(0, 40)
  const lines = [`🗃 Кадровый резерв: ${list.length} чел.`, '', ...shown.map(reserveLine), ...(sorted.length > shown.length ? [`…и ещё ${sorted.length - shown.length}`] : []), '', 'Нажмите на кандидата — откроется карточка:']
  for (const c of shown.slice(0, 30)) keyboard.push([{ text: `${resTitle(c)} · ${c.position || c.city || ''}`.slice(0, 60), callback_data: `a:s:rcard:${c.number}` }])
  keyboard.push(BACK_ROW)
  return { text: lines.join('\n'), keyboard }
}

export function reserveCard(c) {
  const lines = [
    `🗃 Кадровый резерв · ${resTitle(c)}`,
    '',
    `🏙 Город: ${c.city || 'не указан'}`,
    `🎓 Университет: ${c.university || 'не указан'}`,
    `💼 Должность: ${c.position || 'не указана'}`,
    c.telegram ? `💬 Telegram: ${c.telegram}` : null,
    c.phone ? `📞 Телефон: ${c.phone}` : null,
    c.email ? `✉️ Почта: ${c.email}` : null,
    `🔗 Резюме: ${c.resumeUrl || 'ссылка не прикреплена'}`,
    `📅 Заявка: ${ruDate(c.createdAt)}`,
    `📣 Источник: ${c.utm}`,
  ].filter((l) => l !== null)
  const edit = (field, text) => ({ text, callback_data: `a:s:redit:${c.number}:${field}` })
  const keyboard = [
    [edit('resumeUrl', c.resumeUrl ? '🔗 Изменить ссылку на резюме' : '🔗 Прикрепить ссылку на резюме')],
    [edit('city', '✏️ Город'), edit('university', '✏️ Университет')],
    [edit('position', '✏️ Должность'), edit('name', '✏️ ФИО')],
    [{ text: '🗑 Удалить', callback_data: `a:s:rdel:${c.number}` }],
    [{ text: '⬅️ К резерву', callback_data: 'a:s:rlist' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
  ]
  return { text: lines.join('\n'), keyboard }
}

export function reserveFieldPrompt(c, field) {
  const hint = field === 'resumeUrl' ? 'Отправьте ссылку на резюме (например, с Google Диска), начинающуюся с http.' : `Отправьте новое значение: ${RESERVE_FIELDS[field]}.`
  return { text: `✏️ ${resTitle(c)}\n\n${hint}\n«-» — очистить поле, /cancel — отмена.`, keyboard: [[{ text: '⬅️ К карточке', callback_data: `a:s:rcard:${c.number}` }]] }
}

export function reserveDeleteConfirm(c) {
  return { text: `🗑 Удалить кандидата ${resTitle(c)} из кадрового резерва?`, keyboard: [[{ text: '✅ Да, удалить', callback_data: `a:s:rdelok:${c.number}` }, { text: 'Отмена', callback_data: `a:s:rcard:${c.number}` }]] }
}

export const RESERVE_NEW_PROMPT = [
  '➕ Новый кандидат в кадровый резерв',
  '',
  'Отправьте одним сообщением, каждая строка — отдельное поле:',
  '1. ФИО',
  '2. Город',
  '3. Университет',
  '4. Должность',
  '5. Telegram',
  '6. Телефон',
  '7. Ссылка на резюме (Google Диск)',
  '',
  'Ненужное поле — «-». Отмена — /cancel.',
].join('\n')
