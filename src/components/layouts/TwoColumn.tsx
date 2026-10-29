import { useState, type ReactNode } from 'react'

/**
 * Схема «Two Column» (две колонки): каталоги с фильтрами — база вакансий, кандидатов, маркетплейс.
 * Узкая колонка с фильтрами слева (sticky), широкий список справа. На телефоне фильтры уходят над списком и сворачиваются
 * кнопкой («Фильтры»), чтобы список не оказывался на третьем экране.
 * `side`: left — фильтры слева (по умолчанию), right — справа. `asideWidth`: sm 14rem, md 16.25rem, lg 20rem.
 */
const COLS = {
  left: { sm: 'lg:grid-cols-[14rem_minmax(0,1fr)]', md: 'lg:grid-cols-[16.25rem_minmax(0,1fr)]', lg: 'lg:grid-cols-[20rem_minmax(0,1fr)]' },
  right: { sm: 'lg:grid-cols-[minmax(0,1fr)_14rem]', md: 'lg:grid-cols-[minmax(0,1fr)_16.25rem]', lg: 'lg:grid-cols-[minmax(0,1fr)_20rem]' },
} as const

interface Props {
  /** Фильтры (или другая боковая колонка). */
  aside: ReactNode
  children: ReactNode
  side?: 'left' | 'right'
  asideWidth?: 'sm' | 'md' | 'lg'
  /** Прилипает ли колонка при прокрутке списка (на компьютере). */
  sticky?: boolean
  /** Подпись кнопки, сворачивающей колонку на телефоне; без неё колонка на телефоне показана всегда. */
  collapseLabel?: string
  className?: string
}

export default function TwoColumn({ aside, children, side = 'left', asideWidth = 'md', sticky = true, collapseLabel, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`grid grid-cols-1 gap-6 lg:gap-8 ${COLS[side][asideWidth]} ${className}`}>
      <aside className={`relative z-20 min-w-0 ${side === 'right' ? 'lg:order-2' : ''} ${sticky ? 'lg:sticky lg:top-24 lg:self-start' : ''}`}>
        {collapseLabel && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold lg:hidden"
          >
            {collapseLabel}
            <span className={`text-ink/50 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
          </button>
        )}
        <div className={`${collapseLabel ? `${open ? 'mt-3 block' : 'hidden'} lg:mt-0 lg:block` : ''}`}>{aside}</div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
