// Личный кабинет на сайте (/cabinet): вход по логину и паролю, данные берём у сервера (server/lib/accountAuth.js).
// Токен сессии лежит в localStorage этого браузера; на сервере по нему находится сессия на 30 дней.
import { CONSENT_VERSION, MARKETING_CONSENT_VERSION, type ConsentChoice } from './consent'

const KEY = 'ky_cabinet_token'

export interface ResidentInfo {
  /** none — подписки нет; active — действует; ended — срок вышел; lifetime — бессрочная. */
  status: 'none' | 'active' | 'ended' | 'lifetime'
  tariff?: string
  until?: number | null
  since?: number | null
  autoRenew?: boolean
  cancelled?: boolean
  oneTime?: boolean
  daysLeft?: number | null
}

export interface CabinetUser {
  login: string
  name: string
  /** Почта аккаунта резидента (у администратора может быть пустой). */
  email?: string
  role: 'client'
  /** Есть ли карточка этого человека в Telegram-боте (по ней находится подписка). */
  telegramLinked: boolean
  /** Привязка Telegram к кабинету по коду из бота. */
  telegram: TelegramInfo
  resident: ResidentInfo
  /** Режим конфиденциальности: резюме скрыто от работодателей. */
  privacy: { hidden: boolean }
  consents: ConsentsInfo
}

export interface TelegramInfo {
  /** У кабинета есть Telegram id (у резидента — привязан по коду, у администратора задан в настройках сервера). */
  linked: boolean
  linkedAt: number | null
  /** Имя и @ник привязанного Telegram: чтобы видеть, кого привязали. */
  name?: string
  /** Привязку можно сделать и снять (аккаунт резидента). */
  canLink: boolean
}

export interface ConsentsInfo {
  /** Когда человек согласился на обработку данных в боте. */
  processingAt: number | null
  /** Когда согласился при первом сохранении профиля в кабинете. */
  profileAt: number | null
  /** Рекламные и информационные сообщения: да, нет или не отвечал (null). */
  marketing: boolean | null
  marketingAt: number | null
}

/** Резидент входит по почте; администратор — по логину из настроек сервера (у него логин без «u:»). */
export const isResidentAccount = (user: CabinetUser) => user.login.startsWith('u:')

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // хранилище недоступно (приватный режим) — вход будет жить до закрытия страницы
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // нечего очищать
  }
}

export type SignInResult = { ok: true } | { ok: false; error: 'bad_credentials' | 'too_many_attempts' | 'not_configured' | 'network' }

