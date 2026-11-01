import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { pluralRu } from '../../lib/plural'
import { searchKb, type KbNode, type KbSearchResult } from '../../lib/knowledge'
import { KbIcon } from './KbIcon'

// Быстрый поиск по базе знаний (⌘K / Ctrl+K или «/»): ищет по сайту сервера, а без запроса показывает недавние страницы,
// избранное и разделы. Стрелки выбирают, Enter открывает, Esc закрывает.

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

interface Row { id: string; title: string; icon: string; folder: boolean; hint: string; snippet?: string }

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-gold-light/35 px-0.5 text-ink">{part}</mark> : part))}</>
}

/** Показывается, пока смонтирован: родитель создаёт его при открытии и убирает при закрытии, поэтому запрос каждый раз начинается с чистого листа. */
export default function KbPalette({ onClose, tree, recent, favorites }: { onClose: () => void; tree: KbNode[]; recent: string[]; favorites: string[] }) {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KbSearchResult[] | null>(null)
  const [active, setActive] = useState(0)
  const byId = useMemo(() => new Map(tree.map((n) => [n.id, n])), [tree])
  const trail = useCallback((n: KbNode) => {
    const names: string[] = []
    for (let p = n.parent ? byId.get(n.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) names.unshift(p.title)
    return names.join(' › ')
  }, [byId])
  const q = query.trim()
  const searching = q.length >= 2
  const words = useMemo(() => q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2), [q])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (!searching) return
    let live = true
    const timer = window.setTimeout(() => {
      searchKb(q).then((r) => {
        if (live) {
          setResults(r.ok ? r.data : [])
          setActive(0)
        }
      })
    }, 200)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [q, searching])

  const groups = useMemo(() => {
    const pick = (ids: string[]): Row[] =>
      ids.map((id) => byId.get(id)).filter((n): n is KbNode => !!n).map((n) => ({ id: n.id, title: n.title, icon: n.icon, folder: n.folder, hint: trail(n) }))
    if (searching) {
      const rows: Row[] = (results ?? []).map((r) => ({ id: r.id, title: r.title, icon: r.icon ?? '', folder: false, hint: r.crumbs.join(' › '), snippet: r.snippet }))
      return [{ label: results === null ? 'Ищем…' : rows.length ? `Найдено: ${rows.length}` : 'Ничего не найдено', rows }]
    }
    const sections: Row[] = tree.filter((n) => !n.parent).map((n) => ({ id: n.id, title: n.title, icon: n.icon, folder: n.folder, hint: n.pages ? `${n.pages} ${pluralRu(n.pages, ['страница', 'страницы', 'страниц'])}` : '' }))
    return [
      { label: 'Недавние', rows: pick(recent).slice(0, 5) },
      { label: 'Избранное', rows: pick(favorites).slice(0, 5) },
      { label: 'Разделы', rows: sections },
    ].filter((g) => g.rows.length > 0)
  }, [searching, results, tree, recent, favorites, byId, trail])

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const go = (row: Row | undefined) => {
    if (!row) return
    onClose()
    navigate(`/cabinet/knowledge?p=${encodeURIComponent(row.id)}`)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat[active])
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listId])

  let idx = -1
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/55 p-0 sm:p-6 sm:pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Поиск по базе знаний" onKeyDown={onKey} className="flex h-full w-full flex-col overflow-hidden bg-white text-ink shadow-[0_30px_80px_-20px_rgba(40,57,83,0.55)] sm:h-auto sm:max-h-[70vh] sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3">
          <KbIcon name="search" className="h-5 w-5 text-ink/40" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={flat.length ? `${listId}-${active}` : undefined}
            aria-label="Что ищем?"
            placeholder="Найти страницу или слово в тексте"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setResults(null); setActive(0) }}
            className="min-w-0 flex-1 bg-transparent py-1 text-base placeholder:text-ink/40 focus:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Закрыть поиск" className={`flex h-8 items-center rounded-lg px-2 text-xs font-medium text-ink/50 hover:bg-ink/[0.06] hover:text-ink ${focusRing}`}>
            <span className="hidden sm:inline">Esc</span>
            <KbIcon name="close" className="h-4 w-4 sm:hidden" />
          </button>
        </div>

        <div id={listId} role="listbox" aria-label="Результаты" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length === 0 && <p className="px-3 py-10 text-center text-sm text-ink/50">Начните вводить: ищем по названиям и тексту всех страниц.</p>}
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink/40">{g.label}</div>
              {g.rows.map((r) => {
                idx += 1
                const mine = idx
                const on = mine === active
                return (
                  <div
                    key={`${g.label}-${r.id}`}
                    id={`${listId}-${mine}`}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => setActive(mine)}
                    onClick={() => go(r)}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${on ? 'bg-ink/[0.07]' : ''}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06] text-ink/70"><KbIcon name={r.icon} fallback={r.folder ? 'folder' : 'doc'} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold"><Highlight text={r.title} words={searching ? words : []} /></span>
                      {r.hint && <span className="block truncate text-xs text-ink/45">{r.hint}</span>}
                      {r.snippet && <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink/60"><Highlight text={r.snippet} words={words} /></span>}
                    </span>
                    {on && <span className="mt-1.5 hidden shrink-0 text-xs text-ink/40 sm:block">Enter ↵</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="hidden items-center gap-4 border-t border-ink/10 bg-ink/[0.025] px-4 py-2 text-xs text-ink/45 sm:flex">
          <span>↑↓ выбрать</span>
          <span>Enter открыть</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
