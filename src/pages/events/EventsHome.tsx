import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { events } from '../../data/events'
import { submitLead, nextTicketNumber } from '../../lib/leads'
import PhoneInput from '../../components/PhoneInput'
import LeadSuccessCard from '../../components/LeadSuccessCard'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import EventsFooter from './EventsFooter'
import { INDUSTRIES, type EventItem, type Industry, type AudienceLevel } from '../../types'
import { SHOW_CREATE_EVENT, SHOW_EVENTS_ACCOUNT } from '../../lib/featureFlags'

const money = new Intl.NumberFormat('ru-RU')

// Цвет «афиши» — по типу мероприятия, чтобы карточки считывались с ходу даже
// без чтения текста (как цветовое кодирование жанров в афише кинотеатра).
const posterTone: Record<EventItem['type'], string> = {
  conference: 'from-ink to-[#1a2536]',
  webinar: 'from-gold to-ink',
  breakfast: 'from-gold-light to-gold',
  intensive: 'from-ink to-gold',
  tour: 'from-gold-light to-ink',
  internship: 'from-gold-light via-gold to-ink',
}

const eventTypeLabel: Record<EventItem['type'], string> = {
  conference: 'Ключевое мероприятие',
  webinar: 'Вебинар',
  breakfast: 'Бизнес-завтрак',
  intensive: 'Интенсив',
  tour: 'Экскурсия',
  internship: 'Стажировка',
}

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  )
}
function IconCoffee() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M7 3.5c-.6.8-.6 1.4 0 2.2M11 3.5c-.6.8-.6 1.4 0 2.2" />
    </svg>
  )
}
function IconStage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
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
function IconCap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M12 5 3 9.5 12 14l9-4.5L12 5Z" />
      <path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5" />
      <path d="M20 9.5V15" />
    </svg>
  )
}
const posterIcon: Record<EventItem['type'], typeof IconMic> = {
  conference: IconStage,
  webinar: IconMic,
  breakfast: IconCoffee,
  intensive: IconBolt,
  tour: IconStage,
  internship: IconCap,
}

function IconSearch({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </svg>
  )
}
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function IconAccountCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 18.5c1.2-2.3 3.4-3.5 6-3.5s4.8 1.2 6 3.5" />
    </svg>
  )
}
function IconHandshake() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3.5 12.5l3.7-3.7a2 2 0 0 1 2.83 0l1.47 1.47M20.5 12.5l-3.7-3.7a2 2 0 0 0-2.83 0L12.5 10.3" />
      <path d="M7.2 10.8l-3.7 3.7 3 3a2 2 0 0 0 2.83 0l.5-.5M16.8 10.8l3.7 3.7-3 3a2 2 0 0 1-2.83 0l-3.37-3.37a1.5 1.5 0 0 1 0-2.12v0a1.5 1.5 0 0 1 2.12 0l1.25 1.25" />
    </svg>
  )
}

const eventTabs = [
  { id: 'poster', label: 'Афиша', icon: IconGrid },
  { id: 'create', label: 'Создать свое событие', icon: IconPlus },
  { id: 'order', label: 'Заказать мероприятие', icon: IconCart },
  { id: 'account', label: 'Личный кабинет', icon: IconAccountCircle },
] as const

const eventTypeOptions: { id: EventItem['type']; label: string }[] = [
  { id: 'conference', label: 'Ключевые мероприятия' },
  { id: 'webinar', label: 'Вебинары' },
  { id: 'breakfast', label: 'Бизнес-завтраки' },
  { id: 'intensive', label: 'Интенсивы' },
  { id: 'tour', label: 'Экскурсии' },
  { id: 'internship', label: 'Стажировки' },
]

const audienceLabel: Record<AudienceLevel, string> = {
  student: 'Студентам',
  young_lawyer: 'Молодым юристам',
  practicing: 'Практикующим юристам',
}

// Подборки — витрина поверх общего каталога (запрос: «Стажировки»,
// «Конференции», «Бесплатные мероприятия», «Для студентов», «Юридические
// события месяца»). Каждая подборка — это просто предустановленная
// комбинация фильтров ниже, а не отдельный список данных.
type CollectionId = 'internship' | 'conference' | 'free' | 'students' | 'month'
const collections: { id: CollectionId; label: string; description: string }[] = [
  { id: 'internship', label: 'Стажировки', description: 'Программы для студентов и начинающих юристов' },
  { id: 'conference', label: 'Конференции', description: 'Форумы и ключевые отраслевые события' },
  { id: 'free', label: 'Бесплатные мероприятия', description: 'Участие без оплаты' },
  { id: 'students', label: 'Для студентов', description: 'Подходит студентам юрфаков' },
  { id: 'month', label: 'Юридические события месяца', description: 'Отбор редакции — не пропустите' },
]

