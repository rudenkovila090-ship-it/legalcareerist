// Реестр хранилищ с персональными данными: по нему работают и автоудаление по срокам (retention.js),
// и удаление данных человека по его запросу (erasure.js). Новое хранилище с ПД добавляется сюда —
// иначе его данные не попадут ни под сроки, ни под удаление.
//
// Поля записи реестра:
//   id, title    — идентификатор и название для отчёта админу
//   store        — файловое хранилище (createJsonStore)
//   keysOf(rec)  — «ключи человека» записи (телефон, почта, ник, Telegram id), см. personKeys
//   personal     — поля, которые стираются при обезличивании (платёжные сведения остаются)
//   hasMoney(rec)— есть ли в записи сведения об оплате, которые по закону хранятся дольше (обезличиваем, а не удаляем)
//   due(rec,ctx) — по срокам хранения: null или { action: 'delete' | 'anonymize', reason }
import fs from 'node:fs'
import path from 'node:path'
import { createJsonStore } from './jsonStore.js'
import { personKeys } from './consentLog.js'

export const DAY = 24 * 3600 * 1000
export const YEAR = 365 * DAY
const DATA_DIR = path.join(import.meta.dirname, '..', 'data')

/** Сроки хранения (см. раздел 6 Политики): меняются здесь в одном месте. */
export const TERMS = {
  abandonedPayment: 30 * DAY, // неоплаченная заявка на подписку/материал
  botInactive: 3 * YEAR, // карточка пользователя бота без активности
  subscriptionAfterEnd: 3 * YEAR, // подписка: данные подписчика после окончания (срок исковой давности)
  purchaseAfter: 3 * YEAR, // покупка материала
  freeMaterial: 1 * YEAR, // бесплатный материал: почта и имя, без платежей — с последней выдачи
  eventContactsAfter: 1 * YEAR, // контакты участника после мероприятия
  eventRequest: 2 * YEAR, // заявка партнёра/организатора без договора
  dealLost: 2 * YEAR, // отказ по сделке
  dealAfterClose: 3 * YEAR, // закрытая сделка
  interest: 1 * YEAR, // «интересовавшиеся»
  reserve: 1 * YEAR, // кадровый резерв
  application: 1 * YEAR, // отклик на вакансию
  consultationNoOrder: 2 * YEAR, // вопрос/заявка без заказа
  consultationAfterDone: 3 * YEAR, // выполненный заказ
  account: 5 * YEAR, // аккаунт резидента в кабинете на сайте: с последнего входа (смены пароля или создания)
  accountUnverified: 30 * DAY, // регистрация в кабинете, где почту так и не подтвердили (пароль не задан): с создания или последнего письма
  activity: 1 * YEAR, // журнал действий в кабинете
  support: 1 * YEAR, // переписка в чате поддержки кабинета: с последнего сообщения
  payments: 5 * YEAR, // сведения об оплатах (бухгалтерский учёт)
  leadSources: 1 * YEAR, // журнал «Откуда узнали»
  audit: 1 * YEAR, // журнал действий админа
  consentLog: 5 * YEAR, // журнал согласий — доказательство, пока хранятся связанные данные
  webhooks: 5 * YEAR, // журнал платёжных уведомлений Prodamus
  pendingNotices: 1 * DAY, // отложенные уведомления «не завершили оплату»
}

const lastOf = (...values) => Math.max(0, ...values.map((v) => Number(v) || 0))

function anonymizeRec(rec, fields) {
  const out = { ...rec }
  for (const f of fields) {
    if (!(f in out)) continue
    if (Array.isArray(out[f])) out[f] = []
    else if (typeof out[f] === 'string') out[f] = ''
    else if (out[f] !== null && typeof out[f] === 'object') out[f] = {}
    else out[f] = null
  }
  out.anonymizedAt = Date.now()
  return out
}

function readEventCatalog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'event-catalog.json'), 'utf8'))
  } catch {
    return []
  }
}

/** Момент окончания мероприятия: по каталогу сайта (начало + сутки на случай многодневного), иначе — дата заявки. */
function eventEnd(rec, catalog) {
  const ev = catalog.find((e) => e.slug === rec.eventSlug)
  const start = ev?.dateTime ? Date.parse(ev.dateTime) : NaN
  return Number.isFinite(start) ? start + DAY : rec.createdAt
}

/** Когда оканчивается подписка и сколько хранить: Infinity — бессрочный резидент, срока нет. */
export function joinBaseline(j) {
  if (j.lifetime && !j.endsAt) return Infinity
  return lastOf(j.endsAt, j.nextPaymentAt, j.lastPaidAt, j.cancelledAt, j.createdAt)
}

