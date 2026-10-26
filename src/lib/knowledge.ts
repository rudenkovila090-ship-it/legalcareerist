import { getToken } from './cabinet'

// Закрытая база знаний резидентов: запросы к серверу (server/lib/knowledgeBase.js). Доступ проверяет сервер при каждом запросе.

export interface KbNode {
  id: string
  parent: string | null
  title: string
  icon: string
  folder: boolean
  draft?: boolean
  hasBody: boolean
  /** Для раздела — сколько страниц внутри. */
  pages?: number
}

export interface KbChild { id: string; title: string; icon: string; folder: boolean; draft?: boolean; pages?: number }
export interface KbNear { id: string; title: string }

export interface KbPage {
  id: string
  title: string
  icon: string
  folder: boolean
  draft?: boolean
  body: string
  updated: string | null
  readMin: number
  crumbs: { id: string; title: string }[]
  children: KbChild[]
  prev: KbNear | null
  next: KbNear | null
}

export interface KbSearchResult { id: string; title: string; crumbs: string[]; snippet: string; draft?: boolean }

export interface KbIndex {
  admin: boolean
  firstId: string | null
  stats: { pages: number; sections: number }
  tree: KbNode[]
}

export type KbFail = 'locked' | 'auth' | 'not_found' | 'error'
export type KbResult<T> = { ok: true; data: T } | { ok: false; error: KbFail; status?: string }

async function get<T>(path: string): Promise<KbResult<T>> {
  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (res.status === 401) return { ok: false, error: 'auth' }
    if (res.status === 403) {
      const j = (await res.json().catch(() => ({}))) as { status?: string }
      return { ok: false, error: 'locked', status: j.status }
    }
    if (res.status === 404) return { ok: false, error: 'not_found' }
    if (!res.ok) return { ok: false, error: 'error' }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, error: 'error' }
  }
}

export const fetchKb = () => get<KbIndex & { ok: true }>('/api/account/kb')
export const fetchKbPage = async (id: string) => {
  const r = await get<{ page: KbPage }>(`/api/account/kb/page?id=${encodeURIComponent(id)}`)
  return r.ok ? ({ ok: true, data: r.data.page } as KbResult<KbPage>) : (r as KbResult<KbPage>)
}
export const searchKb = async (q: string) => {
  const r = await get<{ results: KbSearchResult[] }>(`/api/account/kb/search?q=${encodeURIComponent(q)}`)
  return r.ok ? ({ ok: true, data: r.data.results } as KbResult<KbSearchResult[]>) : (r as KbResult<KbSearchResult[]>)
}
