// Данные раздела «Построение карьеры» личного кабинета. Три хранилища (всё ключом — логин кабинета):
//  • data/career-data.json — рабочая область: карьерный план, достижения, профессиональный капитал, медиакит, отметки «разобрал» в
//    подготовке к интервью. Это личные записи человека: хранятся, пока есть аккаунт, стираются вместе с ним и попадают в «Мои данные»;
//  • data/podcast-guests.json — заявка на участие в подкасте (контакты и темы): одна на человека, срок TERMS.podcastGuest с последнего
//    изменения;
//  • data/recommendation-requests.json — запросы рекомендации от «Карьерного юриста» (для приложения к отклику): срок
//    TERMS.recommendation с последнего изменения.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const file = (name) => path.join(DATA_DIR, name)
export const PODCAST_TTL_MS = 365 * 24 * 3600 * 1000
export const RECOMMENDATION_TTL_MS = 365 * 24 * 3600 * 1000

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'))
  } catch {
    return fallback
  }
}

function save(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${file(name)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  fs.renameSync(tmp, file(name))
}

const WORKSPACE = 'career-data.json'
const PODCAST = 'podcast-guests.json'
const RECOMMENDATIONS = 'recommendation-requests.json'

export const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
/** Многострочный текст: переносы сохраняются, лишние пробелы и пустые строки убираются. */
export const clipText = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n)
const newId = () => crypto.randomBytes(5).toString('hex')

// ---- Рабочая область ----

export const MAX_ACHIEVEMENTS = 100
export const MAX_PLAN_STEPS = 60
export const MAX_DONE_MARKS = 1000
export const ACHIEVEMENT_CATEGORIES = { award: 'Награда', publication: 'Публикация', speech: 'Выступление', project: 'Проект', education: 'Образование', event: 'Участие в мероприятии', other: 'Другое' }

const emptyWorkspace = () => ({ plan: null, achievements: [], capital: {}, mediakit: {}, interviewDone: [] })
const loadWorkspaces = () => load(WORKSPACE, {})

export function getWorkspace(login) {
  return { ...emptyWorkspace(), ...(loadWorkspaces()[login] ?? {}) }
}

function mutate(login, fn) {
  const all = loadWorkspaces()
  const ws = { ...emptyWorkspace(), ...(all[login] ?? {}) }
  const result = fn(ws)
  ws.updatedAt = Date.now()
  all[login] = ws
  save(WORKSPACE, all)
  return result
}

/** Сохраняет план целиком (его собирает careerCabinet из справочника шагов). */
export const savePlan = (login, plan) => mutate(login, (ws) => { ws.plan = plan; return ws.plan })

export function setStepDone(login, stepId, done, now = Date.now()) {
  return mutate(login, (ws) => {
    const step = ws.plan?.steps.find((s) => s.id === stepId)
    if (!step) return null
    step.done = Boolean(done)
    step.doneAt = step.done ? now : null
    return ws.plan
  })
}

export function addCustomStep(login, title) {
  return mutate(login, (ws) => {
    const text = clip(title, 140)
    if (!ws.plan || !text) return { error: 'bad_request' }
    if (ws.plan.steps.length >= MAX_PLAN_STEPS) return { error: 'too_many' }
    const step = { id: `c-${newId()}`, title: text, group: 'own', custom: true, done: false, doneAt: null }
    ws.plan.steps.push(step)
    return { plan: ws.plan, step }
  })
}

export function removeStep(login, stepId) {
  return mutate(login, (ws) => {
    const step = ws.plan?.steps.find((s) => s.id === stepId)
    if (!step || !step.custom) return null
    ws.plan.steps = ws.plan.steps.filter((s) => s.id !== stepId)
    return ws.plan
  })
}

export const deletePlan = (login) => mutate(login, (ws) => { ws.plan = null })

/** Достижение: { title, category, year, description, link } уже проверены careerCabinet. */
export function addAchievement(login, fields, now = Date.now()) {
  return mutate(login, (ws) => {
    if (ws.achievements.length >= MAX_ACHIEVEMENTS) return { error: 'too_many' }
    const item = { id: newId(), ...fields, createdAt: now }
    ws.achievements = [item, ...ws.achievements]
    return { item }
  })
}