const hasPayments = (j) => Array.isArray(j.payments) && j.payments.some((p) => Number(p.amount) > 0 || p.estimated)

/** Две ступени: через `contactsAfter` обезличиваем (если есть платёжные сведения) или удаляем; через `payments` после платежа — удаляем совсем. */
function twoStage(rec, now, { contactsFrom, contactsAfter, moneyFrom, money, label }) {
  if (money && now > moneyFrom + TERMS.payments) return { action: 'delete', reason: `${label}: платёжные сведения старше 5 лет` }
  if (now > contactsFrom + contactsAfter && !rec.anonymizedAt) {
    return money ? { action: 'anonymize', reason: `${label}: срок хранения контактов истёк, платёжные сведения остаются` } : { action: 'delete', reason: `${label}: срок хранения истёк` }
  }
  return null
}

const baseKeys = (r) => personKeys({ phone: r.phone, email: r.email, telegram: r.telegram, tgId: r.tgUserId })

export const SOURCES = [
  {
    id: 'botUsers',
    title: 'Пользователи бота',
    store: createJsonStore('bot-users.json'),
    keysOf: (u) => personKeys({ phone: u.phone, email: u.email, telegram: u.username, tgId: u.id }),
    personal: ['firstName', 'lastName', 'username', 'phone', 'email', 'contactName'],
    hasMoney: () => false,
    due: (u, ctx) => {
      const resident = ctx.joinBaselineByTg.get(String(u.id)) ?? 0
      const last = lastOf(u.lastSeenAt, u.lastContactAt, u.createdAt, resident)
      return ctx.now > last + TERMS.botInactive ? { action: 'delete', reason: 'нет активности более 3 лет' } : null
    },
  },
  {
    id: 'joins',
    title: 'Подписчики сообщества',
    store: createJsonStore('pending-joins.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'tgUserId', 'cancelReasonText', 'howHeard', 'prodamusProfileId'],
    hasMoney: hasPayments,
    due: (j, ctx) => {
      if (!j.paid) return ctx.now > j.createdAt + TERMS.abandonedPayment ? { action: 'delete', reason: 'неоплаченная заявка старше 30 дней' } : null
      const base = joinBaseline(j)
      if (base === Infinity) return null
      const paidRef = lastOf(j.lastPaidAt, j.firstPaidAt, j.createdAt)
      return twoStage(j, ctx.now, { contactsFrom: base, contactsAfter: TERMS.subscriptionAfterEnd, moneyFrom: paidRef, money: hasPayments(j), label: 'подписка' })
    },
  },
  {
    id: 'purchases',
    title: 'Покупки материалов',
    store: createJsonStore('material-purchases.json'),
    keysOf: (p) => personKeys({ phone: p.phone, email: p.email, tgId: p.tgUserId }),
    personal: ['name', 'phone', 'email', 'tgUserId', 'howHeard'],
    hasMoney: (p) => Boolean(p.paid) && !p.free,
    due: (p, ctx) => {
      // Бесплатный материал: платёжных сведений нет, поэтому просто удаляем контакты, когда срок вышел.
      if (p.free) return ctx.now > lastOf(p.grantedAt, p.createdAt) + TERMS.freeMaterial ? { action: 'delete', reason: 'бесплатный материал: срок хранения истёк' } : null
      if (!p.paid) return ctx.now > p.createdAt + TERMS.abandonedPayment ? { action: 'delete', reason: 'неоплаченная заявка старше 30 дней' } : null
      const ref = p.paidAt ?? p.createdAt
      return twoStage(p, ctx.now, { contactsFrom: ref, contactsAfter: TERMS.purchaseAfter, moneyFrom: ref, money: true, label: 'покупка' })
    },
  },
  {
    id: 'tickets',
    title: 'Регистрации и билеты на мероприятия',
    store: createJsonStore('event-leads.json'),
    filter: (e) => e.kind !== 'request',
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'company', 'note', 'howHeard'],
    hasMoney: (e) => Boolean(e.paidAt) || Number(e.amount) > 0,
    due: (e, ctx) => {
      const end = eventEnd(e, ctx.eventCatalog)
      return twoStage(e, ctx.now, { contactsFrom: end, contactsAfter: TERMS.eventContactsAfter, moneyFrom: e.paidAt ?? end, money: Boolean(e.paidAt) || Number(e.amount) > 0, label: 'билет' })
    },
  },
  {
    id: 'eventRequests',
    title: 'Заявки партнёров и организаторов',
    store: createJsonStore('event-leads.json'),
    filter: (e) => e.kind === 'request',
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'company', 'note', 'howHeard'],
    hasMoney: (e) => Number(e.amount) > 0,
    due: (e, ctx) => (ctx.now > lastOf(e.statusAt, e.createdAt) + TERMS.eventRequest ? { action: 'delete', reason: 'заявка без движения более 2 лет' } : null),
  },
  {
    id: 'deals',
    title: 'Сделки с работодателями',
    store: createJsonStore('deals.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'howHeard', 'details'],
    hasMoney: (d) => Number(d.revenue) > 0,
    due: (d, ctx) => {
      if (d.status === 'active') return null
      const closed = d.closedAt ?? d.createdAt
      if (d.status === 'lost') return ctx.now > closed + TERMS.dealLost ? { action: 'delete', reason: 'отказ по сделке более 2 лет назад' } : null
      const money = Number(d.revenue) > 0
      return twoStage(d, ctx.now, { contactsFrom: closed, contactsAfter: TERMS.dealAfterClose, moneyFrom: d.revenueAt ?? closed, money, label: 'сделка' })
    },
  },
  {
    id: 'interests',
    title: 'Интересовавшиеся (записи админа)',
    store: createJsonStore('interests.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'note'],
    hasMoney: () => false,
    due: (i, ctx) => (ctx.now > lastOf(i.contactedAt, i.doneAt, i.createdAt) + TERMS.interest ? { action: 'delete', reason: 'обращение старше 1 года' } : null),
  },
  {
    id: 'reserve',
    title: 'Кадровый резерв',
    store: createJsonStore('reserve-candidates.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'city', 'university', 'position', 'resumeUrl', 'howHeard'],
    hasMoney: () => false,
    due: (c, ctx) => (ctx.now > lastOf(c.renewedAt, c.createdAt) + TERMS.reserve ? { action: 'delete', reason: 'в резерве более 1 года без подтверждения согласия' } : null),
  },
  {
    id: 'applications',
    title: 'Отклики на вакансии',
    store: createJsonStore('candidate-applications.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'documents', 'howHeard'],
    hasMoney: () => false,
    due: (a, ctx) => (ctx.now > a.createdAt + TERMS.application ? { action: 'delete', reason: 'отклику более 1 года' } : null),
  },
  {
    id: 'consultations',
    title: 'Карьерные консультации',
    store: createJsonStore('consultation-orders.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'email', 'telegram', 'services', 'howHeard'],
    hasMoney: (c) => c.kind === 'order' && Number(c.total) > 0 && c.status === 'done',
    due: (c, ctx) => {
      const ref = lastOf(c.statusAt, c.createdAt)
      const paidOrder = c.kind === 'order' && Number(c.total) > 0 && c.status === 'done'
      if (!paidOrder) return ctx.now > ref + TERMS.consultationNoOrder ? { action: 'delete', reason: 'заявка без заказа старше 2 лет' } : null
      return twoStage(c, ctx.now, { contactsFrom: ref, contactsAfter: TERMS.consultationAfterDone, moneyFrom: ref, money: true, label: 'консультация' })
    },
  },
  {
    id: 'ambassadors',
    title: 'Амбассадоры',
    store: createJsonStore('ambassadors.json'),
    keysOf: baseKeys,
    personal: ['name', 'phone', 'telegram', 'note'],
    hasMoney: () => false,
    due: () => null, // срок участия определяет админ; удаляется кнопкой в боте или по запросу
  },
]

/** Всё, что нужно правилам сроков: «сейчас», каталог мероприятий, сроки подписок по Telegram id. */
export function retentionContext(now = Date.now()) {
  const joinBaselineByTg = new Map()
  for (const j of createJsonStore('pending-joins.json').all()) {
    if (!j.tgUserId || !j.paid) continue
    const base = joinBaseline(j)
    const id = String(j.tgUserId)
    joinBaselineByTg.set(id, Math.max(joinBaselineByTg.get(id) ?? 0, base))
  }
  return { now, eventCatalog: readEventCatalog(), joinBaselineByTg }
}

/** Записи источника (с учётом filter). */
export function recordsOf(source) {
  const all = source.store.all()
  return source.filter ? all.filter(source.filter) : all
}

export const anonymizeRecord = (source, token) => source.store.update(token, (rec) => anonymizeRec(rec, source.personal))