function matchesCollection(e: EventItem, id: CollectionId, thisMonth: number, thisYear: number) {
  if (id === 'internship') return e.type === 'internship'
  if (id === 'conference') return e.type === 'conference'
  if (id === 'free') return e.price === 0
  if (id === 'students') return e.audienceLevel.includes('student')
  if (id === 'month') {
    const d = new Date(e.dateTime)
    return Boolean(e.featured) && d.getMonth() === thisMonth && d.getFullYear() === thisYear
  }
  return true
}

function EventCard({ e }: { e: EventItem }) {
  const Icon = posterIcon[e.type]
  const date = new Date(e.dateTime)
  const past = e.status === 'completed'
  return (
    <Link to={`/events/${e.slug}`} className="glass block overflow-hidden rounded-2xl">
      <div className={`relative flex h-40 flex-col justify-between bg-gradient-to-br p-5 text-white ${posterTone[e.type]} ${past ? 'grayscale' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <Icon />
          <div className="flex flex-wrap justify-end gap-1.5">
            {e.international && (
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">Международное</span>
            )}
            {e.partner && (
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">Партнер</span>
            )}
          </div>
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

        <div className="mt-3 space-y-1 text-sm text-ink/60">
          <div>{e.format === 'online' ? 'Онлайн' : e.city}</div>
          <div>{date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}</div>
          <div>{e.location}</div>
        </div>

        {past && e.sale ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {e.sale.bundle !== undefined && (
              <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                Запись + материалы {e.sale.bundle === 0 ? '· бесплатно' : `· ${money.format(e.sale.bundle)} ₽`}
              </span>
            )}
            {e.sale.bundle === undefined && e.sale.recording !== undefined && (
              <span className="rounded-full bg-ink/10 px-3 py-1.5 text-xs font-semibold text-ink">Запись · {e.sale.recording === 0 ? 'бесплатно' : `${money.format(e.sale.recording)} ₽`}</span>
            )}
            {e.sale.materials !== undefined && e.sale.bundle === undefined && (
              <span className="rounded-full bg-ink/10 px-3 py-1.5 text-xs font-semibold text-ink">Материалы · {money.format(e.sale.materials)} ₽</span>
            )}
          </div>
        ) : (
          <div className="mt-3 inline-block rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">
            {e.price === 0 ? 'Бесплатно' : `${money.format(e.price)} ₽`}
          </div>
        )}
      </div>
    </Link>
  )
}

function IconCart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3.5 4.5h2l2.3 11a1.8 1.8 0 0 0 1.8 1.5h7a1.8 1.8 0 0 0 1.77-1.47L20 9H6.5" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  )
}


const validTabIds = new Set([...eventTabs.map((t) => t.id), 'partner', 'support'])

type TabId = (typeof eventTabs)[number]['id'] | 'partner' | 'support'

export default function EventsHome() {
  useDocumentTitle('Мероприятия')
  // 'partner' и 'support' не выведены отдельными кнопками в подменю сверху
  // (eventTabs) — до них ведут только ссылки в едином подвале (EventsFooter),
  // в том числе с других страниц (например, с детальной страницы
  // мероприятия). Вкладка хранится в ?tab= в адресе (а не в отдельном
  // useState) — так переключение работает одинаково что кликом по кнопке
  // здесь, что переходом по ссылке из подвала на другой странице.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: TabId = tabParam && validTabIds.has(tabParam) ? (tabParam as TabId) : 'poster'

  function setTab(next: TabId) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('tab', next)
      return p
    })
  }

  const [collection, setCollection] = useState<CollectionId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | EventItem['type']>('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [industryFilter, setIndustryFilter] = useState<'all' | Industry>('all')
  const [audienceFilter, setAudienceFilter] = useState<'all' | AudienceLevel>('all')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [regionFilter, setRegionFilter] = useState<'all' | 'ru' | 'intl'>('all')
  const [sort, setSort] = useState<'date_asc' | 'popular' | 'price_asc' | 'price_desc'>('date_asc')

  const cities = useMemo(
    () => Array.from(new Set(events.filter((e) => e.city).map((e) => e.city!))).sort(),
    [],
  )
  const hasInternational = useMemo(() => events.some((e) => e.international), [])

  const now = useMemo(() => new Date(), [])
  const searchNorm = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    const list = events.filter((e) => {
      if (collection !== 'all' && !matchesCollection(e, collection, now.getMonth(), now.getFullYear())) return false
      if (typeFilter !== 'all' && e.type !== typeFilter) return false
      if (cityFilter !== 'all' && e.city !== cityFilter) return false
      if (formatFilter !== 'all' && e.format !== formatFilter) return false
      if (industryFilter !== 'all' && !e.industry.includes(industryFilter)) return false
      if (audienceFilter !== 'all' && !e.audienceLevel.includes(audienceFilter)) return false
      if (priceFilter === 'free' && e.price !== 0) return false
      if (priceFilter === 'paid' && e.price === 0) return false
      if (regionFilter === 'ru' && e.international) return false
      if (regionFilter === 'intl' && !e.international) return false
      if (searchNorm) {
        const haystack = [e.title, e.city, e.location, e.partner, e.description].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(searchNorm)) return false
      }
      return true
    })
    if (sort === 'price_asc') return [...list].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') return [...list].sort((a, b) => b.price - a.price)
    if (sort === 'date_asc') return [...list].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime())
    return [...list].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
  }, [collection, typeFilter, cityFilter, formatFilter, industryFilter, audienceFilter, priceFilter, regionFilter, sort, searchNorm, now])

  const isFiltering =
    collection !== 'all' || typeFilter !== 'all' || cityFilter !== 'all' || formatFilter !== 'all' ||
    industryFilter !== 'all' || audienceFilter !== 'all' || priceFilter !== 'all' || regionFilter !== 'all' ||
    sort !== 'date_asc' || searchNorm !== ''

  function resetFilters() {
    setCollection('all')
    setSearch('')
    setTypeFilter('all')
    setCityFilter('all')
    setFormatFilter('all')
    setIndustryFilter('all')
    setAudienceFilter('all')
    setPriceFilter('all')
    setRegionFilter('all')
    setSort('date_asc')
  }

  function toggleCollection(id: CollectionId) {
    setCollection((prev) => (prev === id ? 'all' : id))
  }

  // «Создать свое событие» — лид-заявка организатора.
  const [eventForm, setEventForm] = useState({ fio: '', phone: '', email: '', telegram: '', about: '' })
  const [eventSent, setEventSent] = useState(false)

  function handleEventSubmit(e: FormEvent) {
    e.preventDefault()
    if (!eventForm.fio.trim() || (!eventForm.phone.trim() && !eventForm.email.trim())) return
    submitLead({
      sourceBlock: 'events',
      formType: 'event_submission',
      name: eventForm.fio,
      contact: [eventForm.phone, eventForm.email, eventForm.telegram].filter(Boolean).join(' / '),
      phone: eventForm.phone || undefined,
      email: eventForm.email || undefined,
      telegram: eventForm.telegram || undefined,
      interest: eventForm.about ? [eventForm.about] : [],
    })
    setEventSent(true)
  }

  // «Заказать мероприятие» — лид-заявка на подбор/организацию мероприятия под запрос.
  const [orderForm, setOrderForm] = useState({ fio: '', phone: '', email: '', telegram: '', about: '' })
  const [orderSent, setOrderSent] = useState(false)

  function handleOrderSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orderForm.fio.trim() || (!orderForm.phone.trim() && !orderForm.email.trim())) return
    submitLead({
      sourceBlock: 'events',
      formType: 'event_order',
      name: orderForm.fio,
      contact: [orderForm.phone, orderForm.email, orderForm.telegram].filter(Boolean).join(' / '),
      phone: orderForm.phone || undefined,
      email: orderForm.email || undefined,
      telegram: orderForm.telegram || undefined,
      interest: orderForm.about ? [orderForm.about] : [],
    })
    setOrderSent(true)
  }

  // «Стать партнером» — лид-заявка на партнерство (общая, не по конкретному
  // мероприятию — для этого есть отдельная форма на странице мероприятия).
  const [partnerForm, setPartnerForm] = useState({ company: '', fio: '', phone: '', email: '', telegram: '' })
  const [partnerSent, setPartnerSent] = useState(false)

  function handlePartnerSubmit(e: FormEvent) {
    e.preventDefault()
    if (!partnerForm.fio.trim() || !partnerForm.company.trim() || (!partnerForm.phone.trim() && !partnerForm.email.trim())) return
    submitLead({
      sourceBlock: 'events',
      formType: 'partner_application',
      name: partnerForm.fio,
      contact: [partnerForm.phone, partnerForm.email, partnerForm.telegram].filter(Boolean).join(' / '),
      phone: partnerForm.phone || undefined,
      email: partnerForm.email || undefined,
      telegram: partnerForm.telegram || undefined,
      interest: [partnerForm.company],
    })
    setPartnerSent(true)
  }

  // «Написать нам» (Помощь → Поддержка) — та же форма лида, что и везде
  // (ФИО, телефон, почта, Telegram), плюс отдельное поле с вопросом.
  const [supportForm, setSupportForm] = useState({ fio: '', phone: '', email: '', telegram: '', question: '' })
  const [supportTicket, setSupportTicket] = useState<string | null>(null)
  const [supportMissing, setSupportMissing] = useState(false)

  async function handleSupportSubmit(e: FormEvent) {
    e.preventDefault()
    setSupportMissing(false)
    if (!supportForm.fio.trim() || !supportForm.phone.trim() || !supportForm.question.trim()) {
      setSupportMissing(true)
      return
    }
    const ticketNumber = await nextTicketNumber()
    submitLead({
      sourceBlock: 'events',
      formType: 'support_request',
      name: supportForm.fio,
      contact: [supportForm.phone, supportForm.email, supportForm.telegram].filter(Boolean).join(' / '),
      phone: supportForm.phone || undefined,
      email: supportForm.email || undefined,
      telegram: supportForm.telegram || undefined,
      ticketNumber,
      interest: [`Вопрос: ${supportForm.question}`],
    })
    setSupportTicket(ticketNumber)
  }

  return (
    <div>
      {/* Подменю раздела — Афиша / Создать свое событие / Заказать мероприятие / Личный кабинет.
          top-16 — сразу под шапкой сайта (h-16), как и на страницах /kadry. */}
      <div className="sticky top-16 z-20 border-b border-ink/10 bg-white/95 py-4 backdrop-blur-xl">
        <div className="container-page">
          <div className="flex flex-wrap justify-end gap-3">
            {eventTabs.filter((t) =>
              (t.id !== 'create' || SHOW_CREATE_EVENT) && (t.id !== 'account' || SHOW_EVENTS_ACCOUNT),
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                  tab === t.id ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
                }`}
              >
                <t.icon />
                {t.label}
              </button>
            ))}
            {/* Реальной формы партнёрства из этого меню пока нет (форма есть
                только в подвале/на странице мероприятия) — кнопка неактивна,
                текст подсказки виден по наведению. */}
            <button
              type="button"
              disabled
              title="Временно недоступно. В разработке."
              className="flex cursor-not-allowed items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-semibold text-ink/30"
            >
              <IconHandshake />
              Стать партнером мероприятия
            </button>
          </div>
        </div>
      </div>

      {tab === 'poster' && (
        <>
          {/* Умный поиск — по названию, городу, месту, организатору. */}
          <section className="container-page pt-8">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию, городу или дате"
                className="w-full rounded-full border border-ink/15 py-3 pl-11 pr-4 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
            </div>
          </section>

          {/* Подборки — предустановленные фильтры-ярлыки поверх общего каталога. */}
          <section className="container-page pt-6">
            <h2 className="mb-3 text-lg font-semibold">Подборки</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {collections.map((c) => {
                const active = collection === c.id
                const count = events.filter((e) => matchesCollection(e, c.id, now.getMonth(), now.getFullYear())).length
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCollection(c.id)}
                    className={`rounded-xl p-4 text-left transition-colors ${active ? 'bg-ink text-white' : 'glass hover:bg-ink/[0.03]'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{c.label}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-white/20' : 'bg-ink/[0.06] text-ink/60'}`}>{count}</span>
                    </div>
                    <div className={`mt-1 text-xs ${active ? 'text-white/70' : 'text-ink/50'}`}>{c.description}</div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="container-page pt-6 pb-8">
            <div className="glass flex flex-wrap items-center gap-3 rounded-xl p-4">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | EventItem['type'])} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Тип мероприятия</option>
                {eventTypeOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
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
              <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value as 'all' | Industry)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Направление права</option>
                {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
              <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value as 'all' | AudienceLevel)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Для кого</option>
                {(Object.entries(audienceLabel) as [AudienceLevel, string][]).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value as 'all' | 'free' | 'paid')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Стоимость</option>
                <option value="free">Бесплатные</option>
                <option value="paid">Платные</option>
              </select>
              {hasInternational && (
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value as 'all' | 'ru' | 'intl')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                  <option value="all">РФ и международные</option>
                  <option value="ru">Российские</option>
                  <option value="intl">Международные</option>
                </select>
              )}
              <select value={sort} onChange={(e) => setSort(e.target.value as 'date_asc' | 'popular' | 'price_asc' | 'price_desc')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="date_asc">Ближайшие даты</option>
                <option value="popular">Популярные</option>
                <option value="price_asc">Сначала дешевле</option>
                <option value="price_desc">Сначала дороже</option>
              </select>
              {isFiltering && (
                <button type="button" onClick={resetFilters} className="text-sm text-ink/50 hover:text-ink">
                  Сбросить
                </button>
              )}
              <div className="ml-auto text-sm text-ink/50">{filtered.length} мероприятий</div>
            </div>
          </section>

          {/* Все события — единый список */}
          <section id="all-events" className="container-page pb-16">
            <h2 className="mb-4 text-xl font-semibold">Все события</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => <EventCard key={e.id} e={e} />)}
              {filtered.length === 0 && (
                <p className="text-ink/50">
                  Мероприятий по фильтру не найдено.{' '}
                  <button type="button" onClick={resetFilters} className="font-medium text-ink underline hover:no-underline">Сбросить фильтры</button>
                </p>
              )}
            </div>
          </section>

          {/* Организаторам — «Стать партнером мероприятия» перенесена в
              подменю сверху (неактивная кнопка рядом с Афишей и Заказать
              мероприятие), здесь остается только карточка создания события. */}
          {SHOW_CREATE_EVENT && (
            <section className="border-t border-ink/10 bg-white py-12">
              <div className="container-page">
                <button type="button" onClick={() => setTab('create')} className="glass mx-auto block max-w-sm rounded-2xl p-6 text-center">
                  <h3 className="text-lg font-semibold">Разместить свое мероприятие</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-ink/60">
                    Временно недоступно. В разработке.
                  </p>
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'create' && (
        <section className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Создать свое событие</div>
          <h2 className="mb-6 text-2xl font-semibold">Расскажите о своем мероприятии</h2>

          <div className="mx-auto max-w-xl">
            {eventSent ? (
              <LeadSuccessCard description="Мы свяжемся с вами, чтобы обсудить детали размещения." />
            ) : (
              <form onSubmit={handleEventSubmit} className="glass grid gap-3 rounded-2xl p-6">
                <input
                  value={eventForm.fio}
                  onChange={(e) => setEventForm((f) => ({ ...f, fio: e.target.value }))}
                  placeholder="ФИО"
                  required
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <PhoneInput
                    value={eventForm.phone}
                    onChange={(value) => setEventForm((f) => ({ ...f, phone: value }))}
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    type="email"
                    value={eventForm.email}
                    onChange={(e) => setEventForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                <input
                  value={eventForm.telegram}
                  onChange={(e) => setEventForm((f) => ({ ...f, telegram: e.target.value }))}
                  placeholder="Telegram"
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <textarea
                  value={eventForm.about}
                  onChange={(e) => setEventForm((f) => ({ ...f, about: e.target.value }))}
                  placeholder="Название и описание мероприятия"
                  rows={4}
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <button type="submit" className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                  Отправить заявку
                </button>
                <p className="text-xs text-ink/40">Нажимая «Отправить заявку», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </section>
      )}

      {tab === 'order' && (
        <section className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Заказать мероприятие</div>
          <h2 className="mb-6 text-2xl font-semibold">Подберем или организуем мероприятие под ваш запрос</h2>

          <div className="mx-auto max-w-xl">
            {orderSent ? (
              <LeadSuccessCard description="Мы свяжемся с вами, чтобы обсудить детали." />
            ) : (
              <form onSubmit={handleOrderSubmit} className="glass grid gap-3 rounded-2xl p-6">
                <input
                  value={orderForm.fio}
                  onChange={(e) => setOrderForm((f) => ({ ...f, fio: e.target.value }))}
                  placeholder="ФИО"
                  required
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <PhoneInput
                    value={orderForm.phone}
                    onChange={(value) => setOrderForm((f) => ({ ...f, phone: value }))}
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    type="email"
                    value={orderForm.email}
                    onChange={(e) => setOrderForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                <input
                  value={orderForm.telegram}
                  onChange={(e) => setOrderForm((f) => ({ ...f, telegram: e.target.value }))}
                  placeholder="Telegram"
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <textarea
                  value={orderForm.about}
                  onChange={(e) => setOrderForm((f) => ({ ...f, about: e.target.value }))}
                  placeholder="Какое мероприятие нужно"
                  rows={4}
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <button type="submit" className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                  Отправить заявку
                </button>
                <p className="text-xs text-ink/40">Нажимая «Отправить заявку», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </section>
      )}

      {tab === 'partner' && (
        <section className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Партнерам</div>
          <h2 className="mb-6 text-2xl font-semibold">Стать партнером мероприятий «Карьерного юриста»</h2>

          <div className="mx-auto max-w-xl">
            {partnerSent ? (
              <LeadSuccessCard description="Мы свяжемся с вами, чтобы обсудить формат партнерства." />
            ) : (
              <form onSubmit={handlePartnerSubmit} className="glass grid gap-3 rounded-2xl p-6">
                <input
                  value={partnerForm.fio}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, fio: e.target.value }))}
                  placeholder="ФИО"
                  required
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <input
                  value={partnerForm.company}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Компания"
                  required
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <PhoneInput
                    value={partnerForm.phone}
                    onChange={(value) => setPartnerForm((f) => ({ ...f, phone: value }))}
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    type="email"
                    value={partnerForm.email}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                <input
                  value={partnerForm.telegram}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, telegram: e.target.value }))}
                  placeholder="Telegram"
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <button type="submit" className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                  Отправить заявку
                </button>
                <p className="text-xs text-ink/40">Нажимая «Отправить заявку», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </section>
      )}

      {tab === 'support' && (
        <section className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Поддержка</div>
          <h2 className="mb-6 text-2xl font-semibold">Написать нам</h2>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="glass rounded-xl p-5">
                <div className="text-sm text-ink/50">Email</div>
                <div className="font-medium">info@legalcareerist.ru</div>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="text-sm text-ink/50">Телефон</div>
                <div className="font-medium">+7 932 262 13 44</div>
              </div>
              <div className="glass rounded-xl p-5">
                <div className="text-sm text-ink/50">Telegram</div>
                <div className="font-medium">@legalcareerist_support</div>
              </div>
            </div>

            {supportTicket ? (
              <LeadSuccessCard ticket={supportTicket} description="Мы свяжемся с вами в ближайшее время." />
            ) : (
              <form onSubmit={handleSupportSubmit} className="glass rounded-xl p-6">
                <div className="font-semibold">Задать вопрос</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    value={supportForm.fio}
                    onChange={(e) => setSupportForm((f) => ({ ...f, fio: e.target.value }))}
                    placeholder="ФИО"
                    required
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                  />
                  <PhoneInput
                    value={supportForm.phone}
                    onChange={(value) => setSupportForm((f) => ({ ...f, phone: value }))}
                    required
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    type="email"
                    value={supportForm.email}
                    onChange={(e) => setSupportForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    value={supportForm.telegram}
                    onChange={(e) => setSupportForm((f) => ({ ...f, telegram: e.target.value }))}
                    placeholder="Telegram"
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                <textarea
                  value={supportForm.question}
                  onChange={(e) => setSupportForm((f) => ({ ...f, question: e.target.value }))}
                  placeholder="Вопрос"
                  required
                  rows={4}
                  className="mt-3 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                />

                {supportMissing && (
                  <p className="mt-3 text-sm text-red-600">Заполните ФИО, телефон и вопрос.</p>
                )}

                <button
                  type="submit"
                  className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  Отправить
                </button>
                <p className="mt-2 text-center text-xs text-ink/40">Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </section>
      )}

      {tab === 'account' && (
        <section className="container-page py-12">
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-sm font-medium uppercase tracking-wide text-gold">Личный кабинет</div>
            <h2 className="mt-2 text-2xl font-semibold">Билеты, заявки и записи мероприятий в одном месте</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">
              Сквозной личный кабинет для участников и организаторов — демо-каркас раздела.
            </p>
            <Link to="/account" className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
              Перейти в личный кабинет
            </Link>
          </div>
        </section>
      )}

      <EventsFooter />
    </div>
  )
}
