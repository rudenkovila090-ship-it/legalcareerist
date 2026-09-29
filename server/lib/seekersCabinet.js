// Раздел «Кадры → Соискатели» кабинета администратора: вакансии в работе
// (просмотры, отклики, источники по UTM) и заказы карьерной консультации.
// Только тексты и кнопки — данные приходят готовыми.
import { CONSULTATION_STATUSES } from './consultations.js'
import { mskDayKey } from './dailyReport.js'

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
export function seekersMonthSummary(applications, orders, which, now = Date.now()) {
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
  lines.push(
    '',
    `🎯 Заявок на консультации: ${created.length} (заказов услуг: ${orderKind.length}, вопросов: ${created.length - orderKind.length})`,
    `✅ Выполнено консультаций: ${done.length} на ${rub(revenue)}`,
    `⏳ Сейчас в работе или новых: ${orders.filter((c) => c.status === 'new' || c.status === 'in_progress').length}`,
  )
  return { text: lines.join('\n'), keyboard: [[{ text: 'Прошлый месяц', callback_data: 'a:s:month:prev' }, { text: 'Текущий', callback_data: 'a:s:month:cur' }], BACK_ROW] }
}
