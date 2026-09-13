import type { ReactNode } from 'react'

export interface AccountSection {
  id: string
  label: string
  icon: ReactNode
}

// Левое меню личного кабинета — общее для соискателя и работодателя
// (см. CandidateAccount.tsx/EmployerAccount.tsx): Профиль, Работа/вакансии,
// Сообщество и мероприятия, Заказы, Уведомления, Настройки, Поддержка и
// безопасность. Переключение вкладок — локальный стейт страницы, без
// отдельных роутов (одна страница кабинета, как и раньше).
export default function AccountSidebarNav({
  sections,
  active,
  onSelect,
  unreadCount,
}: {
  sections: AccountSection[]
  active: string
  onSelect: (id: string) => void
  /** Бейдж с числом непрочитанных — показывается на пункте «Уведомления». */
  unreadCount?: number
}) {
  return (
    <nav className="glass flex flex-col gap-1 rounded-xl p-2">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            active === s.id ? 'bg-ink text-white' : 'text-ink/60 hover:bg-ink/5 hover:text-ink'
          }`}
        >
          <span className="shrink-0">{s.icon}</span>
          <span className="flex-1">{s.label}</span>
          {s.id === 'notifications' && !!unreadCount && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active === s.id ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}>
              {unreadCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
