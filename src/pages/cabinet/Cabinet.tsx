import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { fetchDashboard, fetchMe, signOut, type CabinetUser, type DashboardData } from '../../lib/cabinet'
import { groups, icon, resolvePage, sectionsOfGroup } from './sections'
import { Avatar } from './ui'
import { roleOf } from './shared'
import Dashboard from './Dashboard'
import PageView from './PagesView'
import { ActivatePage, Landing } from './AccountAccess'

const IconOverview = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
)

type Session = { state: 'loading' } | { state: 'anonymous'; notice?: string } | { state: 'error' } | { state: 'authed'; user: CabinetUser }

// Верхний уровень меню: «Сообщество», «Поиск работы» и «Для юристов» — страницы-ленты со всеми разделами группы сразу.
const GROUP_ICONS: Record<string, ReactNode> = { community: icon.users, jobs: icon.case, lawyer: icon.scales }
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

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

  const page = resolvePage(section)
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
  const refresh = async () => {
    const r = await fetchMe()
    if (r.state === 'authed') setSession(r)
    else if (r.state === 'anonymous') setSession({ state: 'anonymous', notice: 'Сессия закончилась. Войдите снова.' })
    void loadDash()
  }
  const unread = dash?.support.unread ?? 0
  const role = roleOf(user)
  const accountItems = sectionsOfGroup('account')
  // Какой пункт «Аккаунта» подсвечен: «Настройки» — и на странице-ленте настроек, и на её разделах.
  const activeChild = page && page.menuId === 'account' ? (page.stacked ? 'settings' : page.parts[0].id) : null
  const signOutNow = async () => {
    await signOut()
    setDash(null)
    setSession({ state: 'anonymous' })
  }

  return (
    // ym-hide-content: содержимое кабинета (профиль, документы, согласия) не попадает в запись вебвизора Яндекс Метрики.
    <div className="ym-hide-content">
      <PageHero eyebrow="Личный кабинет" title={page ? page.title : `Здравствуйте, ${(user.contact.name || user.name).split(' ')[0]}`} description={page?.lead ?? 'Всё о вашем аккаунте в одном месте: подписка, данные, история и поддержка.'} />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[17rem_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {/* Ячейка профиля ведёт на обзор */}
          <Link to="/cabinet" aria-label="Обзор кабинета" className={`glass block rounded-2xl p-4 ${focusRing}`}>
            <div className="flex items-center gap-3">
              <Avatar name={user.contact.name || user.name} email={user.contact.email} size="md" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{user.contact.name || user.name}</div>
                {user.contact.email && user.contact.email !== (user.contact.name || user.name) && <div className="truncate text-xs text-ink/50">{user.contact.email}</div>}
              </div>
            </div>
            <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${role.tone === 'gold' ? 'bg-gold-light/30 text-ink' : role.tone === 'ink' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/70'}`}>{role.label}</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOutNow()}
            className={`mb-4 mt-2 flex w-full items-center justify-center rounded-xl border border-red-200 bg-red-50/70 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 hover:text-red-800 ${focusRing}`}
          >
            Выйти
          </button>

          {/* Компьютер */}
          <nav className="hidden max-h-[calc(100vh-14rem)] overflow-y-auto pr-1 lg:block" aria-label="Разделы кабинета">
            <NavItem to="/cabinet" icon={<IconOverview />} label="Обзор" active={menuId === 'overview'} />
            <button
              type="button"
              aria-expanded={accountOpen}
              aria-controls="account-menu"
              onClick={() => setAccountPicked(!accountOpen)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-ink/[0.05] ${menuId === 'account' ? 'text-ink' : 'text-ink/70 hover:text-ink'} ${focusRing}`}
            >
              {icon.user}
              <span className="min-w-0 flex-1">Аккаунт</span>
              {!accountOpen && unread > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Есть новые ответы поддержки" />}
              <Chevron open={accountOpen} />
            </button>
            {accountOpen && (
              <div id="account-menu" className="mb-1 ml-4 space-y-0.5 border-l border-ink/10 pl-2">
                {accountItems.map((s) => <NavItem key={s.id} to={`/cabinet/${s.id}`} icon={s.icon} label={s.title} active={activeChild === s.id} badge={s.id === 'support' ? unread : 0} small />)}
              </div>
            )}
            {groups.filter((g) => g.id !== 'account').map((g) => (
              <NavItem key={g.id} to={`/cabinet/${g.id}`} icon={GROUP_ICONS[g.id]} label={g.title} active={menuId === g.id} />
            ))}
          </nav>

          {/* Телефон: пилюли; у «Аккаунта» раскрывается вторая строка */}
          <div className="space-y-2 lg:hidden" aria-label="Разделы кабинета">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Pill to="/cabinet" active={menuId === 'overview'}>Обзор</Pill>
              <button
                type="button"
                aria-expanded={accountOpen}
                onClick={() => setAccountPicked(!accountOpen)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${menuId === 'account' ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/70 hover:text-ink'} ${focusRing}`}
              >
                Аккаунт{!accountOpen && unread > 0 ? ` · ${unread}` : ''}
                <Chevron open={accountOpen} />
              </button>
              {groups.filter((g) => g.id !== 'account').map((g) => <Pill key={g.id} to={`/cabinet/${g.id}`} active={menuId === g.id}>{g.title}</Pill>)}
            </div>
            {accountOpen && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {accountItems.map((s) => <Pill key={s.id} to={`/cabinet/${s.id}`} active={activeChild === s.id} soft>{s.title}{s.id === 'support' && unread > 0 ? ` · ${unread}` : ''}</Pill>)}
              </div>
            )}
          </div>
        </aside>
        <main className="min-w-0">
          {page ? <PageView key={page.menuId + page.title} page={page} ctx={{ user, onRefresh: refresh, onRead: loadDash }} /> : <Dashboard user={user} dash={dash} />}
        </main>
      </div>
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

function NavItem({ to, icon: ic, label, active, badge = 0, small }: { to: string; icon: ReactNode; label: string; active: boolean; badge?: number; small?: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2.5 rounded-lg ${small ? 'px-3 py-1.5' : 'px-4 py-2'} text-sm font-medium transition-colors ${active ? 'bg-ink text-white' : 'text-ink/70 hover:bg-ink/[0.05] hover:text-ink'} ${focusRing}`}
    >
      {ic}
      <span className="min-w-0">{label}</span>
      {badge > 0 && <span className="ml-auto rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-ink" aria-label={`Новых ответов: ${badge}`}>{badge}</span>}
    </Link>
  )
}
