import CommunityPromoField from '../../components/CommunityPromoField'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import AmbassadorCarousel, { type Ambassador } from '../../components/AmbassadorCarousel'
import CommunityAchievements from '../../components/CommunityAchievements'
import CommunityFunctionality from '../../components/CommunityFunctionality'
import Testimonials from '../../components/Testimonials'
import { communityTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import { submitLead, leadSubmissionId, withLeadSubmission } from '../../lib/leads'
import ilyaPhoto from '../../assets/ilya-rudenkov.jpg'
import alexandraPhoto from '../../assets/ambassadors/alexandra-barbusova.png'
import valeriaPhoto from '../../assets/ambassadors/valeria-tretyakova.png'
import angelinaPhoto from '../../assets/ambassadors/angelina-kandu.png'
import alenaPhoto from '../../assets/ambassadors/alena-romanova.png'
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
import CommunityIcon from '../../components/CommunityIcon'
import CommunityStory from '../../components/CommunityStory'
import CommunityPartners from '../../components/CommunityPartners'
import './community.css'

const railItems = [
  { id: 'hero', label: 'Сообщество' },
  { id: 'mvc', label: 'Миссия и ценности' },
  { id: 'benefits', label: 'Резидентам' },
  { id: 'map', label: 'География сообщества' },
  { id: 'ambassadors', label: 'Амбассадоры' },
  { id: 'join', label: 'Присоединиться' },
  { id: 'functionality', label: 'Функционал' },
  { id: 'digital-platforms', label: 'Цифровые платформы' },
  { id: 'achievements', label: 'Наши достижения' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'founder', label: 'Основатель' },
  { id: 'partners', label: 'Партнеры' },
  { id: 'faq', label: 'FAQ' },
]

const mvc = [
  {
    label: 'Миссия',
    text: 'Поддерживать, давать совет, помогать сделать следующий шаг в карьере — будь то первая работа, смена работы или развитие личного бренда.',
  },
  {
    label: 'Ценности',
    text: 'Закрытые вакансии, экспертная информация от приглашенных экспертов, база знаний, возможность найти работу.',
  },
]

const residentBenefits = [
  'Закрытый чат в Телеграме',
  'Нетворкинг',
  'Закрытые мероприятия с приглашенными экспертами юридического рынка',
  'Мастермайнды и карьерные разборы',
  'Онлайн- и офлайн-встречи резидентов',
  'База знаний',
  'Закрытые вакансии и стажировки',
  'Одна бесплатная карьерная консультация в месяц',
  'Спикерство на мероприятиях и подкастах',
  'Скидки от 20 до 50 процентов на мероприятия',
  'Специальные предложения и скидки от партнеров',
]

const displayTariffs = (['1m', '6m', '3m'] as const).map((id) => tariffs.find((tariff) => tariff.id === id)!)

const ambassadors: Ambassador[] = [
  { id: 1, lastName: 'Барбусова', firstName: 'Александра', university: 'Санкт-Петербургский институт (филиал) ВГУЮ', universityNote: '(РПА Минюста России)', photo: alexandraPhoto },
  { id: 2, lastName: 'Третьякова', firstName: 'Валерия', university: 'СПбГУ', photo: valeriaPhoto },
  { id: 3, lastName: 'Канду', firstName: 'Ангелина', university: 'СПбГУ', photo: angelinaPhoto },
  { id: 4, lastName: 'Романова', firstName: 'Алена', university: 'СПбГЭУ', role: 'Младший юрист в банкротстве', photo: alenaPhoto },
  { id: 5, lastName: 'Доманова', firstName: 'Анастасия', role: 'Младший юрист' },
  { id: 6, lastName: 'Батчина', firstName: 'Арина', university: 'МГИМО' },
  { id: 8, lastName: 'Гранкина', firstName: 'Юлия', university: 'Университет прокуратуры' },
  { id: 9, lastName: 'Дюскина', firstName: 'Анастасия', university: 'МГЮА' },
  { id: 10, lastName: 'Аверьянова', firstName: 'Анна', university: 'СПбГУ' },
]

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
    'С какого момента открывается мое резидентство в сообществе?',
    'Можно ли сделать возврат?',
    'Входят ли мероприятия в стоимость подписки?',
    'Есть ли заморозка?',
    'Я не из Петербурга или Москвы — стоит ли мне стать резидентом?',
    'Какие есть возможности в сообществе?',
    'Для чего вступать в сообщество?',
    'Как стать резидентом?',
    'Какая аудитория в сообществе?',
    'Я не нашел ответ на свой вопрос. Как мне с вами связаться?',
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
  const [tariffId, setTariffId] = useState<(typeof tariffs)[number]['id']>('6m')
  const [paid, setPaid] = useState(false)
  const paymentDialog = useRef<HTMLDialogElement>(null)
  const paymentTitleId = useId()
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
  const [ambassadorOpen, setAmbassadorOpen] = useState(false)
  const ambassadorDialog = useRef<HTMLDialogElement>(null)
  const ambassadorTitleId = useId()

  useEffect(() => {
    if (!paid) return
    const dialog = paymentDialog.current
    if (!dialog) return
    const overflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [paid])

  useEffect(() => {
    if (!activeCity) return
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-city-marker], [data-city-panel]')) setActiveCity(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveCity(null) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [activeCity])

  useEffect(() => {
    if (!ambassadorOpen) return
    const dialog = ambassadorDialog.current
    if (!dialog) return
    const overflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [ambassadorOpen])

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

  const [ambassadorForm, setAmbassadorForm] = useState({ name: '', phone: '', email: '', telegram: '', about: '' })
  const [ambassadorSent, setAmbassadorSent] = useState(false)
  const [ambassadorError, setAmbassadorError] = useState('')

  const tariff = tariffs.find((t) => t.id === tariffId)!

  function handlePay(id?: (typeof tariffs)[number]['id']) {
    setPromoPrice(null)
    if (id) setTariffId(id)
    setPaid(true)
  }

  function scrollToJoin() {
    document.getElementById('join')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
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
        setFormError(data.error === 'promo_not_available' ? 'Промокод не найден, выключен или не подходит выбранному тарифу.' : 'Промокод: используйте 3–32 буквы, цифры, дефис или подчеркивание.')
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
    const invalid = validateJoinContacts(ambassadorForm) || (!ambassadorForm.about.trim() ? 'Расскажите, почему вы хотите стать резидентом.' : null)
    setAmbassadorError(invalid || '')
    if (invalid) return
    await submitLead({
      requestId: leadSubmissionId(e),
      sourceBlock: 'community',
      formType: 'ambassador_application',
      name: ambassadorForm.name,
      contact: [ambassadorForm.phone, ambassadorForm.email, ambassadorForm.telegram].filter(Boolean).join(' / '),
      phone: ambassadorForm.phone || undefined,
      email: ambassadorForm.email || undefined,
      telegram: ambassadorForm.telegram || undefined,
      interest: [ambassadorForm.about].filter(Boolean),
      consent,
    })
    setAmbassadorSent(true)
  }

  return (
    <div className="community-page">
      <SectionRail items={railItems} />

      <section id="hero" className="community-hero text-center text-white">
        <svg className="community-hero-mark" viewBox="0 0 360 400" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M60 380V220M125 325V150M190 265V80M255 210V10" /><path d="M20 380H335M20 320H335M20 260H335M20 200H335" opacity=".25" /></g></svg>
        <div className="container-page"><div className="community-inner">
          <h1>
            Карьерный юрист — сообщество
          </h1>
          <div className="community-hero-copy">
            <p>
              Закрытое сообщество студентов и начинающих юристов: делимся опытом,
              <span className="block">строим связи и вместе строим карьеру.</span>
            </p>
          </div>
          <button type="button" onClick={scrollToJoin} className="btn-accent community-hero-cta">
            Стать резидентом <CommunityIcon name="arrow" />
          </button>
        </div></div>
      </section>

      <CommunityStory items={mvc} />

      <section id="benefits" className="container-page py-14">
        <div className="community-inner">
        <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Что входит в резидентство</h2>
        <div className="community-comparison overflow-hidden rounded-2xl border border-ink/10">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup><col className="w-1/2 lg:w-[58%]" /><col className="w-1/5 sm:w-1/4 lg:w-[21%]" /><col className="w-[30%] sm:w-1/4 lg:w-[21%]" /></colgroup>
            <thead>
              <tr className="bg-ink/[0.03]">
                <th scope="col" className="p-3 text-xs font-normal text-black sm:p-5 sm:text-sm">Возможности</th>
                <th scope="col" className="px-1 py-5 text-center text-xs font-semibold text-ink/60 sm:px-3 sm:text-base">Без подписки</th>
                <th scope="col" className="bg-accent px-1 py-5 text-center text-xs font-semibold text-white sm:px-3 sm:text-base">С подпиской</th>
              </tr>
            </thead>
            <tbody>
              {residentBenefits.map((benefit) => (
                <tr key={benefit} className="border-t border-ink/10">
                  <th scope="row" className="p-3 text-[10.4px] font-normal leading-relaxed text-black [text-wrap:balance] sm:p-4 sm:text-[12.8px]">{benefit.replace('юридического рынка', 'юридического\u00a0рынка')}</th>
                  <td className="text-center"><span className="community-benefit-no"><CommunityIcon name="close" /></span><span className="sr-only">Не входит без подписки</span></td>
                  <td className="community-benefit-included text-center"><span className="community-benefit-yes"><CommunityIcon name="check" /></span><span className="sr-only">Входит в подписку</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink/10">
                <td colSpan={2} />
                <td className="bg-accent/[0.12] px-1 py-4 text-center sm:px-3">
                  <button type="button" onClick={scrollToJoin} className="btn-accent min-h-12 w-full max-w-56 rounded-xl px-1 py-2 text-[11px] font-semibold leading-4 min-[390px]:text-xs lg:rounded-full lg:text-sm">Стать резидентом</button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      </section>

      <section id="map" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">География сообщества</h2>
          <div className={`community-geography ${activeCity ? 'has-active-city' : ''}`}>
            <div className="community-map-surface">
              <div className="relative">
                <svg viewBox={`0 0 ${RU_MAP_W} ${RU_MAP_H}`} className="w-full" aria-hidden="true">
                  {ruMapRows.map((row, ri) => row.split('').map((cell, ci) => cell === 'X' ? (
                    <rect key={`${ri}-${ci}`} x={ci * RU_MAP_CELL + 1.5} y={ri * RU_MAP_CELL + 1.5} width={RU_MAP_CELL - 3} height={RU_MAP_CELL - 3} rx={2.5} fill="var(--community-map-tile)" stroke="var(--community-map-stroke)" strokeWidth=".8" />
                  ) : null))}
                </svg>
                {cities.map((city) => (
                  <div key={city.id} id={`city-${city.id}`} data-city-marker={city.id} className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 sm:h-7 sm:w-7" style={{ left: `${((city.col + 0.5) * RU_MAP_CELL / RU_MAP_W) * 100}%`, top: `${((city.row + 0.5) * RU_MAP_CELL / RU_MAP_H) * 100}%` }} onMouseEnter={() => setActiveCity(city.id)}>
                    <button type="button" aria-label={`${city.name}: университеты резидентов`} aria-expanded={activeCity === city.id} aria-controls={`city-panel-${city.id}`} onClick={() => setActiveCity(city.id)} onFocus={() => setActiveCity(city.id)} className={`community-map-marker ${activeCity === city.id ? 'is-active' : ''}`}>
                      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white" />
                    </button>
                    <span className={`pointer-events-none absolute top-full mt-1.5 text-center text-[10px] font-medium leading-4 text-ink sm:text-sm sm:leading-5 ${city.id === 'spb' ? 'right-1/2 w-20 sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:whitespace-nowrap' : city.id === 'ekb' ? 'left-0 whitespace-nowrap sm:left-1/2 sm:-translate-x-1/2' : 'left-1/2 -translate-x-1/2 whitespace-nowrap'}`}>{city.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <aside data-city-panel hidden={!activeCity} aria-label="Университеты резидентов" aria-live="polite" className="community-city-panel min-h-44 rounded-2xl border border-accent/20 bg-accent/[0.04] p-6 lg:min-h-72">
              {cities.map((city) => (
                <div key={city.id} id={`city-panel-${city.id}`} hidden={activeCity !== city.id}>
                  <h3 className="text-lg font-semibold">{city.name}</h3>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-accent">Университеты резидентов</p>
                  <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink/70">{city.schools.map((school) => <li key={school}>{school}</li>)}</ul>
                </div>
              ))}
            </aside>
          </div>
        </div>
      </section>

      <section id="ambassadors" className="container-page scroll-mt-24 py-12">
        <AmbassadorCarousel items={ambassadors} />
      </section>

      {/* Заявка в амбассадоры — отправка через существующий реестр лидов. */}
      {SHOW_AMBASSADORS && (
      <section id="ambassador-form" className="scroll-mt-16 border-y border-ink/10 bg-white py-12 text-center">
        <div className="container-page">
          <button type="button" onClick={() => setAmbassadorOpen(true)} aria-haspopup="dialog" className="btn-accent rounded-full px-8 py-3 text-sm font-semibold">Стать амбассадором</button>
          <dialog ref={ambassadorDialog} aria-labelledby={ambassadorTitleId} onCancel={() => setAmbassadorOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setAmbassadorOpen(false) }} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-0 text-ink shadow-xl backdrop:bg-ink/70">
          <div className="p-5 text-left sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 id={ambassadorTitleId} className="text-xl font-semibold sm:text-2xl">Стать амбассадором</h2>
              <button type="button" aria-label="Закрыть заявку амбассадора" onClick={() => setAmbassadorOpen(false)} className="community-dialog-close"><CommunityIcon name="close" /></button>
            </div>

          {ambassadorSent ? (
            <div className="mx-auto max-w-md">
              <LeadSuccessCard description="Мы свяжемся с вами в Telegram." />
            </div>
          ) : (
            <form onSubmit={withLeadSubmission(handleAmbassadorSubmit)} className="grid gap-3 text-left sm:grid-cols-2">
              <input aria-label="ФИО" required
                value={ambassadorForm.name}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ФИО"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <PhoneInput required
                value={ambassadorForm.phone}
                onChange={(value) => setAmbassadorForm((f) => ({ ...f, phone: value }))}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <input aria-label="Почта"
                type="email" required
                value={ambassadorForm.email}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Почта"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <input aria-label="Телеграм" required
                value={ambassadorForm.telegram}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, telegram: e.target.value }))}
                placeholder="Телеграм"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <textarea required aria-label="Почему вы хотите стать резидентом?"
                value={ambassadorForm.about}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, about: e.target.value }))}
                placeholder="Почему вы хотите стать резидентом?"
                rows={3}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40 sm:col-span-2"
              />
              <ConsentCheck compact className="sm:col-span-2" />
              {ambassadorError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{ambassadorError}</p>}
              <button
                type="submit"
                className="btn-accent justify-self-center rounded-full px-8 py-3 text-sm font-semibold sm:col-span-2"
              >
                Стать амбассадором
              </button>
            </form>
          )}
          </div>
          </dialog>
        </div>
      </section>
      )}

      {/* Присоединиться: лид-заявка + тарифы */}
      <section id="join" className="scroll-mt-16 bg-ink py-14 text-white">
        <div className="container-page text-center">
          <h2 className="text-2xl font-semibold sm:text-3xl">Присоединиться</h2>

          <div className="community-tariffs">
                {displayTariffs.map((t) => {
                  const selected = tariffId === t.id
                  return (
                    <article
                      key={t.id}
                      className={`community-tariff ${selected ? 'is-selected' : ''}`}
                    >
                      <button type="button" className="community-tariff-select" aria-pressed={selected} aria-label={`Выбрать подписку на ${t.period}`} onClick={() => setTariffId(t.id)}>
                      <span
                        aria-hidden="true" className={`community-tariff-indicator ${selected ? 'is-selected' : ''}`}
                      />
                      <span className="community-tariff-period">{t.period}</span>
                      <span className="community-tariff-price">{t.priceLabel}</span>
                      <span className="community-tariff-billing">за весь период</span>
                      {t.id === '1m' ? (
                        <span className="community-tariff-note">{t.note}</span>
                      ) : (
                        <span className="community-tariff-saving">
                          {t.note}
                        </span>
                      )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePay(t.id)
                        }}
                        className="btn-accent community-tariff-pay"
                      >
                        Оплатить
                      </button>
                    </article>
                  )
                })}
              </div>
        </div>

        {/* Native dialog provides focus containment, Escape and focus restoration. */}
        {paid && (
          <dialog
            ref={paymentDialog}
            aria-labelledby={paymentTitleId}
            onCancel={() => setPaid(false)}
            onClose={() => setPaid(false)}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return
              const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter((element) => element.getClientRects().length > 0)
              const first = controls[0], last = controls.at(-1)
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
              }
            }}
            className="community-payment-dialog"
            onClick={(e) => {
              if (e.target !== e.currentTarget) return
              const rect = e.currentTarget.getBoundingClientRect()
              if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) setPaid(false)
            }}
          >
            <div className="community-payment-content">
              <div className="mb-4 flex items-center justify-between">
                <h3 id={paymentTitleId} className="text-lg font-semibold">Тариф «{tariff.period}» — {promoPrice === null ? tariff.priceLabel : `${promoPrice.toLocaleString('ru-RU')} ₽`}</h3>
                <button type="button" onClick={() => setPaid(false)} className="community-dialog-close" aria-label="Закрыть">
                  <CommunityIcon name="close" />
                </button>
              </div>
              <div className="mb-5 flex items-center justify-between rounded-lg bg-ink/[0.04] px-4 py-3 text-sm">
                <span className="text-ink/60">{tariff.period}</span>
                <span className="text-base font-semibold text-ink">{promoPrice === null ? tariff.priceLabel : `${promoPrice.toLocaleString('ru-RU')} ₽`}</span>
              </div>
              <form onSubmit={withLeadSubmission(handleSubmit)} className="grid gap-3">
                <input aria-label="ФИО" autoComplete="name"
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
                    type="email" autoComplete="email"
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
                {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
                {submitError && (
                  <p role="alert" className="text-sm text-red-600">Не получилось перейти к оплате — попробуйте еще раз через минуту.</p>
                )}
                <ConsentCheck compact />
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
          </dialog>
        )}
      </section>

      <CommunityFunctionality />

      <CommunityAchievements />

      {/* Отзывы */}
      <div id="reviews">
        <Testimonials items={communityTestimonials} carousel />
      </div>

      {/* Основатель сообщества */}
      <section id="founder" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Основатель сообщества</h2>
          <div className="community-founder-card">
            <img
              src={ilyaPhoto}
              alt="Илья Руденков"
              style={{ objectPosition: '50% 22%' }}
              className="h-20 w-20 shrink-0 rounded-full object-cover shadow-md ring-4 ring-white sm:h-24 sm:w-24"
            />
            <div>
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

      <CommunityPartners />

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={buildFaqItems()} title="Частые вопросы" columns={2} inlineTitle compact />
      </div>

      <CommunityFooter />

      {!paid && !ambassadorOpen && (
        <button type="button" className="btn-accent community-floating-join" aria-label="Стать резидентом — выбрать тариф" onClick={() => {
          scrollToJoin()
          document.querySelector<HTMLElement>('#join .community-tariff-select[aria-pressed="true"]')?.focus({ preventScroll: true })
        }}>
          Стать резидентом <CommunityIcon name="arrow" />
        </button>
      )}
    </div>
  )
}
