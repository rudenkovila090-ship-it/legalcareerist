// Что мы храним о человеке и его мероприятия — для разделов «Мои данные» и «Мероприятия» личного кабинета.
import fs from 'node:fs'
import path from 'node:path'
import { getBotUser } from './botUsers.js'
import { personKeys, consentEntriesFor } from './consentLog.js'
import { SOURCES, recordsOf } from './personData.js'
import { getProfile } from './accountStore.js'
import { listDocuments, DOC_TYPES } from './accountDocs.js'
import { listActivity } from './accountActivity.js'
import { getThread } from './supportChat.js'
import { exportThreads } from './recruiterChat.js'
import { listNotifications } from './accountNotifications.js'
import { ACHIEVEMENT_CATEGORIES, exportPodcast, exportRecommendations, exportWorkspace } from './careerData.js'
import { APPLICATION_STATUSES, statusOf } from './candidateApplications.js'
import { TERMS } from './personData.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')

/** «Ключи человека» вошедшего: Telegram id, ник, телефон и почта из карточки в боте и из настроек кабинета. */
export function accountKeys(cfg) {
  const bot = cfg.tgId ? getBotUser(cfg.tgId) : null
  return personKeys({
    tgId: cfg.tgId,
    telegram: bot?.username,
    phone: cfg.phone || bot?.phone,
    email: cfg.email || bot?.email,
  })
}

// Служебные поля, которые человеку незачем отдавать: внутренний токен записи и отметки напоминаний.
const INTERNAL = /^(token|remindedFor|expiryRemindedFor|expiryAlertedFor|reviewAskedAt|reviewThankedAt|prodamusProfileId)$/

function clean(rec) {
  return Object.fromEntries(Object.entries(rec).filter(([k, v]) => !INTERNAL.test(k) && v !== undefined && v !== null && v !== ''))
}

const SECTION_TITLES = Object.fromEntries(SOURCES.map((s) => [s.id, s.title]))

const iso = (ts) => (ts ? new Date(ts).toISOString() : undefined)

/** Раздел «Построение карьеры»: план, достижения, капитал, медиакит, заявка на подкаст, запросы рекомендации. */
function careerExport(login) {
  const ws = exportWorkspace(login)
  const podcast = exportPodcast(login)
  const recs = exportRecommendations(login)
  if (!ws && !podcast && !recs.length) return undefined
  return {
    plan: ws?.plan ? { ...ws.plan, createdAt: iso(ws.plan.createdAt), updatedAt: iso(ws.plan.updatedAt), steps: ws.plan.steps.map((s) => ({ title: s.title, done: s.done, doneAt: iso(s.doneAt) })) } : undefined,
    achievements: (ws?.achievements ?? []).map((a) => ({ title: a.title, category: ACHIEVEMENT_CATEGORIES[a.category] ?? a.category, year: a.year ?? undefined, description: a.description || undefined, link: a.link || undefined })),
    professionalCapital: ws?.capital?.values,
    mediakit: ws?.mediakit && Object.keys(ws.mediakit).length ? { ...ws.mediakit, updatedAt: iso(ws.mediakit.updatedAt) } : undefined,
    interviewQuestionsDone: ws?.interviewDone?.length || undefined,
    podcastApplication: podcast ? { ...podcast, createdAt: iso(podcast.createdAt), updatedAt: iso(podcast.updatedAt), consentAt: iso(podcast.consentAt) } : undefined,
    recommendationRequests: recs.map((r) => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt), readyAt: iso(r.readyAt) })),
  }
}

