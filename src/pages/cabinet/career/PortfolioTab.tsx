import { Link } from 'react-router-dom'
import { pluralRu } from '../../../lib/plural'
import { icon } from '../sections'
import { Chip, Progress } from '../kit'
import { focusRing } from '../kitStyles'
import AchievementsPanel from './AchievementsPanel'
import CapitalPanel from './CapitalPanel'
import MediakitPanel from './MediakitPanel'
import type { CareerHandle } from './useCareer'

// Портфолио: три части одного рассказа о себе. «Мои достижения» (что сделано), «Мой профессиональный капитал» (из чего складывается
// ценность) и «Медиакит» (всё это на одной странице для партнёров и организаторов). Сверху переключатель частей, адреса отдельные.

export type PortfolioSub = 'overview' | 'achievements' | 'capital' | 'mediakit'

const SUBS: { id: PortfolioSub; label: string; href: string }[] = [
  { id: 'overview', label: 'Обзор', href: '/cabinet/portfolio' },
  { id: 'achievements', label: 'Мои достижения', href: '/cabinet/achievements' },
  { id: 'capital', label: 'Профессиональный капитал', href: '/cabinet/capital' },
  { id: 'mediakit', label: 'Медиакит', href: '/cabinet/mediakit' },
]

export default function PortfolioTab({ career, sub }: { career: CareerHandle; sub: PortfolioSub }) {
  const { state } = career
  const fields = state.capital.schema.sections.reduce((n, s) => n + s.fields.length, 0)
  const filled = Object.keys(state.capital.values).length
  const kitFilled = Boolean(state.mediakit.headline || state.mediakit.about)

  return (
    <div className="space-y-2">
      <nav aria-label="Части портфолио" className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex w-max min-w-full gap-1.5">
          {SUBS.map((s) => (
            <li key={s.id}>
              <Link to={s.href} aria-current={s.id === sub ? 'page' : undefined} className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${s.id === sub ? 'bg-ink text-white' : 'bg-white text-ink/65 hover:text-ink'} ${focusRing}`}>{s.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      {sub === 'overview' && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-3">
          <Link to="/cabinet/achievements" className={`group flex flex-col gap-3 rounded-2xl bg-ink p-4 text-white transition-transform hover:-translate-y-0.5 ${focusRing}`}>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.trophy}</span>Мои достижения</span>
            <span className="text-4xl font-semibold leading-none tabular-nums">{state.achievements.length}</span>
            <span className="text-xs text-white/70">{pluralRu(state.achievements.length, ['достижение', 'достижения', 'достижений'])}: награды, публикации, проекты, участие в мероприятиях.</span>
          </Link>
          <Link to="/cabinet/capital" className={`group flex flex-col gap-3 rounded-2xl bg-amber-300 p-4 text-ink transition-transform hover:-translate-y-0.5 ${focusRing}`}>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink/65"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.gem}</span>Профессиональный капитал</span>
            <span className="text-4xl font-semibold leading-none tabular-nums">{filled}<span className="text-xl text-ink/45"> / {fields}</span></span>
            <Progress value={filled} max={fields} label="Заполнено полей капитала" />
            <span className="text-xs text-ink/70">Знания, опыт, репутация и связи: из чего складывается ваша ценность.</span>
          </Link>
          <Link to="/cabinet/mediakit" className={`group flex flex-col gap-3 rounded-2xl bg-gold-light/30 p-4 text-ink transition-transform hover:-translate-y-0.5 ${focusRing}`}>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink/65"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.card}</span>Медиакит</span>
            <span className="text-xl font-semibold leading-snug">{kitFilled ? 'Медиакит собран' : 'Соберите медиакит'}</span>
            <span className="text-xs text-ink/70">Одна страница о вас: профиль, достижения, темы выступлений и контакты. Её можно сохранить в PDF.</span>
            <span><Chip>{kitFilled ? 'открыть' : 'начать'}</Chip></span>
          </Link>
        </div>
      )}
      {sub === 'achievements' && <AchievementsPanel career={career} />}
      {sub === 'capital' && <CapitalPanel career={career} />}
      {sub === 'mediakit' && <MediakitPanel career={career} />}
    </div>
  )
}
