import { useRef, useState, type FormEvent } from 'react'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { communityTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import { submitLead } from '../../lib/leads'
import ilyaPhoto from '../../assets/ilya-rudenkov.jpg'

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

const residentBenefits: { icon: typeof IconLock; title: string; text: string | null; list: string[] | null }[] = [
  { icon: IconLock, title: 'Закрытые вакансии', text: 'Вакансии, которых нет в открытом доступе — резиденты узнают о них первыми.', list: null },
  { icon: IconChatDot, title: 'Бесплатная консультация', text: 'Одна бесплатная карьерная консультация в месяц продолжительностью 30 минут.', list: null },
  { icon: IconBook, title: 'База знаний', text: null, list: [...knowledgeCategories, 'Нетворкинг', 'Книжный клуб', 'Психологический клуб'] },
  { icon: IconNetwork, title: 'Нетворкинг', text: 'Возможность расширять сеть контактов среди студентов и молодых юристов.', list: null },
  { icon: IconTrophy, title: 'Спортивный клуб', text: 'Регулярные челленджи и совместная активность.', list: null },
  { icon: IconBadge, title: 'Личный бренд', text: 'Советы, помощь и поддержка в развитии — выступления на подкастах и мероприятиях.', list: null },
  { icon: IconBookOpen, title: 'Книжный клуб', text: 'Обсуждаем тематическую книгу месяца.', list: null },
  { icon: IconQuestion, title: 'Юридические вопросы', text: 'Можно задавать вопросы по практике, с которой раньше не сталкивались.', list: null },
  { icon: IconTicket, title: 'Мероприятия', text: 'Скидки 20–30% на мероприятия «Карьерного юриста» и партнеров, подборки событий, где выступают резиденты.', list: null },
]

const ambassadors = [
  'Анна Соколова', 'Максим Волков', 'Дарья Новикова', 'Иван Кузнецов',
  'Полина Морозова', 'Артем Соловьев', 'Мария Егорова', 'Никита Орлов',
].map((name) => ({ name, status: 'Great-амбассадор' }))

const cities = [
  { id: 'spb', name: 'Санкт-Петербург', x: '32%', y: '20%', schools: ['СПбГУ', 'НИУ ВШЭ', 'РАНХиГС'] },
  { id: 'msk', name: 'Москва', x: '40%', y: '38%', schools: ['МГЮА', 'МГУ', 'МГИМО'] },
  { id: 'ekb', name: 'Екатеринбург', x: '66%', y: '44%', schools: ['УрГУ'] },
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

const tariffs = [
  { id: '1m', period: '1 месяц', price: 690, priceLabel: '690 ₽', note: 'Стандартная' },
  { id: '3m', period: '3 месяца', price: 1770, priceLabel: '590 ₽/мес', note: '1 770 ₽ за 3 месяца · выгоднее на 14%' },
  { id: '6m', period: '6 месяцев', price: 3180, priceLabel: '530 ₽/мес', note: '3 180 ₽ за 6 месяцев · выгоднее на 23%' },
  { id: 'demo', period: 'Демодоступ', price: 0, priceLabel: 'Бесплатно', note: '7 дней, чтобы попробовать формат перед оплатой' },
] as const

// Лендинг «Вступить» (уточнено заказчиком): выбор тарифа → оплата → ник в
// Telegram → бот сам пишет пользователю и присылает ссылку на вступление.
// Реальная оплата подключается позже (Prodamus); здесь — рабочий макет шагов.
export default function CommunityHome() {
  const joinRef = useRef<HTMLElement>(null)
  const [tariffId, setTariffId] = useState<(typeof tariffs)[number]['id']>('1m')
  const [paid, setPaid] = useState(false)
  const [name, setName] = useState('')
  const [telegram, setTelegram] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [hoveredCity, setHoveredCity] = useState<(typeof cities)[number]['id'] | null>(null)

  const [ambassadorForm, setAmbassadorForm] = useState({ name: '', telegram: '', about: '' })
  const [ambassadorSent, setAmbassadorSent] = useState(false)

  const tariff = tariffs.find((t) => t.id === tariffId)!

  function handlePay() {
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
    setSubmitted(true)
  }

  function handleAmbassadorSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ambassadorForm.name.trim() || !ambassadorForm.telegram.trim()) return
    submitLead({
      sourceBlock: 'community',
      formType: 'ambassador_application',
      name: ambassadorForm.name,
      contact: ambassadorForm.telegram,
      interest: [ambassadorForm.about].filter(Boolean),
    })
    setAmbassadorSent(true)
  }

  return (
    <div>
      <PageHero
        eyebrow="Сообщество для молодых юристов"
        title="Карьера в праве — легче, когда рядом свои люди"
        description="Объединяем студентов и начинающих юристов из разных городов и университетов."
      />

      {/* Главное */}
      <section className="container-page py-14">
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
      <section className="border-y border-ink/10 bg-white py-12">
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
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Что получают резиденты</div>
        <h2 className="mb-6 text-2xl font-semibold">Все, что входит в резидентство</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {residentBenefits.map((b) => (
            <div key={b.title} className="glass rounded-xl border border-ink/5 p-5 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
                <b.icon />
              </div>
              <div className="font-semibold text-ink">{b.title}</div>
              {b.list ? (
                <ul className="mt-2 space-y-0.5 text-sm text-ink/60">
                  {b.list.map((item) => <li key={item}>· {item}</li>)}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink/60">{b.text}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Основатель сообщества */}
      <section className="border-y border-ink/10 bg-white py-12">
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

      {/* Амбассадоры клуба */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Амбассадоры клуба</div>
        <h2 className="mb-6 text-2xl font-semibold">Резиденты, которые представляют сообщество</h2>
        <div className="overflow-x-auto">
          <div className="animate-marquee flex w-max gap-4">
            {[...ambassadors, ...ambassadors].map((a, i) => (
              <div key={`${a.name}-${i}`} className="glass w-40 shrink-0 rounded-xl p-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold-light/25 text-lg font-semibold text-ink">
                  {a.name.split(' ').map((p) => p[0]).join('')}
                </div>
                <div className="mt-3 text-sm font-semibold">{a.name}</div>
                <div className="mt-1 text-xs text-ink/50">{a.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Представители по городам */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Представители</div>
          <h2 className="mb-6 text-2xl font-semibold">Резиденты есть в этих городах</h2>
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-ink/[0.04]">
              <svg viewBox="0 0 160 75" className="absolute inset-0 h-full w-full" aria-hidden="true">
                {/* Условная сетка параллелей/меридианов — чтобы читалось как карта */}
                {[15, 30, 45, 60].map((y) => (
                  <line key={y} x1="0" y1={y} x2="160" y2={y} stroke="rgba(40,57,83,0.06)" strokeWidth="0.3" />
                ))}
                {[20, 45, 70, 95, 120, 145].map((x) => (
                  <line key={x} x1={x} y1="0" x2={x} y2="75" stroke="rgba(40,57,83,0.06)" strokeWidth="0.3" />
                ))}
                {/* Стилизованный контур территории РФ, запад→восток */}
                <path
                  d="M6 40 Q4 28 14 22 Q10 14 22 10 Q30 4 42 8 Q55 2 66 8 Q78 4 88 10 Q100 5 112 11 Q126 6 138 14 Q150 12 155 22 Q158 32 150 38 Q154 46 144 50 Q148 58 136 60 Q124 68 108 62 Q96 70 82 63 Q68 69 56 61 Q42 66 30 58 Q18 62 10 52 Q4 48 6 40 Z"
                  fill="rgba(111,147,196,0.18)"
                  stroke="rgba(40,57,83,0.35)"
                  strokeWidth="0.6"
                />
              </svg>
              {cities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setHoveredCity(c.id)}
                  onMouseLeave={() => setHoveredCity(null)}
                  onFocus={() => setHoveredCity(c.id)}
                  onBlur={() => setHoveredCity(null)}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                  style={{ left: c.x, top: c.y }}
                >
                  <span className="h-3 w-3 rounded-full bg-ink ring-4 ring-white" />
                  <span className="mt-1 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink shadow">
                    {c.name}
                  </span>
                  {hoveredCity === c.id && (
                    <div className="glass absolute top-full z-10 mt-2 w-44 rounded-lg p-3 text-left text-xs">
                      <div className="mb-1 font-semibold text-ink">{c.name}</div>
                      <ul className="space-y-0.5 text-ink/60">
                        {c.schools.map((s) => <li key={s}>· {s}</li>)}
                      </ul>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <ul className="space-y-3">
              {cities.map((c) => (
                <li key={c.id} className="glass rounded-xl p-4">
                  <div className="font-semibold">{c.name}</div>
                  <div className="mt-1 text-sm text-ink/60">{c.schools.join(', ')}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Присоединиться: лид-заявка + тарифы */}
      <section id="join" ref={joinRef} className="scroll-mt-16 bg-ink py-14 text-white">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Присоединиться</div>
          <h2 className="mb-8 text-2xl font-semibold">Вступить в «Карьерный юрист»</h2>

          {!paid && !submitted && (
            <>
              <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
                {tariffs.filter((t) => t.id !== 'demo').map((t) => {
                  const recommended = t.id === '3m'
                  const selected = tariffId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTariffId(t.id)}
                      className={`glass-dark relative flex min-h-64 flex-col items-center rounded-2xl p-6 pt-8 text-center ${
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
                    </button>
                  )
                })}
              </div>

              <button
                onClick={handlePay}
                className="mx-auto mt-8 block w-full max-w-3xl rounded-lg bg-gold-light py-3 text-sm font-semibold text-ink hover:opacity-90 sm:w-auto sm:px-10"
              >
                Оплатить {tariff.priceLabel.replace('/мес', '')}
              </button>
            </>
          )}

          {paid && !submitted && (
            <form onSubmit={handleSubmit} className="glass-dark max-w-md rounded-2xl p-6">
              <div className="mb-1 font-semibold">Укажите ник в Telegram</div>
              <p className="mb-4 text-sm text-white/50">
                Тариф «{tariff.period}» {tariff.price > 0 && `оплачен (${tariff.priceLabel.replace('/мес', '')})`}.
                Бот напишет вам первым — убедитесь, что можете получать сообщения от новых контактов.
              </p>
              <div className="grid gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя"
                  required
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                />
                <input
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="Ник в Telegram, например @ivanov"
                  required
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                />
              </div>
              <button
                type="submit"
                className="mt-4 w-full rounded-lg bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
              >
                Вступить в сообщество
              </button>
            </form>
          )}

          {submitted && (
            <div className="max-w-md rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-sm text-emerald-200">
              <div className="font-semibold">Готово!</div>
              <p className="mt-1">
                В течение нескольких минут бот{' '}
                <a className="underline" href="https://t.me/legalcareerist_bot" target="_blank" rel="noreferrer">
                  @legalcareerist_bot
                </a>{' '}
                напишет вам в Telegram и пришлет ссылку на вступление в сообщество.
              </p>
            </div>
          )}

          {/* Стать амбассадором */}
          <div className="mt-14 border-t border-white/10 pt-10 text-center">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Стать амбассадором</div>
            <h3 className="mb-2 text-xl font-semibold">Хотите представлять сообщество в своем вузе или городе?</h3>
            <p className="mx-auto mb-6 max-w-xl text-sm text-white/60">
              Амбассадоры помогают развивать сообщество: рассказывают о нем среди своих, помогают с
              мероприятиями, представляют «Карьерного юриста» в своем городе.
            </p>

            {ambassadorSent ? (
              <div className="mx-auto max-w-md rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-sm text-emerald-200">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1">Мы свяжемся с вами в Telegram.</p>
              </div>
            ) : (
              <form onSubmit={handleAmbassadorSubmit} className="glass-dark mx-auto grid max-w-2xl gap-3 rounded-2xl p-6 text-left sm:grid-cols-2">
                <input
                  value={ambassadorForm.name}
                  onChange={(e) => setAmbassadorForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Имя"
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                />
                <input
                  value={ambassadorForm.telegram}
                  onChange={(e) => setAmbassadorForm((f) => ({ ...f, telegram: e.target.value }))}
                  placeholder="Telegram"
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                />
                <input
                  value={ambassadorForm.about}
                  onChange={(e) => setAmbassadorForm((f) => ({ ...f, about: e.target.value }))}
                  placeholder="Вуз и город"
                  className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40 sm:col-span-2"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90 sm:col-span-2"
                >
                  Стать амбассадором
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Отзывы */}
      <Testimonials items={communityTestimonials} />

      {/* FAQ */}
      <FAQSection items={buildFaqItems(handleActivateDemo)} />
    </div>
  )
}
