// Данные личного кабинета на сайте: профиль юриста (практики и опыт, ожидания по роли, режим конфиденциальности),
// запросы на удаление данных. Профиль хранится на сервере в account-profile.json по логину; сейчас вошедший один —
// администратор проекта, но формат рассчитан на многих клиентов.
// Всё, что приходит из браузера, проходит через чистку: только известные коды, ограниченная длина, числа в пределах.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const PROFILE_FILE = path.join(DATA_DIR, 'account-profile.json')
const REQUESTS_FILE = path.join(DATA_DIR, 'account-requests.json')

export const PRACTICES = {
  corporate: 'Корпоративное право',
  mna: 'M&A',
  tax: 'Налоги',
  disputes: 'Споры и арбитраж',
  ip: 'Интеллектуальная собственность',
  compliance: 'Комплаенс',
  inhouse: 'In-house',
  labor: 'Трудовое право',
  realestate: 'Недвижимость',
  banking: 'Банки и финансы',
  criminal: 'Уголовное право',
  family: 'Семейное и наследственное',
  other: 'Другое',
}
export const LEVELS = { student: 'Студент', intern: 'Стажёр', junior: 'Младший юрист', middle: 'Юрист', senior: 'Старший юрист', lead: 'Руководитель направления', partner: 'Партнёр' }
export const WORK_FORMATS = ['office', 'hybrid', 'remote']
export const RELOCATION = ['no', 'maybe', 'yes']
export const OVERTIME = ['no', 'sometimes', 'yes']

// eslint-disable-next-line no-control-regex
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, max)
const list = (v, max, len) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, len)).filter(Boolean))].slice(0, max) : [])
const oneOf = (v, allowed, fallback = '') => (allowed.includes(v) ? v : fallback)
const money = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : null
}

const DEFAULTS = {
  practices: { main: '', related: [] },
  experience: { level: '', years: null, litigation: '', deals: '', projects: '', languages: [], foreignClients: false },
  expectations: { workFormat: [], city: '', relocation: '', salaryFrom: null, salaryTo: null, overtime: '' },
  privacy: { hidden: false, hideFrom: [] },
}

/** Чистка частей профиля. Возвращают нормализованную часть или бросают { code } при явной ошибке. */
const CLEAN = {
  practices(d) {
    const codes = Object.keys(PRACTICES)
    const main = oneOf(d?.main, codes)
    const related = Array.isArray(d?.related) ? [...new Set(d.related.filter((c) => codes.includes(c) && c !== main))] : []
    return { main, related }
  },
  experience(d) {
    const years = d?.years === '' || d?.years == null ? null : Math.round(Number(d.years))
    if (years != null && (!Number.isFinite(years) || years < 0 || years > 60)) throw { code: 'bad_years' }
    return {
      level: oneOf(d?.level, Object.keys(LEVELS)),
      years,
      litigation: text(d?.litigation, 600),
      deals: text(d?.deals, 600),
      projects: text(d?.projects, 600),
      languages: list(d?.languages, 10, 40),
      foreignClients: d?.foreignClients === true,
    }
  },
  expectations(d) {
    const salaryFrom = money(d?.salaryFrom)
    const salaryTo = money(d?.salaryTo)
    if (salaryFrom && salaryTo && salaryFrom > salaryTo) throw { code: 'bad_salary' }
    return {
      workFormat: [...new Set((Array.isArray(d?.workFormat) ? d.workFormat : []).filter((x) => WORK_FORMATS.includes(x)))],
      city: text(d?.city, 80),
      relocation: oneOf(d?.relocation, RELOCATION),
      salaryFrom,
      salaryTo,
      overtime: oneOf(d?.overtime, OVERTIME),
    }
  },
  privacy(d) {
    return { hidden: d?.hidden === true, hideFrom: list(d?.hideFrom, 30, 80) }
  },
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
}

/** Профиль со значениями по умолчанию для частей, которые ещё не заполняли. */
export function getProfile(login) {
  const saved = readJson(PROFILE_FILE, {})[login] ?? {}
  const out = { consentAt: saved.consentAt ?? null, updatedAt: saved.updatedAt ?? null }
  for (const part of Object.keys(DEFAULTS)) out[part] = { ...DEFAULTS[part], ...(saved[part] ?? {}) }
  return out
}

/**
 * Сохраняет присланные части профиля (остальные не трогает). Возвращает { profile } или { error }.
 * consentGiven — отмечены ли обязательные галочки: при первом сохранении без согласия профиль не пишется.
 */
export function saveProfile(login, body, consentGiven, now = Date.now()) {
  const parts = Object.keys(CLEAN).filter((p) => body && typeof body[p] === 'object' && body[p] !== null)
  if (!parts.length) return { error: 'nothing_to_save' }
  const data = readJson(PROFILE_FILE, {})
  const saved = data[login] ?? {}
  if (!saved.consentAt && !consentGiven) return { error: 'consent_required' }
  const cleaned = {}
  try {
    for (const p of parts) cleaned[p] = CLEAN[p](body[p])
  } catch (err) {
    if (err?.code) return { error: err.code }
    throw err
  }
  data[login] = { ...saved, ...cleaned, consentAt: saved.consentAt ?? now, updatedAt: now }
  writeJson(PROFILE_FILE, data)
  return { profile: getProfile(login), firstConsent: !saved.consentAt }
}

/** Запрос на удаление данных: хранится, чтобы не потерять, и уходит админу в бота. */
export function addRequest(login, kind, now = Date.now()) {
  const list = readJson(REQUESTS_FILE, [])
  const request = { id: `${now}-${Math.random().toString(36).slice(2, 6)}`, login, kind, at: now, status: 'new' }
  list.push(request)
  writeJson(REQUESTS_FILE, list)
  return request
}

export function lastRequest(login, kind) {
  return [...readJson(REQUESTS_FILE, [])].reverse().find((r) => r.login === login && r.kind === kind) ?? null
}
