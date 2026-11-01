import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { setCabinetGreeting } from '../../lib/cabinetGreeting'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { fetchDashboard, fetchMe, signOut, type CabinetUser, type DashboardData } from '../../lib/cabinet'
import { forgetCabinetData } from '../../lib/vacanciesCabinet'
import { groups, icon, resolvePage, sectionsOfGroup } from './sections'
import { Avatar } from './ui'
import { roleOf } from './shared'
import Dashboard from './Dashboard'
import PageView from './PagesView'
import VacanciesWorkspace from './vacancies/VacanciesWorkspace'
import CareerWorkspace from './career/CareerWorkspace'
import { HolyGrail } from '../../components/layouts'
import KnowledgeBase from './KnowledgeBase'
import { ActivatePage, Landing } from './AccountAccess'

type Session = { state: 'loading' } | { state: 'anonymous'; notice?: string } | { state: 'error' } | { state: 'authed'; user: CabinetUser }

// Меню: «Главная», затем группы в порядке важности (см. sections.tsx); «Аккаунт» раскрывается списком, остальные — страницы-ленты.
const GROUP_ICONS: Record<string, ReactNode> = {
  vacancies: icon.case,
  career: icon.route,
  events: icon.ticket,
  knowledge: icon.book,
  networking: icon.users,
  partner: icon.gift,
  lawyer: icon.scales,
  account: icon.user,
}
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

