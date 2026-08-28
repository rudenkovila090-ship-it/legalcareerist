import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import SectionRail from '../../components/SectionRail'
import { events } from '../../data/events'
import type { EventItem } from '../../types'

const money = new Intl.NumberFormat('ru-RU')

// Цвет «афиши» — по типу мероприятия, чтобы ряды считывались с ходу даже
// без чтения текста (как цветовое кодирование жанров в афише кинотеатра).
const posterTone: Record<EventItem['type'], string> = {
  conference: 'from-ink to-[#1a2536]',
  webinar: 'from-gold to-ink',
  breakfast: 'from-gold-light to-gold',
  intensive: 'from-ink to-gold',
  tour: 'from-gold-light to-ink',
}

const eventTypeLabel: Record<EventItem['type'], string> = {
  conference: 'Ключевое мероприятие',
  webinar: 'Вебинар',
  breakfast: 'Бизнес-завтрак',
  intensive: 'Интенсив',
  tour: 'Экскурсия',
}

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}
function IconCoffee() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M7 3.5c-.6.8-.6 1.4 0 2.2M11 3.5c-.6.8-.6 1.4 0 2.2" />
    </svg>
  )
}
function IconStage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
      <path d="M3.5 19h17M5 19V9.5l7-5 7 5V19" />
      <path d="M9.5 19v-6h5v6" />
    </svg>
  )
}
function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9">
      <path d="M12.5 3L5 13.5h6l-1 7.5 7.5-10.5h-6l1-7.5z" />
    </svg>
  )
}
const posterIcon: Record<EventItem['type'], typeof IconMic> = {
  conference: IconStage,
  webinar: IconMic,
  breakfast: IconCoffee,
  intensive: IconBolt,
  tour: IconStage,
}