/** Полная выгрузка данных человека одним файлом: всё из хранилищ, журнал согласий и профиль кабинета. */
export function exportPersonData(cfg, now = Date.now()) {
  const keys = accountKeys(cfg)
  const records = {}
  for (const source of SOURCES) {
    const mine = recordsOf(source).filter((r) => [...source.keysOf(r)].some((k) => keys.has(k)))
    if (mine.length) records[SECTION_TITLES[source.id] ?? source.id] = mine.map(clean)
  }
  return {
    generatedAt: new Date(now).toISOString(),
    note: 'Все данные о вас, которые хранит сервис «Карьерный юрист» на сегодня. Платёжные сведения и журналы показаны в объёме, в котором мы их храним.',
    account: { login: cfg.login, email: cfg.email || null, name: cfg.name || null, phone: cfg.contactPhone || cfg.phone || null, telegramId: cfg.tgId || null, created: cfg.createdAt ? new Date(cfg.createdAt).toISOString() : null },
    activityLog: listActivity(cfg.login, 100, now).map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
    supportChat: getThread(cfg.login).messages.map((m) => ({ from: m.from === 'user' ? 'вы' : 'поддержка', text: m.text, at: new Date(m.at).toISOString() })),
    recruiterChats: exportThreads(cfg.login).map((t) => ({ vacancy: t.title, messages: t.messages.map((m) => ({ from: m.from === 'user' ? 'вы' : 'рекрутер', text: m.text, at: new Date(m.at).toISOString() })) })),
    notifications: listNotifications(cfg.login).map((n) => ({ title: n.title, text: n.text, at: new Date(n.at).toISOString(), read: Boolean(n.readAt) })),
    career: careerExport(cfg.login),
    cabinetProfile: getProfile(cfg.login),
    cabinetDocuments: {
      note: 'Сами файлы скачиваются в личном кабинете, в разделах «Профиль и CV» и «Сопроводительные и тестовые».',
      list: listDocuments(cfg.login).map((d) => ({
        title: d.title,
        type: DOC_TYPES[d.type] ?? d.type,
        note: d.note || undefined,
        target: d.target || undefined,
        main: d.primary || undefined,
        added: new Date(d.createdAt).toISOString(),
        versions: d.versions.map((v) => ({ n: v.n, file: v.filename, sizeBytes: v.size, uploaded: new Date(v.uploadedAt).toISOString() })),
      })),
    },
    ...records,
    consentLog: consentEntriesFor(keys).map((entry) => {
      const e = { ...entry }
      delete e.erasedAt
      delete e.ids
      return e
    }),
  }
}

const STATUS = { registered: 'Зарегистрирован', paid: 'Оплачен', attended: 'Был на мероприятии', cancelled: 'Отменено' }

function eventDate(slug) {
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'event-catalog.json'), 'utf8'))
    const ts = Date.parse(catalog.find((e) => e.slug === slug)?.dateTime)
    return Number.isFinite(ts) ? ts : null
  } catch {
    return null
  }
}

/** Регистрации человека на мероприятия (билеты), новые сверху. */
export function accountEvents(cfg) {
  const keys = accountKeys(cfg)
  const source = SOURCES.find((s) => s.id === 'tickets')
  return recordsOf(source)
    .filter((r) => [...source.keysOf(r)].some((k) => keys.has(k)))
    .map((r) => ({
      title: r.eventTitle || 'Мероприятие',
      slug: r.eventSlug || null,
      date: eventDate(r.eventSlug) ?? r.createdAt,
      tariff: r.tariff || '',
      status: STATUS[r.status] ?? 'Зарегистрирован',
      attended: r.status === 'attended',
      amount: Number(r.amount) > 0 ? Number(r.amount) : null,
    }))
    .sort((a, b) => b.date - a.date)
}

/** Отклики человека на вакансии (по подтверждённой почте и привязанному Telegram), новые сверху. */
export function accountApplications(cfg) {
  const keys = accountKeys(cfg)
  const source = SOURCES.find((s) => s.id === 'applications')
  return recordsOf(source)
    .filter((r) => [...source.keysOf(r)].some((k) => keys.has(k)))
    .map((r) => {
      const status = statusOf(r)
      return {
        number: r.number,
        vacancySlug: r.vacancySlug || '',
        vacancyTitle: r.vacancyTitle || r.vacancySlug || 'Вакансия',
        createdAt: r.createdAt,
        status,
        statusLabel: APPLICATION_STATUSES[status],
        statusAt: r.statusAt ?? r.createdAt,
        history: (r.history ?? [{ status: 'sent', at: r.createdAt }]).map((h) => ({ status: h.status, label: APPLICATION_STATUSES[h.status] ?? h.status, at: h.at })),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Запись человека в кадровом резерве (по подтверждённой почте и привязанному Telegram) в виде для кабинета или null. */
export function accountReserve(cfg) {
  const keys = accountKeys(cfg)
  const source = SOURCES.find((s) => s.id === 'reserve')
  const mine = recordsOf(source)
    .filter((r) => [...source.keysOf(r)].some((k) => keys.has(k)))
    .sort((a, b) => Math.max(b.renewedAt ?? 0, b.createdAt) - Math.max(a.renewedAt ?? 0, a.createdAt))[0]
  if (!mine) return null
  const since = Math.max(mine.renewedAt ?? 0, mine.createdAt)
  return { number: mine.number, name: mine.name, city: mine.city, university: mine.university, position: mine.position, joinedAt: mine.createdAt, renewedAt: mine.renewedAt ?? null, until: since + TERMS.reserve, fromSite: mine.source !== 'cabinet' }
}
