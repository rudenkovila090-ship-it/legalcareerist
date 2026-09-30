// Сделки кадрового агентства (рекрутинг для работодателей) — мини-CRM в боте.
// Сделка заводится из заявки с сайта (или вручную из бота), получает сквозной
// номер и проходит этапы воронки; по каждому этапу бот напоминает админу, что
// нужно сделать для перехода дальше. Хранится в data/deals.json.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('deals.json')
const DAY = 24 * 3600 * 1000

// remindDays — через сколько дней без движения бот напоминает про этап;
// на этапах 4–5 это раз в неделю — как раз срок еженедельного отчёта заказчику.
export const STAGES = [
  { id: 1, name: 'Формирование заказа', remindDays: 1, todo: 'Связаться с заказчиком, определить квалификацию лида (квалифицированный или нет) и отправить бриф.' },
  { id: 2, name: 'Согласование работ', remindDays: 2, todo: 'Отправить договор, счёт на оплату, сформированный заказ и вакансию; дождаться согласования и оплаты.' },
  { id: 3, name: 'План работ', remindDays: 2, todo: 'Представить заказчику план работ: как и где мы будем искать кандидатов.' },
  { id: 4, name: 'Поиск', remindDays: 7, todo: 'Идёт поиск. Раз в неделю отправлять заказчику отчёт о проделанной работе.' },
  { id: 5, name: 'Скрининг и интервью', remindDays: 7, todo: 'Скрининг и интервью кандидатов. Раз в неделю отправлять заказчику отчёт о проделанной работе.' },
  { id: 6, name: 'Передача кандидатов', remindDays: 2, todo: 'Передать работодателю отобранных кандидатов с резюме.' },
  { id: 7, name: 'Собеседование', remindDays: 3, todo: 'Работодатель проводит собеседования: узнать результаты и собрать обратную связь по кандидатам.' },
  { id: 8, name: 'Испытательный срок', remindDays: 30, todo: 'Испытательный срок — 30 дней. По его окончании зафиксировать выручку и закрыть сделку.' },
]

export const LAST_STAGE = STAGES.length

export function stageOf(id) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]
}

function nextReminder(stageId, from) {
  return from + stageOf(stageId).remindDays * DAY
}

export function listDeals() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getDeal(number) {
  return listDeals().find((d) => d.number === Number(number)) ?? null
}

function updateDeal(number, fn) {
  const deal = getDeal(number)
  return deal ? store.update(deal.token, fn) : null
}

/**
 * Новая сделка на этапе 1. Если такая же заявка (та же компания и контакт,
 * тот же запрос) пришла в последние 10 минут — вернёт существующую сделку
 * с duplicate: true, чтобы двойная отправка формы не плодила сделки.
 */
export function createDeal({ company, name, phone, email, telegram, request, details, source, expectedFee }) {
  const now = Date.now()
  const all = listDeals()
  const same = all.find(
    (d) => now - d.createdAt < 10 * 60 * 1000 && d.company === (company || '') && d.request === (request || '') && (d.phone === (phone || '') && d.email === (email || '')),
  )
  if (same) return { deal: same, duplicate: true }

  const number = all.reduce((max, d) => Math.max(max, d.number), 0) + 1
  const token = store.create({
    number,
    company: company || '',
    name: name || '',
    phone: phone || '',
    email: email || '',
    telegram: telegram || '',
    request: request || '',
    details: details ?? [],
    source: source || 'manual',
    expectedFee: expectedFee || null,
    status: 'active',
    stage: 1,
    qualified: null,
    stageEnteredAt: now,
    stageHistory: [{ stage: 1, at: now }],
    nextReminderAt: nextReminder(1, now),
    revenue: null,
    revenueAt: null,
  })
  return { deal: store.get(token) && { token, ...store.get(token) }, duplicate: false }
}

/** Перевод на соседний этап: delta = +1 / -1. С последнего этапа вперёд — сделка «завершена». */
export function moveDeal(number, delta) {
  return updateDeal(number, (d) => {
    if (d.status !== 'active') return d
    const now = Date.now()
    const stage = d.stage + delta
    if (stage < 1) return d
    if (stage > LAST_STAGE) return { ...d, status: 'done', closedAt: now, nextReminderAt: null }
    return { ...d, stage, stageEnteredAt: now, stageHistory: [...d.stageHistory, { stage, at: now }], nextReminderAt: nextReminder(stage, now) }
  })
}

/** Квалификация лида. «Не квалифицирован» сразу закрывает сделку как отказ. */
export function setQualified(number, qualified) {
  return updateDeal(number, (d) => {
    if (d.status !== 'active') return d
    if (!qualified) return { ...d, qualified: false, status: 'lost', lostReason: 'неквалифицированный лид', closedAt: Date.now(), nextReminderAt: null }
    return { ...d, qualified: true }
  })
}

export function closeDeal(number, status, reason) {
  return updateDeal(number, (d) => ({ ...d, status, closedAt: Date.now(), nextReminderAt: null, ...(reason ? { lostReason: reason } : {}) }))
}

// Оплаты по сделке: предоплата (PREPAY_PCT% от ожидаемой суммы) и остаток после испытательного срока.
// revenue/revenueAt хранят итог и момент последней оплаты — по ним считаются итоги месяца.
export const PREPAY_PCT = 75

export function prepayAmount(d) {
  return d.expectedFee ? Math.round((d.expectedFee * PREPAY_PCT) / 100) : null
}

/** Список оплат сделки; сделки, где выручка была указана одной суммой, дают одну оплату «total». */
export function dealPayments(d) {
  if (Array.isArray(d.payments) && d.payments.length) return d.payments
  return d.revenue != null ? [{ amount: d.revenue, at: d.revenueAt ?? d.createdAt, kind: 'total' }] : []
}

export const dealReceived = (d) => dealPayments(d).reduce((acc, p) => acc + p.amount, 0)

/** Добавляет оплату (kind: 'prepay' | 'final'). */
export function addDealPayment(number, amount, kind) {
  return updateDeal(number, (d) => {
    const now = Date.now()
    const payments = [...dealPayments(d), { amount, at: now, kind }]
    return { ...d, payments, revenue: payments.reduce((acc, p) => acc + p.amount, 0), revenueAt: now }
  })
}

/** Выручка по сделке, указанная вручную одной суммой (заменяет отдельные оплаты). */
export function setRevenue(number, amount) {
  return updateDeal(number, (d) => {
    const now = Date.now()
    return { ...d, payments: [{ amount, at: now, kind: 'total' }], revenue: amount, revenueAt: now }
  })
}

export function scheduleReminder(number, at) {
  return updateDeal(number, (d) => ({ ...d, nextReminderAt: at }))
}

export function reopenDeal(number) {
  return updateDeal(number, (d) => {
    const now = Date.now()
    return { ...d, status: 'active', closedAt: null, nextReminderAt: nextReminder(d.stage, now) }
  })
}

/** Активные сделки, по которым пора напомнить. */
export function dealsDueForReminder(now) {
  return listDeals().filter((d) => d.status === 'active' && d.nextReminderAt && d.nextReminderAt <= now)
}