function EventPoster({ e }: { e: EventItem }) {
  const Icon = posterIcon[e.type]
  const date = new Date(e.dateTime)
  const past = e.status === 'completed'
  return (
    <Link
      to={`/events/${e.slug}`}
      className="glass block w-96 shrink-0 snap-start overflow-hidden rounded-2xl"
    >
      <div className={`relative flex h-[13.5rem] flex-col justify-between bg-gradient-to-br p-5 text-white ${posterTone[e.type]} ${past ? 'grayscale' : ''}`}>
        <div className="flex items-start justify-between">
          <Icon />
          {e.partner && (
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">Партнер</span>
          )}
        </div>
        <div className="text-sm font-semibold uppercase tracking-wide opacity-80">
          {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        </div>
        {past && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 -rotate-12 rounded border-2 border-white/70 px-3 py-1 text-sm font-bold uppercase tracking-wide">
            Прошло
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-gold">{eventTypeLabel[e.type]}</div>
        <h3 className="mt-1 text-lg font-semibold leading-snug">{e.title}</h3>
        <div className="mt-2 text-sm text-ink/50">{e.format === 'online' ? 'Онлайн' : e.city}</div>
        {past && e.sale ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {e.sale.bundle !== undefined && (
              <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white">
                Запись + материалы {e.sale.bundle === 0 ? '· бесплатно' : `· ${money.format(e.sale.bundle)} ₽`}
              </span>
            )}
            {e.sale.bundle === undefined && e.sale.recording !== undefined && (
              <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-medium text-ink">Запись · {e.sale.recording === 0 ? 'бесплатно' : `${money.format(e.sale.recording)} ₽`}</span>
            )}
            {e.sale.materials !== undefined && e.sale.bundle === undefined && (
              <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-medium text-ink">Материалы · {money.format(e.sale.materials)} ₽</span>
            )}
          </div>
        ) : (
          <div className="mt-3 text-base font-medium">{e.price === 0 ? 'Бесплатно' : `${money.format(e.price)} ₽`}</div>
        )}
      </div>
    </Link>
  )
}

function EventRow({ id, title, items }: { id: string; title: string; items: EventItem[] }) {
  if (items.length === 0) return null
  return (
    <section id={id} className="scroll-mt-24 py-8">
      <div className="container-page">
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      </div>
      <div className="container-page">
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-px-5">
          {items.map((e) => <EventPoster key={e.id} e={e} />)}
        </div>
      </div>
    </section>
  )
}

const railItems = [
  { id: 'big', label: 'Ключевые' },
  { id: 'webinars', label: 'Вебинары' },
  { id: 'breakfasts', label: 'Бизнес-завтраки' },
  { id: 'partners', label: 'Партнеры' },
  { id: 'past', label: 'Прошедшие' },
]

const eventTypeOptions: { id: EventItem['type'] | 'all'; label: string }[] = [
  { id: 'all', label: 'Вид мероприятия' },
  { id: 'conference', label: 'Ключевое мероприятие' },
  { id: 'webinar', label: 'Вебинар' },
  { id: 'breakfast', label: 'Бизнес-завтрак' },
  { id: 'intensive', label: 'Интенсив' },
  { id: 'tour', label: 'Экскурсия' },
]

const sortOptions = [
  { id: 'popular', label: 'Популярные' },
  { id: 'price_asc', label: 'Сначала дешевле' },
  { id: 'price_desc', label: 'Сначала дороже' },
] as const

export default function EventsHome() {
  const [typeFilter, setTypeFilter] = useState<EventItem['type'] | 'all'>('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [sort, setSort] = useState<(typeof sortOptions)[number]['id']>('popular')

  const cities = useMemo(
    () => Array.from(new Set(events.filter((e) => e.city).map((e) => e.city!))).sort(),
    [],
  )

  const isFiltering = typeFilter !== 'all' || cityFilter !== 'all' || formatFilter !== 'all' || sort !== 'popular'

  const filtered = useMemo(() => {
    const list = events.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (cityFilter !== 'all' && e.city !== cityFilter) return false
      if (formatFilter !== 'all' && e.format !== (formatFilter === 'online' ? 'online' : 'offline')) return false
      return true
    })
    if (sort === 'price_asc') return [...list].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') return [...list].sort((a, b) => b.price - a.price)
    return list
  }, [typeFilter, cityFilter, formatFilter, sort])

  const open = events.filter((e) => e.status === 'open')
  const big = open.filter((e) => !e.partner && (e.type === 'conference' || e.type === 'intensive' || e.type === 'tour'))
  const webinars = open.filter((e) => !e.partner && e.type === 'webinar')
  const breakfasts = open.filter((e) => !e.partner && e.type === 'breakfast')
  const partners = open.filter((e) => e.partner)
  const past = events.filter((e) => e.status === 'completed')

  return (
    <div>
      <SectionRail items={railItems} />
      <PageHero eyebrow="Мероприятия" title="Вебинары, бизнес-завтраки, интенсивы" description="Онлайн и офлайн события для карьерного роста в праве — листайте афиши в каждой категории или отфильтруйте." prototype />

      <div className="container-page py-8">
        <div className="glass flex flex-wrap items-center gap-3 rounded-xl p-4">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as EventItem['type'] | 'all')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
            {eventTypeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
            <option value="all">Город мероприятия</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value as 'all' | 'online' | 'offline')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
            <option value="all">Способ участия</option>
            <option value="online">Онлайн</option>
            <option value="offline">Офлайн</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as (typeof sortOptions)[number]['id'])} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
            {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          {isFiltering && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all')
                setCityFilter('all')
                setFormatFilter('all')
                setSort('popular')
              }}
              className="text-sm text-ink/50 hover:text-ink"
            >
              Сбросить
            </button>
          )}
          <div className="ml-auto text-sm text-ink/50">{filtered.length} мероприятий</div>
        </div>
      </div>

      {isFiltering ? (
        <div className="container-page pb-16">
          <div className="flex flex-wrap gap-4">
            {filtered.map((e) => <EventPoster key={e.id} e={e} />)}
            {filtered.length === 0 && <p className="text-ink/50">Мероприятий по фильтру не найдено.</p>}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-ink/10">
          <EventRow id="big" title="Ключевые мероприятия" items={big} />
          <EventRow id="webinars" title="Вебинары" items={webinars} />
          <EventRow id="breakfasts" title="Бизнес-завтраки" items={breakfasts} />
          <EventRow id="partners" title="Мероприятия наших партнеров" items={partners} />
          <EventRow id="past" title="Прошедшие" items={past} />
        </div>
      )}
      {events.length === 0 && <p className="container-page py-16 text-ink/50">Мероприятий пока нет.</p>}
    </div>
  )
}