export function updateAchievement(login, id, fields) {
  return mutate(login, (ws) => {
    const at = ws.achievements.findIndex((a) => a.id === id)
    if (at < 0) return null
    ws.achievements[at] = { ...ws.achievements[at], ...fields }
    return ws.achievements[at]
  })
}

export function deleteAchievement(login, id) {
  return mutate(login, (ws) => {
    const before = ws.achievements.length
    ws.achievements = ws.achievements.filter((a) => a.id !== id)
    return ws.achievements.length < before
  })
}

export const saveCapital = (login, values) => mutate(login, (ws) => { ws.capital = { values, updatedAt: Date.now() }; return ws.capital })
export const saveMediakit = (login, fields) => mutate(login, (ws) => { ws.mediakit = { ...fields, updatedAt: Date.now() }; return ws.mediakit })

export function setInterviewDone(login, questionId, done) {
  return mutate(login, (ws) => {
    const set = new Set(ws.interviewDone)
    if (done) {
      if (set.size >= MAX_DONE_MARKS) return ws.interviewDone
      set.add(questionId)
    } else set.delete(questionId)
    ws.interviewDone = [...set]
    return ws.interviewDone
  })
}

export const exportWorkspace = (login) => {
  const ws = loadWorkspaces()[login]
  return ws ?? null
}

export function eraseWorkspace(login) {
  const all = loadWorkspaces()
  if (!all[login]) return 0
  delete all[login]
  save(WORKSPACE, all)
  return 1
}

// ---- Заявка на участие в подкасте ----

export const getPodcast = (login) => load(PODCAST, {})[login] ?? null

export function savePodcast(login, fields, now = Date.now()) {
  const all = load(PODCAST, {})
  const prev = all[login]
  all[login] = { ...fields, status: prev?.status ?? 'new', createdAt: prev?.createdAt ?? now, updatedAt: now }
  save(PODCAST, all)
  return { record: all[login], created: !prev }
}

export function deletePodcast(login) {
  const all = load(PODCAST, {})
  if (!all[login]) return false
  delete all[login]
  save(PODCAST, all)
  return true
}

export const erasePodcast = (login) => (deletePodcast(login) ? 1 : 0)
export const exportPodcast = (login) => getPodcast(login)

export function countOldPodcast(now = Date.now()) {
  return Object.values(load(PODCAST, {})).filter((r) => (r.updatedAt ?? r.createdAt ?? 0) <= now - PODCAST_TTL_MS).length
}

export function prunePodcast(now = Date.now()) {
  const all = load(PODCAST, {})
  const old = Object.keys(all).filter((l) => (all[l].updatedAt ?? all[l].createdAt ?? 0) <= now - PODCAST_TTL_MS)
  for (const l of old) delete all[l]
  if (old.length) save(PODCAST, all)
  return old.length
}

// ---- Запросы рекомендации ----

export const RECOMMENDATION_STATUSES = { new: 'Получен', work: 'В работе', ready: 'Готово', declined: 'Отклонён' }
const MAX_ACTIVE_REQUESTS = 3
const MAX_REQUESTS = 20
const MAX_ADMIN_IDS = 20

const loadRecs = () => {
  const data = load(RECOMMENDATIONS, { seq: 0, items: {} })
  return { seq: data.seq ?? 0, items: data.items ?? {} }
}

export const listRecommendations = (login) => (loadRecs().items[login] ?? []).slice().sort((a, b) => b.createdAt - a.createdAt)

export function createRecommendation(login, fields, now = Date.now()) {
  const data = loadRecs()
  const mine = data.items[login] ?? []
  if (mine.filter((r) => r.status === 'new' || r.status === 'work').length >= MAX_ACTIVE_REQUESTS) return { error: 'too_many_active' }
  if (mine.length >= MAX_REQUESTS) return { error: 'too_many' }
  data.seq += 1
  const item = { id: newId(), number: data.seq, ...fields, status: 'new', result: '', createdAt: now, updatedAt: now, adminMsgIds: [] }
  data.items[login] = [...mine, item]
  save(RECOMMENDATIONS, data)
  return { item }
}

