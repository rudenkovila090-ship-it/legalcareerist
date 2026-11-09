import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import KbMarkdown from '../../components/KbMarkdown'
import { KbCard } from '../../components/kb/KbCard'
import { KbIcon } from '../../components/kb/KbIcon'
import KbOutline from '../../components/kb/KbOutline'
import KbPalette from '../../components/kb/KbPalette'
import { kbHeadings, scrollToHeading } from '../../lib/kbHeadings'
import { useKbMarks, type KbMarks } from '../../lib/kbState'
import { fetchKb, fetchKbPage, kbHref, type KbIndex, type KbNode, type KbPage } from '../../lib/knowledge'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { pluralRu } from '../../lib/plural'
import type { CabinetUser } from '../../lib/cabinet'
import { icon as cabinetIcon } from './sections'

// Закрытая база знаний резидентов: /cabinet/knowledge. Слева панель разделов (дерево, счётчики, избранное, быстрый поиск ⌘K),
// в центре страница, справа «На странице». Отметки читателя (избранное, прочитано, недавние) живут в его браузере.
// Тексты и порядок — на сервере (server/content/knowledge, docs/knowledge-base.md).

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const START_ID = 'nachalo-raboty'

type PageState = { id: string; state: 'ok'; data: KbPage } | { id: string; state: 'missing' | 'error' }

const dateRu = (iso: string | null) => {
  const ts = iso ? Date.parse(iso) : NaN
  return Number.isNaN(ts) ? '' : new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
const pagesWord = (n: number) => `${n} ${pluralRu(n, ['страница', 'страницы', 'страниц'])}`
const minWord = (n: number) => `≈ ${n} ${pluralRu(n, ['минута', 'минуты', 'минут'])}`

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
  const [params] = useSearchParams()
  const [index, setIndex] = useState<{ state: 'loading' } | { state: 'ready'; data: KbIndex } | { state: 'locked'; status?: string } | { state: 'auth' } | { state: 'error' }>({ state: 'loading' })
  const [reload, setReload] = useState(0)
  const marks = useKbMarks(user.login)

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
  const pageId = requested
  const [page, setPage] = useState<PageState | null>(null)
  const { visit } = marks

  useEffect(() => {
    if (!pageId || !ready) return
    let active = true
    fetchKbPage(pageId).then((r) => {
      if (!active) return
      setPage(r.ok ? { id: pageId, state: 'ok', data: r.data } : { id: pageId, state: r.error === 'not_found' ? 'missing' : 'error' })
      if (r.ok && !r.data.folder) visit(pageId)
      window.scrollTo({ top: 0 })
    })
    return () => {
      active = false
    }
  }, [pageId, ready, visit])

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
  return <Workspace data={index.data} pageId={pageId} current={current} marks={marks} />
}

