import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { events } from '../../data/events'
import { submitLead } from '../../lib/leads'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import type { EventItem } from '../../types'

const money = new Intl.NumberFormat('ru-RU')

// Цвет «афиши» — по типу мероприятия, чтобы карточки считывались с ходу даже
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
const posterIcon: Record<EventItem['type'], typeof IconMic> = {
  conference: IconStage,
  webinar: IconMic,
  breakfast: IconCoffee,
  intensive: IconBolt,
  tour: IconStage,
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

const eventTabs = [
  { id: 'poster', label: 'Афиша', icon: IconGrid },
  { id: 'create', label: 'Создать свое событие', icon: IconPlus },
  { id: 'order', label: 'Заказать мероприятие', icon: IconCart },
  { id: 'account', label: 'Личный кабинет', icon: IconAccountCircle },
] as const

// Категории на одной строке — прямоугольная ячейка-иконка и подпись справа
// от нее, ведут себя как быстрый фильтр по афише ниже.
const quickCategories = [
  { id: 'key', label: 'Ключевые мероприятия', icon: IconStage },
  { id: 'breakfast', label: 'Бизнес-завтраки', icon: IconCoffee },
  { id: 'webinar', label: 'Вебинары', icon: IconMic },
] as const
type QuickCategory = (typeof quickCategories)[number]['id'] | 'all'

function EventCard({ e }: { e: EventItem }) {
  const Icon = posterIcon[e.type]
  const date = new Date(e.dateTime)
  const past = e.status === 'completed'
  return (
    <Link to={`/events/${e.slug}`} className="glass block overflow-hidden rounded-2xl">
      <div className={`relative flex h-40 flex-col justify-between bg-gradient-to-br p-5 text-white ${posterTone[e.type]} ${past ? 'grayscale' : ''}`}>
        <div className="flex items-start justify-between">
          <Icon />
          {e.partner && (
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">Партнер</span>
          )}
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
          <div>{date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
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

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M21.5 3.5 2.7 11.2c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.9.9.9.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.7-.8L23.9 4.9c.3-1.3-.5-1.9-1.4-1.4z" />
    </svg>
  )
}
function IconVk() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M13.2 17.3c-5.4 0-8.6-3.7-8.7-9.9h2.8c.1 4.5 2.1 6.4 3.6 6.8v-6.8h2.6v3.9c1.5-.2 3.1-2 3.6-3.9h2.6c-.4 2.3-2.1 4.1-3.3 4.9 1.2.6 3.1 2.2 3.9 4.9h-2.9c-.6-1.8-2-3.2-3.9-3.4v3.4z" />
    </svg>
  )
}
function IconYoutube() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M22 12s0-3-.4-4.4a2.9 2.9 0 0 0-2-2C17.9 5 12 5 12 5s-5.9 0-7.6.6a2.9 2.9 0 0 0-2 2C2 9 2 12 2 12s0 3 .4 4.4a2.9 2.9 0 0 0 2 2C6.1 19 12 19 12 19s5.9 0 7.6-.6a2.9 2.9 0 0 0 2-2C22 15 22 12 22 12z" opacity=".18" />
      <path d="M10 15.2V8.8L15.8 12z" />
    </svg>
  )
}
function IconTiktok() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M16.5 2h-3v13.6a2.6 2.6 0 1 1-2-2.5v-3a5.6 5.6 0 1 0 5 5.6V9c1 .7 2.2 1.1 3.5 1.1V7a3.5 3.5 0 0 1-3.5-3.5z" />
    </svg>
  )
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M13.6 10.6 20.4 3h-2l-5.8 6.6L7.9 3H2.5l6.9 10.1L2.5 21h2l6.2-7 5 7h5.4l-7.2-10.4h-.3zm-2.2 2.5-.7-1L5 4.7h2.3l4.6 6.6.7 1 6 8.6h-2.3l-4.9-7z" />
    </svg>
  )
}
function IconLinkedin() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M4.5 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 9.5h3v11H3v-11zM9.5 9.5h2.9v1.5h.04c.4-.76 1.4-1.56 2.9-1.56 3.1 0 3.66 2.04 3.66 4.7v6.36h-3v-5.64c0-1.34-.03-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.97v5.73h-3v-11z" />
    </svg>
  )
}
// Закон.ру, Дзен, Авито — площадки без стандартной line-иконки в проекте,
// монограмма в кружке (тот же прием, что и у аватаров без фото — см.
// initials в CommunityHome/EventDetail), а не попытка воспроизвести
// точный логотип.
function IconMonogram({ text }: { text: string }) {
  return <span className="text-[11px] font-bold leading-none">{text}</span>
}

