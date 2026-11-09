import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { setCabinetGreeting } from '../../lib/cabinetGreeting'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { fetchDashboard, fetchMe, signOut, type CabinetUser, type DashboardData } from '../../lib/cabinet'
import { forgetCabinetData } from '../../lib/vacanciesCabinet'
import { groups, icon, resolvePage, sectionsOfGroup } from './sections'
import ProfileCard from './ProfileCard'
import Dashboard from './Dashboard'
import PageView from './PagesView'
import VacanciesWorkspace from './vacancies/VacanciesWorkspace'
import CareerWorkspace from './career/CareerWorkspace'
import { HolyGrail } from '../../components/layouts'
import KnowledgeBase from './KnowledgeBase'
import { ActivatePage, Landing } from './AccountAccess'
import MaterialManager from './MaterialManager'

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
  const materialManagement = section === 'manage-materials'
  useDocumentTitle(materialManagement ? 'Материалы сайта — Личный кабинет' : page ? `${page.title} — Личный кабинет` : 'Личный кабинет')
  const menuId = materialManagement ? 'manage-materials' : section === 'knowledge' ? 'knowledge' : page?.menuId ?? 'overview'
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
  const refresh = async () => {
    const r = await fetchMe()
    if (r.state === 'authed') setSession(r)
    else if (r.state === 'anonymous') setSession({ state: 'anonymous', notice: 'Сессия закончилась. Войдите снова.' })
    void loadDash()
  }
  const unread = dash?.support.unread ?? 0
  // непрочитанные ответы рекрутера и уведомления вкладки «Вакансии»: число в меню
  const vacancyAlerts = (dash?.vacancies.unreadChats ?? 0) + (dash?.vacancies.unreadNotifications ?? 0)
  const accountItems = sectionsOfGroup('account')
  // Какой пункт «Аккаунта» подсвечен: «Настройки» — и на странице-ленте настроек, и на её разделах.
  const activeChild = page && page.menuId === 'account' ? (page.stacked ? 'settings' : page.parts[0].id) : null
  const signOutNow = async () => {
    await signOut()
    forgetCabinetData()
    setDash(null)
    setSession({ state: 'anonymous' })
  }


  return (
    // ym-hide-content: содержимое кабинета (профиль, документы, согласия) не попадает в запись вебвизора Яндекс Метрики.
    <div className="ym-hide-content">
      {/* схема Holy Grail: шапка и подвал — сайта, слева меню, по центру содержимое, справа (по желанию) подсказки */}
      <HolyGrail
        nav={
        <>
          <ProfileCard user={user} dash={dash} open={accountOpen} onToggle={() => setAccountPicked(!accountOpen)}>
            {accountItems.map((s) => <NavItem key={s.id} to={`/cabinet/${s.id}`} icon={s.icon} label={s.id === 'profile' ? 'Личные данные и контакты' : s.title} active={activeChild === s.id} badge={s.id === 'support' ? unread : 0} small />)}
          </ProfileCard>
          <nav className="mt-3 hidden space-y-0.5 rounded-2xl bg-ink/[0.045] p-2 lg:block" aria-label="Разделы кабинета">
            <NavItem to="/cabinet" icon={icon.home} label="Главная" active={menuId === 'overview'} />
            {user.capabilities?.manageMaterials && <NavItem to="/cabinet/manage-materials" icon={icon.folder} label="Материалы сайта" active={materialManagement} />}
            {groups.map((g) => <NavItem key={g.id} to={`/cabinet/${g.id}`} icon={GROUP_ICONS[g.id]} label={g.title} active={menuId === g.id} badge={g.id === 'vacancies' ? vacancyAlerts : 0} badgeLabel="Новых ответов и уведомлений" />)}
          </nav>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:hidden" aria-label="Разделы кабинета">
            <Pill to="/cabinet" active={menuId === 'overview'}>Главная</Pill>
            {user.capabilities?.manageMaterials && <Pill to="/cabinet/manage-materials" active={materialManagement}>Материалы сайта</Pill>}
            {groups.map((g) => <Pill key={g.id} to={`/cabinet/${g.id}`} active={menuId === g.id}>{g.title}{g.id === 'vacancies' && vacancyAlerts > 0 ? ` · ${vacancyAlerts}` : ''}</Pill>)}
          </nav>
          <button type="button" onClick={() => void signOutNow()} className={`mt-3 flex w-full items-center justify-center rounded-xl border border-ink/15 px-4 py-2 text-xs font-medium text-ink/60 hover:bg-ink/5 hover:text-ink ${focusRing}`}>Выйти из аккаунта</button>
        </>
        }
      >
          {section === 'knowledge' ? <><header className="mb-4"><h1 className="text-2xl font-semibold tracking-tight">База знаний</h1><p className="mt-1 text-sm text-ink/60">Материалы сообщества: выберите тему и настройте фильтры.</p></header><KnowledgeBase user={user} /></> : materialManagement ? (user.capabilities?.manageMaterials ? <MaterialManager /> : <p role="alert">Этот раздел доступен только владельцу сайта.</p>) : page ? (
            <>
              <header className="mb-4">
                <h1 className={`font-semibold tracking-tight ${page.menuId === 'partner' ? 'whitespace-nowrap text-xl sm:text-2xl' : 'text-2xl'}`}>{page.title}</h1>
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
      className={`flex items-center gap-2.5 rounded-xl ${small ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} transition-colors ${active ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(40,57,83,0.08),0_6px_14px_-8px_rgba(40,57,83,0.25)]' : 'font-medium text-ink/70 hover:bg-white/60 hover:text-ink'} ${focusRing}`}
    >
      <span className={active ? 'text-ink' : 'text-ink/55'}>{ic}</span>
      <span className="min-w-0 whitespace-nowrap">{label}</span>
      {badge > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-bold leading-none text-ink" aria-label={`${badgeLabel}: ${badge}`}>{badge}</span>}
    </Link>
  )
}
