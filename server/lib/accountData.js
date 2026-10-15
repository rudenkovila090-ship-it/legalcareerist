// Что мы храним о человеке и его мероприятия — для разделов «Мои данные» и «Мероприятия» личного кабинета.
import fs from 'node:fs'
import path from 'node:path'
import { getBotUser } from './botUsers.js'
import { personKeys, consentEntriesFor } from './consentLog.js'
import { SOURCES, recordsOf } from './personData.js'
import { getProfile } from './accountStore.js'

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
    account: { login: cfg.login, telegramId: cfg.tgId || null },
    cabinetProfile: getProfile(cfg.login),
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
