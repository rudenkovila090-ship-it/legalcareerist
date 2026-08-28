import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
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

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}
function IconCoffee() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M7 3.5c-.6.8-.6 1.4 0 2.2M11 3.5c-.6.8-.6 1.4 0 2.2" />
    </svg>
  )
}
function IconStage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
      <path d="M3.5 19h17M5 19V9.5l7-5 7 5V19" />
      <path d="M9.5 19v-6h5v6" />
    </svg>
  )
}
function IconBolt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
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
      className="glass block w-64 shrink-0 snap-start overflow-hidden rounded-2xl"
    >
      <div className={`relative flex h-36 flex-col justify-between bg-gradient-to-br p-4 text-white ${posterTone[e.type]} ${past ? 'grayscale' : ''}`}>
        <div className="flex items-start justify-between">
          <Icon />
          {e.partner && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Партнер</span>
          )}
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
          {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        </div>
        {past && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 -rotate-12 rounded border-2 border-white/70 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
            Прошло
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold leading-snug">{e.title}</h3>
        <div className="mt-1.5 text-xs text-ink/50">{e.format === 'online' ? 'Онлайн' : e.city}</div>
        {past && e.sale ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {e.sale.bundle !== undefined && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-white">
                Запись + материалы {e.sale.bundle === 0 ? '· бесплатно' : `· ${money.format(e.sale.bundle)} ₽`}
              </span>
            )}
            {e.sale.bundle === undefined && e.sale.recording !== undefined && (
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink">Запись · {e.sale.recording === 0 ? 'бесплатно' : `${money.format(e.sale.recording)} ₽`}</span>
            )}
            {e.sale.materials !== undefined && e.sale.bundle === undefined && (
              <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink">Материалы · {money.format(e.sale.materials)} ₽</span>
            )}
          </div>
        ) : (
          <div className="mt-2 text-sm font-medium">{e.price === 0 ? 'Бесплатно' : `${money.format(e.price)} ₽`}</div>
        )}
      </div>
    </Link>
  )
}

function EventRow({ title, items }: { title: string; items: EventItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="py-8">
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

export default function EventsHome() {
  const open = events.filter((e) => e.status === 'open')
  const big = open.filter((e) => !e.partner && (e.type === 'conference' || e.type === 'intensive' || e.type === 'tour'))
  const webinars = open.filter((e) => !e.partner && e.type === 'webinar')
  const breakfasts = open.filter((e) => !e.partner && e.type === 'breakfast')
  const partners = open.filter((e) => e.partner)
  const past = events.filter((e) => e.status === 'completed')

  return (
    <div>
      <PageHero eyebrow="Мероприятия" title="Вебинары, бизнес-завтраки, интенсивы" description="Онлайн и офлайн события для карьерного роста в праве — листайте афиши в каждой категории." prototype />
      <div className="divide-y divide-ink/10">
        <EventRow title="Большие мероприятия" items={big} />
        <EventRow title="Вебинары" items={webinars} />
        <EventRow title="Бизнес-завтраки" items={breakfasts} />
        <EventRow title="Мероприятия наших партнеров" items={partners} />
        <EventRow title="Прошедшие" items={past} />
      </div>
      {events.length === 0 && <p className="container-page py-16 text-ink/50">Мероприятий пока нет.</p>}
    </div>
  )
}
