import { Link } from 'react-router-dom'
import { kbHref } from '../../lib/knowledge'
import { KbIcon } from './KbIcon'

// Карточка раздела или страницы базы знаний: значок, название, краткое описание, строка сведений и (у разделов) полоска прочитанного.
// Используется на странице раздела, в «Смотрите также» и в карте разделов на странице «Начало работы».

export interface KbCardProps {
  id: string
  title: string
  icon?: string
  folder: boolean
  summary?: string
  meta?: string
  draft?: boolean
  /** Прочитана ли страница. */
  done?: boolean
  /** Доля прочитанного в разделе, 0–1. */
  progress?: number
  /** Путь для «Смотрите также». */
  crumbs?: string
  large?: boolean
}

export function KbCard({ id, title, icon, folder, summary, meta, draft, done, progress, crumbs, large }: KbCardProps) {
  return (
    <Link
      to={kbHref(id)}
      className="glass group flex h-full min-w-0 flex-col rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 sm:p-5"
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`flex shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-ink/70 transition-colors group-hover:bg-ink group-hover:text-white ${large ? 'h-11 w-11' : 'h-9 w-9'}`}>
          <KbIcon name={icon} fallback={folder ? 'folder' : 'doc'} className={large ? 'h-6 w-6' : 'h-5 w-5'} />
        </span>
        <span className="flex items-center gap-2">
          {draft && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">черновик</span>}
          {done && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-light/30 text-gold" title="Прочитано">
              <KbIcon name="check" strokeWidth={2.2} className="h-3 w-3" />
              <span className="sr-only">Прочитано</span>
            </span>
          )}
          <KbIcon name="arrow" className="h-4 w-4 text-ink/25 transition-all group-hover:translate-x-0.5 group-hover:text-ink/60" />
        </span>
      </span>
      {crumbs && <span className="mt-3 block truncate text-[11px] text-ink/45">{crumbs}</span>}
      <span className={`block text-balance font-semibold leading-snug ${crumbs ? 'mt-0.5' : 'mt-3'} ${large ? 'text-lg' : ''}`}>{title}</span>
      {summary && <span className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink/60">{summary}</span>}
      <span className="flex-1" />
      {(meta || progress !== undefined) && (
        <span className="mt-4 block">
          {progress !== undefined && (
            <span className="mb-2 block h-1 overflow-hidden rounded-full bg-ink/[0.08]" role="presentation">
              <span className="block h-full rounded-full bg-gold-light transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
          {meta && <span className="block text-xs text-ink/50">{meta}</span>}
        </span>
      )}
    </Link>
  )
}
