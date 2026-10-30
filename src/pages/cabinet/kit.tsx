import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { accent, focusRing, shadowLift, shadowSoft } from './kitStyles'

// Элементы нового оформления кабинета: тот же язык, что у базы знаний (светлая тонированная панель, белые карточки, пилюли,
// мелкие подписи капсом), доведённый по образцу «приборной панели»: крупные цифры, вкладки-пилюли с белой активной, один
// яркий акцент (тёплый жёлтый) только там, где нужно действие: новый ответ, непрочитанное, текущий шаг.
// Три уровня важности: 1 — сводка и то, что требует действия (крупно, акцент); 2 — основное содержимое вкладки (белые карточки);
// 3 — справочное и второстепенное (тихий текст, без рамок).


/** Тонированная рабочая область (как панель разделов в базе знаний), внутри — белые карточки. */
export function Workspace({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl bg-ink/[0.045] p-2 sm:p-3">{children}</div>
}

/** Белая карточка внутри рабочей области. */
export function Surface({ children, className = '', as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <Tag className={`rounded-2xl bg-white p-3 sm:p-4 ${shadowSoft} ${className}`}>{children}</Tag>
}

export interface TabDef {
  id: string
  label: string
  icon: ReactNode
  /** Число рядом с названием. */
  count?: number
  /** Нужно внимание: число показывается на жёлтом. */
  attention?: boolean
}

/** Вкладки-пилюли: активная белая с тенью, остальные плоские; прокручиваются по горизонтали на узких экранах. */
export function PillTabs({ tabs, active, hrefOf, label }: { tabs: TabDef[]; active: string; hrefOf: (id: string) => string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max min-w-full gap-1">
        {tabs.map((t) => {
          const on = t.id === active
          return (
            <li key={t.id}>
              <Link
                to={hrefOf(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${on ? `bg-white text-ink ${shadowLift}` : 'text-ink/60 hover:bg-white/60 hover:text-ink'} ${focusRing}`}
              >
                <span className={`[&>svg]:h-4 [&>svg]:w-4 ${on ? 'text-ink' : 'text-ink/50'}`}>{t.icon}</span>
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`min-w-[1.125rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none tabular-nums ${t.attention ? accent : 'bg-ink text-white'}`}>{t.count}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Показатель: подпись, крупное число и пояснение. Кликабельный, если задан `to`; `attention` подсвечивает его жёлтым. */
export function Stat({ label, value, hint, to, attention }: { label: string; value: ReactNode; hint?: string; to?: string; attention?: boolean }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink/55">
        {attention && <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />}
        {label}
      </span>
      <span className="mt-0.5 block text-xl font-semibold leading-none tracking-tight tabular-nums sm:text-2xl">{value}</span>
      {hint && <span className="mt-1 block truncate text-[11px] text-ink/50">{hint}</span>}
    </>
  )
  const cls = `block min-w-0 rounded-xl px-3 py-2 transition-colors ${attention ? 'bg-amber-100/70' : ''}`
  return to ? <Link to={to} className={`${cls} hover:bg-ink/[0.04] ${attention ? 'hover:bg-amber-100' : ''} ${focusRing}`}>{body}</Link> : <div className={cls}>{body}</div>
}

/** Полоса показателей: белая панель, показатели разделены тонкими линиями. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className={`grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 sm:p-1.5 lg:grid-cols-4 lg:divide-x lg:divide-ink/10 lg:gap-0 ${shadowSoft}`}>{children}</div>
}

/** Заголовок блока внутри вкладки: уровень 2 (название) и тихая подпись справа или под ним (уровень 3). */
export function BlockHead({ title, note, aside }: { title: string; note?: string; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-ink/55">{note}</p>}
      </div>
      {aside}
    </div>
  )
}

/** Пустое состояние: что здесь будет и что сделать. */
export function EmptyNote({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-ink/15 bg-white/50 px-4 py-7 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink/60 shadow-[0_1px_2px_rgba(40,57,83,0.08)] [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <div className="text-sm font-semibold">{title}</div>
      {children && <p className="max-w-md text-[13px] text-ink/60">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Путь отклика: узлы по шагам, пройденные тёмные, текущий жёлтый, будущие пустые; между ними линия. */
export function StepTrack({ steps, reached, stopped }: { steps: { id: string; label: string }[]; reached: number; stopped?: { label: string; tone: 'bad' | 'muted' } | null }) {
  return (
    <div>
      <ol className="flex items-start" aria-label="Путь отклика">
        {steps.map((s, i) => {
          const done = i < reached
          const current = i === reached && !stopped
          const last = i === steps.length - 1
          return (
            <li key={s.id} className={`flex min-w-0 items-start ${last ? '' : 'flex-1'}`} aria-current={current ? 'step' : undefined}>
              <div className="flex w-[4.25rem] shrink-0 flex-col items-center text-center sm:w-24">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    done ? 'bg-ink text-white' : current ? `${accent} ring-4 ring-amber-300/30` : i <= reached && stopped ? 'bg-ink/25 text-white' : 'border border-ink/20 bg-white text-ink/30'
                  }`}
                >
                  {done || (stopped && i <= reached) ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className={`mt-1.5 text-[11px] leading-tight ${current ? 'font-semibold text-ink' : done ? 'text-ink/70' : 'text-ink/40'}`}>{s.label}</span>
              </div>
              {!last && <span className={`mt-3 h-0.5 min-w-3 flex-1 rounded-full ${i < reached ? 'bg-ink' : 'bg-ink/12'}`} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
      {stopped && (
        <p className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${stopped.tone === 'bad' ? 'bg-red-50 text-red-700' : 'bg-ink/[0.06] text-ink/60'}`}>{stopped.label}</p>
      )}
    </div>
  )
}

/** Заглушка на время загрузки вкладки: держит высоту, чтобы страница не прыгала, и не выводит мигающих надписей. */
export function TabSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 motion-safe:animate-pulse rounded-2xl bg-white/70" />
      ))}
    </div>
  )
}

/** Тёмная пилюля-метка (как в образце): группа шага, формат файла, категория. */
export function Chip({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'amber' | 'soft' }) {
  const cls = tone === 'dark' ? 'bg-ink text-white' : tone === 'amber' ? accent : 'bg-ink/[0.07] text-ink/70'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight ${cls}`}>{children}</span>
}

/** Тонкая полоса прогресса: `tone` — цвет заливки (на тёмном фоне «amber», на светлом «ink»). */
export function Progress({ value, max, tone = 'ink', label }: { value: number; max: number; tone?: 'ink' | 'amber'; label: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${tone === 'amber' ? 'bg-white/20' : 'bg-ink/10'}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${tone === 'amber' ? 'bg-amber-300' : 'bg-ink'}`} style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
  )
}
