import { NavLink, useLocation } from 'react-router-dom'

const nav = [
  { to: '/kadry/employers', label: 'Кадры' },
  { to: '/community', label: 'Сообщество' },
  { to: '/events', label: 'Мероприятия' },
]

function IconAccount() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
    </svg>
  )
}

const kadryAudience = [
  { to: '/kadry/employers', label: 'Работодателям' },
  { to: '/kadry/candidates', label: 'Соискателям' },
]

function linkClass({ isActive }: { isActive: boolean }) {
  return `text-sm font-medium transition-colors ${
    isActive ? 'text-ink' : 'text-ink/60 hover:text-ink'
  }`
}

export default function Header() {
  const { pathname } = useLocation()
  const onKadry = pathname.startsWith('/kadry')
  // Фон подкадровой панели меняется по аудитории: синий для работодателей,
  // белый для соискателей — визуально разводит два сценария подбора.
  const isCandidates = pathname.startsWith('/kadry/candidates')

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/70 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2.5">
          <svg viewBox="0 0 26 24" className="h-6 w-6 text-ink" fill="currentColor" aria-hidden="true">
            <rect x="0" y="13" width="4" height="11" rx="1" />
            <rect x="9" y="6" width="4" height="18" rx="1" />
            <rect x="18" y="0" width="4" height="24" rx="1" />
          </svg>
          <span className="font-semibold tracking-tight">Карьерный Юрист</span>
        </NavLink>

        <nav className="hidden items-center gap-6 md:flex">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <NavLink
            to="/account"
            className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            <IconAccount />
            Личный кабинет
          </NavLink>
        </div>
      </div>
      <nav className="container-page flex gap-4 overflow-x-auto pb-3 md:hidden">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {onKadry && (
        <div className={`border-t transition-colors ${isCandidates ? 'border-ink/10 bg-white' : 'border-white/10 bg-ink'}`}>
          <div className="container-page flex justify-end gap-3 py-4">
            {kadryAudience.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-6 py-2.5 text-base font-semibold transition-colors ${
                    isActive
                      ? isCandidates
                        ? 'bg-ink text-white'
                        : 'bg-white text-ink'
                      : isCandidates
                        ? 'border border-ink/15 text-ink/60 hover:text-ink'
                        : 'border border-white/25 text-white/70 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
