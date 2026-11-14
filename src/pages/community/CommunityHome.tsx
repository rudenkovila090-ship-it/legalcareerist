import CommunityPromoField from '../../components/CommunityPromoField'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import AmbassadorCarousel, { type Ambassador } from '../../components/AmbassadorCarousel'
import CommunityAchievements from '../../components/CommunityAchievements'
import Testimonials from '../../components/Testimonials'
import { communityTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import { submitLead, leadSubmissionId, withLeadSubmission } from '../../lib/leads'
import ilyaPhoto from '../../assets/ilya-rudenkov.jpg'
import alexandraPhoto from '../../assets/ambassadors/alexandra-barbusova.png'
import valeriaPhoto from '../../assets/ambassadors/valeria-tretyakova.png'
import angelinaPhoto from '../../assets/ambassadors/angelina-kandu.png'
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
  { id: 'map', label: 'География сообщества' },
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
  { id: 4, lastName: 'Романова', firstName: 'Алена', university: 'СПбГЭУ', role: 'Младший юрист в банкротстве' },
  { id: 5, lastName: 'Доманова', firstName: 'Анастасия', role: 'Младший юрист' },
  { id: 6, lastName: 'Батчина', firstName: 'Арина', university: 'МГИМО' },
  { id: 7, lastName: 'Шеловская', firstName: 'Мария', university: 'НИУ ВШЭ' },
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
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
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

      <section id="hero" className="bg-ink py-16 text-center text-white sm:py-20">
        <div className="container-page"><div className="mx-auto max-w-5xl">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Сообщество карьерного юриста
          </h1>
          <div className="mt-8 w-full rounded-2xl border border-white/15 bg-white/[0.04] p-5 sm:mt-10 sm:p-8">
            <p className="text-base leading-relaxed text-white/80 sm:text-lg lg:text-xl">
              Закрытое сообщество студентов и начинающих юристов: делимся опытом,
              <span className="block">строим связи и вместе строим карьеру.</span>
            </p>
          </div>
          <button type="button" onClick={scrollToJoin} className="btn-accent mt-8 h-[3.75rem] min-w-60 rounded-full px-10 text-[17.5px] font-semibold">
            Стать резидентом
          </button>
        </div></div>
      </section>

      {/* Миссия — крупная плитка слева; ценность и цель — справа. */}
      <section id="mvc" className="border-y border-ink/10 bg-white py-16">
        <div className="container-page">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:grid-rows-2">
            {mvc.map((item, index) => (
              <article key={item.label} className={`relative overflow-hidden rounded-2xl border p-8 sm:p-10 ${index === 0 ? 'flex min-h-72 flex-col justify-center border-ink bg-ink text-white md:row-span-2' : 'min-h-48 border-ink/10 bg-[#eef3fb]'}`}>
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
        <div className="mx-auto max-w-5xl">
        <h2 className="mb-8 text-2xl font-semibold sm:text-3xl">Что входит в резидентство</h2>
        <div className="community-comparison overflow-hidden rounded-2xl border border-ink/10">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup><col className="w-[45%] sm:w-1/2" /><col className="w-1/5 sm:w-1/4" /><col className="w-[35%] sm:w-1/4" /></colgroup>
            <thead>
              <tr className="bg-ink/[0.03]">
                <th scope="col" className="p-3 text-xs font-normal text-black sm:p-5 sm:text-sm">Возможности</th>
                <th scope="col" className="px-1 py-5 text-center text-xs font-semibold text-ink/60 sm:px-3 sm:text-base">Без подписки</th>
                <th scope="col" className="bg-accent px-1 py-5 text-center text-xs font-semibold text-[#0b1c32] sm:px-3 sm:text-base">С подпиской</th>
              </tr>
            </thead>
            <tbody>
              {residentBenefits.map((benefit) => (
                <tr key={benefit} className="border-t border-ink/10">
                  <th scope="row" className="p-3 text-[10.4px] font-normal leading-relaxed text-black sm:p-4 sm:text-[12.8px]">{benefit}</th>
                  <td className="text-center"><span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink/[0.04] text-xl text-ink/60">×</span><span className="sr-only">Не входит без подписки</span></td>
                  <td className="bg-accent/[0.12] text-center"><span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-lg text-[#0b1c32]">✓</span><span className="sr-only">Входит в подписку</span></td>
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
          <div className="mx-auto grid max-w-5xl items-start gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="mx-auto w-4/5 max-w-[38.4rem] rounded-2xl bg-ink/[0.02] p-4 sm:p-6 lg:w-full">
              <div className="relative">
                <svg viewBox={`0 0 ${RU_MAP_W} ${RU_MAP_H}`} className="w-full" aria-hidden="true">
                  <defs><filter id="ru-map-tile-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1.2" stdDeviation="0.9" floodColor="#283953" floodOpacity="0.3" /></filter></defs>
                  {ruMapRows.map((row, ri) => row.split('').map((cell, ci) => cell === 'X' ? (
                    <rect key={`${ri}-${ci}`} x={ci * RU_MAP_CELL + 1.5} y={ri * RU_MAP_CELL + 1.5} width={RU_MAP_CELL - 3} height={RU_MAP_CELL - 3} rx={3.5} fill="white" stroke="rgba(40,57,83,0.2)" strokeWidth="1" filter="url(#ru-map-tile-shadow)" />
                  ) : null))}
                </svg>
                {cities.map((city) => (
                  <div key={city.id} id={`city-${city.id}`} data-city-marker={city.id} className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 sm:h-7 sm:w-7" style={{ left: `${((city.col + 0.5) * RU_MAP_CELL / RU_MAP_W) * 100}%`, top: `${((city.row + 0.5) * RU_MAP_CELL / RU_MAP_H) * 100}%` }} onMouseEnter={() => setActiveCity(city.id)}>
                    <button type="button" aria-label={`${city.name}: университеты резидентов`} aria-expanded={activeCity === city.id} aria-controls={`city-panel-${city.id}`} onClick={() => setActiveCity(city.id)} onFocus={() => setActiveCity(city.id)} className={`flex h-full w-full items-center justify-center rounded-full border-2 border-white bg-accent shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${activeCity === city.id ? 'ring-4 ring-accent/25' : ''}`}>
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
              <button type="button" aria-label="Закрыть заявку амбассадора" onClick={() => setAmbassadorOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/50 hover:bg-ink/[0.04]">✕</button>
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

          <div className="mx-auto mt-8 grid max-w-4xl items-stretch gap-6 lg:grid-cols-3">
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
                      className={`relative flex cursor-pointer flex-col items-center justify-self-center rounded-2xl border p-4 pt-8 text-center outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-4 focus-visible:ring-offset-ink sm:p-5 sm:pt-8 lg:p-5 lg:pt-8 min-h-72 w-full ${
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
                        <span className="inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full bg-emerald-400/15 px-2 py-1.5 text-[11px] font-semibold leading-5 text-emerald-300 lg:text-xs">
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
          </div>
        )}
      </section>

      <CommunityAchievements />

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
        <FAQSection items={buildFaqItems()} title="Частые вопросы" columns={2} inlineTitle compact />
      </div>

      <div className="container-page border-t border-ink/15 py-10 text-center">
        <button type="button" onClick={scrollToJoin} className="btn-accent h-[3.75rem] min-w-60 rounded-full px-10 text-[17.5px] font-semibold">Стать резидентом</button>
      </div>

      <CommunityFooter />
    </div>
  )
}
