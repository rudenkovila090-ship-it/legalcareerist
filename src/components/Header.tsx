import { NavLink, useLocation } from 'react-router-dom'

const nav = [
  { to: '/kadry/employers', label: 'Кадры' },
  { to: '/community', label: 'Сообщество' },
  { to: '/events', label: 'Мероприятия' },
  { to: '/marketplace', label: 'Маркет' },
  { to: '/blog', label: 'Блог' },
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
  const onCommunity = pathname.startsWith('/community')
  const onMarketplace = pathname.startsWith('/marketplace')
  const showAccountButton = onCommunity || onMarketplace

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-white/70 backdrop-blur-xl [transform:translateZ(0)] [will-change:transform]">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-3">
          {/* Высота иконки подогнана под высоту двухстрочного лого-текста
              справа (leading-[1.15] text-sm × 2 строки) — см. legalcareerist-design/SKILL.md. */}
          <svg viewBox="0 0 100 100" className="h-8 w-8 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" aria-hidden="true">
            <line x1="26" y1="88" x2="26" y2="48" />
            <line x1="42" y1="74" x2="42" y2="34" />
            <line x1="58" y1="60" x2="58" y2="20" />
            <line x1="74" y1="46" x2="74" y2="6" />
          </svg>
          <span className="font-logo text-sm font-bold leading-[1.15] tracking-tight">
            Карьерный
            <br />
            юрист
          </span>
        </NavLink>

        <nav className="hidden items-center gap-6 md:flex">
          {nav.map((item) =>
            item.label === 'Кадры' ? (
              // «Кадры» — по наведению открывает выбор аудитории (Работодателям/
              // Соискателям) вместо отдельной всегда видимой панели под шапкой.
              <div key={item.to} className="group relative">
                <NavLink to={item.to} className={linkClass}>{item.label}</NavLink>
                <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
                  <div className="w-48 rounded-xl border border-ink/10 bg-white p-1.5 shadow-xl">
                    {kadryAudience.map((a) => (
                      <NavLink
                        key={a.to}
                        to={a.to}
                        className={({ isActive }) =>
                          `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive ? 'bg-ink/5 text-ink' : 'text-ink/60 hover:bg-ink/5 hover:text-ink'
                          }`
                        }
                      >
                        {a.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          {/* Всегда занимает место в разметке (invisible, а не условный рендер) —
              иначе шапка «прыгает» при переходе на/со страницы Сообщества. */}
          <NavLink
            to="/account"
            aria-hidden={!showAccountButton}
            tabIndex={showAccountButton ? undefined : -1}
            className={`flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90 ${
              showAccountButton ? '' : 'invisible pointer-events-none'
            }`}
          >
            <IconAccount />
            Личный кабинет
          </NavLink>
        </div>
      </div>
      <nav className="container-page flex items-center gap-4 overflow-x-auto pb-3 md:hidden">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
        {/* На тач-устройствах нет наведения — переключатель аудитории «Кадры»
            показываем явными ссылками, а не только скрытым по ховеру меню. */}
        {onKadry &&
          kadryAudience.map((a) => (
            <NavLink
              key={a.to}
              to={a.to}
              className={({ isActive }) =>
                `shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60'
                }`
              }
            >
              {a.label}
            </NavLink>
          ))}
      </nav>
    </header>
  )
}
