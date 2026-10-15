import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchEvents, type CabinetEvent, type CabinetUser } from '../../lib/cabinet'
import { pluralRu } from '../../lib/plural'
import { TELEGRAM_BOT_USERNAME } from '../../lib/telegram'
import { Card } from './ui'
import { longDate } from './shared'

// ---- Мероприятия и история посещений ----
export function EventsSection() {
  const [events, setEvents] = useState<CabinetEvent[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    fetchEvents().then((r) => {
      if (!active) return
      if (r.ok) setEvents(r.data.events)
      else setFailed(true)
    })
    return () => {
      active = false
    }
  }, [])

  if (failed) return <p className="text-sm text-ink/50">Не удалось загрузить регистрации. Обновите страницу.</p>
  if (!events) return <p className="text-sm text-ink/50">Загружаем…</p>
  if (!events.length) {
    return (
      <Card>
        <p className="text-lg font-semibold">Регистраций пока нет</p>
        <p className="mt-1 text-sm text-ink/60">Мероприятия находятся по почте, телефону или нику в Telegram, с которыми вы регистрировались. Ближайшие события — на странице «Мероприятия».</p>
        <Link to="/events" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">Смотреть мероприятия</Link>
      </Card>
    )
  }
  return (
    <ul className="space-y-3">
      {events.map((e, i) => (
        <li key={`${e.slug}-${i}`} className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-5">
          <div>
            {e.slug ? <Link to={`/events/${e.slug}`} className="font-semibold hover:underline">{e.title}</Link> : <span className="font-semibold">{e.title}</span>}
            <div className="mt-0.5 text-sm text-ink/60">{longDate(e.date)}{e.tariff ? ` · ${e.tariff}` : ''}{e.amount ? ` · ${e.amount.toLocaleString('ru-RU')} ₽` : ''}</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${e.attended ? 'bg-emerald-50 text-emerald-700' : 'bg-ink/[0.06] text-ink/70'}`}>{e.status}</span>
        </li>
      ))}
    </ul>
  )
}

// ---- Telegram-бот ----
export function TelegramSection({ user }: { user: CabinetUser }) {
  return (
    <Card>
      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${user.telegramLinked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
        {user.telegramLinked ? 'Бот подключён' : 'Бот не подключён'}
      </span>
      <p className="mt-3 text-lg font-semibold">@{TELEGRAM_BOT_USERNAME}</p>
      <p className="mt-1 max-w-xl text-sm text-ink/60">
        {user.telegramLinked
          ? 'Ваш аккаунт в боте найден: подписка и согласия в кабинете берутся оттуда. Бот присылает уведомления и напоминания.'
          : 'Откройте бота и нажмите Start: тогда кабинет найдёт ваш аккаунт, подтянет подписку и сможет присылать уведомления.'}
      </p>
      <a href={`https://t.me/${TELEGRAM_BOT_USERNAME}`} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
        Открыть бота
      </a>
    </Card>
  )
}

// ---- Статус участника сообщества ----
export function ResidentSection({ user }: { user: CabinetUser }) {
  const r = user.resident
  return (
    <div>
      <Card>
        {r.status === 'none' && (
          <>
            <span className="inline-block rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-semibold text-ink/70">Нет подписки</span>
            <p className="mt-3 text-lg font-semibold">Вы пока не резидент сообщества</p>
            <p className="mt-1 text-sm text-ink/60">
              Резидентом можно стать на странице сообщества.
              {!user.telegramLinked && ` Если подписка уже оформлена, откройте @${TELEGRAM_BOT_USERNAME} в Telegram и нажмите Start — тогда она появится здесь.`}
            </p>
            <a href="/community#join" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">Выбрать тариф</a>
          </>
        )}
        {r.status === 'lifetime' && (
          <>
            <span className="inline-block rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-ink">Бессрочный резидент</span>
            <p className="mt-3 text-lg font-semibold">Подписка бессрочная</p>
            <p className="mt-1 text-sm text-ink/60">{r.since ? `Резидент с ${longDate(r.since)} ` : ''}Списаний нет — доступ к сообществу сохраняется.</p>
          </>
        )}
        {(r.status === 'active' || r.status === 'ended') && (
          <>
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {r.status === 'active' ? 'Резидент сообщества' : 'Подписка закончилась'}
            </span>
            <p className="mt-3 text-lg font-semibold">
              {r.status === 'active' ? `Подписка действует до ${longDate(r.until)}` : `Подписка закончилась ${longDate(r.until)}`}
            </p>
            {r.status === 'active' && typeof r.daysLeft === 'number' && (
              <p className="mt-1 text-sm text-ink/60">Осталось {r.daysLeft} {pluralRu(r.daysLeft, ['день', 'дня', 'дней'])}</p>
            )}
            <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {r.tariff && (<div><dt className="text-ink/50">Тариф</dt><dd className="font-medium">{r.tariff}</dd></div>)}
              {r.since && (<div><dt className="text-ink/50">Резидент с</dt><dd className="font-medium">{longDate(r.since)}</dd></div>)}
              {r.status === 'active' && (
                <div>
                  <dt className="text-ink/50">Продление</dt>
                  <dd className="font-medium">{r.autoRenew ? 'Автоматическое, спишется в день окончания' : r.cancelled ? 'Автопродление отключено, доступ сохранится до этой даты' : 'Разовая подписка, без автопродления'}</dd>
                </div>
              )}
            </dl>
            {(r.status === 'ended' || !r.autoRenew) && (
              <a href="/community#join" className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                {r.status === 'ended' ? 'Продлить подписку' : 'Оформить продление'}
              </a>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
