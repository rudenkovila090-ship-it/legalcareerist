import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { fetchEvents, linkTelegram, unlinkTelegram, type CabinetEvent, type CabinetUser } from '../../lib/cabinet'
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
const SUPPORT_EMAIL = 'info@legalcareerist.ru'

const linkError = (code: string): string =>
  ({
    bad_code: 'Код не подошёл: он неверный, просрочен (живёт 10 минут) или уже использован. Отправьте боту /link и возьмите новый.',
    telegram_taken: `Этот Telegram уже привязан к другому кабинету. Откройте тот кабинет и отвяжите Telegram там или напишите нам: ${SUPPORT_EMAIL}`,
    already_linked: 'К этому кабинету уже привязан Telegram. Сначала отвяжите его.',
    too_many_attempts: 'Слишком много попыток. Попробуйте через 15 минут.',
    unauthorized: 'Сессия закончилась. Войдите снова.',
    network: 'Не получилось связаться с сервером. Попробуйте ещё раз.',
  })[code] ?? 'Не получилось привязать Telegram. Попробуйте ещё раз.'

export function TelegramSection({ user, onRefresh }: { user: CabinetUser; onRefresh: () => Promise<void> }) {
  const tg = user.telegram
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  async function handleLink(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await linkTelegram(code)
    if (!r.ok) {
      setBusy(false)
      setError(linkError(r.error))
      return
    }
    setCode('')
    await onRefresh()
    setBusy(false)
  }

  async function handleUnlink() {
    setBusy(true)
    setError('')
    const r = await unlinkTelegram()
    if (!r.ok) setError(linkError(r.error))
    setConfirmUnlink(false)
    await onRefresh()
    setBusy(false)
  }

  // Администратор: Telegram задан в настройках сервера, привязывать нечего.
  if (!tg.canLink) {
    return (
      <Card>
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${user.telegramLinked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {user.telegramLinked ? 'Бот подключён' : 'Бот не подключён'}
        </span>
        <p className="mt-3 text-lg font-semibold">@{TELEGRAM_BOT_USERNAME}</p>
        <p className="mt-1 max-w-xl text-sm text-ink/60">Telegram администратора задан в настройках сервера: подписка и согласия берутся из карточки в боте.</p>
        <a href={`https://t.me/${TELEGRAM_BOT_USERNAME}`} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
          Открыть бота
        </a>
      </Card>
    )
  }

  if (tg.linked) {
    return (
      <Card>
        <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Telegram привязан</span>
        <p className="mt-3 text-lg font-semibold">{tg.name || 'Ваш Telegram'}</p>
        <p className="mt-1 max-w-xl text-sm text-ink/60">
          {tg.linkedAt ? `Привязан ${longDate(tg.linkedAt)} ` : ''}Подписка и согласия берутся из вашей карточки в @{TELEGRAM_BOT_USERNAME}, бот присылает уведомления и напоминания.
          Если привязали не вы, отвяжите Telegram и смените пароль в разделе «Вход и пароль».
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href={`https://t.me/${TELEGRAM_BOT_USERNAME}`} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
            Открыть бота
          </a>
          {!confirmUnlink ? (
            <button type="button" onClick={() => setConfirmUnlink(true)} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/60 hover:text-ink">Отвязать Telegram</button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void handleUnlink()} className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Отвязываем…' : 'Да, отвязать'}</button>
              <button type="button" onClick={() => setConfirmUnlink(false)} className="text-sm font-medium text-ink/50 hover:text-ink">Отмена</button>
            </>
          )}
        </div>
        {confirmUnlink && <p className="mt-3 text-xs text-ink/50">После отвязки подписка и билеты будут находиться только по почте кабинета.</p>}
      </Card>
    )
  }

  return (
    <Card>
      <span className="inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Telegram не привязан</span>
      <p className="mt-3 text-lg font-semibold">Привяжите Telegram по коду из бота</p>
      <p className="mt-1 max-w-xl text-sm text-ink/60">
        Тогда подписка и билеты, оформленные через бота или с другой почтой, появятся в кабинете, а бот сможет присылать уведомления. Пароль и почта при этом не меняются.
      </p>
      <ol className="mt-5 space-y-5 text-sm">
        <li>
          <p className="font-medium">1. Получите код в боте</p>
          <p className="mt-1 text-ink/60">Откройте @{TELEGRAM_BOT_USERNAME} и нажмите Start, бот пришлёт код. Если бот уже открыт, отправьте ему команду /link.</p>
          <a href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=link`} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
            Получить код в боте
          </a>
        </li>
        <li>
          <form onSubmit={handleLink}>
            <label htmlFor="tg-code" className="font-medium">2. Введите код из бота</label>
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                id="tg-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                required
                placeholder="XXXX-XXXX"
                className="w-44 rounded-lg border border-ink/15 px-4 py-2.5 font-mono text-sm tracking-widest placeholder:text-ink/30 focus:border-ink/40 focus:outline-none"
              />
              <button type="submit" disabled={busy} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">{busy ? 'Привязываем…' : 'Привязать'}</button>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          </form>
        </li>
      </ol>
      <p className="mt-5 text-xs text-ink/50">Код действует 10 минут и срабатывает один раз. Никому его не сообщайте: с ним можно привязать ваш Telegram к чужому кабинету.</p>
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