function findByNumber(data, number) {
  for (const [login, list] of Object.entries(data.items)) {
    const item = list.find((r) => r.number === Number(number))
    if (item) return { login, item }
  }
  return null
}

export function getRecommendation(number) {
  const hit = findByNumber(loadRecs(), number)
  return hit ? { login: hit.login, ...hit.item } : null
}

/** Отмена самим человеком: только пока запрос никто не взял в работу. */
export function cancelRecommendation(login, id) {
  const data = loadRecs()
  const mine = data.items[login] ?? []
  const item = mine.find((r) => r.id === id)
  if (!item) return { error: 'not_found' }
  if (item.status !== 'new') return { error: 'closed' }
  data.items[login] = mine.filter((r) => r.id !== id)
  if (!data.items[login].length) delete data.items[login]
  save(RECOMMENDATIONS, data)
  return { ok: true, item }
}

/** Статус меняет админ в боте. Возвращает { login, item } после изменения или null. */
export function setRecommendationStatus(number, status, now = Date.now()) {
  if (!RECOMMENDATION_STATUSES[status]) return null
  const data = loadRecs()
  const hit = findByNumber(data, number)
  if (!hit) return null
  hit.item.status = status
  hit.item.updatedAt = now
  save(RECOMMENDATIONS, data)
  return hit
}

/** Готовая рекомендация (ответ админа в боте): записывается текст и статус «Готово». */
export function setRecommendationResult(number, text, now = Date.now()) {
  const body = clipText(text, 4000)
  if (!body) return { error: 'empty' }
  const data = loadRecs()
  const hit = findByNumber(data, number)
  if (!hit) return { error: 'not_found' }
  hit.item.result = body
  hit.item.status = 'ready'
  hit.item.updatedAt = now
  hit.item.readyAt = now
  save(RECOMMENDATIONS, data)
  return hit
}

export function linkRecommendationMessage(number, tgMessageId) {
  if (!tgMessageId) return
  const data = loadRecs()
  const hit = findByNumber(data, number)
  if (!hit) return
  hit.item.adminMsgIds = [...(hit.item.adminMsgIds ?? []), Number(tgMessageId)].slice(-MAX_ADMIN_IDS)
  save(RECOMMENDATIONS, data)
}

/** Запрос по номеру сообщения в чате админа (ответ Reply на него приносит текст рекомендации). */
export function recommendationByAdminMessage(tgMessageId) {
  const id = Number(tgMessageId)
  if (!id) return null
  for (const [login, list] of Object.entries(loadRecs().items)) {
    const item = list.find((r) => (r.adminMsgIds ?? []).includes(id))
    if (item) return { login, ...item }
  }
  return null
}

export const exportRecommendations = (login) => (loadRecs().items[login] ?? []).map(({ adminMsgIds: _ids, ...r }) => r)

export function eraseRecommendations(login) {
  const data = loadRecs()
  const n = (data.items[login] ?? []).length
  if (n) {
    delete data.items[login]
    save(RECOMMENDATIONS, data)
  }
  return n
}

const expiredRecs = (data, now) => Object.entries(data.items).flatMap(([login, list]) => list.filter((r) => (r.updatedAt ?? r.createdAt) <= now - RECOMMENDATION_TTL_MS).map((r) => [login, r.id]))
export const countOldRecommendations = (now = Date.now()) => expiredRecs(loadRecs(), now).length

export function pruneRecommendations(now = Date.now()) {
  const data = loadRecs()
  const old = expiredRecs(data, now)
  for (const [login, id] of old) {
    data.items[login] = data.items[login].filter((r) => r.id !== id)
    if (!data.items[login].length) delete data.items[login]
  }
  if (old.length) save(RECOMMENDATIONS, data)
  return old.length
}

/** Стирает всё, что раздел хранит о человеке (аккаунт удаляется или человек просит стереть данные). */
export const eraseCareerAll = (login) => eraseWorkspace(login) + erasePodcast(login) + eraseRecommendations(login)