export async function signIn(login: string, password: string): Promise<SignInResult> {
  try {
    const res = await fetch('/api/account/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) })
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
    if (res.ok && data.token) {
      setToken(data.token)
      return { ok: true }
    }
    if (data.error === 'too_many_attempts' || data.error === 'not_configured') return { ok: false, error: data.error }
    return { ok: false, error: 'bad_credentials' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

// ---- Аккаунт резидента: регистрация по почте, пароль по ссылке из письма ----

export type AccountError = 'bad_email' | 'consent_required' | 'too_many_attempts' | 'mail_failed' | 'mail_unavailable' | 'network' | 'error'
export type PasswordError = 'password_short' | 'password_long' | 'password_weak'

async function postPublic<T extends object>(path: string, body: object): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? 'error' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Регистрация: на почту уходит письмо со ссылкой, где человек задаёт пароль. Ответ не зависит от того, есть ли уже такая почта. */
export async function registerAccount(input: { email: string; name: string; consent: ConsentChoice }): Promise<{ ok: true } | { ok: false; error: AccountError }> {
  const r = await postPublic('/api/account/register', { ...input, consentVersion: CONSENT_VERSION, marketingVersion: MARKETING_CONSENT_VERSION })
  return r.ok ? { ok: true } : { ok: false, error: r.error as AccountError }
}

/** «Забыли пароль»: если аккаунт есть, на почту уходит ссылка; ответ всегда одинаковый. */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: AccountError }> {
  const r = await postPublic('/api/account/forgot', { email })
  return r.ok ? { ok: true } : { ok: false, error: r.error as AccountError }
}

export interface ActivationInfo {
  /** activate — подтверждение почты и первый пароль; reset — новый пароль вместо забытого. */
  purpose: 'activate' | 'reset'
  email: string
}

/** Что за ссылка из письма. null — ссылка не действует (использована или истекла). */
export async function fetchActivation(token: string): Promise<{ state: 'ok'; info: ActivationInfo } | { state: 'invalid' } | { state: 'error' }> {
  try {
    const res = await fetch(`/api/account/activation?token=${encodeURIComponent(token)}`)
    if (res.status === 404) return { state: 'invalid' }
    if (!res.ok) return { state: 'error' }
    const data = (await res.json()) as ActivationInfo
    return { state: 'ok', info: { purpose: data.purpose, email: data.email } }
  } catch {
    return { state: 'error' }
  }
}

/** Пароль по ссылке из письма. При успехе кабинет сразу открывается: сервер выдаёт сессию. */
export async function activateAccount(token: string, password: string): Promise<{ ok: true } | { ok: false; error: PasswordError | 'bad_token' | 'too_many_attempts' | 'network' | 'error' }> {
  const r = await postPublic<{ token?: string }>('/api/account/activate', { token, password })
  if (r.ok && r.data.token) {
    setToken(r.data.token)
    return { ok: true }
  }
  return { ok: false, error: (r.ok ? 'error' : r.error) as PasswordError | 'bad_token' | 'too_many_attempts' | 'network' | 'error' }
}

export type MeResult = { state: 'authed'; user: CabinetUser } | { state: 'anonymous' } | { state: 'error' }

/** Кто вошёл. Нет токена или он просрочен — anonymous (токен при этом очищается). */
export async function fetchMe(): Promise<MeResult> {
  const token = getToken()
  if (!token) return { state: 'anonymous' }
  try {
    const res = await fetch('/api/account/me', { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      clearToken()
      return { state: 'anonymous' }
    }
    if (!res.ok) return { state: 'error' }
    return { state: 'authed', user: (await res.json()) as CabinetUser }
  } catch {
    return { state: 'error' }
  }
}

export async function signOut() {
  const token = getToken()
  clearToken()
  if (!token) return
  try {
    await fetch('/api/account/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  } catch {
    // токен на сервере всё равно истечёт сам
  }
}

// ---- Профиль и данные ----

export interface Profile {
  consentAt: number | null
  updatedAt: number | null
  practices: { main: string; related: string[] }
  experience: { level: string; years: number | null; litigation: string; deals: string; projects: string; languages: string[]; foreignClients: boolean }
  expectations: { workFormat: string[]; city: string; relocation: string; salaryFrom: number | null; salaryTo: number | null; overtime: string }
  privacy: { hidden: boolean; hideFrom: string[] }
}

export interface CabinetEvent {
  title: string
  slug: string | null
  date: number
  tariff: string
  status: string
  attended: boolean
  amount: number | null
}

export interface ProfileOptions {
  practices: Record<string, string>
  levels: Record<string, string>
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    // Для файлов (FormData) тип запроса ставит браузер сам, вместе с границей частей.
    const headers: Record<string, string> = { Authorization: `Bearer ${getToken()}` }
    if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(path, { ...init, headers })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (res.status === 401) clearToken()
    // 413 без тела — отказ веб-сервера (nginx) до приложения: файл больше его предела.
    const fallback = res.status === 401 ? 'unauthorized' : res.status === 413 ? 'file_too_large' : 'error'
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? fallback }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export const fetchProfile = () => api<{ profile: Profile }>('/api/account/profile')
export const fetchOptions = () => api<ProfileOptions>('/api/account/options')
export const fetchEvents = () => api<{ events: CabinetEvent[] }>('/api/account/events')

/** Сохранение частей профиля. consent — галочки (нужны только при первом сохранении). */
export const saveProfile = (parts: Partial<Pick<Profile, 'practices' | 'experience' | 'expectations' | 'privacy'>>, consent?: ConsentChoice) =>
  api<{ profile: Profile }>('/api/account/profile', { method: 'PUT', body: JSON.stringify({ ...parts, ...(consent ? { consent, consentVersion: CONSENT_VERSION, marketingVersion: MARKETING_CONSENT_VERSION } : {}) }) })

export const setMarketing = (marketing: boolean) => api<{ marketing: boolean; at: number; applied: boolean }>('/api/account/marketing', { method: 'POST', body: JSON.stringify({ marketing, consentVersion: CONSENT_VERSION, marketingVersion: MARKETING_CONSENT_VERSION }) })
export const requestDeletion = () => api<{ already?: boolean; at: number }>('/api/account/data-request', { method: 'POST', body: '{}' })

/** Привязка Telegram: код из бота (команда /link). */
export const linkTelegram = (code: string) => api<{ ok: true }>('/api/account/telegram/link', { method: 'POST', body: JSON.stringify({ code }) })
export const unlinkTelegram = () => api<{ ok: true }>('/api/account/telegram', { method: 'DELETE' })

/** Смена пароля вошедшим: нужен текущий. Остальные входы с других устройств закрываются. */
export const changePassword = (current: string, password: string) => api<{ ok: true }>('/api/account/password', { method: 'POST', body: JSON.stringify({ current, password }) })

/** Сохраняет файл из памяти браузера под заданным именем (ссылка должна быть в документе, и адрес живёт ещё секунду). */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Скачивает файл со всеми данными человека (браузер сохранит его как moi-dannye-ДАТА.json). */
export async function downloadMyData(): Promise<boolean> {
  try {
    const res = await fetch('/api/account/data', { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) return false
    saveBlob(await res.blob(), `moi-dannye-${new Date().toISOString().slice(0, 10)}.json`)
    return true
  } catch {
    return false
  }
}

// ---- Документы: резюме, сопроводительные, тестовые ----

export type DocType = 'cv' | 'cover' | 'test' | 'other'

export interface DocVersion {
  n: number
  filename: string
  ext: string
  size: number
  uploadedAt: number
}

export interface CabinetDoc {
  id: string
  type: DocType
  title: string
  note: string
  target: string
  /** Основное резюме: его получают в первую очередь (только у резюме). */
  primary: boolean
  createdAt: number
  updatedAt: number
  versions: DocVersion[]
}

export interface DocumentsState {
  documents: CabinetDoc[]
  types: Record<DocType, string>
  extensions: string[]
  limits: { fileBytes: number; docs: number; versions: number; totalBytes: number }
  usedBytes: number
  /** Когда человек дал согласие на обработку данных в кабинете; null — первая загрузка потребует галочек. */
  consentAt: number | null
}

export interface UploadInput {
  file: File
  type?: DocType
  title?: string
  note?: string
  target?: string
  /** Если указан — файл добавляется новой версией этого документа. */
  docId?: string
  consent?: ConsentChoice
}

export const fetchDocuments = () => api<DocumentsState>('/api/account/documents')

export function uploadDocument(input: UploadInput) {
  const body = new FormData()
  if (input.docId) body.set('docId', input.docId)
  else {
    body.set('type', input.type ?? 'cv')
    body.set('title', input.title ?? '')
    body.set('note', input.note ?? '')
    body.set('target', input.target ?? '')
  }
  // Настоящее имя файла отдельным полем: в частях multipart кириллица в имени может исказиться.
  body.set('fileName', input.file.name)
  if (input.consent) {
    body.set('consent', JSON.stringify(input.consent))
    body.set('consentVersion', CONSENT_VERSION)
    body.set('marketingVersion', MARKETING_CONSENT_VERSION)
  }
  body.set('file', input.file)
  return api<DocumentsState & { doc: CabinetDoc }>('/api/account/documents', { method: 'POST', body })
}

export const updateDocument = (id: string, patch: { title?: string; note?: string; target?: string; primary?: boolean }) =>
  api<DocumentsState>(`/api/account/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
export const deleteDocument = (id: string) => api<DocumentsState>(`/api/account/documents/${id}`, { method: 'DELETE' })
export const deleteDocumentVersion = (id: string, n: number) => api<DocumentsState>(`/api/account/documents/${id}/versions/${n}`, { method: 'DELETE' })

/** Скачивает файл версии под его настоящим именем. */
export async function downloadVersion(id: string, v: DocVersion): Promise<boolean> {
  try {
    const res = await fetch(`/api/account/documents/${id}/versions/${v.n}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) return false
    saveBlob(await res.blob(), v.filename)
    return true
  } catch {
    return false
  }
}
