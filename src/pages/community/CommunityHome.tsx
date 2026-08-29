import { useRef, useState, type FormEvent } from 'react'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { communityTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import { submitLead } from '../../lib/leads'
import { openTelegramBot } from '../../lib/telegram'
import ilyaPhoto from '../../assets/ilya-rudenkov.jpg'

const railItems = [
  { id: 'hero', label: 'Обзор' },
  { id: 'main', label: 'Главное' },
  { id: 'mvc', label: 'Миссия и цель' },
  { id: 'benefits', label: 'Резидентам' },
  { id: 'founder', label: 'Основатель' },
  { id: 'ambassadors', label: 'Амбассадоры' },
  { id: 'map', label: 'Представители' },
  { id: 'join', label: 'Присоединиться' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'faq', label: 'FAQ' },
]

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  )
}
function IconChatDot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
      <circle cx="9" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 5.5c1.5-1 4-1.3 6-.5v14c-2-.8-4.5-.5-6 .5v-14z" />
      <path d="M20 5.5c-1.5-1-4-1.3-6-.5v14c2-.8 4.5-.5 6 .5v-14z" />
    </svg>
  )
}
function IconNetwork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="12" cy="18" r="2.3" />
      <path d="M7.7 7.3L10.5 16M16.3 7.3L13.5 16M8.3 6h7.4" />
    </svg>
  )
}
function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M7 4.5h10v5a5 5 0 0 1-10 0v-5z" />
      <path d="M7 6H4.5A2.5 2.5 0 0 0 5.5 10.5H7M17 6h2.5A2.5 2.5 0 0 1 18.5 10.5H17" />
      <path d="M12 14.5V18M9 20.5h6" />
    </svg>
  )
}
function IconBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5" />
    </svg>
  )
}
function IconBookOpen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 6.5c-2-1.3-4.5-1.6-7-1v13c2.5-.6 5 -.3 7 1 2-1.3 4.5-1.6 7-1v-13c-2.5-.6-5-.3-7 1z" />
      <path d="M12 6.5v13" />
    </svg>
  )
}
function IconQuestion() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.4 1-1.4 1.9v.3" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconTicket() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.2a1.8 1.8 0 0 0 0 3.6v1.2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.2a1.8 1.8 0 0 0 0-3.6V8.5z" />
      <path d="M9.5 6.5v11" strokeDasharray="1.5 1.8" />
    </svg>
  )
}
function IconUsersMeet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="8.5" cy="8" r="2.6" />
      <circle cx="16" cy="8.5" r="2.1" />
      <path d="M3.5 19c0-3 2.3-5 5-5s5 2 5 5" />
      <path d="M14 14.3c2 .2 3.5 1.9 3.5 4.2" />
    </svg>
  )
}

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

const knowledgeCategories = [
  'Юридический мир', 'Юридическая карьера', 'Бизнес', 'Маркетинг', 'Личный бренд',
  'Продажи', 'Финансы', 'Сервис', 'Лайф-менеджмент', 'Юридический менеджмент',
  'Юриспруденция', 'Legal Tech', 'Legal Design', 'Legal Writing',
]

const residentBenefits = [
  { icon: IconLock, title: 'Закрытые вакансии', text: 'Вакансии, которых нет в открытом доступе — резиденты узнают о них первыми.' },
  { icon: IconChatDot, title: 'Бесплатная консультация', text: 'Одна бесплатная карьерная консультация в месяц продолжительностью 30 минут.' },
  { icon: IconNetwork, title: 'Нетворкинг', text: 'Возможность расширять сеть контактов среди студентов и молодых юристов.' },
  { icon: IconTrophy, title: 'Спортивный клуб', text: 'Регулярные челленджи и совместная активность.' },
  { icon: IconBadge, title: 'Личный бренд', text: 'Советы, помощь и поддержка в развитии — выступления на подкастах и мероприятиях.' },
  { icon: IconBookOpen, title: 'Книжный клуб', text: 'Обсуждаем тематическую книгу месяца.' },
  { icon: IconQuestion, title: 'Юридические вопросы', text: 'Можно задавать вопросы по практике, с которой раньше не сталкивались.' },
  { icon: IconTicket, title: 'Мероприятия', text: 'Скидки 20–30% на мероприятия «Карьерного юриста» и партнеров, подборки событий, где выступают резиденты.' },
  { icon: IconUsersMeet, title: 'Встречи', text: 'Встречаемся с приглашенными экспертами, обсуждаем темы месяца, а также проводим встречи резидентов.' },
]

