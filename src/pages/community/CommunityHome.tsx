import { useState, type FormEvent } from 'react'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import FAQSection from '../../components/FAQSection'
import CTASection from '../../components/CTASection'
import { submitLead } from '../../lib/leads'

const stats = [
  { value: '70+', label: 'резидентов' },
  { value: '4', label: 'клуба' },
  { value: '690 ₽', label: 'подписка на 1 месяц' },
  { value: '2 города', label: 'офлайн-встреч' },
]

const valueProps = [
  { title: 'Не одни на старте карьеры', text: 'На старте вопросов всегда больше, чем ответов: куда идти — консалтинг, инхаус или адвокатура, как оценить оффер. Рядом — те, кто уже разбирался с этим.' },
  { title: 'Честный фидбек, а не вежливый', text: 'Сообщество, где можно показать резюме и получить реальную обратную связь, а не общие слова.' },
  { title: 'Ниша, которую больше никто не закрывает', text: 'Юридических сообществ хватает, но почти все — для практиков с именем и связями. Для студентов и начинающих юристов таких почти нет.' },
]

const benefits = [
  { title: 'Закрытые вакансии', text: 'Помощники, младшие юристы, секретари, офис-менеджеры — вакансий нет в открытом доступе. Резиденты получают предложения о работе в приоритетном порядке.' },
  { title: 'Скидки на мероприятия', text: '30–50% на офлайн-встречи и участие в событиях сообщества.' },
  { title: 'Закрытые вебинары', text: 'С приглашёнными экспертами — доступны только резидентам.' },
  { title: 'База знаний', text: 'Юридическая литература, психология, soft skills, юридический мир, legal design & writing и многое другое.' },
  { title: 'Скидка на консультации', text: 'Льготная цена на консультацию психолога и карьерного консультанта для резидентов.' },
  { title: 'Личный бренд', text: 'Записываем подкасты с резидентами, публикуем статьи.' },
]

