import type { ReactNode } from 'react'

/**
 * Схема «Hero Landing» + «Z-Pattern»: страница услуги (подбор юристов, мероприятие, членство в сообществе).
 *  • Hero: заголовок-выгода, одна строка пояснения и ОДНА главная кнопка (`cta`): для услуг с заявкой «Оставить заявку», у членства в сообществе «Вступить». Вторых кнопок в первом экране нет.
 *  • Z-Pattern: дальше блоки идут «зигзагом»: картинка слева — текст справа, затем наоборот; взгляд читает страницу буквой Z.
 *  • В конце — тот же призыв и форма: одна кнопка, один адрес (`#apply`).
 */
export interface HeroLandingProps {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  /** Единственная кнопка первого экрана. */
  cta: { label: string; href: string }
  /** Картинка справа от заголовка (необязательно). */
  media?: ReactNode
  dark?: boolean
}

export function HeroLanding({ eyebrow, title, lead, cta, media, dark = true }: HeroLandingProps) {
  return (
    <section className={dark ? 'bg-ink text-white' : 'bg-white text-ink'}>
      <div className={`container-page grid items-center gap-10 py-14 sm:py-20 ${media ? 'lg:grid-cols-2' : ''}`}>
        <div className="min-w-0">
          {eyebrow && <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${dark ? 'text-gold-light' : 'text-gold'}`}>{eyebrow}</div>}
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{title}</h1>
          {lead && <p className={`mt-4 max-w-xl text-base sm:text-lg ${dark ? 'text-white/75' : 'text-ink/70'}`}>{lead}</p>}
          <a href={cta.href} className={`mt-8 inline-block rounded-full px-8 py-3.5 text-sm font-semibold hover:opacity-90 ${dark ? 'bg-gold-light text-ink' : 'bg-ink text-white'}`}>{cta.label}</a>
        </div>
        {media && <div className="min-w-0">{media}</div>}
      </div>
    </section>
  )
}

export interface ZRowData {
  title: string
  text: ReactNode
  media: ReactNode
}

/** Блоки зигзагом: нечётные — картинка слева, чётные — справа; на телефоне картинка всегда над текстом. */
export function ZPattern({ rows }: { rows: ZRowData[] }) {
  return (
    <div className="container-page space-y-14 py-14 sm:space-y-20 sm:py-20">
      {rows.map((r, i) => (
        <div key={r.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div className={`min-w-0 ${i % 2 === 1 ? 'lg:order-2' : ''}`}>{r.media}</div>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold leading-snug sm:text-3xl">{r.title}</h2>
            <div className="mt-3 text-ink/70">{r.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
