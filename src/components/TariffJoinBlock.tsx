import { useEffect, useState, type FormEvent } from 'react'
import { tariffs, type TariffId } from '../data/tariffs'
import { submitLead } from '../lib/leads'
import { openTelegramBot } from '../lib/telegram'

/**
 * Виджет выбора и оплаты тарифа сообщества — та же логика и тот же бэкенд
 * (/api/community/subscribe → Prodamus), что и в блоке «Присоединиться» на
 * /community#join, но в компактном оформлении, подходящем для встраивания
 * в текст статьи (светлая карточка, а не полноширинная темная секция).
 * Используется для CTA внутри статей базы знаний — см. Article.cta.
 */
export default function TariffJoinBlock() {
  const [tariffId, setTariffId] = useState<TariffId>('1m')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [telegram, setTelegram] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  // При возврате кнопкой «Назад» после редиректа на оплату bfcache может
  // восстановить страницу с «замороженной» кнопкой — сбрасываем загрузку.
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

  const tariff = tariffs.find((t) => t.id === tariffId)!

  function openModal(id: TariffId) {
    setTariffId(id)
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
    setSubmitted(false)
    setName('')
    setPhone('')
    setEmail('')
    setTelegram('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !telegram.trim()) return
    if (tariff.price > 0 && !phone.trim()) return

    submitLead({
      sourceBlock: 'community',
      formType: 'community_join',
      name,
      contact: telegram.startsWith('@') ? telegram : `@${telegram}`,
      interest: [tariff.period],
    })

    if (tariff.price === 0) {
      openTelegramBot(`resident_${tariffId}`)
      setSubmitted(true)
      return
    }

    setSubmitting(true)
    setSubmitError(false)
    try {
      const res = await fetch('/api/community/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffId, name, phone, email, telegram }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error('subscribe_failed')
      window.location.assign(data.url)
    } catch {
      setSubmitting(false)
      setSubmitError(true)
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-ink p-6 text-white sm:p-8">
      <div className="mb-1 text-sm font-medium uppercase tracking-wide text-gold-light">Присоединиться</div>
      <h3 className="text-xl font-semibold">Выберите и оплатите тариф</h3>
      <p className="mt-2 text-sm text-white/60">
        Доступ к закрытому сообществу открывается автоматически в Telegram-боте сразу после оплаты.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {tariffs.filter((t) => t.id !== 'demo').map((t) => {
          const recommended = t.id === '3m'
          return (
            <div
              key={t.id}
              className="glass-dark relative flex flex-col items-center rounded-xl p-5 pt-7 text-center"
            >
              {recommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-ink">
                  Популярный выбор
                </span>
              )}
              <div className="text-xs font-medium uppercase tracking-wide text-white/50">Подписка</div>
              <div className="mt-1 text-base font-semibold">{t.period}</div>
              <div className="mt-2 text-2xl font-semibold text-gold-light">{t.priceLabel}</div>
              {t.id === '1m' ? (
                <p className="mt-3 text-xs leading-relaxed text-white/50">{t.note}</p>
              ) : (
                <span className="mt-3 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                  {t.note}
                </span>
              )}
              <button
                type="button"
                onClick={() => openModal(t.id)}
                className="mt-4 w-full rounded-lg bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
              >
                Оплатить
              </button>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => openModal('demo')}
        className="mt-4 text-sm font-medium text-white/60 underline-offset-2 hover:text-white hover:underline"
      >
        Попробовать бесплатный демодоступ на 7 дней
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            {submitted ? (
              <div className="py-4 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                </div>
                <p className="text-sm leading-relaxed text-ink/70">
                  Мы открыли чат с ботом в новой вкладке — нажмите там Start, и он пришлет вам ссылку на вступление в закрытое сообщество.
                </p>
                <button type="button" onClick={closeModal} className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white">
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Тариф «{tariff.period}» — {tariff.priceLabel}</h3>
                  <button type="button" onClick={closeModal} className="text-ink/40 hover:text-ink" aria-label="Закрыть">
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
                  {tariff.price > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Телефон, например +79990000000"
                        required
                        className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Почта (необязательно)"
                        className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      />
                    </div>
                  )}
                  <input
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="Ник в Telegram, например @ivanov"
                    required
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  {submitError && (
                    <p className="text-sm text-red-600">Не получилось перейти к оплате — попробуйте еще раз через минуту.</p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
                  >
                    {submitting ? 'Переходим к оплате…' : tariff.price > 0 ? 'Перейти к оплате' : 'Вступить в сообщество'}
                  </button>
                  <p className="text-xs text-ink/50">Нажимая «{tariff.price > 0 ? 'Перейти к оплате' : 'Вступить в сообщество'}», вы соглашаетесь на обработку персональных данных.</p>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
