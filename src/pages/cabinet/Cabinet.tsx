import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { fetchMe, signIn, signOut, type CabinetUser, type ResidentInfo } from '../../lib/cabinet'
import { groups, sectionById, sections, sectionsOfGroup, type CabinetSection, type GroupId } from './sections'
import { Card, Todo } from './ui'
import { inputClass } from './shared'
import { ExpectationsSection, PracticesSection, PrivacySection } from './ProfileSections'
import { ConsentsSection, MyDataSection, VisibilitySection } from './DataSections'
import { EventsSection, ResidentSection, TelegramSection } from './CommunitySections'

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

  const current = sectionById(section)
  // Группа, раскрытая в мобильном меню: выбранная вручную (пока остаёмся на том же разделе) или группа текущего раздела.
  const [picked, setPicked] = useState<{ group: GroupId; section?: string } | null>(null)
  const openGroup: GroupId = picked && picked.section === current?.id ? picked.group : current?.group ?? groups[0].id
  const setOpenGroup = (group: GroupId) => setPicked({ group, section: current?.id })

  if (session.state === 'loading') return <div className="container-page py-24 text-center text-sm text-ink/50">Загружаем кабинет…</div>
  if (session.state === 'error') {
    return (
      <div className="container-page py-24 text-center">
        <p className="text-sm text-ink/60">Не получилось связаться с сервером. Обновите страницу через минуту.</p>
      </div>
    )
  }
  if (session.state === 'anonymous') return <Landing notice={session.notice} onSignedIn={(user) => setSession({ state: 'authed', user })} />

  const user = session.user
  const refresh = async () => {
    const r = await fetchMe()
    if (r.state === 'authed') setSession(r)
    else if (r.state === 'anonymous') setSession({ state: 'anonymous', notice: 'Сессия закончилась. Войдите снова.' })
  }

  return (
    <div>
      <PageHero eyebrow="Личный кабинет" title={current ? current.title : `Здравствуйте, ${user.name.split(' ')[0]}`} description={current?.lead} />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[17rem_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="glass mb-4 rounded-xl p-4">
            <div className="truncate font-semibold">{user.name}</div>
            <span className="mt-1 inline-block rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">Клиент сервиса</span>
            <Link
              to="/cabinet/privacy"
              className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${user.privacy.hidden ? 'bg-emerald-50 text-emerald-800' : 'bg-ink/[0.04] text-ink/60 hover:text-ink'}`}
            >
              {sectionById('privacy')?.icon}
              Скрытый поиск: {user.privacy.hidden ? 'включён' : 'выключен'}
            </Link>
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

          {/* Компьютер: все разделы по группам. */}
          <nav className="hidden max-h-[calc(100vh-14rem)] overflow-y-auto pr-1 lg:block" aria-label="Разделы кабинета">
            <NavItem to="/cabinet" end icon={<IconOverview />} label="Обзор" />
            {groups.map((g) => (
              <div key={g.id}>
                <div className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink/40">{g.title}</div>
                {sectionsOfGroup(g.id).map((s) => <NavItem key={s.id} to={`/cabinet/${s.id}`} icon={s.icon} label={s.title} dev={!s.ready} />)}
              </div>
            ))}
          </nav>

          {/* Телефон: сначала группа, потом её разделы — две строки прокручиваемых пилюль. */}
          <div className="space-y-2 lg:hidden" aria-label="Разделы кабинета">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Pill to="/cabinet" end>Обзор</Pill>
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setOpenGroup(g.id)} className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${openGroup === g.id ? 'bg-ink/10 text-ink' : 'text-ink/50'}`}>
                  {g.title}
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sectionsOfGroup(openGroup).map((s) => <Pill key={s.id} to={`/cabinet/${s.id}`}>{s.title}</Pill>)}
            </div>
          </div>
        </aside>
        <main className="min-w-0">{!current ? <Overview user={user} /> : <SectionBody section={current} user={user} onRefresh={refresh} />}</main>
      </div>
    </div>
  )
}