// /cabinet — личный кабинет. Посетителям показываем вход и регистрацию по почте (резиденты сообщества; администратор проекта входит
// здесь же по своему логину), вошедший пользуется кабинетом как клиент сервиса. Разделы, которые ещё не сделаны, помечены
// «В разработке» и перечисляют, что осталось. Ссылка из письма «задайте пароль» — /cabinet/activate?token=…
export default function Cabinet() {
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
  // Сводка перечитывается при входе и при каждом переходе по разделам: страница при этом не пересоздаётся, поэтому старые цифры
  // остаются на экране, пока приходят новые (никакого мигания), а числа в меню и на вкладках всегда свежие.
  useEffect(() => {
    if (!authed) return
    let active = true
    fetchDashboard().then((r) => {
      if (active && r.ok) setDash(r.data)
    })
    return () => {
      active = false
    }
  }, [authed, section])

  // Приветствие «Здравствуйте, Имя» показывает шапка сайта, пока кабинет открыт.
  const greetingName = session.state === 'authed' ? (session.user.contact.name || session.user.name).split(' ')[0] : null
  useEffect(() => {
    setCabinetGreeting(greetingName)
    return () => setCabinetGreeting(null)
  }, [greetingName])

  const page = resolvePage(section)
  useDocumentTitle(page ? `${page.title} — Личный кабинет` : 'Личный кабинет')
  const menuId = page?.menuId ?? 'overview'
  // «Аккаунт» раскрывается по стрелке; пока человек сам не нажимал, он открыт только на страницах этой группы.
  const [accountPicked, setAccountPicked] = useState<boolean | null>(null)
  const accountOpen = accountPicked ?? menuId === 'account'

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
  // База знаний открывается на всю ширину: у неё своя панель разделов, меню кабинета и шапка страницы здесь не нужны.
  if (section === 'knowledge') return <KnowledgeBase user={user} />
  const refresh = async () => {
    const r = await fetchMe()
    if (r.state === 'authed') setSession(r)
    else if (r.state === 'anonymous') setSession({ state: 'anonymous', notice: 'Сессия закончилась. Войдите снова.' })
    void loadDash()
  }
  const unread = dash?.support.unread ?? 0
  // непрочитанные ответы рекрутера и уведомления вкладки «Вакансии»: число в меню
  const vacancyAlerts = (dash?.vacancies.unreadChats ?? 0) + (dash?.vacancies.unreadNotifications ?? 0)
  const role = roleOf(user)
  const accountItems = sectionsOfGroup('account')
  // Какой пункт «Аккаунта» подсвечен: «Настройки» — и на странице-ленте настроек, и на её разделах.
  const activeChild = page && page.menuId === 'account' ? (page.stacked ? 'settings' : page.parts[0].id) : null
  const signOutNow = async () => {
    await signOut()
    forgetCabinetData()
    setDash(null)
    setSession({ state: 'anonymous' })
  }

  const accountGroup = groups.find((g) => g.id === 'account')!
  const accountMenuLabel = accountGroup.title

  return (
    // ym-hide-content: содержимое кабинета (профиль, документы, согласия) не попадает в запись вебвизора Яндекс Метрики.
    <div className="ym-hide-content">
      {/* схема Holy Grail: шапка и подвал — сайта, слева меню, по центру содержимое, справа (по желанию) подсказки */}
      <HolyGrail
        nav={
        <>
          {/* Ячейка профиля ведёт на главную */}
          <Link to="/cabinet" aria-label="Главная кабинета" className={`glass block rounded-2xl p-3.5 ${focusRing}`}>
            <div className="flex items-center gap-3">
              <Avatar name={user.contact.name || user.name} email={user.contact.email} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.contact.name || user.name}</div>
                {user.contact.email && user.contact.email !== (user.contact.name || user.name) && <div className="truncate text-xs text-ink/50">{user.contact.email}</div>}
              </div>
            </div>
            <span className={`mt-2.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${role.tone === 'gold' ? 'bg-gold-light/30 text-ink' : role.tone === 'ink' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/70'}`}>{role.label}</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOutNow()}
            className={`mb-3 mt-2 flex w-full items-center justify-center rounded-xl border border-red-200 bg-red-50/70 px-4 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 hover:text-red-800 ${focusRing}`}
          >
            Выйти
          </button>

          {/* Компьютер */}
          <nav className="hidden max-h-[calc(100vh-13rem)] space-y-0.5 overflow-y-auto rounded-2xl bg-ink/[0.045] p-2 lg:block" aria-label="Разделы кабинета">
            <NavItem to="/cabinet" icon={icon.home} label="Главная" active={menuId === 'overview'} />
            {groups.map((g) =>
              g.id === 'account' ? (
                <div key={g.id}>
                  <button
                    type="button"
                    aria-expanded={accountOpen}
                    aria-controls="account-menu"
                    onClick={() => setAccountPicked(!accountOpen)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-left text-sm font-medium transition-colors hover:bg-white/60 ${menuId === 'account' ? 'text-ink' : 'text-ink/70 hover:text-ink'} ${focusRing}`}
                  >
                    {GROUP_ICONS.account}
                    <span className="min-w-0 flex-1">{accountMenuLabel}</span>
                    {!accountOpen && unread > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Есть новые ответы поддержки" />}
                    <Chevron open={accountOpen} />
                  </button>
                  {accountOpen && (
                    <div id="account-menu" className="mb-1 ml-4 space-y-0.5 border-l border-ink/15 pl-2">
                      {accountItems.map((s) => <NavItem key={s.id} to={`/cabinet/${s.id}`} icon={s.icon} label={s.title} active={activeChild === s.id} badge={s.id === 'support' ? unread : 0} small />)}
                    </div>
                  )}
                </div>
              ) : (
                <NavItem key={g.id} to={`/cabinet/${g.id}`} icon={GROUP_ICONS[g.id]} label={g.title} active={menuId === g.id} badge={g.id === 'vacancies' ? vacancyAlerts : 0} badgeLabel="Новых ответов и уведомлений" />
              ),
            )}
          </nav>

          {/* Телефон: пилюли; у «Аккаунта» раскрывается вторая строка */}
          <div className="space-y-2 lg:hidden" aria-label="Разделы кабинета">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Pill to="/cabinet" active={menuId === 'overview'}>Главная</Pill>
              {groups.map((g) =>
                g.id === 'account' ? (
                  <button
                    key={g.id}
                    type="button"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountPicked(!accountOpen)}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${menuId === 'account' ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/70 hover:text-ink'} ${focusRing}`}
                  >
                    {accountMenuLabel}{!accountOpen && unread > 0 ? ` · ${unread}` : ''}
                    <Chevron open={accountOpen} />
                  </button>
                ) : (
                  <Pill key={g.id} to={`/cabinet/${g.id}`} active={menuId === g.id}>{g.title}{g.id === 'vacancies' && vacancyAlerts > 0 ? ` · ${vacancyAlerts}` : ''}</Pill>
                ),
              )}
            </div>
            {accountOpen && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {accountItems.map((s) => <Pill key={s.id} to={`/cabinet/${s.id}`} active={activeChild === s.id} soft>{s.title}{s.id === 'support' && unread > 0 ? ` · ${unread}` : ''}</Pill>)}
              </div>
            )}
          </div>
        </>
        }
      >
          {page ? (
            <>
              <header className="mb-4">
                <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
                {page.lead && <p className="mt-1 max-w-3xl text-sm text-ink/60">{page.lead}</p>}
              </header>
              {page.menuId === 'vacancies' ? (
                <VacanciesWorkspace key={page.menuId} page={page} ctx={{ user, dash, onRefresh: refresh, onRead: loadDash }} />
              ) : page.menuId === 'career' ? (
                <CareerWorkspace key={page.menuId} page={page} ctx={{ user, dash, onRefresh: refresh, onRead: loadDash }} />
              ) : (
                <PageView key={page.menuId + page.title} page={page} ctx={{ user, dash, onRefresh: refresh, onRead: loadDash }} />
              )}
            </>
          ) : (
            <>
              <h1 className="sr-only">Главная</h1>
              <Dashboard user={user} dash={dash} />
            </>
          )}
      </HolyGrail>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function Pill({ to, active, soft, children }: { to: string; active: boolean; soft?: boolean; children: ReactNode }) {
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-ink bg-ink text-white' : soft ? 'border-ink/10 bg-ink/[0.04] text-ink/70 hover:text-ink' : 'border-ink/15 text-ink/70 hover:text-ink'} ${focusRing}`}>
      {children}
    </Link>
  )
}

function NavItem({ to, icon: ic, label, active, badge = 0, badgeLabel = 'Новых ответов', small }: { to: string; icon: ReactNode; label: string; active: boolean; badge?: number; badgeLabel?: string; small?: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-xl ${small ? 'px-3 py-1.5' : 'px-3.5 py-2'} text-sm transition-colors ${active ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(40,57,83,0.08),0_6px_14px_-8px_rgba(40,57,83,0.25)]' : 'font-medium text-ink/70 hover:bg-white/60 hover:text-ink'} ${focusRing}`}
    >
      <span className={active ? 'text-ink' : 'text-ink/55'}>{ic}</span>
      <span className="min-w-0">{label}</span>
      {badge > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-bold leading-none text-ink" aria-label={`${badgeLabel}: ${badge}`}>{badge}</span>}
    </Link>
  )
}
