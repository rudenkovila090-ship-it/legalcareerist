import { useMemo, useState } from 'react'
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

function IconAccount() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
    </svg>
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

function ProductCard({ m, onOpen }: { m: MaterialItem; onOpen: (m: MaterialItem) => void }) {
  const free = m.price === 0 && !m.sale
  const fromPrice = m.sale ? Math.min(...Object.values(m.sale).filter((v): v is number => v !== undefined)) : m.price
  return (
    <div className="glass flex flex-col overflow-hidden rounded-xl">
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

        <button
          type="button"
          onClick={() => onOpen(m)}
          className="mt-4 rounded-full bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
        >
          {free || m.freePreview ? 'Посмотреть бесплатно' : `Купить за ${money.format(fromPrice)} ₽`}
        </button>
      </div>
    </div>
  )
}

export default function MarketplaceHome() {
  const [gateFor, setGateFor] = useState<MaterialItem | null>(null)
  const [account, setAccount] = useState({ email: '', password: '' })
  const [created, setCreated] = useState(false)

  const [category, setCategory] = useState<MaterialKind | 'all'>('all')
  const [directions, setDirections] = useState<Set<MarketplaceDirection>>(new Set())
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')

  function toggleDirection(id: MarketplaceDirection) {
    setDirections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isFiltering = category !== 'all' || directions.size > 0 || priceFrom !== '' || priceTo !== ''

  function resetFilters() {
    setCategory('all')
    setDirections(new Set())
    setPriceFrom('')
    setPriceTo('')
  }

  const filtered = useMemo(() => {
    const from = Number(priceFrom) || 0
    const to = Number(priceTo) || Infinity
    return materials.filter((m) => {
      if (category !== 'all' && m.kind !== category) return false
      if (directions.size > 0 && !m.direction.some((d) => directions.has(d))) return false
      if (m.price < from || m.price > to) return false
      return true
    })
  }, [category, directions, priceFrom, priceTo])

  function closeGate() {
    setGateFor(null)
    setCreated(false)
    setAccount({ email: '', password: '' })
  }

  return (
    <div>
      <PageHero
        eyebrow="Карьерный Юрист"
        title="Маркетплейс"
        description="Каталог полезных материалов для юридической карьеры: гайды, чек-листы, лонглисты, статьи и вебинары."
        prototype
      />

      {/* Личный кабинет — справа */}
      <div className="border-b border-ink/10 bg-white py-3">
        <div className="container-page flex justify-end">
          <Link
            to="/account"
            className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:text-ink"
          >
            <IconAccount />
            Личный кабинет
          </Link>
        </div>
      </div>

      <div className="container-page py-10">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          {/* Фильтры */}
          <aside className="space-y-6">
            <div className="rounded-2xl border border-ink/10 p-5">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">Категория</div>
              <div className="space-y-2 text-sm">
                {categoryOptions.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="category"
                      checked={category === c.id}
                      onChange={() => setCategory(c.id)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-ink/10 p-5">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">Направление</div>
              <div className="space-y-2 text-sm">
                {MARKETPLACE_DIRECTIONS.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={directions.has(d.id)}
                      onChange={() => toggleDirection(d.id)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

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
            <div className="mb-1 text-sm font-medium uppercase tracking-wide text-gold">Маркетплейс</div>
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="text-2xl font-semibold">Каталог материалов</h2>
              <span className="shrink-0 text-sm text-ink/50">{filtered.length} материалов</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((m) => <ProductCard key={m.id} m={m} onOpen={setGateFor} />)}
              {filtered.length === 0 && <p className="text-ink/50">По заданным фильтрам материалов не найдено.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Гейт создания аккаунта — при просмотре/покупке любого материала */}
      {gateFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGate()
          }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:p-8">
            {created ? (
              <div className="py-4 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                </div>
                <div className="font-semibold">Аккаунт создан</div>
                <p className="mt-2 text-sm text-ink/60">
                  «{gateFor.title}» сохранен в личном кабинете — там же будут храниться все купленные и открытые материалы.
                </p>
                <button type="button" onClick={closeGate} className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white">
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Создайте аккаунт</h3>
                  <button type="button" onClick={closeGate} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
                </div>
                <p className="mb-4 text-sm text-ink/60">
                  Чтобы открыть «{gateFor.title}», сохраните его в личном кабинете — там же будут все ваши материалы.
                </p>
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!account.email.trim()) return
                    setCreated(true)
                  }}
                >
                  <input
                    type="email"
                    required
                    placeholder="Почта"
                    value={account.email}
                    onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Пароль"
                    value={account.password}
                    onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90">
                    Создать аккаунт и продолжить
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
