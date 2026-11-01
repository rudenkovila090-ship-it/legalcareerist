import { Children, type ReactNode } from 'react'

/**
 * Схема «Magazine / Asymmetrical» («журнал», асимметричная сетка): афиша мероприятий, кейсы, подборки. Первый материал — крупный,
 * занимает две колонки и две строки; остальные мельче вокруг него. Так у афиши сразу виден главный герой, а не ровный ряд одинаковых плиток.
 * Колонок три на компьютере, две на планшете, одна на телефоне. Если материалов меньше трёх, сетка выравнивается сама.
 */
export default function Magazine({ children, className = '' }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children)
  const rich = items.length >= 3
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {items.map((child, i) => (
        <div key={i} className={`min-w-0 ${rich && i === 0 ? 'sm:col-span-2 lg:row-span-2' : ''}`}>{child}</div>
      ))}
    </div>
  )
}
