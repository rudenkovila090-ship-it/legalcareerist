// Личный кабинет на сайте (/cabinet): вход по логину и паролю, данные берём у сервера (server/lib/accountAuth.js).
// Токен сессии лежит в localStorage этого браузера; на сервере по нему находится сессия на 30 дней.
import type { ConsentChoice } from './consent'

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
  role: 'client'
  /** Есть ли карточка этого человека в Telegram-боте (по ней находится подписка). */
  telegramLinked: boolean
  resident: ResidentInfo
  /** Режим конфиденциальности: резюме скрыто от работодателей. */
  privacy: { hidden: boolean }
  consents: ConsentsInfo
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
    const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(init.headers ?? {}) } })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (res.status === 401) clearToken()
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? (res.status === 401 ? 'unauthorized' : 'error') }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export const fetchProfile = () => api<{ profile: Profile }>('/api/account/profile')
export const fetchOptions = () => api<ProfileOptions>('/api/account/options')
export const fetchEvents = () => api<{ events: CabinetEvent[] }>('/api/account/events')

/** Сохранение частей профиля. consent — галочки (нужны только при первом сохранении). */
export const saveProfile = (parts: Partial<Pick<Profile, 'practices' | 'experience' | 'expectations' | 'privacy'>>, consent?: ConsentChoice) =>
  api<{ profile: Profile }>('/api/account/profile', { method: 'PUT', body: JSON.stringify({ ...parts, ...(consent ? { consent } : {}) }) })

export const setMarketing = (marketing: boolean) => api<{ marketing: boolean; at: number; applied: boolean }>('/api/account/marketing', { method: 'POST', body: JSON.stringify({ marketing }) })
export const requestDeletion = () => api<{ already?: boolean; at: number }>('/api/account/data-request', { method: 'POST', body: '{}' })

/** Скачивает файл со всеми данными человека (браузер сохранит его как moi-dannye-ДАТА.json). */
export async function downloadMyData(): Promise<boolean> {
  try {
    const res = await fetch('/api/account/data', { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) return false
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `moi-dannye-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}
