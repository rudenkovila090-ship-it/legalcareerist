import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { materials } from '../data/materials'
import { materialKindLabel } from '../components/cards'
import { MARKETPLACE_DIRECTIONS, type MaterialItem, type MaterialKind, type MarketplaceDirection } from '../types'

const money = new Intl.NumberFormat('ru-RU')

const categoryOptions: { id: MaterialKind; label: string }[] = [
  { id: 'guide', label: 'Гайды' },
  { id: 'checklist', label: 'Чек-листы' },
  { id: 'longlist', label: 'Лонг-листы' },
  { id: 'article', label: 'Статьи' },
  { id: 'webinar', label: 'Вебинары' },
  { id: 'presentation', label: 'Презентации' },
]

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onOutside])
  return ref
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// Категория и Направление — скрытые за раскрывающейся кнопкой блоки с
// мультивыбором (чекбоксы), а не всегда открытый список.
function CollapsibleCheckboxFilter<T extends string>({
  label, options, selected, onToggle,
}: {
  label: string
  options: { id: T; label: string }[]
  selected: Set<T>
  onToggle: (id: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))

  return (
    <div ref={ref} className="rounded-2xl border border-ink/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {label}{selected.size > 0 ? ` (${selected.size})` : ''}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="max-h-72 space-y-2 overflow-y-auto border-t border-ink/10 p-5 pt-4 text-sm">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Рейтинг ${rating} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${i < Math.round(rating) ? 'fill-gold text-gold' : 'fill-ink/10 text-ink/10'}`}>
          <path d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L1.4 7.7l6.1-.6z" />
        </svg>
      ))}
    </span>
  )
}

function ProductCard({ m }: { m: MaterialItem }) {
  const free = m.price === 0 && !m.sale
  const fromPrice = m.sale ? Math.min(...Object.values(m.sale).filter((v): v is number => v !== undefined)) : m.price
  return (
    <Link to={`/materials/${m.slug}`} className="glass flex flex-col overflow-hidden rounded-xl">
      <div className="flex h-32 items-center justify-center bg-gradient-to-br from-ink to-gold text-white">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{materialKindLabel[m.kind]}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold leading-snug">{m.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-ink/60">{m.description}</p>

        {m.rating !== undefined && (
          <div className="mt-2 flex items-center gap-2 text-xs text-ink/50">
            <Stars rating={m.rating} />
            <span>{m.rating.toFixed(1)}</span>
            {m.reviewsCount !== undefined && <span>· {m.reviewsCount} отзывов</span>}
          </div>
        )}

        <span className="mt-4 rounded-full bg-ink py-2.5 text-center text-sm font-semibold text-white hover:bg-ink/90">
          {free || m.freePreview ? 'Посмотреть бесплатно' : `Купить за ${money.format(fromPrice)} ₽`}
        </span>
      </div>
    </Link>
  )
}

export default function MarketplaceHome() {
  const [category, setCategory] = useState<Set<MaterialKind>>(new Set())
  const [directions, setDirections] = useState<Set<MarketplaceDirection>>(new Set())
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [sort, setSort] = useState<'popular' | 'price_asc' | 'price_desc'>('popular')

  function toggleCategory(id: MaterialKind) {
    setCategory((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleDirection(id: MarketplaceDirection) {
    setDirections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isFiltering = category.size > 0 || directions.size > 0 || priceFrom !== '' || priceTo !== ''

  function resetFilters() {
    setCategory(new Set())
    setDirections(new Set())
    setPriceFrom('')
    setPriceTo('')
  }

  const filtered = useMemo(() => {
    const from = Number(priceFrom) || 0
    const to = Number(priceTo) || Infinity
    const list = materials.filter((m) => {
      if (category.size > 0 && !category.has(m.kind)) return false
      if (directions.size > 0 && !m.direction.some((d) => directions.has(d))) return false
      if (m.price < from || m.price > to) return false
      return true
    })
    if (sort === 'price_asc') return [...list].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') return [...list].sort((a, b) => b.price - a.price)
    return [...list].sort((a, b) => (b.purchases ?? 0) - (a.purchases ?? 0))
  }, [category, directions, priceFrom, priceTo, sort])

  return (
    <div>
      <PageHero
        eyebrow="Карьерный Юрист"
        title="Маркет"
        description="Каталог полезных материалов для юридической карьеры: гайды, чек-листы, лонглисты, статьи и вебинары."
      />

      <div className="container-page py-10">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          {/* Фильтры */}
          <aside className="space-y-4">
            <CollapsibleCheckboxFilter label="Категория" options={categoryOptions} selected={category} onToggle={toggleCategory} />
            <CollapsibleCheckboxFilter label="Направление" options={MARKETPLACE_DIRECTIONS} selected={directions} onToggle={toggleDirection} />

            <div className="rounded-2xl border border-ink/10 p-5">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">Цена</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  value={priceFrom}
                  onChange={(e) => setPriceFrom(e.target.value)}
                  placeholder="От"
                  className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                />
                <input
                  type="number"
                  min={0}
                  value={priceTo}
                  onChange={(e) => setPriceTo(e.target.value)}
                  placeholder="До"
                  className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                />
              </div>
            </div>

            {isFiltering && (
              <button type="button" onClick={resetFilters} className="text-sm text-ink/50 hover:text-ink">
                Сбросить фильтры
              </button>
            )}
          </aside>

          {/* Каталог */}
          <div>
            <div className="mb-1 text-sm font-medium uppercase tracking-wide text-gold">Маркет</div>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-2xl font-semibold">Каталог материалов</h2>
              <div className="flex items-center gap-3">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as 'popular' | 'price_asc' | 'price_desc')}
                  className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
                >
                  <option value="popular">Популярное</option>
                  <option value="price_asc">По цене, минимальной</option>
                  <option value="price_desc">По цене, максимальной</option>
                </select>
                <span className="shrink-0 text-sm text-ink/50">{filtered.length} материалов</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((m) => <ProductCard key={m.id} m={m} />)}
              {filtered.length === 0 && <p className="text-ink/50">По заданным фильтрам материалов не найдено.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
