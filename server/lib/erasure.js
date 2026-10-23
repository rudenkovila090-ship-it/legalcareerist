// Удаление данных человека по его запросу (ст. 14, 21 152-ФЗ): админ вводит в боте телефон, e-mail, ник или Telegram id,
// бот показывает, что найдено, и после подтверждения удаляет записи во всех хранилищах реестра (personData.js).
// Записи с платёжными сведениями не удаляются, а обезличиваются: ФИО и контакты стираются, сумма и дата остаются —
// закон требует хранить их дольше. Журнал согласий и журнал платежей Prodamus обезличиваются так же.
import fs from 'node:fs'
import path from 'node:path'
import { createJsonStore, normalizePhone } from './jsonStore.js'
import { SOURCES, recordsOf, anonymizeRecord } from './personData.js'
import { personKeys, countConsentEntries, pseudonymizeConsent } from './consentLog.js'
import { accountConfig, revokeAdminSessions, revokeFor } from './accountAuth.js'
import { listAccounts, contextOf, deleteAccount } from './accountUsers.js'
import { accountKeys } from './accountData.js'
import { eraseProfile, getProfile } from './accountStore.js'
import { listDocuments, eraseAccountFiles } from './accountDocs.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const reviewsStore = createJsonStore('material-reviews.json')

/** Разбирает введённое админом: телефон, e-mail, @ник или Telegram id → набор ключей. Пустой набор — не разобрали. */
export function parseQuery(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return new Set()
  if (raw.includes('@') && /\S+@\S+\.\S+/.test(raw)) return personKeys({ email: raw })
  const digitsOnly = raw.replace(/[\s+\-()]/g, '')
  if (/^\d+$/.test(digitsOnly)) {
    const keys = new Set()
    if (digitsOnly.length >= 10) for (const k of personKeys({ phone: digitsOnly.length === 10 ? `7${digitsOnly}` : digitsOnly })) keys.add(k)
    if (digitsOnly.length <= 10 && digitsOnly.length >= 5) for (const k of personKeys({ tgId: digitsOnly })) keys.add(k)
    return keys
  }
  return personKeys({ telegram: raw })
}

const intersects = (own, keys) => [...own].some((k) => keys.has(k))

// Личный кабинет на сайте хранит данные по логину, а не по контактам: считаем их данными человека, если логин или его
// контакты (Telegram id, ник, телефон, почта из настроек и из карточки бота) совпали с запросом.
const ACCOUNT_KEY = 'a:login'
function accountOf(query, keys) {
  const cfg = accountConfig()
  if (!cfg) return null
  const asked = String(query ?? '').trim().toLowerCase().replace(/^@/, '')
  if (!keys.has(ACCOUNT_KEY) && asked !== cfg.login.toLowerCase() && !intersects(accountKeys(cfg), keys)) return null
  const docs = listDocuments(cfg.login)
  return { login: cfg.login, hasProfile: Boolean(getProfile(cfg.login).updatedAt), docs: docs.length, files: docs.reduce((n, d) => n + d.versions.length, 0) }
}

// Аккаунты резидентов (вход по почте, lib/accountUsers.js): считаются данными человека, если их почта или Telegram совпали с запросом.
function customersOf(keys) {
  return listAccounts()
    .filter((a) => intersects(accountKeys(contextOf(a)), keys))
    .map((a) => {
      const login = `u:${a.id}`
      const docs = listDocuments(login)
      return { id: a.id, login, email: a.email, hasProfile: Boolean(getProfile(login).updatedAt), docs: docs.length, files: docs.reduce((n, d) => n + d.versions.length, 0) }
    })
}

/** Короткая подпись записи для подтверждения: имя с инициалом фамилии и последние цифры телефона — чтобы админ узнал человека. */
function label(rec) {
  const name = String(rec.name || [rec.firstName, rec.lastName].filter(Boolean).join(' ') || '').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  const short = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || 'без имени'
  const phone = normalizePhone(rec.phone)
  return phone ? `${short}, ···${phone.slice(-4)}` : short
}

function bodyKeys(body) {
  const keys = new Set()
  const walk = (v, k = '') => {
    if (v && typeof v === 'object') return Object.entries(v).forEach(([kk, vv]) => walk(vv, kk))
    if (typeof v !== 'string' && typeof v !== 'number') return
    const s = String(v)
    if (/phone/i.test(k)) for (const x of personKeys({ phone: s })) keys.add(x)
    else if (/email/i.test(k)) for (const x of personKeys({ email: s })) keys.add(x)
    else if (/tg_user_id|telegram_id/i.test(k)) for (const x of personKeys({ tgId: s })) keys.add(x)
    else if (/customer_extra/i.test(k)) for (const m of s.matchAll(/@([\w]{3,})/g)) for (const x of personKeys({ telegram: m[1] })) keys.add(x)
  }
  walk(body)
  return keys
}

