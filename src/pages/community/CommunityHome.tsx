import { useState, type FormEvent } from 'react'
import PageHero from '../../components/PageHero'
import { submitLead } from '../../lib/leads'

const tariffs = [
  { id: '1m', period: '1 месяц', price: 690, priceLabel: '690 ₽', note: 'Стандартная' },
  { id: '3m', period: '3 месяца', price: 1770, priceLabel: '590 ₽/мес', note: '1 770 ₽ за 3 месяца · выгоднее на 14%' },
  { id: '6m', period: '6 месяцев', price: 3180, priceLabel: '530 ₽/мес', note: '3 180 ₽ за 6 месяцев · выгоднее на 23%' },
  { id: 'demo', period: 'Демодоступ', price: 0, priceLabel: 'Бесплатно', note: '7 дней, чтобы попробовать формат перед оплатой' },
] as const

const benefits = [
  'Закрытые вакансии — помощники, младшие юристы, секретари, офис-менеджеры, которых нет в открытом доступе',
  'Скидки 30–50% на офлайн-встречи и мероприятия сообщества',
  'Закрытые вебинары с приглашёнными экспертами',
  'База знаний: юридическая литература, психология, soft skills, legal design & writing',
  'Льготная цена на консультацию психолога и карьерного консультанта',
  'Личный бренд — подкасты и статьи с участием резидентов',
]

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
        title="Вступить в «Карьерный юрист»"
        description="Выберите тариф, оплатите и укажите ник в Telegram — бот сам напишет вам и пришлёт ссылку на вступление в закрытое сообщество."
      />

      <div className="container-page py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-3 font-semibold">Что входит в резидентство</div>
            <ul className="space-y-2 text-sm text-ink/70">
              {benefits.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <span>{b}</span>
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
      </div>
    </div>
  )
}
