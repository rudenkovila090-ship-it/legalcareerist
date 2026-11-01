import type { ReactNode } from 'react'

/**
 * Схема «Single Column» (одна колонка): блог, статьи, новости, юридические тексты.
 * Одна колонка текста по центру, строка до ~65–75 знаков, ничего по бокам: человек читает и не отвлекается.
 * `width`: prose — основной текст статьи (48rem), narrow — формы и короткие страницы (36rem), wide — текст с крупными вставками (56rem).
 */
const WIDTHS = { narrow: 'max-w-xl', prose: 'max-w-3xl', wide: 'max-w-4xl' } as const

export default function SingleColumn({ children, width = 'prose', className = '' }: { children: ReactNode; width?: keyof typeof WIDTHS; className?: string }) {
  return (
    <div className={`container-page py-12 ${className}`}>
      <div className={`mx-auto ${WIDTHS[width]}`}>{children}</div>
    </div>
  )
}