function Pill({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/70 hover:text-ink'}`}>
      {children}
    </NavLink>
  )
}

function NavItem({ to, end, icon, label, dev }: { to: string; end?: boolean; icon: ReactNode; label: string; dev?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/[0.05] hover:text-ink'}`}
    >
      {icon}
      <span className="min-w-0">{label}</span>
      {dev && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="В разработке" />}
    </NavLink>
  )
}

function SectionBody({ section, user, onRefresh }: { section: CabinetSection; user: CabinetUser; onRefresh: () => Promise<void> }) {
  const body: Record<string, ReactNode> = {
    privacy: <PrivacySection onSaved={() => void onRefresh()} />,
    practices: <PracticesSection />,
    expectations: <ExpectationsSection />,
    consents: <ConsentsSection user={user} onRefresh={onRefresh} />,
    mydata: <MyDataSection />,
    visibility: <VisibilitySection />,
    resident: <ResidentSection user={user} />,
    events: <EventsSection />,
    telegram: <TelegramSection user={user} />,
  }
  if (!section.ready || !body[section.id]) {
    return (
      <Card>
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
      </Card>
    )
  }
  return (
    <div className="space-y-6">
      {body[section.id]}
      <Todo items={section.todo} />
    </div>
  )
}

const residentBadge = (r: ResidentInfo) => (r.status === 'lifetime' ? 'Бессрочно' : r.status === 'active' ? 'Резидент' : r.status === 'ended' ? 'Подписка закончилась' : 'Нет подписки')

function Overview({ user }: { user: CabinetUser }) {
  const mk = user.consents.marketing
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatusTile to="/cabinet/resident" label="Сообщество" value={residentBadge(user.resident)} good={user.resident.status === 'active' || user.resident.status === 'lifetime'} />
        <StatusTile to="/cabinet/privacy" label="Скрытый поиск" value={user.privacy.hidden ? 'Включён' : 'Выключен'} good={user.privacy.hidden} />
        <StatusTile to="/cabinet/consents" label="Рассылки" value={mk === true ? 'Включены' : mk === false ? 'Выключены' : 'Не выбрано'} good={mk === true} />
      </div>
      {groups.map((g) => (
        <section key={g.id}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/40">{g.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {sectionsOfGroup(g.id).map((s) => (
              <Link key={s.id} to={`/cabinet/${s.id}`} className="glass flex min-w-0 items-center gap-3 rounded-xl p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">{s.icon}</span>
                <span className="min-w-0 flex-1 font-semibold leading-snug">{s.title}</span>
                {s.ready ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Доступно</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">В разработке</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-ink/40">Всего разделов: {sections.length}. Разделы со значком «В разработке» мы будем настраивать по очереди.</p>
    </div>
  )
}

function StatusTile({ to, label, value, good }: { to: string; label: string; value: string; good: boolean }) {
  return (
    <Link to={to} className="glass rounded-xl p-4">
      <div className="text-xs text-ink/50">{label}</div>
      <div className={`mt-1 font-semibold ${good ? 'text-emerald-700' : 'text-ink'}`}>{value}</div>
    </Link>
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
        description="Раздел в разработке. Здесь появятся профиль юриста с режимом конфиденциальности, отклики и интервью, карьерный план, статус в сообществе и управление вашими данными."
      />
      <div className="container-page grid gap-6 py-12 lg:grid-cols-[1fr_22rem]">
        <section className="glass rounded-2xl p-6">
          <div className="mb-1 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">В разработке</div>
          <h2 className="mt-2 text-xl font-semibold">Что будет в кабинете</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g.id}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/40">{g.title}</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-ink/80">
                  {sectionsOfGroup(g.id).map((s) => <li key={s.id}>{s.title}</li>)}
                </ul>
              </div>
            ))}
          </div>
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
