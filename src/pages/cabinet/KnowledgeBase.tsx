import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import KbMarkdown from '../../components/KbMarkdown'
import { kbHeadings } from '../../lib/kbHeadings'
import { fetchKb, fetchKbPage, searchKb, type KbChild, type KbIndex, type KbNode, type KbPage, type KbSearchResult } from '../../lib/knowledge'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { pluralRu } from '../../lib/plural'
import type { CabinetUser } from '../../lib/cabinet'
import { icon as cabinetIcon } from './sections'

// Закрытая база знаний резидентов: /cabinet/knowledge. Слева панель с разделами (дерево, счётчики страниц, поиск), справа страница.
// На телефоне панель раскрывается кнопкой «Разделы». Тексты и порядок — на сервере (server/content/knowledge, docs/knowledge-base.md).

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const OPEN_KEY = 'ky_kb_open'

// ---- значки разделов: тонкая линия, как во всём кабинете ----
const ICONS: Record<string, ReactNode> = {
  flag: <path d="M6 20V4.5M6 5h11l-2 3.5 2 3.5H6" />,
  briefcase: <><rect x="4" y="7.5" width="16" height="12" rx="2" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M4 12.5h16" /></>,
  scales: <><path d="M12 4v16M7 20h10M5 8h14" /><path d="m5 8-2.5 6a3 3 0 0 0 5 0L5 8Zm14 0-2.5 6a3 3 0 0 0 5 0L19 8Z" /></>,
  cap: <><path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z" /><path d="M7 11.5V16c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-4.5M21 9v5" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  book: <><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5v-14Z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 8h6" /></>,
  pen: <><path d="M5 19l1-4L16.5 4.5a2 2 0 0 1 3 3L9 18l-4 1Z" /><path d="m14.5 6.5 3 3" /></>,
  spark: <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5Z" />,
  trend: <><path d="M4 17l5-5 3.5 3.5L20 8" /><path d="M15 8h5v5" /></>,
  coins: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  leaf: <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" /><path d="M5 19c2-4 5-7 9-9" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 3.5v3.5M14 3.5v3.5M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5" /></>,
  users: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 6.2a3 3 0 0 1 0 5.6M17 14.2c2 .5 3.5 2.2 3.5 4.8" /></>,
  folder: <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7Z" />,
  doc: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" /><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
}