export default function EventsHome() {
  useDocumentTitle('Мероприятия')
  // 'partner' и 'support' не выведены отдельными кнопками в подменю сверху
  // (eventTabs) — до них ведут только ссылки в подвале страницы.
  const [tab, setTab] = useState<(typeof eventTabs)[number]['id'] | 'partner' | 'support'>('poster')

  const [quick, setQuick] = useState<QuickCategory>('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [sort, setSort] = useState<'popular' | 'price_asc' | 'price_desc'>('popular')

  const cities = useMemo(
    () => Array.from(new Set(events.filter((e) => e.city).map((e) => e.city!))).sort(),
    [],
  )

  const filtered = useMemo(() => {
    const list = events.filter((e) => {
      if (quick === 'key' && !(e.type === 'conference' || e.type === 'intensive' || e.type === 'tour')) return false
      if (quick === 'breakfast' && e.type !== 'breakfast') return false
      if (quick === 'webinar' && e.type !== 'webinar') return false
      if (cityFilter !== 'all' && e.city !== cityFilter) return false
      if (formatFilter !== 'all' && e.format !== formatFilter) return false
      return true
    })
    if (sort === 'price_asc') return [...list].sort((a, b) => a.price - b.price)
    if (sort === 'price_desc') return [...list].sort((a, b) => b.price - a.price)
    return [...list].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
  }, [quick, cityFilter, formatFilter, sort])

  const isFiltering = quick !== 'all' || cityFilter !== 'all' || formatFilter !== 'all' || sort !== 'popular'

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
      interest: [partnerForm.company],
    })
    setPartnerSent(true)
  }

  // «Написать нам» (Помощь → Поддержка) — та же форма лида, что и везде
  // (ФИО, телефон, почта, Telegram), плюс отдельное поле с вопросом.
  const [supportForm, setSupportForm] = useState({ fio: '', phone: '', email: '', telegram: '', question: '' })
  const [supportSent, setSupportSent] = useState(false)

  function handleSupportSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supportForm.fio.trim() || (!supportForm.phone.trim() && !supportForm.email.trim())) return
    submitLead({
      sourceBlock: 'events',
      formType: 'support_request',
      name: supportForm.fio,
      contact: [supportForm.phone, supportForm.email, supportForm.telegram].filter(Boolean).join(' / '),
      interest: supportForm.question ? [supportForm.question] : [],
    })
    setSupportSent(true)
  }

  return (
    <div>
      {/* Подменю раздела — Афиша / Создать свое событие / Заказать мероприятие / Личный кабинет.
          top-16 — сразу под шапкой сайта (h-16), как и на страницах /kadry. */}
      <div className="sticky top-16 z-20 border-b border-ink/10 bg-white/95 py-4 backdrop-blur-xl">
        <div className="container-page">
          <div className="flex flex-wrap justify-end gap-3">
            {eventTabs.map((t) => (
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
          </div>
        </div>
      </div>

      {tab === 'poster' && (
        <>
          <section className="container-page pt-8 pb-8">
            <div className="glass flex flex-wrap items-center gap-3 rounded-xl p-4">
              <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Город мероприятия</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value as 'all' | 'online' | 'offline')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Способ участия</option>
                <option value="online">Онлайн</option>
                <option value="offline">Офлайн</option>
              </select>
              <select value={quick} onChange={(e) => setQuick(e.target.value as QuickCategory)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="all">Тип мероприятия</option>
                {quickCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as 'popular' | 'price_asc' | 'price_desc')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                <option value="popular">Популярные</option>
                <option value="price_asc">Сначала дешевле</option>
                <option value="price_desc">Сначала дороже</option>
              </select>
              {isFiltering && (
                <button
                  type="button"
                  onClick={() => {
                    setQuick('all')
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
          </section>

          {/* Все события — единый список */}
          <section id="all-events" className="container-page pb-16">
            <h2 className="mb-4 text-xl font-semibold">Все события</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => <EventCard key={e.id} e={e} />)}
              {filtered.length === 0 && <p className="text-ink/50">Мероприятий по фильтру не найдено.</p>}
            </div>
          </section>

          {/* Партнерам и организаторам */}
          <section className="border-t border-ink/10 bg-white py-12">
            <div className="container-page grid gap-4 sm:grid-cols-2">
              <div className="glass rounded-2xl p-6 text-center">
                <h3 className="text-lg font-semibold">Стать партнером мероприятия</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink/60">
                  Условия партнерства — раздел в разработке, наполнение уточняется.
                </p>
              </div>
              <button type="button" onClick={() => setTab('create')} className="glass rounded-2xl p-6 text-center">
                <h3 className="text-lg font-semibold">Разместить свое мероприятие</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink/60">
                  Форма подачи мероприятия — раздел в разработке, наполнение уточняется.
                </p>
              </button>
            </div>
          </section>
        </>
      )}

      {tab === 'create' && (
        <section className="container-page py-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Создать свое событие</div>
          <h2 className="mb-6 text-2xl font-semibold">Расскажите о своем мероприятии</h2>

          <div className="mx-auto max-w-xl">
            {eventSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm">Мы свяжемся с вами, чтобы обсудить детали размещения.</p>
              </div>
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
                  <input
                    type="tel"
                    value={eventForm.phone}
                    onChange={(e) => setEventForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm">Мы свяжемся с вами, чтобы обсудить детали.</p>
              </div>
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
                  <input
                    type="tel"
                    value={orderForm.phone}
                    onChange={(e) => setOrderForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm">Мы свяжемся с вами, чтобы обсудить формат партнерства.</p>
              </div>
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
                  <input
                    type="tel"
                    value={partnerForm.phone}
                    onChange={(e) => setPartnerForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
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

          <div className="mx-auto max-w-xl">
            {supportSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
                <div className="font-semibold">Сообщение отправлено</div>
                <p className="mt-1 text-sm">Мы свяжемся с вами в ближайшее время.</p>
              </div>
            ) : (
              <form onSubmit={handleSupportSubmit} className="glass grid gap-3 rounded-2xl p-6">
                <input
                  value={supportForm.fio}
                  onChange={(e) => setSupportForm((f) => ({ ...f, fio: e.target.value }))}
                  placeholder="ФИО"
                  required
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="tel"
                    value={supportForm.phone}
                    onChange={(e) => setSupportForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    type="email"
                    value={supportForm.email}
                    onChange={(e) => setSupportForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                <input
                  value={supportForm.telegram}
                  onChange={(e) => setSupportForm((f) => ({ ...f, telegram: e.target.value }))}
                  placeholder="Telegram"
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <textarea
                  value={supportForm.question}
                  onChange={(e) => setSupportForm((f) => ({ ...f, question: e.target.value }))}
                  placeholder="Ваш вопрос"
                  rows={4}
                  className="rounded-lg border border-ink/15 px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                />
                <button type="submit" className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                  Отправить
                </button>
                <p className="text-xs text-ink/40">Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.</p>
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

      {/* Подвал раздела «Мероприятия» — вместо общего футера сайта (отключен для
          этой страницы в Layout), поэтому здесь же дублируется юридический блок
          и копирайт. Каждая строка — рабочая ссылка, ни одной серой заглушки. */}
      {/* Заголовки колонок — яркие (text-white, font-bold), сами ссылки —
          приглушенные, сероватые (text-white/40), чтобы структура
          считывалась с первого взгляда. Порядок колонок: Мероприятия,
          Все события, Партнерам, Организаторам, Помощь, Юридический блок,
          Социальные сети. */}
      <footer className="border-t border-white/10 bg-ink text-white/40">
        <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Мероприятия</div>
            <ul className="space-y-2 text-sm">
              <li><Link className="hover:text-white" to="/about">О нас</Link></li>
              <li><Link className="hover:text-white" to="/blog">Блог</Link></li>
              <li><Link className="hover:text-white" to="/news">Новости</Link></li>
              <li><Link className="hover:text-white" to="/events/documents">Документы</Link></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Все события</div>
            <ul className="space-y-2 text-sm">
              <li><Link className="hover:text-white" to="/events/ticket-refund">Возврат билета</Link></li>
              <li><Link className="hover:text-white" to="/events/research">Участие в исследованиях</Link></li>
              <li><Link className="hover:text-white" to="/events/ticketing">Билетная система</Link></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Партнерам</div>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => { setTab('partner'); window.scrollTo(0, 0) }} className="hover:text-white">Стать партнером</button></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Организаторам</div>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => { setTab('create'); window.scrollTo(0, 0) }} className="hover:text-white">Создать событие</button></li>
              <li><Link className="hover:text-white" to="/events/opportunities">Возможности</Link></li>
              <li><Link className="hover:text-white" to="/events/advertising">Реклама</Link></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Помощь</div>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => { setTab('support'); window.scrollTo(0, 0) }} className="hover:text-white">Поддержка</button></li>
              <li><Link className="hover:text-white" to="/events/knowledge">База знаний</Link></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Юридический блок</div>
            <ul className="space-y-2 text-sm">
              <li><Link className="hover:text-white" to="/legal/privacy">Политика обработки персональных данных</Link></li>
              <li><Link className="hover:text-white" to="/legal/consent">Согласие на обработку персональных данных</Link></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Социальные сети</div>
            <div className="flex flex-wrap gap-2.5">
              <a href="https://t.me/legalcareerst_support" target="_blank" rel="noreferrer" aria-label="Telegram" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconTelegram />
              </a>
              <a href="https://vk.com/legalcareerist" target="_blank" rel="noreferrer" aria-label="ВКонтакте" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconVk />
              </a>
              <a href="https://youtube.com/@legalcareerist" target="_blank" rel="noreferrer" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconYoutube />
              </a>
              <a href="https://tiktok.com/@legalcareerist" target="_blank" rel="noreferrer" aria-label="TikTok" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconTiktok />
              </a>
              <a href="https://x.com/legalcareerist" target="_blank" rel="noreferrer" aria-label="X (Twitter)" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconX />
              </a>
              <a href="https://linkedin.com/company/legalcareerist" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconLinkedin />
              </a>
              <a href="https://zakon.ru" target="_blank" rel="noreferrer" aria-label="Закон.ру" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconMonogram text="Zn" />
              </a>
              <a href="https://dzen.ru/legalcareerist" target="_blank" rel="noreferrer" aria-label="Дзен" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconMonogram text="Дз" />
              </a>
              <a href="https://avito.ru" target="_blank" rel="noreferrer" aria-label="Авито" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
                <IconMonogram text="Av" />
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-5">
          <div className="container-page text-center text-xs text-white/40">
            <span>© {new Date().getFullYear()} ИП Руденков И.В. Карьерный Юрист.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
