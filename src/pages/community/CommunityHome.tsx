import { useState, type FormEvent } from 'react'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { communityTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import { submitLead } from '../../lib/leads'
import ilyaPhoto from '../../assets/ilya-rudenkov.jpg'

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
  { title: 'Закрытые вакансии', text: 'Вакансии, которых нет в открытом доступе — резиденты узнают о них первыми.' },
  { title: 'Бесплатная консультация', text: 'Одна бесплатная карьерная консультация в месяц продолжительностью 30 минут.' },
  { title: 'База знаний', text: `Материалы по темам: ${knowledgeCategories.join(', ')} — а также нетворкинг, книжный клуб, психологический клуб.` },
  { title: 'Нетворкинг', text: 'Возможность расширять сеть контактов среди студентов и молодых юристов.' },
  { title: 'Спортивный клуб', text: 'Регулярные челленджи и совместная активность.' },
  { title: 'Личный бренд', text: 'Советы, помощь и поддержка в развитии — выступления на подкастах и мероприятиях.' },
  { title: 'Книжный клуб', text: 'Обсуждаем тематическую книгу месяца.' },
  { title: 'Юридические вопросы', text: 'Можно задавать вопросы по практике, с которой раньше не сталкивались.' },
  { title: 'Мероприятия', text: 'Скидки 20–30% на мероприятия «Карьерного юриста» и партнеров, подборки событий, где выступают резиденты.' },
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

const faqItems = [
  { q: 'Что такое сообщество и чем оно отличается от юридических клубов, СНО?', a: 'Сообщество «Карьерного юриста» объединяет студентов и начинающих юристов из разных вузов и городов вокруг одной цели — карьеры в праве, а не привязано к конкретному учебному заведению, как студенческие клубы или СНО. Здесь закрытые вакансии, база знаний, менторская поддержка и живое общение с теми, кто уже прошел этот путь.' },
  { q: 'Можно ли познакомиться с сообществом до вступления?', a: 'Да, вы можете вступить по демодоступу на 7 дней — оценить формат перед оплатой.' },
  { q: 'Что я получу сразу после оплаты?', a: 'Бот @legalcareerist_bot сам напишет вам в Telegram в течение нескольких минут и пришлет ссылку на вступление в закрытое сообщество.' },
  { q: 'Что если я передумаю?', a: 'Подписка действует на выбранный срок (1, 3 или 6 месяцев) без автопродления — можно просто не продлевать дальше.' },
  { q: 'Нужна ли специализация или опыт?', a: 'Нет — сообщество открыто студентам и начинающим юристам из любого города, вуза и колледжа, независимо от специализации.' },
  { q: 'Как устроены закрытые вакансии?', a: 'Работодатели сначала предлагают вакансии резидентам сообщества — и только потом кадровому резерву и открытому рынку.' },
]

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
          <a
            href="#join"
            className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90"
          >
            Стать резидентом
          </a>
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
            <div key={b.title} className="glass rounded-xl p-5">
              <div className="font-semibold">{b.title}</div>
              <p className="mt-1 text-sm text-ink/60">{b.text}</p>
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
            <div className="relative aspect-[4/3] w-full rounded-2xl bg-ink/[0.04]">
              <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <path
                  d="M8 30 Q5 15 20 12 Q35 5 50 10 Q70 6 85 15 Q95 22 92 35 Q95 48 85 55 Q75 65 55 62 Q40 68 25 60 Q10 55 8 40 Z"
                  fill="rgba(111,147,196,0.15)"
                  stroke="rgba(40,57,83,0.2)"
                  strokeWidth="0.5"
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
      <section id="join" className="scroll-mt-16 bg-ink py-14 text-white">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Присоединиться</div>
          <h2 className="mb-8 text-2xl font-semibold">Вступить в «Карьерный юрист»</h2>

          {!paid && !submitted && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tariffs.map((t) => {
                  const recommended = t.id === '3m'
                  const selected = tariffId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTariffId(t.id)}
                      className={`glass-dark relative flex flex-col rounded-2xl p-5 pt-7 text-left ${
                        selected ? 'border-gold-light' : ''
                      }`}
                    >
                      {recommended && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-ink">
                          Популярный выбор
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-white/50">Подписка</span>
                        <span
                          className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                            selected ? 'border-gold-light bg-gold-light' : 'border-white/30'
                          }`}
                        />
                      </div>
                      <div className="mt-1 text-lg font-semibold">{t.period}</div>
                      <div className="mt-3 text-3xl font-semibold text-gold-light">{t.priceLabel}</div>
                      <p className="mt-3 text-xs leading-relaxed text-white/50">{t.note}</p>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 flex flex-wrap gap-3 text-xs text-white/50">
                <span className="rounded-full bg-white/10 px-3 py-1.5">Оплата на стороне платежной системы</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">Без автопродления</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">Бот пишет вам сам после оплаты</span>
              </div>

              <button
                onClick={handlePay}
                className="mt-8 w-full rounded-lg bg-gold-light py-3 text-sm font-semibold text-ink hover:opacity-90 sm:w-auto sm:px-10"
              >
                {tariff.price === 0 ? 'Активировать демодоступ' : `Оплатить ${tariff.priceLabel.replace('/мес', '')}`}
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
          <div className="mt-14 border-t border-white/10 pt-10">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Стать амбассадором</div>
            <h3 className="mb-2 text-xl font-semibold">Хотите представлять сообщество в своем вузе или городе?</h3>
            <p className="mb-6 max-w-xl text-sm text-white/60">
              Амбассадоры помогают развивать сообщество: рассказывают о нем среди своих, помогают с
              мероприятиями, представляют «Карьерного юриста» в своем городе.
            </p>

            {ambassadorSent ? (
              <div className="max-w-md rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-sm text-emerald-200">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1">Мы свяжемся с вами в Telegram.</p>
              </div>
            ) : (
              <form onSubmit={handleAmbassadorSubmit} className="glass-dark grid max-w-2xl gap-3 rounded-2xl p-6 sm:grid-cols-2">
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
      <FAQSection items={faqItems} />
    </div>
  )
}