const PII_KEY = /phone|email|extra|name|fio|customer|telegram|username|tg_user|vk|address/i
function redact(v, k = '') {
  if (v && typeof v === 'object') return Array.isArray(v) ? v.map((x) => redact(x, k)) : Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, redact(vv, kk)]))
  return PII_KEY.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v) !== '' ? '[удалено]' : v
}

function readJsonl(file) {
  try {
    return fs.readFileSync(path.join(DATA_DIR, file), 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function webhookLines(keys) {
  return readJsonl('prodamus-webhooks.jsonl').map((line) => {
    try {
      const entry = JSON.parse(line)
      return { line, entry, match: intersects(bodyKeys(entry.body), keys) }
    } catch {
      return { line, entry: null, match: false }
    }
  })
}

/** Ищет человека по запросу и возвращает план удаления, ничего не меняя. */
export function findPerson(query) {
  const initial = parseQuery(query)
  if (!initial.size) return { error: 'unparsed' }

  const collect = (keys) => {
    const out = []
    for (const source of SOURCES) {
      for (const rec of recordsOf(source)) {
        if (intersects(source.keysOf(rec), keys)) out.push({ source, rec })
      }
    }
    return out
  }

  // Шаг 1: по введённому. Шаг 2: по остальным идентификаторам найденных записей (тот же человек под ником/телефоном/Telegram id).
  const first = collect(initial)
  const keys = new Set(initial)
  for (const { source, rec } of first) for (const k of source.keysOf(rec)) keys.add(k)
  const found = collect(keys)

  const purchaseTokens = new Set(found.filter((f) => f.source.id === 'purchases').map((f) => f.rec.token))
  const reviews = reviewsStore.all().filter((r) => purchaseTokens.has(r.purchaseToken))
  const hooks = webhookLines(keys).filter((w) => w.match)

  const extraKeys = keys.size - initial.size
  const account = accountOf(query, keys)
  if (account) keys.add(ACCOUNT_KEY)
  const customers = customersOf(keys)
  const matches = found.map(({ source, rec }) => ({
    source: source.id,
    title: source.title,
    token: rec.token,
    action: source.hasMoney(rec) ? 'anonymize' : 'delete',
    label: label(rec),
  }))
  const logs = {
    consent: countConsentEntries(keys),
    webhooks: hooks.length,
    reviews: reviews.length,
  }
  const empty = !matches.length && !logs.consent && !logs.webhooks && !logs.reviews && !(account && (account.hasProfile || account.docs)) && !customers.length
  return { keys: [...keys], extraKeys, matches, logs, account, customers, empty }
}

/** Текст подтверждения для админа. */
export function describeFound(res) {
  const lines = ['🗑 Удаление данных человека', '']
  const bySource = new Map()
  for (const m of res.matches) {
    const e = bySource.get(m.source) ?? { title: m.title, items: [] }
    e.items.push(m)
    bySource.set(m.source, e)
  }
  for (const e of bySource.values()) {
    lines.push(`• ${e.title}:`)
    for (const m of e.items) lines.push(`   ${m.action === 'delete' ? 'удалить' : 'обезличить'} — ${m.label}`)
  }
  if (res.account && (res.account.hasProfile || res.account.docs)) {
    lines.push(`• Личный кабинет на сайте (${res.account.login}): удалить профиль${res.account.docs ? `, документов ${res.account.docs} (файлов ${res.account.files})` : ''}, закрыть вход`)
  }
  for (const c of res.customers ?? []) lines.push(`• Личный кабинет резидента (${c.email}): удалить аккаунт${c.hasProfile ? ', профиль' : ''}${c.docs ? `, документов ${c.docs} (файлов ${c.files})` : ''}`)
  if (res.logs.reviews) lines.push(`• Отзывы о материалах: удалить ${res.logs.reviews}`)
  if (res.logs.consent) lines.push(`• Журнал согласий: заменить имя и контакты отпечатками (${res.logs.consent})`)
  if (res.logs.webhooks) lines.push(`• Журнал платежей Prodamus: стереть имя и контакты (${res.logs.webhooks})`)
  lines.push('')
  lines.push('«Обезличить» — стереть ФИО и контакты, оставив сумму и дату платежа: их закон требует хранить дольше. Удаление безвозвратно.')
  lines.push('Уведомления в Telegram-чате админа и резервные копии бот удалить не может — их чистите вы.')
  return lines.join('\n')
}

/** Выполняет удаление по ключам, найденным findPerson. Данные перечитываются заново, так что результат всегда актуален. */
export function erasePerson(keyList) {
  const keys = new Set(keyList)
  const done = { deleted: 0, anonymized: 0, reviews: 0, consent: 0, webhooks: 0, leadSources: 0, notices: 0, cabinet: 0, cabinetFiles: 0 }
  const names = new Set()

  const purchaseTokens = []
  for (const source of SOURCES) {
    for (const rec of recordsOf(source)) {
      if (!intersects(source.keysOf(rec), keys)) continue
      if (rec.name) names.add(String(rec.name).trim().toLowerCase())
      if (source.id === 'purchases') purchaseTokens.push(rec.token)
      if (source.hasMoney(rec)) {
        if (!rec.anonymizedAt) anonymizeRecord(source, rec.token)
        done.anonymized += 1
      } else {
        source.store.remove(rec.token)
        done.deleted += 1
      }
    }
  }

  for (const r of reviewsStore.all()) {
    if (purchaseTokens.includes(r.purchaseToken)) {
      reviewsStore.remove(r.token)
      done.reviews += 1
    }
  }

  // Личный кабинет: профиль, документы с файлами, запросы; сессии закрываются, чтобы вошедший не пересоздал данные со старого входа.
  const cfg = accountConfig()
  if (cfg && (keys.has(ACCOUNT_KEY) || intersects(accountKeys(cfg), keys))) {
    done.cabinetFiles = eraseAccountFiles(cfg.login)
    done.cabinet = eraseProfile(cfg.login) ? 1 : 0
    revokeAdminSessions()
  }

  for (const c of customersOf(keys)) {
    done.cabinetFiles = (done.cabinetFiles ?? 0) + eraseAccountFiles(c.login)
    done.cabinet = (done.cabinet ?? 0) + (eraseProfile(c.login) ? 1 : 0)
    revokeFor(c.login)
    done.accounts = (done.accounts ?? 0) + (deleteAccount(c.id) ? 1 : 0)
  }

  done.consent = pseudonymizeConsent(keys)

  // Журнал платежей Prodamus: имя и контакты в совпавших строках стираем, остальное (сумма, номер заказа, дата) остаётся.
  const hooks = webhookLines(keys)
  if (hooks.some((w) => w.match)) {
    const out = hooks.map((w) => {
      if (!w.match) return w.line
      done.webhooks += 1
      return JSON.stringify({ ...w.entry, body: redact(w.entry.body), erasedAt: Date.now() })
    })
    fs.writeFileSync(path.join(DATA_DIR, 'prodamus-webhooks.jsonl'), out.join('\n') + '\n')
  }

  // Журнал «Откуда узнали» хранит только имя (без контактов): убираем строки с именами удалённых записей.
  const leadLines = readJsonl('lead-sources.jsonl')
  if (leadLines.length && names.size) {
    const kept = leadLines.filter((l) => {
      try {
        return !names.has(String(JSON.parse(l).name ?? '').trim().toLowerCase())
      } catch {
        return true
      }
    })
    if (kept.length !== leadLines.length) {
      done.leadSources = leadLines.length - kept.length
      fs.writeFileSync(path.join(DATA_DIR, 'lead-sources.jsonl'), kept.join('\n') + (kept.length ? '\n' : ''))
    }
  }

  // Отложенные уведомления «не завершили оплату» (содержат текст с контактами).
  try {
    const file = path.join(DATA_DIR, 'pending-notices.json')
    const list = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (Array.isArray(list)) {
      const kept = list.filter((n) => !intersects(personKeys({ phone: n.phone, email: n.email, telegram: n.telegram }), keys))
      if (kept.length !== list.length) {
        done.notices = list.length - kept.length
        fs.writeFileSync(file, JSON.stringify(kept))
      }
    }
  } catch {
    // файла нет — нечего чистить
  }
  return done
}

export function erasedText(done) {
  const lines = ['✅ Данные удалены', '', `Записей удалено: ${done.deleted}`, `Записей обезличено: ${done.anonymized}`]
  if (done.reviews) lines.push(`Отзывов удалено: ${done.reviews}`)
  if (done.cabinet || done.cabinetFiles) lines.push(`Личный кабинет: профиль удалён, файлов документов удалено ${done.cabinetFiles}, вход закрыт`)
  if (done.accounts) lines.push(`Аккаунты резидентов удалены: ${done.accounts}`)
  if (done.consent) lines.push(`Записей журнала согласий обезличено: ${done.consent}`)
  if (done.webhooks) lines.push(`Строк журнала платежей очищено: ${done.webhooks}`)
  if (done.leadSources) lines.push(`Строк журнала «Откуда узнали» удалено: ${done.leadSources}`)
  if (done.notices) lines.push(`Отложенных уведомлений удалено: ${done.notices}`)
  lines.push('', 'Не забудьте: сообщения с данными этого человека в вашем Telegram-чате и старые резервные копии остаются у вас — удалите их вручную, и сообщите человеку, что данные удалены.')
  return lines.join('\n')
}
