import CommunityPromoField from '../../components/CommunityPromoField'
import { useEffect, useState, type FormEvent } from 'react'
import Testimonials from '../../components/Testimonials'
import { communityTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import { submitLead, leadSubmissionId, withLeadSubmission } from '../../lib/leads'
import ilyaPhoto from '../../assets/ilya-rudenkov.jpg'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { tariffs } from '../../data/tariffs'
import CommunityFooter from './CommunityFooter'
import PhoneInput from '../../components/PhoneInput'
import HowHeardField from '../../components/HowHeardField'
import LeadSuccessCard from '../../components/LeadSuccessCard'
import { validateJoinContacts } from '../../lib/joinValidation'
import { SHOW_AMBASSADORS } from '../../lib/featureFlags'
import ConsentCheck from '../../components/ConsentCheck'
import { consentOf } from '../../lib/consent'
import { goal } from '../../lib/metrika'

const railItems = [
  { id: 'hero', label: 'Сообщество' },
  { id: 'mvc', label: 'Миссия и цель' },
  { id: 'benefits', label: 'Резидентам' },
  { id: 'map', label: 'Города' },
  { id: 'ambassadors', label: 'Амбассадоры' },
  { id: 'join', label: 'Присоединиться' },
  { id: 'achievements', label: 'Наши достижения' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'founder', label: 'Основатель' },
  { id: 'faq', label: 'FAQ' },
]

const mvc = [
  {
    label: 'Миссия',
    text: 'Поддерживать, давать совет, помогать сделать следующий шаг в карьере — будь то первая работа, смена работы или развитие личного бренда.',
  },
  {
    label: 'Ценность',
    text: 'Закрытые вакансии, экспертная информация от приглашенных экспертов, база знаний, возможность найти работу.',
  },
  {
    label: 'Цель',
    text: 'Помогать расти профессионально, закрывать вакансии, делиться знаниями, помогать развивать личный бренд, выступать на подкастах и мероприятиях.',
  },
]

const residentBenefits = [
  'Закрытые вакансии',
  'Бесплатная карьерная консультация раз в месяц',
  'Random coffee — нетворкинг',
  'Скидки на мероприятия от 20 до 50%',
  'База знаний',
  'Полезные материалы — бесплатно',
  'Закрытые мероприятия с приглашёнными экспертами',
]

const displayTariffs = (['1m', '6m', '3m'] as const).map((id) => tariffs.find((tariff) => tariff.id === id)!)

// Пять мест для анкет. Фотографии и подтверждённые данные заполняются
// здесь, когда владелец выберет амбассадоров для публичной страницы.
const ambassadors: {
  id: number
  lastName: string
  firstName: string
  university: string
  photo?: string
}[] = Array.from({ length: 5 }, (_, index) => ({
  id: index + 1,
  lastName: 'Фамилия',
  firstName: 'Имя',
  university: 'Университет',
}))

// Мозаичная (пиксельная) карта РФ — сетка квадратов-«блоков», как на
// референсе заказчика: каждая ячейка со скругленными углами и легкой
// тенью, не тонкая линия-паттерн, как было раньше. 'X' — залитая ячейка,
// '.' — пусто. Помимо основного массива суши — несколько «конфетти»-ячеек
// вразброс (сверху-слева, справа), как на референсе.
const RU_MAP_COLS = 26
const ruMapRows = [
  '..........XXXX........XX..',
  '..X.....XXXXXXXX.......X..',
  '......XXXXXXXXXXXX........',
  '....XXXXXXXXXXXXXXXX......',
  '...XXXXXXXXXXXXXXXXXXX....',
  '..XXXXXXXXXXXXXXXXXXXXX...',
  '..XXXXXXXXXXXXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXXXXXXXXXX...',
  '.XXXXXXXXXXXXXXXXXXXX...X.',
  '..XXXXXXXXXXXXXXXXX..XX...',
  '...XXXXXXXXXXXXXX...XXX...',
  '....XXXXXXXXXX......XX....',
  '....XX....................',
  '....X.....................',
]
const RU_MAP_ROWS = ruMapRows.length
const RU_MAP_CELL = 16 // px в системе координат viewBox (шаг ячейки)
const RU_MAP_W = RU_MAP_COLS * RU_MAP_CELL
const RU_MAP_H = RU_MAP_ROWS * RU_MAP_CELL

// row/col — позиция точки на мозаичной карте выше, подобраны так, чтобы три
// города были геогрфически сопоставимы: Санкт-Петербург — северо-запад,
// Москва — южнее и восточнее, Екатеринбург — за Уралом, заметно восточнее.
const cities = [
  {
    id: 'spb',
    name: 'Санкт-Петербург',
    row: 2, col: 7,
    schools: ['СПбГУ', 'НИУ ВШЭ', 'РГУП', 'РПА', 'СПбГЭУ'],
  },
  {
    id: 'msk',
    name: 'Москва',
    row: 5, col: 10,
    schools: [
      'МГУ',
      'МГЮА',
      'РТА',
      'ВАВТ',
      'НИУ ВШЭ',
      'РАНХиГС',
      'РГАИС',
      'Институт законодательства и сравнительного правоведения',
    ],
  },
  { id: 'ekb', name: 'Екатеринбург', row: 6, col: 17, schools: ['УрГЮУ'] },
] as const

function buildFaqItems() {
  return [
    'Как понять, подхожу ли я?',
    'С какого момента открывается моё резидентство в сообществе?',
    'Можно ли сделать возврат?',
    'Входят ли мероприятия в стоимость подписки?',
    'Есть ли заморозка?',
    'Я не из Петербурга или Москвы — стоит ли мне стать резидентом?',
    'Какие есть возможности в сообществе?',
    'Для чего вступать в сообщество?',
    'Как стать резидентом?',
    'Какая аудитория в сообществе?',
    'Я не нашёл ответ на свой вопрос. Как мне с вами связаться?',
  ].map((question) => ({
    q: question,
    a: <mark className="box-decoration-clone rounded-sm bg-yellow-200 px-1.5 py-0.5 text-ink">Здесь будет ответ на этот вопрос.</mark>,
  }))
}

// Лендинг «Вступить»: выбор тарифа → форма (имя, телефон, telegram) →
// POST /api/community/subscribe генерирует подписанную ссылку на оплату
// Prodamus (идентификация по телефону) → редирект на страницу оплаты.
// После оплаты Prodamus возвращает человека на /community/success, где
// кнопка открывает бота (@legalcareerist_bot, payload access_<token>) —
// бот проверяет статус оплаты (вебхук /api/prodamus/webhook) и присылает
// ссылку на вступление в сообщество. Демодоступ (без оплаты) — как раньше,
// сразу открывает бота.
export default function CommunityHome() {
  useDocumentTitle('Сообщество')
  const [tariffId, setTariffId] = useState<(typeof tariffs)[number]['id']>('1m')
  const [paid, setPaid] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [telegram, setTelegram] = useState('')
  const [howHeard, setHowHeard] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [promoPrice, setPromoPrice] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [formError, setFormError] = useState('')
  const [activeCity, setActiveCity] = useState<string | null>(null)

  useEffect(() => {
    if (!activeCity) return
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-city-marker]')) setActiveCity(null)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [activeCity])

  // При возврате кнопкой «Назад» браузер часто восстанавливает страницу из
  // bfcache вместе с "замороженным" состоянием — кнопка так и осталась бы
  // задизейбленной в виде «Переходим к оплате…». Сбрасываем состояние
  // загрузки, чтобы поля снова были редактируемыми.
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        setSubmitting(false)
        setSubmitError(false)
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  const [ambassadorForm, setAmbassadorForm] = useState({ name: '', phone: '', email: '', telegram: '', about: '', howHeard: '' })
  const [ambassadorSent, setAmbassadorSent] = useState(false)

  const tariff = tariffs.find((t) => t.id === tariffId)!

  function handlePay(id?: (typeof tariffs)[number]['id']) {
    setPromoPrice(null)
    if (id) setTariffId(id)
    setPaid(true)
  }

  function scrollToJoin() {
    document.getElementById('join')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const consent = consentOf(e)
    const invalid = validateJoinContacts({ name, phone, email, telegram })
    setFormError(invalid ?? '')
    if (invalid) return

    await submitLead({
      requestId: leadSubmissionId(e),
      sourceBlock: 'community',
      formType: 'community_join',
      name,
      contact: telegram.startsWith('@') ? telegram : `@${telegram}`,
      phone: phone || undefined,
      email: email || undefined,
      telegram: telegram ? (telegram.startsWith('@') ? telegram : `@${telegram}`) : undefined,
      howHeard,
      interest: [tariff.period, ...(promoCode ? [`Промокод: ${promoCode}`] : [])],
      consent,
    })

    // Уходим на настоящую страницу оплаты Prodamus. После
    // оплаты человек вернется на /community/success, откуда перейдет в бота
    // за ссылкой на вступление (бот не может писать первым — нужен Start).
    setSubmitting(true)
    setSubmitError(false)
    try {
      const res = await fetch('/api/community/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffId, name, phone, email, telegram, howHeard, promoCode, consent }),
      })
      const data = await res.json()
      if (data.error === 'invalid_promo_code' || data.error === 'promo_not_available') {
        setSubmitting(false)
        setFormError(data.error === 'promo_not_available' ? 'Промокод не найден, выключен или не подходит выбранному тарифу.' : 'Промокод: используйте 3–32 буквы, цифры, дефис или подчёркивание.')
        return
      }
      if (!res.ok || !data.url) throw new Error('subscribe_failed')
      // Цель «заявка в сообщество» — после ответа сервера; переход на оплату ждёт, пока Метрика примет цель.
      goal('lead_community', undefined, () => window.location.assign(data.url))
    } catch {
      setSubmitting(false)
      setSubmitError(true)
    }
  }

  async function handleAmbassadorSubmit(e: FormEvent) {
    e.preventDefault()
    const consent = consentOf(e)
    if (!ambassadorForm.name.trim() || (!ambassadorForm.phone.trim() && !ambassadorForm.telegram.trim())) return
    await submitLead({
      requestId: leadSubmissionId(e),
      sourceBlock: 'community',
      formType: 'ambassador_application',
      name: ambassadorForm.name,
      contact: [ambassadorForm.phone, ambassadorForm.email, ambassadorForm.telegram].filter(Boolean).join(' / '),
      phone: ambassadorForm.phone || undefined,
      email: ambassadorForm.email || undefined,
      telegram: ambassadorForm.telegram || undefined,
      howHeard: ambassadorForm.howHeard,
      interest: [ambassadorForm.about].filter(Boolean),
      consent,
    })
    setAmbassadorSent(true)
  }

  return (
    <div>
      <SectionRail items={railItems} />

      <section id="hero" className="bg-ink py-16 text-center text-white sm:py-20">
        <div className="container-page">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Сообщество карьерного юриста
          </h1>
          <div className="mt-8 w-full rounded-2xl border border-white/15 bg-white/[0.04] p-5 sm:mt-10 sm:p-8">
            <p className="text-base leading-relaxed text-white/80 sm:text-lg lg:text-xl">
              Закрытое сообщество студентов и начинающих юристов: делимся опытом, строим связи и вместе строим карьеру.
            </p>
          </div>
          <button type="button" onClick={scrollToJoin} className="mt-8 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-ink hover:bg-white/90">
            Стать резидентом
          </button>
        </div>
      </section>

      {/* Миссия — крупная плитка слева; ценность и цель — справа. */}
      <section id="mvc" className="border-y border-ink/10 bg-white py-16">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-2 md:grid-rows-2">
            {mvc.map((item, index) => (
              <article key={item.label} className={`relative overflow-hidden rounded-2xl border p-8 sm:p-10 ${index === 0 ? 'flex min-h-72 flex-col justify-between border-ink bg-ink text-white md:row-span-2' : 'min-h-48 border-ink/10 bg-[#eef3fb]'}`}>
                <span aria-hidden="true" className={`mb-6 block text-4xl font-semibold ${index === 0 ? 'text-white/25' : 'text-ink/20'}`}>0{index + 1}</span>
                <div>
                  <h2 className={`text-xl font-semibold sm:text-2xl ${index === 0 ? 'text-white' : 'text-ink'}`}>{item.label}</h2>
                  <p className={`mt-4 text-base leading-relaxed sm:text-lg ${index === 0 ? 'text-white/75' : 'text-ink/70'}`}>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="benefits" className="container-page py-14">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Возможности сообщества</div>
        <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Что входит в резидентство</h2>
        <div className="overflow-hidden rounded-2xl border border-ink/10">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup><col className="w-[52%] sm:w-[58%]" /><col /><col /></colgroup>
            <thead>
              <tr className="bg-ink/[0.03]">
                <th scope="col" className="p-3 text-xs font-medium text-ink/60 sm:p-5 sm:text-sm">Возможности</th>
                <th scope="col" className="px-1 py-5 text-center text-xs font-semibold text-ink/60 sm:px-3 sm:text-base">Без подписки</th>
                <th scope="col" className="bg-ink px-1 py-5 text-center text-xs font-semibold text-white sm:px-3 sm:text-base">С подпиской</th>
              </tr>
            </thead>
            <tbody>
              {residentBenefits.map((benefit) => (
                <tr key={benefit} className="border-t border-ink/10">
                  <th scope="row" className="p-3 text-[13px] font-medium leading-relaxed sm:p-5 sm:text-base">{benefit}</th>
                  <td className="text-center"><span aria-hidden="true" className="text-lg text-ink/25">—</span><span className="sr-only">Не входит без подписки</span></td>
                  <td className="bg-[#eef3fb] text-center"><span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-lg text-white">✓</span><span className="sr-only">Входит в подписку</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink/50">Сравнение относится к возможностям закрытого сообщества.</p>
      </section>

      {/* Форма заявки открывается отдельно от витрины амбассадоров. */}
      {SHOW_AMBASSADORS && (
      <section id="ambassador-form" className="scroll-mt-16 border-y border-ink/10 bg-white py-12 text-center">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Стать амбассадором</div>
          <h2 className="mb-2 text-2xl font-semibold">Хотите представлять сообщество в своем вузе или городе?</h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-ink/60">
            Амбассадоры помогают развивать сообщество: рассказывают о нем среди своих, помогают с
            мероприятиями, представляют «Карьерного юриста» в своем городе.
          </p>

          {ambassadorSent ? (
            <div className="mx-auto max-w-md">
              <LeadSuccessCard description="Мы свяжемся с вами в Telegram." />
            </div>
          ) : (
            <form onSubmit={withLeadSubmission(handleAmbassadorSubmit)} className="glass mx-auto grid max-w-2xl gap-3 rounded-2xl p-6 text-left sm:grid-cols-2">
              <input aria-label="ФИО"
                value={ambassadorForm.name}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ФИО"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <PhoneInput
                value={ambassadorForm.phone}
                onChange={(value) => setAmbassadorForm((f) => ({ ...f, phone: value }))}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <input aria-label="Почта"
                type="email"
                value={ambassadorForm.email}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Почта"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <input aria-label="Telegram"
                value={ambassadorForm.telegram}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, telegram: e.target.value }))}
                placeholder="Telegram"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <textarea aria-label="Напишите, почему должны выбрать вас"
                value={ambassadorForm.about}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, about: e.target.value }))}
                placeholder="Напишите, почему должны выбрать вас"
                rows={3}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40 sm:col-span-2"
              />
              <div className="sm:col-span-2">
                <HowHeardField value={ambassadorForm.howHeard} onChange={(v) => setAmbassadorForm((f) => ({ ...f, howHeard: v }))} />
              </div>
              <ConsentCheck className="sm:col-span-2" />
              <button
                type="submit"
                className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90 sm:col-span-2"
              >
                Стать амбассадором
              </button>
            </form>
          )}
        </div>
      </section>
      )}

      <section id="map" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Резиденты есть в этих городах</h2>
          <div className="mx-auto max-w-3xl rounded-2xl bg-ink/[0.02] p-4 sm:p-6">
            <div className="relative">
              <svg viewBox={`0 0 ${RU_MAP_W} ${RU_MAP_H}`} className="w-full" aria-hidden="true">
                <defs>
                  <filter id="ru-map-tile-shadow" x="-60%" y="-60%" width="220%" height="220%">
                    <feDropShadow dx="0" dy="1.2" stdDeviation="0.9" floodColor="#283953" floodOpacity="0.3" />
                  </filter>
                </defs>
                {ruMapRows.map((row, ri) => row.split('').map((cell, ci) => cell === 'X' ? (
                  <rect key={`${ri}-${ci}`} x={ci * RU_MAP_CELL + 1.5} y={ri * RU_MAP_CELL + 1.5} width={RU_MAP_CELL - 3} height={RU_MAP_CELL - 3} rx={3.5} fill="white" stroke="rgba(40,57,83,0.2)" strokeWidth="1" filter="url(#ru-map-tile-shadow)" />
                ) : null))}
              </svg>
              {cities.map((city, index) => (
                <div
                  key={city.id}
                  id={`city-${city.id}`}
                  data-city-marker={city.id}
                  className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 sm:h-7 sm:w-7 ${activeCity === city.id ? 'z-20' : 'z-10'}`}
                  style={{ left: `${((city.col + 0.5) * RU_MAP_CELL / RU_MAP_W) * 100}%`, top: `${((city.row + 0.5) * RU_MAP_CELL / RU_MAP_H) * 100}%` }}
                  onMouseEnter={() => setActiveCity(city.id)}
                  onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setActiveCity(null) }}
                  onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveCity(null) }}
                >
                  <button
                    type="button"
                    aria-label={`${city.name}: университеты резидентов`}
                    aria-expanded={activeCity === city.id}
                    aria-describedby={activeCity === city.id ? `city-tooltip-${city.id}` : undefined}
                    aria-controls={`city-tooltip-${city.id}`}
                    onClick={() => setActiveCity(city.id)}
                    onFocus={() => setActiveCity(city.id)}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setActiveCity(null) } }}
                    className="flex h-full w-full items-center justify-center rounded-md border-2 border-white bg-ink text-[11px] font-semibold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:text-xs"
                  >
                    {index + 1}
                  </button>
                  <span className={`pointer-events-none absolute top-full mt-1.5 text-center text-[10px] font-medium leading-4 text-ink sm:text-sm sm:leading-5 ${city.id === 'spb' ? 'right-1/2 w-20 sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:whitespace-nowrap' : 'left-1/2 -translate-x-1/2 whitespace-nowrap'}`}>
                    {city.name}
                  </span>
                  <div id={`city-tooltip-${city.id}`} role="tooltip" hidden={activeCity !== city.id} className={`absolute top-full mt-10 w-56 rounded-xl bg-ink p-4 text-left text-xs leading-relaxed text-white shadow-xl sm:bottom-full sm:top-auto sm:mb-3 sm:mt-0 sm:w-64 ${city.id === 'spb' ? 'left-0' : 'left-1/2 -translate-x-1/2'}`}>
                    <div className="mb-2 font-semibold">Университеты</div>
                    <ul className="space-y-1 text-white/80">{city.schools.map((school) => <li key={school}>{school}</li>)}</ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="ambassadors" className="container-page scroll-mt-24 py-12">
        <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Амбассадоры</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          {ambassadors.map((ambassador) => (
            <article key={ambassador.id} aria-label={`Карточка амбассадора ${ambassador.id}`} className="min-w-0 overflow-hidden rounded-2xl border border-ink/10 bg-white">
              <div className="aspect-[3/4] overflow-hidden bg-ink/[0.04]">
                {ambassador.photo ? (
                  <img src={ambassador.photo} alt={`${ambassador.lastName} ${ambassador.firstName}`} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div role="img" aria-label="Место для фотографии амбассадора" className="flex h-full flex-col items-center justify-center gap-3 text-ink/30">
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-14 w-14" aria-hidden="true">
                      <circle cx="32" cy="22" r="10" />
                      <path d="M13 56c0-12 8-20 19-20s19 8 19 20" />
                    </svg>
                    <span className="text-xs">Фото</span>
                  </div>
                )}
              </div>
              <div className="p-4 sm:p-5">
                <h3 className="text-base font-semibold leading-snug sm:text-lg">
                  <span className="block">{ambassador.lastName}</span>
                  <span className="block">{ambassador.firstName}</span>
                </h3>
                <p className="mt-3 break-words text-sm leading-5 text-ink/60">{ambassador.university}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Присоединиться: лид-заявка + тарифы */}
      <section id="join" className="scroll-mt-16 bg-ink py-14 text-white">
        <div className="container-page text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Присоединиться</h2>
          <p className="mb-8 mt-3 text-sm text-white/60 sm:text-base">Выберите удобный период подписки</p>

          <div className="mx-auto grid max-w-5xl items-center gap-6 lg:grid-cols-[1fr_1.25fr_1fr]">
                {displayTariffs.map((t) => {
                  const selected = tariffId === t.id
                  return (
                    <div
                      key={t.id}
                      role="button"
                      aria-pressed={selected}
                      aria-label={`Выбрать подписку на ${t.period}`}
                      tabIndex={0}
                      onClick={() => setTariffId(t.id)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          setTariffId(t.id)
                        }
                      }}
                      className={`relative flex cursor-pointer flex-col items-center justify-self-center rounded-2xl border p-4 pt-8 text-center outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-4 focus-visible:ring-offset-ink sm:p-5 sm:pt-8 lg:p-5 lg:pt-8 ${t.id === '6m' ? 'min-h-[22.5rem] w-full' : 'min-h-72 w-4/5 lg:w-full'} ${
                        selected ? 'border-gold-light bg-[#344e75] ring-1 ring-gold-light' : 'border-white/15 bg-[#2d415f]'
                      }`}
                    >
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          selected ? 'border-gold-light bg-gold-light' : 'border-white/30'
                        }`}
                      />
                      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-white/50">Подписка</div>
                      <div className="mt-1 text-lg font-semibold">{t.period}</div>
                      <div className="mt-3 text-3xl font-semibold text-gold-light">{t.priceLabel}</div>
                      <div className="mt-4 flex-1" />
                      {t.id === '1m' ? (
                        <p className="text-xs leading-relaxed text-white/50">{t.note}</p>
                      ) : (
                        <span className="inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full bg-emerald-400/15 px-2 py-1.5 text-[10px] font-semibold leading-5 text-emerald-300 min-[360px]:text-[11px] lg:text-xs">
                          {t.note}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePay(t.id)
                        }}
                        className="mt-5 w-full rounded-lg bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
                      >
                        Оплатить
                      </button>
                    </div>
                  )
                })}
              </div>
        </div>

        {/* Модалка оплаты — как в конструкторе карьерной консультации:
            центрированное окно поверх страницы, а не блок слева. */}
        {paid && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPaid(false)
            }}
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Тариф «{tariff.period}» — {promoPrice === null ? tariff.priceLabel : `${promoPrice.toLocaleString('ru-RU')} ₽`}</h3>
                <button type="button" onClick={() => setPaid(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">
                  ✕
                </button>
              </div>
              <div className="mb-5 flex items-center justify-between rounded-lg bg-ink/[0.04] px-4 py-3 text-sm">
                <span className="text-ink/60">{tariff.period}</span>
                <span className="text-base font-semibold text-ink">{promoPrice === null ? tariff.priceLabel : `${promoPrice.toLocaleString('ru-RU')} ₽`}</span>
              </div>
              <form onSubmit={withLeadSubmission(handleSubmit)} className="grid gap-3">
                <input aria-label="ФИО"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ФИО"
                  required
                  className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    required
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input aria-label="Почта"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Почта"
                    required
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                </div>
                <input aria-label="Ник в Telegram, например @ivanov"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="Ник в Telegram, например @ivanov"
                  required
                  className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                />
                <CommunityPromoField value={promoCode} onChange={setPromoCode} tariffId={tariffId} onPriceChange={setPromoPrice} />
                <HowHeardField value={howHeard} onChange={setHowHeard} className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none" />
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                {submitError && (
                  <p className="text-sm text-red-600">Не получилось перейти к оплате — попробуйте еще раз через минуту.</p>
                )}
                <ConsentCheck />
                <button
                  id="btn-community-join"
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
                >
                  {submitting ? 'Переходим к оплате…' : 'Перейти к оплате'}
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      <section id="achievements" className="container-page scroll-mt-24 py-14">
        <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Наши достижения</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {['Сообщество', 'Встречи и события', 'Карьерные истории'].map((achievement) => (
            <article key={achievement} className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
              <h3 className="text-sm font-medium text-ink/60">{achievement}</h3>
              <p className="my-4 text-4xl font-semibold"><mark className="rounded-md bg-yellow-200 px-2 text-ink">…</mark></p>
              <p className="text-sm leading-relaxed"><mark className="box-decoration-clone rounded-sm bg-yellow-200 px-1 text-ink">Здесь будет достижение сообщества.</mark></p>
            </article>
          ))}
        </div>
      </section>

      {/* Отзывы */}
      <div id="reviews">
        <Testimonials items={communityTestimonials} carousel />
      </div>

      {/* Основатель сообщества */}
      <section id="founder" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Основатель сообщества</div>
          <div className="glass flex flex-col gap-5 rounded-xl p-6 sm:flex-row">
            <img
              src={ilyaPhoto}
              alt="Илья Руденков"
              style={{ objectPosition: '50% 22%' }}
              className="h-20 w-20 shrink-0 rounded-full object-cover shadow-md ring-4 ring-white sm:h-24 sm:w-24"
            />
            <div>
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Основатель</div>
              <div className="mt-1 text-xl font-semibold">Илья Руденков</div>
              <p className="mt-2 text-sm text-ink/60">
                Создал сообщество, чтобы у студентов и начинающих юристов было пространство, где
                можно честно обсудить карьеру, получить обратную связь и найти работу — не в
                одиночку и не методом проб и ошибок.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={buildFaqItems()} title="Частые вопросы" columns={2} />
      </div>

      <div className="container-page pb-14 text-center">
        <button type="button" onClick={scrollToJoin} className="rounded-full bg-ink px-8 py-3.5 text-sm font-semibold text-white hover:bg-ink/90">Стать резидентом</button>
      </div>

      <CommunityFooter />
    </div>
  )
}
