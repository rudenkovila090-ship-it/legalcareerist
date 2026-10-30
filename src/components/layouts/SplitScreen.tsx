import type { ReactNode } from 'react'

/**
 * Схема «Split Screen» (разделённый экран): страница мероприятия. Слева крупное фото или афиша — оно остаётся на месте,
 * пока справа прокручиваются описание, программа и регистрация. На телефоне фото идёт сверху, затем текст.
 * `mediaSide`: left (по умолчанию) или right. `ratio`: доля колонки с фото — half (50/50) или third (40/60).
 */
const COLS = { half: 'lg:grid-cols-2', third: 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' } as const

interface Props {
  media: ReactNode
  children: ReactNode
  mediaSide?: 'left' | 'right'
  ratio?: keyof typeof COLS
  /** Фото прилипает при прокрутке текста (на компьютере). */
  stickyMedia?: boolean
  className?: string
}

export default function SplitScreen({ media, children, mediaSide = 'left', ratio = 'half', stickyMedia = true, className = '' }: Props) {
  return (
    <div className={`grid grid-cols-1 gap-8 lg:gap-12 ${COLS[ratio]} ${className}`}>
      <div className={`min-w-0 ${mediaSide === 'right' ? 'lg:order-2' : ''} ${stickyMedia ? 'lg:sticky lg:top-24 lg:self-start' : ''}`}>{media}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
