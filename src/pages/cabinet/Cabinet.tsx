import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { pluralRu } from '../../lib/plural'
import { TELEGRAM_BOT_USERNAME } from '../../lib/telegram'
import { fetchMe, signIn, signOut, type CabinetUser, type ResidentInfo } from '../../lib/cabinet'
import { sectionById, sections, type CabinetSection } from './sections'

const inputClass = 'w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none'
const longDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

const IconOverview = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
)

type Session = { state: 'loading' } | { state: 'anonymous'; notice?: string } | { state: 'error' } | { state: 'authed'; user: CabinetUser }

// /cabinet — личный кабинет. Посетителям показываем «раздел в разработке» и вход для администратора проекта; вошедший
// пользуется кабинетом как клиент сервиса. Разделы, которые ещё не сделаны, помечены «В разработке» и перечисляют, что осталось.
export default function Cabinet() {
  useDocumentTitle('Личный кабинет')
  const { section } = useParams()
  const [session, setSession] = useState<Session>({ state: 'loading' })

  // Кабинет не для поисковиков.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    let active = true
    fetchMe().then((r) => active && setSession(r.state === 'authed' ? r : r.state === 'error' ? { state: 'error' } : { state: 'anonymous' }))
    return () => {
      active = false
    }
  }, [])

  if (session.state === 'loading') {
    return <div className="container-page py-24 text-center text-sm text-ink/50">Загружаем кабинет…</div>
  }
  if (session.state === 'error') {
    return (
      <div className="container-page py-24 text-center">
        <p className="text-sm text-ink/60">Не получилось связаться с сервером. Обновите страницу через минуту.</p>
      </div>
    )
  }
  if (session.state === 'anonymous') {
    return <Landing notice={session.notice} onSignedIn={(user) => setSession({ state: 'authed', user })} />
  }

  const user = session.user
  const current = sectionById(section)
  return (
    <div>
      <PageHero eyebrow="Личный кабинет" title={current ? current.title : `Здравствуйте, ${user.name.split(' ')[0]}`} description={current?.lead} />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[17rem_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="glass mb-4 rounded-xl p-4">
            <div className="truncate font-semibold">{user.name}</div>
            <span className="mt-1 inline-block rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">Клиент сервиса</span>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                setSession({ state: 'anonymous' })
              }}
              className="mt-3 block text-xs font-semibold text-ink/50 hover:text-ink"
            >
              Выйти
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0" aria-label="Разделы кабинета">
            <NavItem to="/cabinet" end icon={<IconOverview />} label="Обзор" />
            {sections.map((s) => (
              <NavItem key={s.id} to={`/cabinet/${s.id}`} icon={s.icon} label={s.title} dev={!s.ready} />
            ))}
          </nav>
        </aside>
        <main className="min-w-0">
          {!current ? <Overview user={user} /> : current.id === 'resident' ? <ResidentSection section={current} user={user} /> : <DevSection section={current} />}
        </main>
      </div>
    </div>
  )
}

function NavItem({ to, end, icon, label, dev }: { to: string; end?: boolean; icon: React.ReactNode; label: string; dev?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors lg:whitespace-normal lg:rounded-lg ${
          isActive ? 'bg-ink text-white' : 'border border-ink/15 text-ink/70 hover:text-ink lg:border-transparent lg:hover:bg-ink/[0.05]'
        }`
      }
    >
      {icon}
      <span className="min-w-0">{label}</span>
      {dev && <span className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 lg:block" title="В разработке" />}
    </NavLink>
  )
}

function Landing({ notice, onSignedIn }: { notice?: string; onSignedIn: (user: CabinetUser) => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(notice ?? '')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await signIn(login, password)
    if (!r.ok) {
      setBusy(false)
      setError(
        r.error === 'too_many_attempts' ? 'Слишком много попыток. Попробуйте через 15 минут.'
        : r.error === 'not_configured' ? 'Вход пока не настроен.'
        : r.error === 'network' ? 'Не получилось связаться с сервером. Попробуйте ещё раз.'
        : 'Неверный логин или пароль.',
      )
      return
    }
    const me = await fetchMe()
    setBusy(false)
    if (me.state === 'authed') onSignedIn(me.user)
    else setError('Вход выполнен, но кабинет не открылся. Обновите страницу.')
  }

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет"
        title="Личный кабинет"
        description="Раздел в разработке. Здесь появятся резюме, рынок труда, карьерный маршрут и другие инструменты для юристов."
      />
      <div className="container-page grid gap-6 py-12 lg:grid-cols-[1fr_22rem]">
        <section className="glass rounded-2xl p-6">
          <div className="mb-1 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">В разработке</div>
          <h2 className="mt-2 text-xl font-semibold">Что будет в кабинете</h2>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border border-ink/10 px-3.5 py-2.5 text-sm text-ink/80">
                <span className="text-ink/50">{s.icon}</span>
                {s.title}
              </li>
            ))}
          </ul>
        </section>
        <form onSubmit={handleSubmit} className="glass h-fit rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Вход для администратора</h2>
          <p className="mt-1 text-sm text-ink/60">Пока кабинет в разработке, вход открыт только администратору проекта.</p>
          <div className="mt-4 grid gap-3">
            <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин" autoComplete="username" required className={inputClass} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Пароль" autoComplete="current-password" required className={inputClass} />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="rounded-full bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
              {busy ? 'Входим…' : 'Войти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Overview({ user }: { user: CabinetUser }) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.id} to={`/cabinet/${s.id}`} className="glass flex flex-col rounded-xl p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">{s.icon}</span>
              {s.ready ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {s.id === 'resident' ? residentBadge(user.resident) : 'Доступно'}
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">В разработке</span>
              )}
            </div>
            <div className="mt-3 font-semibold">{s.title}</div>
            <p className="mt-1 text-sm text-ink/60">{s.lead}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink/40">Разделы со значком «В разработке» мы будем настраивать по очереди.</p>
    </div>
  )
}

const residentBadge = (r: ResidentInfo) => (r.status === 'lifetime' ? 'Бессрочно' : r.status === 'active' ? 'Резидент' : r.status === 'ended' ? 'Подписка закончилась' : 'Нет подписки')

function DevSection({ section }: { section: CabinetSection }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">В разработке</div>
      <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink/50">Что ещё не сделано</h2>
      <ul className="mt-3 space-y-2.5">
        {section.todo.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm text-ink/80">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-ink/25" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-ink/40">Список предварительный: уточним, когда дойдём до этого раздела.</p>
    </div>
  )
}

function ResidentSection({ section, user }: { section: CabinetSection; user: CabinetUser }) {
  const r = user.resident
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6">
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
      </div>
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Что ещё не сделано</h2>
        <ul className="mt-3 space-y-2.5">
          {section.todo.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm text-ink/80">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-ink/25" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
