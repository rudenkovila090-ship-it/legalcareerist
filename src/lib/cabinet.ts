// Личный кабинет на сайте (/cabinet): вход по логину и паролю, данные берём у сервера (server/lib/accountAuth.js).
// Токен сессии лежит в localStorage этого браузера; на сервере по нему находится сессия на 30 дней.
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
