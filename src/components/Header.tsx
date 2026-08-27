import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/kadry', label: 'Кадры' },
  { to: '/community', label: 'Сообщество' },
]

function linkClass({ isActive }: { isActive: boolean }) {
  return `text-sm font-medium transition-colors ${
    isActive ? 'text-ink' : 'text-ink/60 hover:text-ink'
  }`
}

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-gold-light">
            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M16 4l9 4v7c0 6.5-3.8 10.8-9 13-5.2-2.2-9-6.5-9-13v-7l9-4z" />
            </svg>
          </span>
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
    </header>
  )
}
