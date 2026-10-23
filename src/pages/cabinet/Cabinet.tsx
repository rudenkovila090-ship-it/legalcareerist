import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { fetchDashboard, fetchMe, signOut, type CabinetUser, type DashboardData } from '../../lib/cabinet'
import { groups, sectionById, sectionsOfGroup, type CabinetSection, type GroupId } from './sections'
import { Avatar, Card, Todo } from './ui'
import { roleOf } from './shared'
import Dashboard from './Dashboard'
import { ActivitySection, ProfileInfoSection, SettingsSection } from './AccountSections'
import { HelpSection, SupportSection } from './HelpSections'
import { ExpectationsSection, PracticesSection, PrivacySection } from './ProfileSections'
import { ConsentsSection, MyDataSection, VisibilitySection } from './DataSections'
import { EventsSection, ResidentSection, TelegramSection } from './CommunitySections'
import { CvSection, DocumentsSection } from './DocumentsSections'
import { ActivatePage, Landing, PasswordSection } from './AccountAccess'

const IconOverview = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
)

type Session = { state: 'loading' } | { state: 'anonymous'; notice?: string } | { state: 'error' } | { state: 'authed'; user: CabinetUser }

// /cabinet — личный кабинет. Посетителям показываем вход и регистрацию по почте (резиденты сообщества; администратор проекта входит
// здесь же по своему логину), вошедший пользуется кабинетом как клиент сервиса. Разделы, которые ещё не сделаны, помечены
// «В разработке» и перечисляют, что осталось. Ссылка из письма «задайте пароль» — /cabinet/activate?token=…
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

  // Сводка для обзора и числа непрочитанных ответов поддержки в меню; обновляется при входе и когда разделы что-то меняют.
  const [dash, setDash] = useState<DashboardData | null>(null)
  const authed = session.state === 'authed'
  const loadDash = useCallback(async () => {
    const r = await fetchDashboard()
    if (r.ok) setDash(r.data)
  }, [])
  useEffect(() => {
    if (!authed) return
    let active = true
    fetchDashboard().then((r) => {
      if (active && r.ok) setDash(r.data)
    })
    return () => {
      active = false
    }
  }, [authed])

  const current = sectionById(section)
  // Группа, раскрытая в мобильном меню: выбранная вручную (пока остаёмся на том же разделе) или группа текущего раздела.
  const [picked, setPicked] = useState<{ group: GroupId; section?: string } | null>(null)
  const openGroup: GroupId = picked && picked.section === current?.id ? picked.group : current?.group ?? groups[0].id
  const setOpenGroup = (group: GroupId) => setPicked({ group, section: current?.id })

  // Ссылка из письма «задайте пароль»: открывается, даже если в этом браузере уже есть вход (при восстановлении пароля так и бывает).
  if (section === 'activate') return <ActivatePage onSignedIn={(user) => setSession({ state: 'authed', user })} />
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
    void loadDash()
  }
  const unread = dash?.support.unread ?? 0
  const role = roleOf(user)

  return (
    // ym-hide-content: содержимое кабинета (профиль, документы, согласия) не попадает в запись вебвизора Яндекс Метрики.
    <div className="ym-hide-content">
      <PageHero eyebrow="Личный кабинет" title={current ? current.title : `Здравствуйте, ${(user.contact.name || user.name).split(' ')[0]}`} description={current?.lead ?? 'Всё о вашем аккаунте в одном месте: подписка, данные, история и поддержка.'} />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[17rem_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="glass mb-4 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.contact.name || user.name} email={user.contact.email} size="md" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{user.contact.name || user.name}</div>
                {user.contact.email && user.contact.email !== (user.contact.name || user.name) && <div className="truncate text-xs text-ink/50">{user.contact.email}</div>}
              </div>
            </div>
            <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${role.tone === 'gold' ? 'bg-gold-light/30 text-ink' : role.tone === 'ink' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/70'}`}>{role.label}</span>
            <Link
              to="/cabinet/privacy"
              className={`mt-3 hidden items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium lg:flex ${user.privacy.hidden ? 'bg-emerald-50 text-emerald-800' : 'bg-ink/[0.04] text-ink/60 hover:text-ink'}`}
            >
              {sectionById('privacy')?.icon}
              Скрытый поиск: {user.privacy.hidden ? 'включён' : 'выключен'}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                setDash(null)
                setSession({ state: 'anonymous' })
              }}
              className="mt-3 block rounded text-xs font-semibold text-ink/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40"
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
                {sectionsOfGroup(g.id).map((s) => <NavItem key={s.id} to={`/cabinet/${s.id}`} icon={s.icon} label={s.title} dev={!s.ready} badge={s.id === 'support' ? unread : 0} />)}
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
              {sectionsOfGroup(openGroup).map((s) => <Pill key={s.id} to={`/cabinet/${s.id}`}>{s.title}{s.id === 'support' && unread > 0 ? ` · ${unread}` : ''}</Pill>)}
            </div>
          </div>
        </aside>
        <main className="min-w-0">{!current ? <Dashboard user={user} dash={dash} /> : <SectionBody section={current} user={user} onRefresh={refresh} onRead={loadDash} />}</main>
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

function NavItem({ to, end, icon, label, dev, badge = 0 }: { to: string; end?: boolean; icon: ReactNode; label: string; dev?: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/[0.05] hover:text-ink'}`}
    >
      {icon}
      <span className="min-w-0">{label}</span>
      {dev && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="В разработке" />}
      {badge > 0 && <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-ink" aria-label={`Новых ответов: ${badge}`}>{badge}</span>}
    </NavLink>
  )
}

function SectionBody({ section, user, onRefresh, onRead }: { section: CabinetSection; user: CabinetUser; onRefresh: () => Promise<void>; onRead: () => void }) {
  const body: Record<string, ReactNode> = {
    profile: <ProfileInfoSection user={user} onSaved={onRefresh} />,
    activity: <ActivitySection />,
    settings: <SettingsSection user={user} onRefresh={onRefresh} />,
    help: <HelpSection />,
    support: <SupportSection onRead={onRead} />,
    password: <PasswordSection user={user} />,
    privacy: <PrivacySection onSaved={() => void onRefresh()} />,
    practices: <PracticesSection />,
    expectations: <ExpectationsSection />,
    consents: <ConsentsSection user={user} onRefresh={onRefresh} />,
    mydata: <MyDataSection />,
    visibility: <VisibilitySection />,
    resident: <ResidentSection user={user} />,
    events: <EventsSection />,
    telegram: <TelegramSection user={user} onRefresh={onRefresh} />,
    cv: <CvSection />,
    documents: <DocumentsSection />,
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
      {section.todo.length > 0 && <Todo items={section.todo} />}
    </div>
  )
}