const faqItems = [
  { q: 'Что я получу сразу после оплаты?', a: 'Бот @legalcareerist_bot сам напишет вам в Telegram в течение нескольких минут и пришлёт ссылку на вступление в закрытое сообщество.' },
  { q: 'Можно попробовать бесплатно?', a: 'Да, есть демодоступ на 7 дней — чтобы оценить формат перед оплатой.' },
  { q: 'Что если я передумаю?', a: 'Подписка действует на выбранный срок (1, 3 или 6 месяцев) без автопродления — можно просто не продлевать дальше.' },
  { q: 'Нужна ли специализация или опыт?', a: 'Нет — сообщество открыто студентам и начинающим юристам из любого города, вуза и колледжа, независимо от специализации.' },
  { q: 'Как устроены закрытые вакансии?', a: 'Работодатели сначала предлагают вакансии резидентам сообщества — и только потом кадровому резерву и открытому рынку.' },
  { q: 'Безопасно ли писать боту свой ник в Telegram?', a: 'Ник используется только для того, чтобы бот отправил приглашение в сообщество — подробности в Политике обработки персональных данных.' },
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

  return (
    <div>
      <PageHero
        eyebrow="Сообщество для молодых юристов"
        title="Карьера в праве — легче, когда рядом свои люди"
        description="Объединяем студентов и начинающих юристов из разных городов и университетов."
      />

      <section className="container-page py-10">
        <div className="grid gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-ink/10 bg-white p-4">
              <div className="text-2xl font-semibold text-ink">{s.value}</div>
              <div className="mt-1 text-sm text-ink/60">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* О компании */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">О сообществе</div>
          <h2 className="mb-4 text-2xl font-semibold">Почему нам доверяют</h2>
          <p className="max-w-2xl text-ink/60">
            «Карьерный юрист» — сообщество для студентов и начинающих юристов: помогаем находить
            работу, расти в профессии и заводить своих людей. Признано рынком: 3-я группа в
            номинации «Профессиональные сообщества» рейтинга РАСО и Legal Business Forum (2026) и
            5-е место в рейтинге юридических Telegram-каналов (2025).
          </p>
        </div>
      </section>

      {/* Польза */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">В чём наша польза</div>
        <h2 className="mb-6 text-2xl font-semibold">Зачем вступать</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {valueProps.map((v) => (
            <div key={v.title} className="rounded-xl border border-ink/10 bg-white p-5">
              <div className="font-semibold">{v.title}</div>
              <p className="mt-1 text-sm text-ink/60">{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Кейсы и результаты */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Кейсы и результаты</div>
          <h2 className="mb-6 text-2xl font-semibold">70+ резидентов из 4 городов</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-paper p-5">
              <div className="font-semibold">Что уже сделано</div>
              <ul className="mt-2 space-y-1 text-sm text-ink/60">
                <li>· Открыли 4 клуба по интересам</li>
                <li>· Провели офлайн-встречи в Петербурге и Москве</li>
                <li>· Запустили закрытые встречи с экспертами юррынка</li>
                <li>· Создали базу знаний</li>
              </ul>
            </div>
            <div className="rounded-xl bg-paper p-5">
              <div className="font-semibold">Признание на рынке</div>
              <ul className="mt-2 space-y-1 text-sm text-ink/60">
                <li>· 3-я группа в номинации «Профессиональные сообщества» (РАСО и Legal Business Forum, 2026)</li>
                <li>· 5 место в номинации «Самые вовлечённые юридические клубы» (рейтинг Telegram-каналов, 2025)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Преимущества и выгоды */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Преимущества и выгоды</div>
        <h2 className="mb-6 text-2xl font-semibold">Что входит в резидентство</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-xl border border-ink/10 bg-white p-5">
              <div className="font-semibold">{b.title}</div>
              <p className="mt-1 text-sm text-ink/60">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Отзывы */}
      <Testimonials />

      {/* Что мы предлагаем */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Что мы предлагаем</div>
          <h2 className="mb-4 text-2xl font-semibold">Резидентство «Карьерного юриста»</h2>
          <p className="max-w-2xl text-sm text-ink/60">
            Мы объединяемся не городом и не университетом, а одной целью. Понимаем специфику
            профессии и разницу между направлениями практики, даём доступ к закрытым вакансиям и
            живому общению — 4 клуба, встречи, обсуждения, челленджи.
          </p>
        </div>
      </section>

      {/* Цены / вступление */}
      <section id="join" className="container-page scroll-mt-16 py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Цены</div>
        <h2 className="mb-6 text-2xl font-semibold">Вступить в «Карьерный юрист»</h2>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-3 font-semibold">Что входит в резидентство</div>
            <ul className="space-y-2 text-sm text-ink/70">
              {benefits.slice(0, 4).map((b) => (
                <li key={b.title} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>{b.title} — {b.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-ink/10 bg-white p-6">
            {submitted ? (
              <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-semibold">Готово!</div>
                <p className="mt-1">
                  В течение нескольких минут бот{' '}
                  <a className="underline" href="https://t.me/legalcareerist_bot" target="_blank" rel="noreferrer">
                    @legalcareerist_bot
                  </a>{' '}
                  напишет вам в Telegram и пришлёт ссылку на вступление в сообщество.
                </p>
              </div>
            ) : !paid ? (
              <>
                <div className="mb-4 font-semibold">1. Выберите тариф</div>
                <div className="space-y-2">
                  {tariffs.map((t) => (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm transition-colors ${
                        tariffId === t.id ? 'border-ink bg-paper' : 'border-ink/15'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="tariff"
                          checked={tariffId === t.id}
                          onChange={() => setTariffId(t.id)}
                        />
                        <span>
                          <span className="block font-medium">{t.period}</span>
                          <span className="block text-xs text-ink/50">{t.note}</span>
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold">{t.priceLabel}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handlePay}
                  className="mt-5 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  {tariff.price === 0 ? 'Активировать демодоступ' : `Оплатить ${tariff.priceLabel.replace('/мес', '')}`}
                </button>
                <p className="mt-2 text-xs text-ink/40">Оплата — на стороне платёжной системы, карту не запрашиваем.</p>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="mb-1 font-semibold">2. Укажите ник в Telegram</div>
                <p className="mb-4 text-sm text-ink/50">
                  Тариф «{tariff.period}» {tariff.price > 0 && `оплачен (${tariff.priceLabel.replace('/мес', '')})`}.
                  Бот напишет вам первым — убедитесь, что можете получать сообщения от новых контактов.
                </p>
                <div className="grid gap-3">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя"
                    required
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                  />
                  <input
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="Ник в Telegram, например @ivanov"
                    required
                    className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                <button
                  type="submit"
                  className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  Вступить в сообщество
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection items={faqItems} />

      {/* CTA */}
      <CTASection
        title="Готовы присоединиться?"
        description="Выберите тариф или начните с бесплатного демодоступа на 7 дней."
        ctaLabel="Выбрать тариф"
        ctaTo="#join"
      />
    </div>
  )
}
