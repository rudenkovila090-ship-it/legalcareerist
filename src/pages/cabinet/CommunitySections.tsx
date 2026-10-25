import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { cancelSubscription, fetchEvents, fetchSubscription, linkTelegram, requestCardChange, unlinkTelegram, type CabinetEvent, type CabinetUser, type SubscriptionInfo } from '../../lib/cabinet'
import { events as catalogEvents } from '../../data/events'
import { eventStories } from '../../data/eventStories'
import { articles } from '../../data/articles'
import { eventTimeRange } from '../../lib/eventTime'
import { pluralRu } from '../../lib/plural'
import { TELEGRAM_BOT_USERNAME } from '../../lib/telegram'
import { Card, Chip } from './ui'
import { longDate } from './shared'

// ---- Мероприятия: афиша и мои регистрации ----
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

/** Ближайшие мероприятия сайта: открытые и ещё не закончившиеся, по дате. */
function upcomingEvents() {
  const now = Date.now()
  return catalogEvents
    .filter((e) => e.status === 'open' && Date.parse(e.endDateTime ?? e.dateTime) >= now)
    .sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime))
}

function PosterCard({ event }: { event: (typeof catalogEvents)[number] }) {
  const image = eventStories[event.slug]?.cardImage
  const [ru] = event.title.split(' / ')
  const start = new Date(event.dateTime)
  const place = [event.city, event.venue || event.location].filter(Boolean).join(', ')
  return (
    <Link to={`/events/${event.slug}`} className={`group relative block overflow-hidden rounded-2xl bg-ink text-white ${focusRing}`}>
      {image && <img src={image} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-[50%_30%] opacity-60 transition-transform duration-700 group-hover:scale-[1.03]" />}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" aria-hidden="true" />
      <div className="relative flex min-h-[15rem] flex-col justify-end gap-3 p-5 sm:min-h-[17rem] sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">{start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">{eventTimeRange(event)}</span>
        </div>
        <div className="text-xl font-semibold leading-snug sm:text-2xl">{ru}</div>
        {place && <div className="text-sm text-white/70">{place}</div>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="rounded-full bg-gold-light px-5 py-2 text-sm font-semibold text-ink">Подробнее и билеты</span>
          {event.price > 0 && <span className="text-sm text-white/70">от {event.price.toLocaleString('ru-RU')} ₽</span>}
        </div>
      </div>
    </Link>
  )
}

export function EventsSection() {
  const [events, setEvents] = useState<CabinetEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  const upcoming = upcomingEvents()

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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/40">Афиша</h3>
        {upcoming.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {upcoming.map((e) => <PosterCard key={e.id} event={e} />)}
          </div>
        ) : (
          <Card>
            <p className="font-semibold">Ближайшие мероприятия скоро анонсируем</p>
            <p className="mt-1 text-sm text-ink/60">Следите за обновлениями в Telegram-боте и сообществе.</p>
          </Card>
        )}
        <Link to="/events" className={`mt-3 inline-block rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>Все мероприятия →</Link>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/40">Мои регистрации</h3>
        {failed && <p className="text-sm text-ink/50">Не удалось загрузить регистрации. Обновите страницу.</p>}
        {!failed && !events && <p className="text-sm text-ink/50">Загружаем…</p>}
        {events && events.length === 0 && (
          <Card>
            <p className="font-semibold">Регистраций пока нет</p>
            <p className="mt-1 text-sm text-ink/60">Регистрации находятся по почте кабинета, телефону или нику в Telegram, с которыми вы записывались.</p>
          </Card>
        )}
        {events && events.length > 0 && (
          <ul className="space-y-3">
            {events.map((e, i) => (
              <li key={`${e.slug}-${i}`} className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-5">
                <div>
                  {e.slug ? <Link to={`/events/${e.slug}`} className="font-semibold hover:underline">{e.title}</Link> : <span className="font-semibold">{e.title}</span>}
                  <div className="mt-0.5 text-sm text-ink/60">{longDate(e.date)}{e.tariff ? ` · ${e.tariff}` : ''}{e.amount ? ` · ${e.amount.toLocaleString('ru-RU')} ₽` : ''}</div>
                </div>
                <Chip tone={e.attended || e.status === 'Оплачен' ? 'good' : 'muted'}>{e.status}</Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---- База знаний (для резидентов) ----
export function KnowledgeSection() {
  const list = [...articles].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6)
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((a) => (
          <Link key={a.id} to={`/knowledge/${a.slug}`} className={`glass flex min-w-0 flex-col gap-2 rounded-2xl p-5 ${focusRing}`}>
            <span className="text-xs text-ink/50">{longDate(Date.parse(a.date))}</span>
            <span className="font-semibold leading-snug">{a.title}</span>
            <span className="line-clamp-2 text-sm text-ink/60">{a.excerpt}</span>
          </Link>
        ))}
      </div>
      <Link to="/blog" className={`inline-block rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>Вся база знаний →</Link>
    </div>
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

// ---- Статус: подписка на сообщество ----
const money = (n?: number | null) => (n ? `${n.toLocaleString('ru-RU')} ₽` : '—')

export function StatusSection({ user, onRefresh }: { user: CabinetUser; onRefresh: () => Promise<void> }) {
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [panel, setPanel] = useState<'none' | 'history' | 'cancel' | 'card'>('none')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ kind: 'cancel' | 'card'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    fetchSubscription().then((r) => {
      if (!active) return
      if (r.ok) setSub(r.data.subscription)
      else setFailed(true)
    })
    return () => {
      active = false
    }
  }, [])

  if (failed) return <Card><p className="text-sm text-ink/60">Не получилось загрузить данные подписки. Обновите страницу через минуту.</p></Card>
  if (!sub) return <Card><p className="text-sm text-ink/50">Загружаем…</p></Card>

  const status = sub.status
  const lifetime = status === 'lifetime'
  const active = status === 'active'
  const toggle = (next: 'history' | 'cancel' | 'card') => {
    setPanel((p) => (p === next ? 'none' : next))
    setError('')
  }

  async function doCancel() {
    setBusy(true)
    setError('')
    const r = await cancelSubscription(reason)
    setBusy(false)
    if (!r.ok) {
      setError(r.error === 'too_many_attempts' ? 'Слишком много попыток. Попробуйте позже или напишите в чат поддержки.' : r.error === 'already_cancelled' ? 'Подписка уже отключена. Обновите страницу.' : 'Не получилось отключить. Попробуйте ещё раз или напишите в чат поддержки.')
      return
    }
    setPanel('none')
    setReason('')
    // сразу снимаем кнопку отключения, не дожидаясь обновления данных: двойной щелчок ничего не отправит второй раз
    setSub((prev) => (prev ? { ...prev, canCancel: false, cancelled: true, autoRenew: false, nextPayment: null } : prev))
    setDone({
      kind: 'cancel',
      text: r.data.test
        ? 'Тест основателя: путь отключения пройден, подписка не изменилась.'
        : r.data.confirmed
          ? `Автопродление отключено, списаний больше не будет. Доступ к сообществу сохранится${r.data.endsAt ? ` до ${longDate(r.data.endsAt)}` : ' до конца оплаченного периода'}.`
          : 'Мы получили заявку, но автоматически отключить подписку в платёжной системе не получилось. Мы отключим её вручную; если за это время придёт списание, напишите в чат поддержки.',
    })
    const refreshed = await fetchSubscription()
    if (refreshed.ok) setSub(refreshed.data.subscription)
    await onRefresh()
  }

  async function copyInvite(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен: ссылка видна на странице
    }
  }

  async function doCard() {
    setBusy(true)
    setError('')
    const r = await requestCardChange()
    setBusy(false)
    if (!r.ok) {
      setError(r.error === 'too_many_attempts' ? 'Запрос уже отправлен. Ответ придёт в чат поддержки.' : 'Не получилось отправить запрос. Напишите в чат поддержки.')
      return
    }
    setPanel('none')
    setDone({ kind: 'card', text: 'Запрос отправлен. Ответ придёт в чат поддержки, на почту и в Telegram, если он привязан.' })
  }

  const badge =
    status === 'none' ? <Chip>Нет подписки</Chip>
    : lifetime ? <Chip tone="good">Бессрочный резидент</Chip>
    : active ? <Chip tone="good">{sub.cancelled ? 'Подписка активна, автопродление отключено' : 'Подписка активна'}</Chip>
    : <Chip tone="warn">Подписка закончилась</Chip>

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">{badge}</div>
        {status === 'none' ? (
          <>
            <p className="mt-3 text-lg font-semibold">Вы пока не резидент сообщества</p>
            <p className="mt-1 text-sm text-ink/60">
              Резидентом можно стать на странице сообщества.
              {!user.telegramLinked && ` Если подписка уже оформлена, привяжите Telegram или откройте @${TELEGRAM_BOT_USERNAME} и нажмите Start: тогда она появится здесь.`}
            </p>
            <a href="/community#join" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">Выбрать тариф</a>
          </>
        ) : (
          <>
            <p className="mt-3 text-lg font-semibold">
              {lifetime ? 'Подписка бессрочная' : active ? `Доступ к сообществу до ${longDate(sub.until)}` : `Подписка закончилась ${longDate(sub.until)}`}
            </p>
            {active && typeof sub.daysLeft === 'number' && <p className="mt-1 text-sm text-ink/60">Осталось {sub.daysLeft} {pluralRu(sub.daysLeft, ['день', 'дня', 'дней'])}</p>}
            <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Fact label="Тариф" value={sub.tariff ?? '—'} note={!lifetime && sub.price ? `${money(sub.price)}${sub.period ? ` за ${sub.period}` : ''}` : undefined} />
              <Fact label="Статус" value={lifetime ? 'Активна, без списаний' : active ? (sub.cancelled ? 'Активна до конца периода' : 'Активна') : 'Закончилась'} />
              <Fact label={active ? 'Действует до' : 'Закончилась'} value={lifetime ? (sub.until ? longDate(sub.until) : 'Бессрочно') : longDate(sub.until)} />
              <Fact
                label="Следующее списание"
                value={sub.nextPayment ? longDate(sub.nextPayment) : '—'}
                note={sub.nextPayment ? money(sub.price) : lifetime ? 'списаний нет' : sub.oneTime ? 'разовая подписка, без автопродления' : sub.cancelled ? 'автопродление отключено' : undefined}
              />
              {sub.since && <Fact label="Резидент с" value={longDate(sub.since)} />}
            </dl>

            {active && !lifetime && sub.invite && (
              <div className="mt-6 rounded-xl border border-ink/10 p-4">
                <h3 className="text-sm font-semibold">Ссылка на вступление в закрытый чат</h3>
                <p className="mt-1 text-sm text-ink/70">
                  {sub.joined ? `Вы в закрытом чате${sub.joinedAt ? ` с ${longDate(sub.joinedAt)}` : ''}. Ссылка нужна, только если вышли из чата и хотите вернуться. ` : ''}
                  Подайте заявку по ссылке, и бот одобрит её автоматически: подписка у вас оплачена.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <a href={sub.invite.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90">Вступить в сообщество</a>
                  <button type="button" onClick={() => void copyInvite(sub.invite!.url)} className="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink">{copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <ActionButton on={panel === 'history'} onClick={() => toggle('history')}>История оплат</ActionButton>
              {sub.canCancel && <ActionButton on={panel === 'cancel'} onClick={() => toggle('cancel')} danger>Отключить автопродление</ActionButton>}
              {!lifetime && <ActionButton on={panel === 'card'} onClick={() => toggle('card')}>Сменить карту</ActionButton>}
              {(status === 'ended' || sub.cancelled || sub.oneTime) && <a href="/community#join" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90">{status === 'ended' ? 'Продлить подписку' : 'Оформить продление'}</a>}
            </div>
          </>
        )}

        {done && (
          <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${done.kind === 'cancel' ? 'bg-emerald-50 text-emerald-800' : 'bg-ink/[0.05] text-ink/80'}`}>
            {done.text} {done.kind === 'card' && <Link to="/cabinet/support" className="font-semibold underline">Открыть чат</Link>}
          </p>
        )}

        {panel === 'history' && (
          <div className="mt-5 rounded-xl border border-ink/10 p-4">
            <h3 className="text-sm font-semibold">История оплат</h3>
            {sub.payments.length === 0 ? (
              <p className="mt-2 text-sm text-ink/60">Оплат пока нет.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink/10">
                {sub.payments.map((p, i) => (
                  <li key={`${p.paidAt}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{p.paidAt ? longDate(p.paidAt) : 'Дата неизвестна'}</span>
                    <span className="font-semibold tabular-nums">{p.amount ? money(p.amount) : '—'}{p.estimated && <span className="ml-1 font-normal text-ink/40" title="Сумма оценочная: перенесена из прежней системы">≈</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink/50">Чек каждой оплаты приходит на почту, указанную при оплате.</p>
          </div>
        )}

        {panel === 'cancel' && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50/50 p-4">
            <h3 className="text-sm font-semibold">Отключить автопродление?</h3>
            <p className="mt-1 text-sm text-ink/70">Списаний больше не будет. Доступ к сообществу сохранится до {longDate(sub.until)}, потом закончится. Подписку можно оформить заново в любой момент.</p>
            <label htmlFor="cancel-reason" className="mt-3 block text-sm font-medium text-ink/80">Почему отключаете? Необязательно, но нам это важно</label>
            <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-base focus:border-ink/40 focus:outline-none sm:text-sm" />
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button type="button" disabled={busy} onClick={() => void doCancel()} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Отключаем…' : 'Отключить'}</button>
              <button type="button" onClick={() => setPanel('none')} className="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink">Не отключать</button>
            </div>
          </div>
        )}

        {panel === 'card' && (
          <div className="mt-5 rounded-xl border border-ink/10 p-4">
            <h3 className="text-sm font-semibold">Сменить карту для списаний</h3>
            <p className="mt-1 text-sm text-ink/70">Платёжная система не позволяет сменить карту самостоятельно, поэтому это делает поддержка. Нажмите кнопку: запрос с данными вашей подписки уйдёт нам, а ответ придёт в чат поддержки, на почту и в Telegram, если он привязан.</p>
            {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2.5">
              <button type="button" disabled={busy} onClick={() => void doCard()} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">{busy ? 'Отправляем…' : 'Отправить запрос'}</button>
              <button type="button" onClick={() => setPanel('none')} className="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink">Отмена</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-ink/50">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      {note && <dd className="text-xs text-ink/50">{note}</dd>}
    </div>
  )
}

function ActionButton({ on, danger, onClick, children }: { on: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  const base = 'rounded-full border px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
  const tone = danger
    ? on ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 text-red-700 hover:bg-red-50'
    : on ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/70 hover:text-ink'
  return <button type="button" aria-pressed={on} onClick={onClick} className={`${base} ${tone}`}>{children}</button>
}
