import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { events } from '../../data/events'
import { clubs } from '../../data/clubs'
import { TagRow } from '../../components/Tag'
import ProcessSteps from '../../components/ProcessSteps'
import RelatedContentBlock from '../../components/RelatedContentBlock'
import { getRelatedContent } from '../../lib/related'
import { demoMemberships } from '../../lib/account'
import { submitLead } from '../../lib/leads'

const eventTypeLabel = { webinar: 'Вебинар', breakfast: 'Бизнес-завтрак', intensive: 'Интенсив', tour: 'Экскурсия' }

const steps = [
  { title: 'Регистрация', description: 'Оставляете заявку на участие на этой странице.' },
  { title: 'Оплата', description: 'Если мероприятие платное — оплачиваете счёт или применяете промокод.' },
  { title: 'Напоминание', description: 'За день и за час до старта пришлём напоминание на email/Telegram.' },
  { title: 'Участие', description: 'Подключаетесь по ссылке (онлайн) или приходите по адресу (офлайн).' },
  { title: 'Материалы после', description: 'Запись и презентация публикуются в разделе «Полезные материалы».' },
]

// Связка «Сообщество → Мероприятия» (раздел 6.6): участникам клуба с той же
// специализацией автоматически применяется скидка при регистрации.
const COMMUNITY_DISCOUNT = 0.2

export default function EventDetail() {
  const { slug } = useParams()
  const event = events.find((e) => e.slug === slug)
  const [registered, setRegistered] = useState(false)

  const eligibleMembership = useMemo(() => {
    if (!event) return null
    return demoMemberships.find((m) => {
      const club = clubs.find((c) => c.name === m.clubName)
      return m.active && club?.specialization.some((s) => event.specialization.includes(s))
    })
  }, [event])

  if (!event) {
    return (
      <div className="container-page py-16">
        <p>Мероприятие не найдено. <Link className="underline" to="/events">Все мероприятия</Link></p>
      </div>
    )
  }

  const related = getRelatedContent(event, 'event', event.id)
  const finalPrice = eligibleMembership && event.price > 0 ? Math.round(event.price * (1 - COMMUNITY_DISCOUNT)) : event.price

  function handleRegister() {
    if (!event) return
    submitLead({
      sourceBlock: 'events',
      formType: 'event_registration',
      name: 'Демо-пользователь',
      contact: 'demo@example.com',
      interest: [event.title],
    })
    setRegistered(true)
  }

  return (
    <div className="container-page py-12">
      <Link to="/events" className="text-sm text-ink/50 hover:text-ink">← Все мероприятия</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <span className="text-sm font-medium uppercase tracking-wide text-gold">{eventTypeLabel[event.type]}</span>
          <h1 className="mt-1 text-3xl font-semibold">{event.title}</h1>
          <div className="mt-2 text-ink/60">
            {new Date(event.dateTime).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })} ·{' '}
            {event.format === 'online' ? 'Онлайн' : event.city}
          </div>
          <div className="mt-3"><TagRow specialization={event.specialization} industry={event.industry} /></div>

          <p className="mt-6 leading-relaxed text-ink/80">{event.description}</p>

          <div className="mt-6">
            <h2 className="font-semibold">Программа</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {event.program.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>

          <div className="mt-6">
            <h2 className="font-semibold">Спикеры</h2>
            <p className="mt-2 text-ink/70">{event.speakers.join(', ')}</p>
          </div>

          <div className="mt-10">
            <h2 className="mb-4 text-xl font-semibold">Как проходит участие</h2>
            <ProcessSteps steps={steps} />
          </div>

          <RelatedContentBlock items={related} />
        </div>

        <aside>
          <div className="glass rounded-xl p-6">
            <div className="text-sm text-ink/50">Стоимость участия</div>
            <div className="mt-1 text-2xl font-semibold">
              {finalPrice === 0 ? 'Бесплатно' : `${finalPrice.toLocaleString('ru-RU')} ₽`}
            </div>
            {eligibleMembership && event.price > 0 && (
              <div className="mt-1 text-xs text-emerald-600">
                Скидка {Math.round(COMMUNITY_DISCOUNT * 100)}% как участнику клуба «{eligibleMembership.clubName}»
              </div>
            )}
            {event.promoCode && (
              <div className="mt-2 text-xs text-ink/50">Промокод: {event.promoCode}</div>
            )}

            {event.status === 'completed' ? (
              <div className="mt-4 rounded-lg bg-ink/[0.04] p-3 text-sm text-ink/60">
                Мероприятие завершено. Запись — в разделе «Полезные материалы».
              </div>
            ) : registered ? (
              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Вы зарегистрированы. Напоминание придёт заранее.</div>
            ) : (
              <button
                onClick={handleRegister}
                className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
              >
                Зарегистрироваться
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