function KbIcon({ name, fallback, className = 'h-[1.125rem] w-[1.125rem]' }: { name?: string; fallback: 'folder' | 'doc'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`} aria-hidden="true">
      {ICONS[name && ICONS[name] ? name : fallback]}
    </svg>
  )
}

const dateRu = (iso: string | null) => {
  const ts = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ts) ? '' : new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
const pagesWord = (n: number) => `${n} ${pluralRu(n, ['страница', 'страницы', 'страниц'])}`

function loadOpen(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-gold-light/30 px-0.5 text-ink">{part}</mark> : part))}</>
}

function Locked({ status }: { status?: string }) {
  const ended = status === 'ended'
  return (
    <div className="container-page py-14">
      <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink/[0.06] text-ink/70">{cabinetIcon.lock}</div>
        <h1 className="mt-4 text-xl font-semibold">База знаний — для резидентов сообщества</h1>
        <p className="mt-2 text-sm text-ink/70">
          Подробные материалы по карьере юриста открыты участникам сообщества с действующей подпиской. {ended ? 'Ваша подписка закончилась: продлите её, и доступ вернётся сразу.' : 'Вступите в сообщество, чтобы открыть базу.'}
        </p>
        <a href="/community#join" className={`mt-6 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 ${focusRing}`}>{ended ? 'Продлить подписку' : 'Вступить в сообщество'}</a>
        <div className="mt-4"><Link to="/cabinet" className={`rounded text-sm text-ink/50 hover:text-ink ${focusRing}`}>← В кабинет</Link></div>
      </div>
    </div>
  )
}

export default function KnowledgeBase({ user }: { user: CabinetUser }) {
  void user
  const [params] = useSearchParams()
  const [index, setIndex] = useState<{ state: 'loading' } | { state: 'ready'; data: KbIndex } | { state: 'locked'; status?: string } | { state: 'auth' } | { state: 'error' }>({ state: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    fetchKb().then((r) => {
      if (!active) return
      if (r.ok) setIndex({ state: 'ready', data: r.data })
      else if (r.error === 'locked') setIndex({ state: 'locked', status: r.status })
      else if (r.error === 'auth') setIndex({ state: 'auth' })
      else setIndex({ state: 'error' })
    })
    return () => {
      active = false
    }
  }, [reload])

  const requested = params.get('p')
  const ready = index.state === 'ready' ? index.data : null
  const pageId = requested ?? ready?.firstId ?? null
  const [page, setPage] = useState<{ id: string; state: 'ok'; data: KbPage } | { id: string; state: 'missing' | 'error' } | null>(null)

  useEffect(() => {
    if (!pageId || !ready) return
    let active = true
    fetchKbPage(pageId).then((r) => {
      if (!active) return
      setPage(r.ok ? { id: pageId, state: 'ok', data: r.data } : { id: pageId, state: r.error === 'not_found' ? 'missing' : 'error' })
      window.scrollTo({ top: 0 })
    })
    return () => {
      active = false
    }
  }, [pageId, ready])

  const current = page && page.id === pageId ? page : null
  useDocumentTitle(current?.state === 'ok' ? `${current.data.title} — База знаний` : 'База знаний — Личный кабинет')

  if (index.state === 'loading') return <div className="container-page py-24 text-center text-sm text-ink/50">Открываем базу знаний…</div>
  if (index.state === 'locked') return <Locked status={index.status} />
  if (index.state === 'auth') {
    return (
      <div className="container-page py-24 text-center">
        <p className="text-sm text-ink/60">Сессия закончилась. <Link to="/cabinet" className="font-medium underline">Войдите снова</Link>.</p>
      </div>
    )
  }
  if (index.state === 'error') {
    return (
      <div className="container-page py-24 text-center">
        <p className="text-sm text-ink/60">Не получилось загрузить базу знаний.</p>
        <button type="button" onClick={() => { setIndex({ state: 'loading' }); setReload((n) => n + 1) }} className={`mt-4 rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink ${focusRing}`}>Повторить</button>
      </div>
    )
  }
  return <Workspace data={index.data} pageId={pageId} current={current} />
}

function Workspace({ data, pageId, current }: { data: KbIndex; pageId: string | null; current: { id: string; state: 'ok'; data: KbPage } | { id: string; state: 'missing' | 'error' } | null }) {
  const { tree, admin } = data
  const byId = useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree])
  const byParent = useMemo(() => {
    const m = new Map<string | null, KbNode[]>()
    for (const n of tree) m.set(n.parent, [...(m.get(n.parent) ?? []), n])
    return m
  }, [tree])

  // Раскрытые разделы: что человек оставил открытым + путь к текущей странице.
  const [opened, setOpened] = useState<Set<string>>(loadOpen)
  const trail = useMemo(() => {
    const ids: string[] = []
    for (let n = pageId ? byId.get(pageId) : undefined; n; n = n.parent ? byId.get(n.parent) : undefined) ids.push(n.id)
    return new Set(ids)
  }, [pageId, byId])
  const isOpen = (id: string) => opened.has(id) || trail.has(id)
  const toggle = (id: string) => {
    setOpened((prev) => {
      const next = new Set(prev)
      if (isOpen(id)) next.delete(id)
      else next.add(id)
      // раздел с текущей страницей закрыть нельзя, пока она открыта: он остаётся раскрытым по пути
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
      } catch {
        // без сохранения — просто не запомним
      }
      return next
    })
  }

  // Поиск: через четверть секунды после ввода.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KbSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2), [query])
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let active = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      searchKb(q).then((r) => {
        if (!active) return
        setSearching(false)
        setResults(r.ok ? r.data : [])
      })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])
  const showResults = query.trim().length >= 2

  const [panelOpen, setPanelOpen] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  const currentTitle = current?.state === 'ok' ? current.data.title : ''

  const empty = tree.length === 0

  return (
    <div className="ym-hide-content container-page py-6 lg:py-8">
      <nav aria-label="Навигация" className="mb-4 flex items-center gap-2 text-sm text-ink/50">
        <Link to="/cabinet" className={`rounded hover:text-ink ${focusRing}`}>Личный кабинет</Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink/80">База знаний</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
        {/* Панель разделов */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <button
            type="button"
            aria-expanded={panelOpen}
            aria-controls="kb-panel"
            onClick={() => setPanelOpen((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-2xl bg-ink/[0.045] px-4 py-3 text-left text-sm font-semibold lg:hidden ${focusRing}`}
          >
            <KbIcon name="menu" fallback="doc" />
            <span className="min-w-0 flex-1 truncate">{currentTitle || 'Разделы'}</span>
            <span className="text-xs font-medium text-ink/50">{panelOpen ? 'Скрыть' : 'Разделы'}</span>
          </button>

          <div id="kb-panel" className={`${panelOpen ? 'mt-3 block' : 'hidden'} rounded-2xl bg-ink/[0.045] p-3 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto`}>
            <div className="flex items-center gap-2.5 px-2 pb-3 pt-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-ink shadow-[0_1px_2px_rgba(40,57,83,0.08)]"><KbIcon name="book" fallback="doc" /></span>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">База знаний</div>
                <div className="text-xs text-ink/50">{pagesWord(data.stats.pages)}</div>
              </div>
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"><KbIcon name="search" fallback="doc" className="h-4 w-4" /></span>
              <input
                type="search"
                aria-label="Поиск по базе знаний"
                placeholder="Поиск"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-xl border border-transparent bg-white py-2.5 pl-9 pr-9 text-base shadow-[0_1px_2px_rgba(40,57,83,0.06)] placeholder:text-ink/40 focus:border-ink/25 focus:outline-none sm:text-sm [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(''); setResults(null) }} className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink/40 hover:bg-ink/[0.06] hover:text-ink ${focusRing}`}>
                  <KbIcon name="close" fallback="doc" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {showResults ? (
              <div className="mt-4" aria-live="polite">
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/40">
                  {searching || results === null ? 'Ищем…' : results.length ? `Найдено: ${results.length}` : 'Ничего не найдено'}
                </div>
                <ul className="space-y-1">
                  {(results ?? []).map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/cabinet/knowledge?p=${encodeURIComponent(r.id)}`}
                        onClick={() => setPanelOpen(false)}
                        className={`block rounded-xl px-3 py-2.5 transition-colors hover:bg-white/80 ${r.id === pageId ? 'bg-white shadow-[0_1px_2px_rgba(40,57,83,0.08)]' : ''} ${focusRing}`}
                      >
                        {r.crumbs.length > 0 && <div className="truncate text-[11px] text-ink/45">{r.crumbs.join(' › ')}</div>}
                        <div className="text-sm font-semibold leading-snug"><Highlight text={r.title} words={words} /></div>
                        <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink/60"><Highlight text={r.snippet} words={words} /></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="px-2 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink/40">Разделы</div>
                {empty ? (
                  <p className="px-2 py-2 text-sm text-ink/50">Пока пусто.</p>
                ) : (
                  <Branch nodes={byParent.get(null) ?? []} byParent={byParent} depth={0} pageId={pageId} isOpen={isOpen} toggle={toggle} onNavigate={() => setPanelOpen(false)} />
                )}
              </>
            )}

            {admin && <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-xs leading-relaxed text-ink/60">Режим администратора: черновики и пустые разделы видны только вам.</p>}
          </div>
        </aside>

        {/* Страница */}
        <article ref={articleRef} className="min-w-0">
          {empty ? <EmptyBase admin={admin} /> : !pageId || !current ? <div className="py-16 text-center text-sm text-ink/50">Открываем страницу…</div> : current.state === 'ok' ? <PageBody page={current.data} /> : (
            <div className="py-16 text-center">
              <h1 className="text-xl font-semibold">{current.state === 'missing' ? 'Страница не найдена' : 'Не получилось открыть страницу'}</h1>
              <p className="mt-2 text-sm text-ink/60">{current.state === 'missing' ? 'Возможно, её переименовали или убрали. Выберите страницу слева.' : 'Попробуйте обновить страницу через минуту.'}</p>
            </div>
          )}
        </article>
      </div>
    </div>
  )
}

