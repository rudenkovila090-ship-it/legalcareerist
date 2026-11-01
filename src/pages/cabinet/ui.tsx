import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ConsentCheck from '../../components/ConsentCheck'
import { consentOf } from '../../lib/consent'
import { saveProfile, type Profile } from '../../lib/cabinet'
import { errorText, initials } from './shared'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-6 ${className}`}>{children}</div>
}

/** Переключатель «вкл/выкл» (по образцу тумблеров сайта): скрытый чекбокс поверх, трек и бегунок под ним. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`relative inline-flex h-7 w-12 shrink-0 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
      <span className="absolute inset-0 rounded-full bg-ink/20 transition-colors peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink/40" />
      <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </label>
  )
}

export function Todo({ items }: { items: string[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">Что ещё не сделано</h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm text-ink/80">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-ink/25" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Форма раздела профиля: кнопка «Сохранить», сообщения об успехе и ошибке. Пока профиль не сохраняли, под формой две
 * обязательные галочки (Политика и согласие на обработку) — без них сервер не запишет профиль.
 */
export function ProfileForm({
  profile,
  parts,
  onSaved,
  children,
}: {
  profile: Profile
  /** Что отправить на сервер из состояния формы. Бросает { message } при ошибке заполнения. */
  parts: () => Parameters<typeof saveProfile>[0]
  onSaved: (profile: Profile) => void
  children: ReactNode
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const needConsent = profile.consentAt === null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const consent = consentOf(e)
    setError('')
    let payload
    try {
      payload = parts()
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Проверьте заполнение.')
      return
    }
    setState('saving')
    const r = await saveProfile(payload, needConsent ? consent : undefined)
    if (!r.ok) {
      setState('idle')
      setError(errorText(r.error))
      return
    }
    onSaved(r.data.profile)
    setState('saved')
    setTimeout(() => setState('idle'), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-6 rounded-2xl p-6">
      {children}
      {needConsent && (
        <div className="rounded-lg border border-ink/10 p-4">
          <p className="mb-3 text-xs text-ink/60">Профиль — это ваши персональные данные. Чтобы сохранить его, нужны две отметки; согласие на рекламу по желанию.</p>
          <ConsentCheck />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={state === 'saving'} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
          {state === 'saving' ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {state === 'saved' && <span className="text-sm font-medium text-emerald-700">Сохранено</span>}
      </div>
    </form>
  )
}

const AVATAR_SIZES = { sm: 'h-10 w-10 text-sm', md: 'h-14 w-14 text-lg', lg: 'h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl' }

/** Аватар из инициалов: фото в кабинете пока не загружается. Круг фирменных цветов с мягким кольцом и тенью. */
export function Avatar({ name, email, size = 'md' }: { name: string; email?: string; size?: keyof typeof AVATAR_SIZES }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-ink to-gold font-semibold tracking-wide text-white shadow-lg shadow-ink/20 ring-4 ring-gold-light/30 ${AVATAR_SIZES[size]}`}
    >
      {initials(name, email)}
    </span>
  )
}

/** Статус-пилюля: good — всё в порядке, warn — требует внимания, muted — нейтрально. */
export function Chip({ tone = 'muted', children }: { tone?: 'good' | 'warn' | 'muted'; children: ReactNode }) {
  const toneClass = tone === 'good' ? 'bg-emerald-50 text-emerald-700' : tone === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-ink/[0.06] text-ink/70'
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{children}</span>
}

/** Круглая иконка-подложка для карточек и строк. */
export function IconBubble({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'soft' }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone === 'ink' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink'}`}>{children}</span>
  )
}

/** Заголовок карточки обзора со ссылкой «Все…» справа. */
export function CardHead({ title, to, linkText }: { title: string; to?: string; linkText?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {to && (
        <Link to={to} className="shrink-0 rounded text-sm font-medium text-gold hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40">
          {linkText ?? 'Все'} →
        </Link>
      )}
    </div>
  )
}
