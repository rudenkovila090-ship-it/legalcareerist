import type { ReactNode } from 'react'

export interface AccountSection {
  id: string
  label: string
  icon: ReactNode
}

// Левое меню личного кабинета — общее для соискателя и работодателя
// (см. CandidateAccount.tsx/EmployerAccount.tsx): Профиль, Работа/вакансии,
// Сообщения, Сообщество и мероприятия, Заказы, Уведомления, Настройки,
// Поддержка и безопасность. Переключение вкладок — локальный стейт
// страницы, без отдельных роутов (одна страница кабинета, как и раньше).
export default function AccountSidebarNav({
  sections,
  active,
  onSelect,
  badges,
}: {
  sections: AccountSection[]
  active: string
  onSelect: (id: string) => void
  /** Бейджи-счетчики по id раздела — например, число непрочитанных
   *  уведомлений или сообщений в чате. */
  badges?: Record<string, number>
}) {
  return (
    <nav className="glass flex flex-col gap-1 rounded-xl p-2">
      {sections.map((s) => {
        const badge = badges?.[s.id]
        return (
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
            {!!badge && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active === s.id ? 'bg-white/20 text-white' : 'bg-red-500 text-white'}`}>
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
