import { Link } from 'react-router-dom'
import type { CabinetUser, DashboardData } from '../../lib/cabinet'
import { roleOf, longDate } from './shared'
import { Avatar } from './ui'

/** Один вход в профиль и настройки аккаунта на всех страницах кабинета. */
export default function ProfileCard({ user, dash, open, onToggle, children }: {
  user: CabinetUser; dash: DashboardData | null; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  const role = roleOf(user)
  const r = user.resident
  const percent = dash?.completeness.percent
  const name = user.contact.name || (user.name === user.contact.email || user.name === user.login ? '' : user.name)
  const until = r.status === 'lifetime' ? 'Бессрочный доступ' : r.status === 'active' ? (r.inGrace ? `Отсрочка до ${longDate(r.graceUntil)}` : `Подписка до ${longDate(r.until)}`) : r.status === 'ended' ? `Подписка завершена ${longDate(r.until)}` : 'Подписка не оформлена'
  return (
    <section aria-label="Профиль и аккаунт" className="rounded-2xl border border-ink/10 bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={name} email={user.contact.email} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{name || 'Мой профиль'}</div>
          {user.contact.email && <div className="truncate text-[11px] text-ink/50">{user.contact.email}</div>}
        </div>
      </div>
      <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${role.tone === 'gold' ? 'bg-gold-light/40 text-ink' : role.tone === 'ink' ? 'bg-ink text-white' : 'bg-ink/5 text-ink/70'}`}>{role.label}</span>
      <p className="mt-2 text-xs leading-relaxed text-ink/60">{until}</p>
      {r.status === 'active' && (r.cancelled || r.autoRenew === false) && <p className="mt-0.5 text-[11px] text-ink/50">Автопродление отключено</p>}
      {percent != null && <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-ink/55"><span>Профиль заполнен</span><span>{percent}%</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Заполненность профиля" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} /></div>
      </div>}
      <Link to="/cabinet/profile" className="mt-3 block rounded-xl bg-ink/[0.055] px-3 py-2 text-center text-xs font-semibold hover:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2">Редактировать профиль</Link>
      <button type="button" aria-expanded={open} aria-controls="profile-account-menu" onClick={onToggle} className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-xs font-medium text-ink/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2">
        Управление аккаунтом <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div id="profile-account-menu" className="mt-1 space-y-0.5 border-t border-ink/10 pt-2">{children}</div>}
    </section>
  )
}
