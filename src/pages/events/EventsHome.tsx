import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { events } from '../../data/events'
import { submitLead } from '../../lib/leads'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import EventsFooter from './EventsFooter'
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

      <EventsFooter />
    </div>
  )
}
