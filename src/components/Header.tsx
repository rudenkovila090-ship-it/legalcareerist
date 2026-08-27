import { NavLink, useLocation } from 'react-router-dom'

const nav = [
  { to: '/kadry', label: 'Кадры' },
  { to: '/community', label: 'Сообщество' },
]

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
            <rect x="0" y="9" width="4" height="15" rx="1" />
            <rect x="9" y="4" width="4" height="20" rx="1" />
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
            to="/community"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            Вступить в сообщество
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
          <div className="container-page flex gap-3 py-4">
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