function EmptyBase({ admin }: { admin: boolean }) {
  return (
    <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink/[0.06] text-ink/70"><KbIcon name="book" fallback="doc" className="h-6 w-6" /></div>
      <h1 className="mt-4 text-xl font-semibold">База знаний наполняется</h1>
      <p className="mt-2 text-sm text-ink/70">Материалы по карьере юриста появятся здесь, как только будут готовы. Мы сообщим в сообществе.</p>
      {admin && <p className="mt-3 text-xs text-ink/50">Администратор: страницы без пометки «черновик» и с текстом сразу станут видны резидентам.</p>}
    </div>
  )
}

function Branch({ nodes, byParent, depth, pageId, isOpen, toggle, onNavigate }: {
  nodes: KbNode[]
  byParent: Map<string | null, KbNode[]>
  depth: number
  pageId: string | null
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  onNavigate: () => void
}) {
  return (
    <ul className={depth ? 'ml-[1.15rem] mt-0.5 space-y-0.5 border-l border-ink/10 pl-2' : 'space-y-0.5'}>
      {nodes.map((n) => {
        const kids = byParent.get(n.id) ?? []
        const open = n.folder && kids.length > 0 && isOpen(n.id)
        const selected = n.id === pageId
        const label = (
          <>
            <span className={selected ? 'text-ink' : 'text-ink/55'}><KbIcon name={n.icon} fallback={n.folder ? 'folder' : 'doc'} /></span>
            <span className="min-w-0 flex-1 truncate">{n.title}</span>
            {n.draft && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">черновик</span>}
            {n.folder && <span className="shrink-0 text-xs tabular-nums text-ink/35">{n.pages ?? 0}</span>}
          </>
        )
        const rowCls = `flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors ${focusRing} ${
          selected ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(40,57,83,0.08),0_6px_14px_-8px_rgba(40,57,83,0.25)]' : 'text-ink/75 hover:bg-white/70 hover:text-ink'
        }`
        return (
          <li key={n.id}>
            <div className="flex items-center">
              {n.folder && kids.length > 0 ? (
                <button type="button" aria-label={`${open ? 'Свернуть' : 'Развернуть'}: ${n.title}`} aria-expanded={open} onClick={() => toggle(n.id)} className={`mr-0.5 flex h-7 w-6 shrink-0 items-center justify-center rounded-lg text-ink/40 hover:bg-white/70 hover:text-ink ${focusRing}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">{ICONS.chevron}</svg>
                </button>
              ) : (
                <span className="mr-0.5 h-7 w-6 shrink-0" aria-hidden="true" />
              )}
              {n.hasBody || !n.folder ? (
                <Link to={`/cabinet/knowledge?p=${encodeURIComponent(n.id)}`} aria-current={selected ? 'page' : undefined} onClick={() => { if (n.folder && !isOpen(n.id)) toggle(n.id); onNavigate() }} className={rowCls}>{label}</Link>
              ) : (
                <button type="button" onClick={() => toggle(n.id)} className={rowCls}>{label}</button>
              )}
            </div>
            {open && <Branch nodes={kids} byParent={byParent} depth={depth + 1} pageId={pageId} isOpen={isOpen} toggle={toggle} onNavigate={onNavigate} />}
          </li>
        )
      })}
    </ul>
  )
}

function ChildCard({ c }: { c: KbChild }) {
  return (
    <Link to={`/cabinet/knowledge?p=${encodeURIComponent(c.id)}`} className={`glass flex min-w-0 items-center gap-3 rounded-xl p-4 ${focusRing}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink/70"><KbIcon name={c.icon} fallback={c.folder ? 'folder' : 'doc'} className="h-5 w-5" /></span>
      <span className="min-w-0">
        <span className="block font-semibold leading-snug">{c.title}{c.draft && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-800">черновик</span>}</span>
        <span className="block text-xs text-ink/50">{c.folder ? pagesWord(c.pages ?? 0) : 'Статья'}</span>
      </span>
    </Link>
  )
}

function PageBody({ page }: { page: KbPage }) {
  const headings = useMemo(() => kbHeadings(page.body), [page.body])
  const toc = headings.filter((h) => h.level === 2)
  const updated = dateRu(page.updated)
  return (
    <div className="max-w-3xl">
      {page.crumbs.length > 0 && (
        <nav aria-label="Путь" className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink/50">
          {page.crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5">
              <Link to={`/cabinet/knowledge?p=${encodeURIComponent(c.id)}`} className={`rounded hover:text-ink ${focusRing}`}>{c.title}</Link>
              <span aria-hidden="true">›</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start gap-4">
        <span className="mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink/[0.06] text-ink/70 sm:flex"><KbIcon name={page.icon} fallback={page.folder ? 'folder' : 'doc'} className="h-6 w-6" /></span>
        <div className="min-w-0">
          <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{page.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/50">
            {page.body && <span>≈ {page.readMin} {pluralRu(page.readMin, ['минута', 'минуты', 'минут'])} чтения</span>}
            {updated && <span>Обновлено {updated}</span>}
            {page.draft && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Черновик — видите только вы</span>}
          </div>
        </div>
      </div>

      {toc.length >= 3 && (
        <details className="group mt-6 rounded-2xl bg-ink/[0.035] px-5 py-3">
          <summary className={`flex cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold ${focusRing}`}>
            Содержание <span className="text-ink/40 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
          </summary>
          <ul className="mt-2 space-y-1.5 pb-1">
            {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} className={`rounded text-sm text-ink/70 hover:text-ink hover:underline ${focusRing}`}>{h.text}</a></li>)}
          </ul>
        </details>
      )}

      {page.body ? <div className="mt-6"><KbMarkdown source={page.body} /></div> : page.folder && page.children.length === 0 && <p className="mt-8 text-ink/60">В этом разделе пока нет страниц.</p>}

      {page.children.length > 0 && (
        <section className="mt-10" aria-label="В этом разделе">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">{page.folder ? 'В этом разделе' : 'Дальше'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">{page.children.map((c) => <ChildCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {(page.prev || page.next) && (
        <nav aria-label="Соседние страницы" className="mt-12 grid gap-3 border-t border-ink/10 pt-6 sm:grid-cols-2">
          {page.prev ? (
            <Link to={`/cabinet/knowledge?p=${encodeURIComponent(page.prev.id)}`} className={`group rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/30 ${focusRing}`}>
              <span className="block text-xs text-ink/50">← Назад</span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug">{page.prev.title}</span>
            </Link>
          ) : <span />}
          {page.next && (
            <Link to={`/cabinet/knowledge?p=${encodeURIComponent(page.next.id)}`} className={`group rounded-xl border border-ink/10 px-4 py-3 text-right transition-colors hover:border-ink/30 ${focusRing}`}>
              <span className="block text-xs text-ink/50">Дальше →</span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug">{page.next.title}</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
