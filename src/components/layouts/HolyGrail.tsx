import type { ReactNode } from 'react'

/**
 * Схема «Holy Grail» («Святой Грааль»): личный кабинет. Сверху шапка сайта, снизу подвал сайта (их рисует Layout), в середине три колонки:
 * меню слева (прилипает), содержимое по центру, необязательная правая колонка (подсказки, сводка, новости).
 * На телефоне порядок: меню (пилюли), содержимое, правая колонка.
 */
interface Props {
  nav: ReactNode
  children: ReactNode
  /** Правая колонка; без неё — две колонки. */
  aside?: ReactNode
  className?: string
}

export default function HolyGrail({ nav, children, aside, className = '' }: Props) {
  return (
    <div className={`container-wide grid gap-6 py-5 lg:py-6 ${aside ? 'lg:grid-cols-[15.5rem_minmax(0,1fr)_17rem]' : 'lg:grid-cols-[15.5rem_minmax(0,1fr)]'} ${className}`}>
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">{nav}</aside>
      <div className="min-w-0">{children}</div>
      {aside && <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">{aside}</aside>}
    </div>
  )
}
