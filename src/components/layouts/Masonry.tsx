import { Children, type ReactNode } from 'react'

/**
 * Схема «Masonry» («кирпичная кладка»): фотоотчёты с мероприятий и всё, где картинки разной высоты. Колонки заполняются сверху вниз,
 * блоки не растягиваются под одну высоту и не оставляют дыр. 1 колонка на телефоне, 2 на планшете, 3 на компьютере (`columns` меняет).
 * Меньше трёх снимков — ровный ряд (два рядом или один), а не кладка.
 */
const COLS = { 2: 'columns-1 sm:columns-2', 3: 'columns-1 sm:columns-2 lg:columns-3', 4: 'columns-2 lg:columns-3 xl:columns-4' } as const

export default function Masonry({ children, columns = 3, className = '' }: { children: ReactNode; columns?: keyof typeof COLS; className?: string }) {
  const items = Children.toArray(children)
  // Меньше трёх снимков «кладка» выглядит как дыра под низким фото: показываем ровный ряд по верхнему краю.
  if (items.length < 3) {
    return <div className={`grid items-start gap-3 ${items.length > 1 ? 'sm:grid-cols-2' : ''} ${className}`}>{items}</div>
  }
  return (
    <div className={`${COLS[columns]} gap-3 [column-fill:_balance] ${className}`}>
      {items.map((child, i) => (
        <div key={i} className="mb-3 break-inside-avoid">{child}</div>
      ))}
    </div>
  )
}

export interface MasonryPhoto {
  src: string
  alt: string
  /** Подпись под фото (необязательно). */
  caption?: string
}

/** Готовая стена фотографий: ленивые картинки с подписями. Размеры берёт сама картинка, поэтому высота у всех разная. */
export function PhotoMasonry({ photos, columns = 3 }: { photos: MasonryPhoto[]; columns?: keyof typeof COLS }) {
  return (
    <Masonry columns={columns}>
      {photos.map((p) => (
        <figure key={p.src} className="overflow-hidden rounded-xl bg-ink/5">
          <img src={p.src} alt={p.alt} loading="lazy" className="block h-auto w-full" />
          {p.caption && <figcaption className="px-3 py-2 text-xs text-ink/60">{p.caption}</figcaption>}
        </figure>
      ))}
    </Masonry>
  )
}