function Workspace({ data, pageId, current, marks }: { data: KbIndex; pageId: string | null; current: PageState | null; marks: KbMarks }) {
  const { tree, admin } = data
  const byId = useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree])
  const byParent = useMemo(() => {
    const m = new Map<string | null, KbNode[]>()
    for (const n of tree) m.set(n.parent, [...(m.get(n.parent) ?? []), n])
    return m
  }, [tree])
  // Страницы (не разделы) под каждым разделом — для прогресса «прочитано».
  const pagesUnder = useMemo(() => {
    const out = new Map<string, string[]>()
    const walk = (id: string): string[] => {
      const ids = (byParent.get(id) ?? []).flatMap((n) => (n.folder ? walk(n.id) : [n.id]))
      out.set(id, ids)
      return ids
    }
    for (const n of byParent.get(null) ?? []) if (n.folder) walk(n.id)
    return out
  }, [byParent])

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [view, setView] = useState('all')
  const [sort, setSort] = useState('default')
  const folders = tree.filter((n) => n.folder)
  const contains = (node: KbNode): boolean => {
    const visited = new Set<string>()
    for (let n: KbNode | undefined = node; n && !visited.has(n.id); n = n.parent ? byId.get(n.parent) : undefined) {
      if (n.id === category) return true
      visited.add(n.id)
    }
    return false
  }
  const results = tree.filter((n) => !n.folder && (!category || contains(n)) && (!query.trim() || n.title.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))) && (view === 'all' || view === 'favorites' && marks.favorites.includes(n.id) || view === 'read' && marks.read.has(n.id) || view === 'unread' && !marks.read.has(n.id)))
  if (sort === 'title') results.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  // Быстрый поиск: ⌘K / Ctrl+K или «/» вне полей ввода.
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const currentPage = current?.state === 'ok' ? current.data : null
  const empty = tree.length === 0
  const headings = useMemo(() => (currentPage ? kbHeadings(currentPage.body) : []), [currentPage])
  const outline = headings.filter((h) => h.level === 2).length >= 3

  const resume = useMemo(() => {
    if (pageId !== START_ID) return null
    const id = marks.recent.find((r) => r !== pageId && byId.get(r) && !byId.get(r)!.folder)
    return id ? byId.get(id) ?? null : null
  }, [pageId, marks.recent, byId])


  return (
    <div className="ym-hide-content space-y-4">
      <section aria-label="Фильтры базы знаний" className="rounded-2xl bg-ink/[0.045] p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-ink/60">Поиск по названию<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название материала" className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-medium text-ink/60">Раздел<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm"><option value="">Все разделы</option>{folders.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
          <label className="text-xs font-medium text-ink/60">Мои отметки<select value={view} onChange={(e) => setView(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm"><option value="all">Все материалы</option><option value="favorites">Избранное</option><option value="unread">Не прочитано</option><option value="read">Прочитано</option></select></label>
          <label className="text-xs font-medium text-ink/60">Порядок<select value={sort} onChange={(e) => setSort(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm"><option value="default">Порядок разделов</option><option value="title">По названию</option></select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55"><span>Найдено: {results.length}</span><div className="flex gap-4"><button type="button" onClick={() => { setQuery(''); setCategory(''); setView('all'); setSort('default') }} className="underline underline-offset-2">Сбросить фильтры</button><button type="button" onClick={() => setPaletteOpen(true)} className="font-semibold text-ink">Поиск по тексту · Ctrl K</button></div></div>
        <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2" aria-label="Материалы базы знаний">
          {results.map((n) => <Link key={n.id} to={kbHref(n.id)} aria-current={n.id === pageId ? 'page' : undefined} className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border p-3 text-sm ${n.id === pageId ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white hover:border-ink/30'}`}><span>{n.title}</span>{marks.read.has(n.id) && <span aria-label="Прочитано">✓</span>}</Link>)}
          {!empty && !results.length && <p className="p-3 text-sm text-ink/60">Материалов по этим фильтрам нет.</p>}
        </div>
        {admin && <p className="mt-3 text-xs text-ink/50">Черновики видны только администраторам.</p>}
      </section>
      <div className={`grid gap-5 ${outline ? '2xl:grid-cols-[minmax(0,1fr)_12rem]' : ''}`}>
        {/* Страница */}
        <article className="min-w-0">
          {empty ? <EmptyBase admin={admin} /> : !pageId ? <p className="px-1 text-sm text-ink/55">Выберите материал в списке выше, чтобы открыть его здесь.</p> : !current ? <PageSkeleton /> : currentPage ? (
            <PageBody page={currentPage} byId={byId} pagesUnder={pagesUnder} tree={tree} marks={marks} resume={resume} outlineShown={outline} />
          ) : (
            <div className="py-16 text-center">
              <h1 className="text-xl font-semibold">{current.state === 'missing' ? 'Страница не найдена' : 'Не получилось открыть страницу'}</h1>
              <p className="mt-2 text-sm text-ink/60">{current.state === 'missing' ? 'Возможно, её переименовали или убрали. Выберите материал через фильтры или поиск.' : 'Попробуйте обновить страницу через минуту.'}</p>
              {current.state === 'missing' && <button type="button" onClick={() => setPaletteOpen(true)} className={`mt-4 rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink ${focusRing}`}>Открыть поиск</button>}
            </div>
          )}
        </article>

        {/* На странице */}
        {outline && (
          <div className="hidden 2xl:block">
            <div className="sticky top-20"><KbOutline key={currentPage?.id} headings={headings} /></div>
          </div>
        )}
      </div>

      {paletteOpen && <KbPalette onClose={() => setPaletteOpen(false)} tree={tree} recent={marks.recent} favorites={marks.favorites} />}
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="max-w-[58rem] motion-safe:animate-pulse" aria-busy="true" aria-label="Открываем страницу">
      <div className="h-4 w-48 rounded bg-ink/[0.07]" />
      <div className="mt-5 h-10 w-3/4 rounded-lg bg-ink/[0.08]" />
      <div className="mt-6 space-y-3">
        <div className="h-4 rounded bg-ink/[0.06]" />
        <div className="h-4 w-11/12 rounded bg-ink/[0.06]" />
        <div className="h-4 w-4/5 rounded bg-ink/[0.06]" />
      </div>
    </div>
  )
}

function EmptyBase({ admin }: { admin: boolean }) {
  return (
    <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink/[0.06] text-ink/70"><KbIcon name="book" className="h-6 w-6" /></div>
      <h1 className="mt-4 text-xl font-semibold">База знаний наполняется</h1>
      <p className="mt-2 text-sm text-ink/70">Материалы по карьере юриста появятся здесь, как только будут готовы. Мы сообщим в сообществе.</p>
      {admin && <p className="mt-3 text-xs text-ink/50">Администратор: страницы без пометки «черновик» и с текстом сразу станут видны резидентам.</p>}
    </div>
  )
}

function SectionGrid({ tree, pagesUnder, marks, skipId }: { tree: KbNode[]; pagesUnder: Map<string, string[]>; marks: KbMarks; skipId: string }) {
  const top = tree.filter((n) => !n.parent && n.folder && n.id !== skipId)
  if (!top.length) return null
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {top.map((n) => {
        const ids = pagesUnder.get(n.id) ?? []
        const read = ids.filter((id) => marks.read.has(id)).length
        return (
          <KbCard
            key={n.id}
            id={n.id}
            title={n.title}
            icon={n.icon}
            folder
            summary={n.summary}
            draft={n.draft}
            large
            progress={ids.length ? read / ids.length : undefined}
            meta={ids.length ? `${pagesWord(ids.length)}${read ? ` · прочитано ${read}` : ''}` : 'Скоро'}
          />
        )
      })}
    </div>
  )
}

function ActionButton({ onClick, pressed, label, children }: { onClick: () => void; pressed?: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium transition-colors ${pressed ? 'bg-gold-light/20 text-gold' : 'text-ink/55 hover:bg-ink/[0.06] hover:text-ink'} ${focusRing}`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function PageBody({ page, byId, pagesUnder, tree, marks, resume, outlineShown }: {
  page: KbPage
  byId: Map<string, KbNode>
  pagesUnder: Map<string, string[]>
  tree: KbNode[]
  marks: KbMarks
  resume: KbNode | null
  outlineShown: boolean
}) {
  const headings = useMemo(() => kbHeadings(page.body), [page.body])
  const toc = headings.filter((h) => h.level === 2)
  const updated = dateRu(page.updated)
  const isRead = marks.read.has(page.id)
  const fav = marks.favorites.includes(page.id)
  const parent = page.crumbs[page.crumbs.length - 1]
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const copyTimer = useRef(0)
  const endRef = useRef<HTMLDivElement>(null)
  const { setRead } = marks
  const readable = !page.folder && page.body.length > 0

  // Дочитал до конца (конец текста показался в окне) — отмечаем страницу прочитанной; снять отметку можно кнопкой внизу.
  useEffect(() => {
    const el = endRef.current
    if (!readable || !el) return
    let frame = 0
    const check = () => {
      frame = 0
      if (el.getBoundingClientRect().top <= window.innerHeight) {
        setRead(page.id, true)
        window.removeEventListener('scroll', onScroll)
      }
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(check)
    }
    frame = window.requestAnimationFrame(check)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [readable, page.id, setRead])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])
  const copyLink = async () => {
    window.clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${kbHref(page.id)}`)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    copyTimer.current = window.setTimeout(() => setCopied(''), 2200)
  }

  const folderStats = page.folder ? pagesUnder.get(page.id) ?? [] : []
  const folderRead = folderStats.filter((id) => marks.read.has(id)).length
  const isStart = page.id === START_ID

  return (
    <div className={page.folder ? '' : 'max-w-[56rem]'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {page.crumbs.length > 0 ? (
          <nav aria-label="Путь" className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink/50">
            {page.crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">›</span>}
                <Link to={kbHref(c.id)} className={`rounded hover:text-ink ${focusRing}`}>{c.title}</Link>
              </span>
            ))}
          </nav>
        ) : <span />}
        <div className="-mr-2 flex items-center gap-0.5">
          {!page.folder && (
            <ActionButton onClick={() => marks.toggleFavorite(page.id)} pressed={fav} label={fav ? 'В избранном' : 'В избранное'}>
              <KbIcon name="star" className={`h-4 w-4 ${fav ? 'fill-gold-light/60' : ''}`} />
            </ActionButton>
          )}
          <ActionButton onClick={copyLink} label="Ссылка"><KbIcon name="link" className="h-4 w-4" /></ActionButton>
          <span role="status" className="sr-only">{copied === 'ok' ? 'Ссылка скопирована' : copied === 'fail' ? 'Не удалось скопировать ссылку' : ''}</span>
          {copied && <span aria-hidden="true" className="ml-1 rounded-md bg-ink px-2 py-1 text-xs font-medium text-white">{copied === 'ok' ? 'Скопировано' : 'Не вышло'}</span>}
        </div>
      </div>

      {resume && (
        <Link to={kbHref(resume.id)} className={`group mb-4 flex items-center gap-3 rounded-xl border border-gold-light/40 bg-gold-light/[0.12] px-3.5 py-2 transition-colors hover:bg-gold-light/[0.2] ${focusRing}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-light/30 text-gold"><KbIcon name="resume" className="h-[1.125rem] w-[1.125rem]" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-ink/55">Продолжить чтение</span>
            <span className="block truncate font-semibold">{resume.title}</span>
          </span>
          <KbIcon name="arrow" className="h-4 w-4 text-ink/40 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      {page.folder ? (
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink/[0.09] via-ink/[0.04] to-gold-light/25 px-5 py-5 sm:px-7 sm:py-6">
          <KbIcon name={page.icon} fallback="folder" strokeWidth={1} className="pointer-events-none absolute -right-3 -top-3 h-32 w-32 text-ink/[0.07]" />
          <div className="relative">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-ink shadow-[0_2px_8px_-2px_rgba(40,57,83,0.25)]"><KbIcon name={page.icon} fallback="folder" className="h-5 w-5" /></span>
            <h1 className="mt-3 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{page.title}</h1>
            {page.summary && <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-ink/70">{page.summary}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {folderStats.length > 0 && <span className="rounded-full bg-white/80 px-2.5 py-0.5 font-medium text-ink/70">{pagesWord(folderStats.length)}</span>}
              {folderRead > 0 && <span className="rounded-full bg-gold-light/30 px-2.5 py-0.5 font-medium text-gold">Прочитано {folderRead} из {folderStats.length}</span>}
              {page.draft && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Черновик — видите только вы</span>}
            </div>
          </div>
        </header>
      ) : (
        <header>
          <div className="flex items-start gap-4">
            <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink/70 sm:flex"><KbIcon name={page.icon} fallback="doc" className="h-5 w-5" /></span>
            <h1 className="min-w-0 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{page.title}</h1>
          </div>
          {page.summary && <p className="mt-3 text-pretty text-base leading-relaxed text-ink/65">{page.summary}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink/60">
            {parent && (
              <Link to={kbHref(parent.id)} className={`flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-0.5 hover:bg-ink/10 hover:text-ink ${focusRing}`}>
                <KbIcon name={byId.get(parent.id)?.icon} fallback="folder" className="h-3.5 w-3.5" />
                {parent.title}
              </Link>
            )}
            {page.body && <span className="flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-0.5"><KbIcon name="clock" className="h-3 w-3" />{minWord(page.readMin)} чтения</span>}
            {updated && <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5">Обновлено {updated}</span>}
            {isRead && <span className="flex items-center gap-1.5 rounded-full bg-gold-light/25 px-2.5 py-0.5 font-medium text-gold"><KbIcon name="check" strokeWidth={2.2} className="h-3.5 w-3.5" />Прочитано</span>}
            {page.draft && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Черновик — видите только вы</span>}
          </div>
        </header>
      )}

      {toc.length >= 3 && (
        <details className={`group mt-4 rounded-xl bg-ink/[0.035] px-4 py-2.5 ${outlineShown ? 'xl:hidden' : ''}`}>
          <summary className={`flex cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold ${focusRing}`}>
            Содержание <KbIcon name="chevron" strokeWidth={2} className="h-3.5 w-3.5 text-ink/40 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="mt-2 space-y-1.5 pb-1">
            {toc.map((h) => <li key={h.id}><a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); scrollToHeading(h.id) }} className={`rounded text-sm text-ink/70 hover:text-ink hover:underline ${focusRing}`}>{h.text}</a></li>)}
          </ul>
        </details>
      )}

      {page.body && (
        <div className="mt-4 max-w-[56rem]">
          <KbMarkdown source={page.body} sections={isStart ? <SectionGrid tree={tree} pagesUnder={pagesUnder} marks={marks} skipId={page.id} /> : undefined} />
        </div>
      )}

      {page.children.length > 0 && (
        <section className="mt-6" aria-label={page.folder ? 'В этом разделе' : 'Дальше'}>
          {(!page.folder || page.body) && <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">{page.folder ? 'В этом разделе' : 'Дальше'}</h2>}
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {page.children.map((c) => {
              const ids = c.folder ? pagesUnder.get(c.id) ?? [] : []
              const read = ids.filter((id) => marks.read.has(id)).length
              return (
                <KbCard
                  key={c.id}
                  id={c.id}
                  title={c.title}
                  icon={c.icon}
                  folder={c.folder}
                  summary={c.summary}
                  draft={c.draft}
                  done={!c.folder && marks.read.has(c.id)}
                  progress={c.folder && ids.length ? read / ids.length : undefined}
                  meta={c.folder ? `${pagesWord(c.pages ?? 0)}${read ? ` · прочитано ${read}` : ''}` : c.readMin ? `${minWord(c.readMin)} чтения` : 'Статья'}
                />
              )
            })}
          </div>
        </section>
      )}

      {page.folder && page.children.length === 0 && !page.body && <p className="mt-8 text-ink/60">В этом разделе пока нет страниц.</p>}

      <div ref={endRef} aria-hidden="true" />

      {readable && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink/[0.035] px-4 py-3">
          <p className="text-sm text-ink/60">{isRead ? 'Страница отмечена прочитанной.' : 'Дочитали? Отметьте страницу, чтобы видеть прогресс по разделу.'}</p>
          <button
            type="button"
            aria-pressed={isRead}
            onClick={() => marks.setRead(page.id, !isRead)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${isRead ? 'border border-ink/15 text-ink/60 hover:text-ink' : 'bg-ink text-white hover:bg-ink/90'} ${focusRing}`}
          >
            <KbIcon name="check" strokeWidth={2.2} className="h-4 w-4" />
            {isRead ? 'Снять отметку' : 'Отметить прочитанным'}
          </button>
        </div>
      )}

      {page.related.length > 0 && (
        <section className="mt-7" aria-label="Смотрите также">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Смотрите также</h2>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {page.related.map((r) => (
              <KbCard key={r.id} id={r.id} title={r.title} icon={r.icon} folder={false} summary={r.summary} crumbs={r.crumbs.join(' › ')} done={marks.read.has(r.id)} meta={`${minWord(r.readMin)} чтения`} />
            ))}
          </div>
        </section>
      )}

      {(page.prev || page.next) && (
        <nav aria-label="Соседние страницы" className="mt-7 grid gap-2.5 border-t border-ink/10 pt-4 sm:grid-cols-2">
          {page.prev ? (
            <Link to={kbHref(page.prev.id)} className={`group rounded-lg border border-ink/10 px-3.5 py-2.5 transition-colors hover:border-ink/30 ${focusRing}`}>
              <span className="block text-xs text-ink/50">← Назад</span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug">{page.prev.title}</span>
            </Link>
          ) : <span />}
          {page.next && (
            <Link to={kbHref(page.next.id)} className={`group rounded-lg border border-ink/10 px-3.5 py-2.5 text-right transition-colors hover:border-ink/30 ${focusRing}`}>
              <span className="block text-xs text-ink/50">Дальше →</span>
              <span className="mt-0.5 block text-sm font-semibold leading-snug">{page.next.title}</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