const ambassadors = [
  'Анна Соколова', 'Максим Волков', 'Дарья Новикова', 'Иван Кузнецов',
  'Полина Морозова', 'Артем Соловьев', 'Мария Егорова', 'Никита Орлов',
].map((name) => ({ name, status: 'Great-амбассадор' }))

const cities = [
  {
    id: 'spb',
    name: 'Санкт-Петербург',
    schools: ['СПбГУ', 'НИУ ВШЭ', 'РГУП', 'РПА', 'СПбГЭУ'],
  },
  {
    id: 'msk',
    name: 'Москва',
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
  { id: 'ekb', name: 'Екатеринбург', schools: ['УрГЮУ'] },
] as const

// Ответ на вопрос про демодоступ — со ссылкой-кнопкой на активацию, поэтому
// собирается прямо в компоненте (нужен доступ к handleActivateDemo).
function buildFaqItems(onActivateDemo: () => void) {
  return [
    { q: 'Что такое сообщество и чем оно отличается от юридических клубов, СНО?', a: 'Сообщество «Карьерного юриста» объединяет студентов и начинающих юристов из разных вузов и городов вокруг одной цели — карьеры в праве, а не привязано к конкретному учебному заведению, как студенческие клубы или СНО. Здесь закрытые вакансии, база знаний, менторская поддержка и живое общение с теми, кто уже прошел этот путь.' },
    {
      q: 'Можно ли познакомиться с сообществом до вступления?',
      a: (
        <>
          Да, вы можете познакомиться с сообществом по демодоступу на 7 дней — оценить формат перед
          оплатой.{' '}
          <button type="button" onClick={onActivateDemo} className="font-medium text-ink underline">
            Попробовать по демодоступу
          </button>
        </>
      ),
    },
    { q: 'Что я получу сразу после оплаты?', a: 'Бот @legalcareerist_bot сам напишет вам в Telegram в течение нескольких минут и пришлет ссылку на вступление в закрытое сообщество.' },
    { q: 'Что если я передумаю?', a: 'Подписка автоматически продлевается по окончании выбранного срока — отключить автопродление можно в любой момент в личном кабинете.' },
    { q: 'Нужна ли специализация или опыт?', a: 'Нет — сообщество открыто студентам и начинающим юристам из любого города, вуза и колледжа, независимо от специализации.' },
    { q: 'Как устроены закрытые вакансии?', a: 'Карьерный юрист сначала предлагает вакансии резидентам сообщества — и только потом кадровому резерву и открытому рынку.' },
  ]
}

// priceLabel — полная стоимость тарифа (то, что списывается при оплате);
// note — цена в пересчете на месяц, показывает выгоду, но не является
// суммой к оплате.
const tariffs = [
  { id: '1m', period: '1 месяц', price: 690, priceLabel: '690 ₽', note: 'Стандартная' },
  { id: '3m', period: '3 месяца', price: 1770, priceLabel: '1 770 ₽', note: '590 ₽/мес · выгоднее на 14%' },
  { id: '6m', period: '6 месяцев', price: 3180, priceLabel: '3 180 ₽', note: '530 ₽/мес · выгоднее на 23%' },
  { id: 'demo', period: 'Демодоступ', price: 0, priceLabel: 'Бесплатно', note: '7 дней, чтобы попробовать формат перед оплатой' },
] as const

// Лендинг «Вступить» (уточнено заказчиком): выбор тарифа → оплата → открываем
// чат с ботом (openTelegramBot) → пользователь жмет Start → бот (сценарий в
// BotHelp, ветка resident_<тариф>) сам присылает ссылку на вступление, ставит
// метку «резидент» и ведет счет дней резидентства.
// Реальная оплата подключается позже (Prodamus) — сейчас клик «Оплатить и
// вступить» сразу считается успешной оплатой (демо-макет шага); когда
// появится реальный платежный шлюз, openTelegramBot нужно перенести в
// обработчик успешного колбэка оплаты, а не оставлять на клике по кнопке.
export default function CommunityHome() {
  const joinRef = useRef<HTMLElement>(null)
  const [tariffId, setTariffId] = useState<(typeof tariffs)[number]['id']>('1m')
  const [paid, setPaid] = useState(false)
  const [name, setName] = useState('')
  const [telegram, setTelegram] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [ambassadorForm, setAmbassadorForm] = useState({ name: '', phone: '', telegram: '', about: '' })
  const [ambassadorSent, setAmbassadorSent] = useState(false)

  const tariff = tariffs.find((t) => t.id === tariffId)!

  function handlePay(id?: (typeof tariffs)[number]['id']) {
    if (id) setTariffId(id)
    setPaid(true)
  }

  function scrollToJoin() {
    joinRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleActivateDemo() {
    setTariffId('demo')
    setPaid(true)
    scrollToJoin()
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !telegram.trim()) return
    submitLead({
      sourceBlock: 'community',
      formType: 'community_join',
      name,
      contact: telegram.startsWith('@') ? telegram : `@${telegram}`,
      interest: [tariff.period],
    })
    // Открываем чат с ботом сразу после оплаты — пользователю остается нажать
    // Start, и дальше сценарий в BotHelp (ветка resident_<тариф>) сам
    // присылает ссылку на вступление и ставит метки резидента.
    openTelegramBot(`resident_${tariffId}`)
    setSubmitted(true)
  }

  function handleAmbassadorSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ambassadorForm.name.trim() || (!ambassadorForm.phone.trim() && !ambassadorForm.telegram.trim())) return
    submitLead({
      sourceBlock: 'community',
      formType: 'ambassador_application',
      name: ambassadorForm.name,
      contact: [ambassadorForm.phone, ambassadorForm.telegram].filter(Boolean).join(' / '),
      interest: [ambassadorForm.about].filter(Boolean),
    })
    setAmbassadorSent(true)
  }

  return (
    <div>
      <SectionRail items={railItems} />

      <div id="hero">
        <PageHero
          eyebrow="Сообщество для молодых юристов"
          title="Карьера в праве — легче, когда рядом свои люди"
          description="Объединяем студентов и начинающих юристов из разных городов и университетов."
        />
      </div>

      {/* Главное */}
      <section id="main" className="container-page py-14">
        <div className="glass rounded-2xl p-8 text-center sm:p-12">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Главное</div>
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold sm:text-3xl">
            Станьте резидентом — и карьера в праве перестанет быть путем в одиночку
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink/60">
            Закрытые вакансии, база знаний, менторская поддержка и живое сообщество тех, кто уже
            прошел этот путь и готов поделиться опытом.
          </p>
          <button
            type="button"
            onClick={scrollToJoin}
            className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90"
          >
            Стать резидентом
          </button>
        </div>
      </section>

      {/* Миссия, ценность, цель */}
      <section id="mvc" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="grid gap-4 sm:grid-cols-3">
            {mvc.map((m) => (
              <div key={m.label} className="glass rounded-xl p-6">
                <div className="text-sm font-medium uppercase tracking-wide text-gold">{m.label}</div>
                <p className="mt-2 text-sm text-ink/70">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Что получают резиденты */}
      <section id="benefits" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Что получают резиденты</div>
        <h2 className="mb-6 text-2xl font-semibold">Все, что входит в резидентство</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {residentBenefits.map((b) => (
            <div key={b.title} className="glass rounded-xl border border-ink/5 p-5 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
                <b.icon />
              </div>
              <div className="font-semibold text-ink">{b.title}</div>
              <p className="mt-1 text-sm text-ink/60">{b.text}</p>
            </div>
          ))}
        </div>

        {/* База знаний — отдельным компактным блоком с тегами, а не длинным списком в карточке */}
        <div className="glass mt-4 rounded-xl border border-ink/5 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
              <IconBook />
            </div>
            <div>
              <div className="font-semibold text-ink">База знаний</div>
              <p className="mt-1 text-sm text-ink/60">Темы, которые доступны резидентам:</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...knowledgeCategories, 'Нетворкинг', 'Книжный клуб', 'Психологический клуб'].map((topic) => (
              <span key={topic} className="rounded-full bg-ink/[0.05] px-3 py-1 text-xs font-medium text-ink/70">
                {topic}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Основатель сообщества */}
      <section id="founder" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Основатель сообщества</div>
          <div className="glass flex gap-5 rounded-xl p-6">
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

      {/* Амбассадоры сообщества — неоновая бегущая линия вместо ручного листания карточек */}
      <section id="ambassadors" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Амбассадоры сообщества</div>
        <h2 className="mb-8 text-2xl font-semibold">Резиденты, которые представляют сообщество</h2>
        <div className="relative overflow-hidden py-3">
          <div
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
            style={{ background: '#5ea1ff', boxShadow: '0 0 8px 1px #5ea1ff, 0 0 20px 4px rgba(94,161,255,0.5)' }}
          />
          <div className="animate-marquee relative flex w-max items-center gap-10">
            {[...ambassadors, ...ambassadors].map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex shrink-0 items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: '#5ea1ff', boxShadow: '0 0 6px 2px #5ea1ff' }}
                />
                <div>
                  <div className="whitespace-nowrap text-sm font-semibold text-ink">{a.name}</div>
                  <div className="text-xs text-ink/40">{a.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Стать амбассадором */}
      <section className="border-y border-ink/10 bg-white py-12 text-center">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Стать амбассадором</div>
          <h2 className="mb-2 text-2xl font-semibold">Хотите представлять сообщество в своем вузе или городе?</h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-ink/60">
            Амбассадоры помогают развивать сообщество: рассказывают о нем среди своих, помогают с
            мероприятиями, представляют «Карьерного юриста» в своем городе.
          </p>

          {ambassadorSent ? (
            <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
              <div className="font-semibold">Заявка отправлена</div>
              <p className="mt-1">Мы свяжемся с вами в Telegram.</p>
            </div>
          ) : (
            <form onSubmit={handleAmbassadorSubmit} className="glass mx-auto grid max-w-2xl gap-3 rounded-2xl p-6 text-left sm:grid-cols-2">
              <input
                value={ambassadorForm.name}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="ФИО"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <input
                type="tel"
                value={ambassadorForm.phone}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Номер телефона"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
              />
              <input
                value={ambassadorForm.telegram}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, telegram: e.target.value }))}
                placeholder="Telegram"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40 sm:col-span-2"
              />
              <textarea
                value={ambassadorForm.about}
                onChange={(e) => setAmbassadorForm((f) => ({ ...f, about: e.target.value }))}
                placeholder="Напишите, почему должны выбрать вас"
                rows={3}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40 sm:col-span-2"
              />
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

      {/* Представители по городам */}
      <section id="map" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Представители</div>
          <h2 className="mb-8 text-2xl font-semibold">Резиденты есть в этих городах</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {cities.map((c) => (
              <div key={c.id} className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
                    <circle cx="12" cy="9.5" r="2.4" />
                  </svg>
                </div>
                <div className="mb-3 text-lg font-semibold text-ink">{c.name}</div>
                <ul className="space-y-1 text-sm text-ink/60">
                  {c.schools.map((s) => <li key={s}>· {s}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Присоединиться: лид-заявка + тарифы */}
      <section id="join" ref={joinRef} className="scroll-mt-16 bg-ink py-14 text-white">
        <div className="container-page text-center">
          <div className="mb-8 text-sm font-medium uppercase tracking-wide text-gold-light">Присоединиться</div>

          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
                {tariffs.filter((t) => t.id !== 'demo').map((t) => {
                  const recommended = t.id === '3m'
                  const selected = tariffId === t.id
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setTariffId(t.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setTariffId(t.id)}
                      className={`glass-dark relative flex min-h-64 cursor-pointer flex-col items-center rounded-2xl p-6 pt-8 text-center ${
                        selected ? 'border-gold-light' : ''
                      }`}
                    >
                      {recommended && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-ink">
                          Популярный выбор
                        </span>
                      )}
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
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
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
              {submitted ? (
                <div className="py-4 text-center">
                  <div className="mb-3 flex justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink/70">
                    Тариф «{tariff.period}» {tariff.price > 0 && `оплачен (${tariff.priceLabel.replace('/мес', '')})`}.
                    Мы открыли чат с ботом в новой вкладке — нажмите там Start, и он сразу пришлет ссылку на вступление в закрытое сообщество.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPaid(false)
                      setSubmitted(false)
                      setName('')
                      setTelegram('')
                    }}
                    className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white"
                  >
                    Закрыть
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Оплата тарифа «{tariff.period}»</h3>
                    <button type="button" onClick={() => setPaid(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">
                      ✕
                    </button>
                  </div>
                  <div className="mb-5 flex items-center justify-between rounded-lg bg-ink/[0.04] px-4 py-3 text-sm">
                    <span className="text-ink/60">{tariff.period}</span>
                    <span className="text-base font-semibold text-ink">{tariff.priceLabel}</span>
                  </div>
                  <form onSubmit={handleSubmit} className="grid gap-3">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Имя"
                      required
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <input
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder="Ник в Telegram, например @ivanov"
                      required
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
                    >
                      {tariff.price > 0 ? 'Оплатить и вступить' : 'Вступить в сообщество'}
                    </button>
                    <p className="text-xs text-ink/50">Нажимая «Оплатить и вступить», вы соглашаетесь на обработку персональных данных.</p>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Отзывы */}
      <div id="reviews">
        <Testimonials items={communityTestimonials} />
      </div>

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={buildFaqItems(handleActivateDemo)} />
      </div>
    </div>
  )
}
