import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { EventItem } from '../../types'
import type { CharacterIcon, EventStory } from '../../data/eventStories'
import { eventTimeRange } from '../../lib/eventTime'
import { prefersReducedMotion } from '../../lib/motion'
import Reveal from '../../components/noir/Reveal'
import CaseFile from '../../components/noir/CaseFile'
import EvidenceBoard from '../../components/noir/EvidenceBoard'
import { ShotFx, ShotOnView } from '../../components/noir/ShotFx'
import { NoirDust, NoirMarquee } from '../../components/noir/NoirAmbient'
import './noir.css'

// Блоки страницы мероприятия в тёмной «нуарной» теме (см. .theme-noir в index.css, анимации — в noir.css).
// Заголовочный шрифт — Playfair Display (с кириллицей), подгружается только на такой странице.

/** «Джазовый вечер для юристов 2» → ['Джазовый вечер для юристов', '2']; без цифры в конце — [текст, '']. */
function splitTrailingNumber(text: string): [string, string] {
  const m = text.match(/^(.*?)\s+(\d+)$/)
  return m ? [m[1], m[2]] : [text, '']
}

const iconPaths: Record<CharacterIcon, ReactNode> = {
  hat: <path d="M2.5 17.5h19M6 17.5c0-6 2-11 6-11s6 5 6 11M6.4 13.6h11.2" />,
  glass: <path d="M4.5 5h15L12 13.5 4.5 5ZM12 13.5V20M8 20h8" />,
  magnifier: (
    <>
      <circle cx="10.5" cy="10.5" r="5.8" />
      <path d="m15 15 5.5 5.5" />
    </>
  ),
  pearl: (
    <>
      <path d="M12 2.5v4.5" />
      <circle cx="12" cy="13.5" r="5.2" />
      <path d="M9.6 12.3a2.8 2.8 0 0 1 2-1.7" />
    </>
  ),
  scales: <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.6 6a3 3 0 0 0 5.2 0L5 8ZM19 8l-2.6 6a3 3 0 0 0 5.2 0L19 8Z" />,
  key: (
    <>
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M11 12h10M17 12v3M20 12v2.5" />
    </>
  ),
}

function CharacterGlyph({ icon }: { icon: CharacterIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      {iconPaths[icon]}
    </svg>
  )
}

/** Ромб-разделитель, как на афише: линия — ромб — линия (в шапке линии «прорисовываются»). */
function Diamond({ className = '', delay }: { className?: string; delay?: number }) {
  const line = delay === undefined ? '' : 'noir-line'
  const style = delay === undefined ? undefined : ({ '--rd': `${delay}s` } as CSSProperties)
  return (
    <div className={`flex items-center gap-3 text-gold ${className}`} aria-hidden="true">
      <span className={`${line} h-px w-14 bg-current opacity-50`} style={style} />
      <span className={`${delay === undefined ? '' : 'noir-rise'} h-1.5 w-1.5 rotate-45 bg-current`} style={style} />
      <span className={`${line} h-px w-14 bg-current opacity-50`} style={style} />
    </div>
  )
}

/** Появление в шапке «лесенкой»: delay — секунды от загрузки страницы. */
function Rise({ delay, className = '', children }: { delay: number; className?: string; children: ReactNode }) {
  return (
    <div className={`noir-rise ${className}`} style={{ '--rd': `${delay}s` } as CSSProperties}>
      {children}
    </div>
  )
}

/** Кровь капает с двойки: полоска стекает, на конце набухает капля, срывается и падает (петля). */
function BloodDrip() {
  return (
    <svg className="blood" viewBox="0 0 24 110" aria-hidden="true">
      <defs>
        <linearGradient id="blood-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8f0f1a" />
          <stop offset="0.5" stopColor="#e0303d" />
          <stop offset="1" stopColor="#6e0912" />
        </linearGradient>
      </defs>
      <path className="blood-streak" d="M8.6 0 H15.4 Q14.3 12 14 24 Q13.9 36 12.9 38.4 Q12 41 11.1 38.4 Q10.1 36 10 24 Q9.7 12 8.6 0 Z" fill="url(#blood-g)" />
      <g className="blood-bulb">
        <path d="M12 0 C12 0 6.4 8 6.4 12.6 A5.6 5.6 0 0 0 17.6 12.6 C17.6 8 12 0 12 0 Z" fill="url(#blood-g)" />
        <ellipse cx="9.8" cy="12.2" rx="1.3" ry="2.3" fill="#fff" opacity="0.4" />
      </g>
    </svg>
  )
}

interface NoirHeroProps {
  event: EventItem
  story: EventStory
  onBuy: () => void
  share: ReactNode
  views: string | null
}

export function NoirHero({ event, story, onBuy, share, views }: NoirHeroProps) {
  const [ru, en] = event.title.split(' / ')
  const [ruText, ruNumber] = splitTrailingNumber(ru)
  const date = new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const shortDate = new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  const heroRef = useRef<HTMLElement>(null)
  const [shot, setShot] = useState(0)
  const [shaking, setShaking] = useState(false)

  // Выстрел: вспышка, короткая дрожь шапки, пробоина с трещинами и дымок.
  const fire = useCallback(() => {
    setShot((n) => n + 1)
    setShaking(true)
    window.setTimeout(() => setShaking(false), 380)
  }, [])

  // Один выстрел — когда открылся занавес и заголовок встал на место.
  useEffect(() => {
    const t = window.setTimeout(fire, prefersReducedMotion() ? 0 : 3100)
    return () => window.clearTimeout(t)
  }, [fire])

  // «Фонарик»: мягкий свет следует за курсором над шапкой.
  function track(e: PointerEvent<HTMLElement>) {
    const el = heroRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--lx', `${e.clientX - r.left}px`)
    el.style.setProperty('--ly', `${e.clientY - r.top}px`)
  }

  return (
    <>
      <section ref={heroRef} onPointerMove={track} className="noir-hero relative mt-4 overflow-hidden">
        <img src={story.heroImage} alt="" aria-hidden="true" className="noir-kb absolute inset-0 h-full w-full object-cover object-[60%_30%] opacity-20 lg:hidden" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0506]/40 to-[#0b0506] lg:hidden" aria-hidden="true" />
        <div className="noir-lamp" aria-hidden="true" />
        <NoirDust />
        <div className="noir-torch" aria-hidden="true" />

        <div className={`container-page relative z-[3] grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.2fr_0.8fr] ${shaking ? 'noir-shaking' : ''}`}>
          <div data-parallax="-0.035" data-pmax="26">
            <Rise delay={1.0}>
              <div className="flex flex-col gap-x-4 gap-y-1 text-base font-semibold text-ink sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-2 sm:text-lg">
                <span>{date}</span>
                <span className="hidden h-5 w-px shrink-0 bg-ink/30 sm:block" aria-hidden="true" />
                <span>{eventTimeRange(event)}</span>
                <span className="hidden h-5 w-px shrink-0 bg-ink/30 sm:block" aria-hidden="true" />
                <span>{event.city}</span>
              </div>
            </Rise>

            <h1 className="font-noir mt-5 text-ink">
              <span className="block text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
                {ruText.split(' ').map((word, i) => (
                  <span key={`${word}-${i}`}>
                    <span className="noir-mask">
                      <span className="noir-word" style={{ '--i': i } as CSSProperties}>{word}</span>
                    </span>{' '}
                  </span>
                ))}
                {ruNumber && (
                  <span className="noir-two ml-1 text-[var(--noir-crimson-bright)]">
                    {ruNumber}
                    <BloodDrip />
                  </span>
                )}
              </span>
              {en && (
                <span className="noir-rise mt-3 block text-2xl font-medium italic text-ink/70 sm:text-3xl" style={{ '--rd': '2.2s' } as CSSProperties}>
                  {en}
                </span>
              )}
            </h1>

            <Diamond className="mt-8" delay={2.4} />

            <Rise delay={2.55} className="mt-6">
              <p className="font-noir text-2xl italic text-ink sm:text-3xl">{story.tagline}</p>
            </Rise>

            {event.description && (
              <Rise delay={2.75} className="mt-6">
                <p className="max-w-xl leading-relaxed text-ink/75">{event.description}</p>
              </Rise>
            )}

            <Rise delay={2.95} className="mt-8">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onBuy}
                  className="noir-cta rounded-full bg-[var(--noir-crimson)] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--noir-crimson-bright)]"
                >
                  Приобрести билет
                </button>
                {share}
                {views && <span className="text-sm text-ink/50">{views}</span>}
              </div>
            </Rise>
          </div>

          <div className="relative mx-auto hidden w-full max-w-sm lg:block" data-parallax="0.04" data-pmax="30">
            <div className="noir-arch-ring absolute -inset-3 rounded-t-[999px] border border-gold/30" aria-hidden="true" />
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[999px]">
              <div data-parallax="0.09" data-pmax="40" className="absolute inset-x-0 -inset-y-12">
                <img src={story.heroImage} alt="" aria-hidden="true" draggable={false} className="noir-kb h-full w-full object-cover object-[50%_35%]" />
              </div>
              <div className="noir-sweep" aria-hidden="true" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0506]/70 via-transparent to-transparent" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Слой выстрела поверх шапки: вспышка и пробоина с дымком. */}
        {shot > 0 && <div key={shot} className="noir-flash" aria-hidden="true" />}
        <div className="pointer-events-none absolute inset-0 z-[25]" aria-hidden="true">
          {shot > 0 && <ShotFx key={shot} x="89%" y="17%" size={1.2} />}
        </div>

        {/* Занавес открывается при загрузке страницы. */}
        <div className="noir-curtain" aria-hidden="true">
          <i />
          <i />
        </div>
      </section>

      <NoirMarquee items={[story.tagline, en ?? ru, shortDate, story.tagline, event.city ?? '', eventTimeRange(event)].filter(Boolean)} />
    </>
  )
}

function NoirHeading({ children }: { children: ReactNode }) {
  return (
    <Reveal>
      <h2 className="noir-h font-noir text-3xl font-semibold text-ink">{children}</h2>
    </Reveal>
  )
}

export function NoirIntro({ story }: { story: EventStory }) {
  return (
    <section className="grid gap-8 md:grid-cols-[1fr_14rem]">
      <div>
        <NoirHeading>О вечере</NoirHeading>
        <Reveal delay={100} className="mt-4">
          <p className="font-noir text-2xl italic leading-snug text-ink">{story.introLead}</p>
        </Reveal>
        <div className="mt-5 space-y-4 leading-relaxed text-ink/75">
          {story.intro.map((p, i) => (
            <Reveal key={p} delay={i * 110}>
              <p>{p}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{story.questionLead}</p>
          <p className="font-noir mt-3 text-2xl font-medium italic leading-snug text-ink sm:text-[1.7rem]">
            <span className="noir-q mr-1 text-[var(--noir-crimson-bright)]" aria-hidden="true">«</span>
            {story.question}
            <span className="noir-q ml-1 text-[var(--noir-crimson-bright)]" aria-hidden="true">»</span>
          </p>
        </Reveal>
      </div>

      <Reveal variant="zoom" delay={150} className="hidden md:block">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl">
          <div data-parallax="0.07" data-pmax="34" className="absolute inset-x-0 -inset-y-9">
            <img src={story.portraitImage} alt="" aria-hidden="true" className="noir-kb h-full w-full object-cover object-[60%_50%]" />
          </div>
          <div className="noir-sweep" aria-hidden="true" />
        </div>
      </Reveal>
    </section>
  )
}

/** «Досье вечера» — папка с делом: формат, жанр и цель на страницах, которые переворачиваются. */
export function NoirFacts({ story }: { story: EventStory }) {
  return (
    <section>
      <NoirHeading>Досье вечера</NoirHeading>
      <Reveal className="mt-5">
        <CaseFile pages={story.facts} />
      </Reveal>
      <Reveal className="mt-6">
        <p className="font-noir text-xl italic leading-snug text-ink/90">{story.principle}</p>
      </Reveal>
    </section>
  )
}

/** «Для кого» — стена улик: фото, связанные красными нитками; подпись появляется при наведении. */
export function NoirAudience({ story }: { story: EventStory }) {
  return (
    <section>
      <NoirHeading>Для кого этот вечер</NoirHeading>
      <Reveal delay={90}>
        <p className="mt-2 text-sm text-ink/55">Наведите курсор на фото (на телефоне — нажмите).</p>
      </Reveal>
      <Reveal variant="zoom" className="mt-5">
        <EvidenceBoard people={story.audience} />
      </Reveal>
    </section>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** Закрытая плашка — спойлер, который не показываем до вечера (чёрная полоса наезжает на текст). */
function Sealed({ children }: { children: ReactNode }) {
  return <div className="noir-sealed rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">{children}</div>
}

export function NoirStory({ story }: { story: EventStory }) {
  return (
    <section>
      <NoirHeading>Сюжет вечера</NoirHeading>
      <Reveal delay={80}>
        <p className="mt-2 text-sm text-ink/55">Три акта расследования.</p>
      </Reveal>
      <ol className="mt-6 space-y-8">
        {story.acts.map((act, i) => (
          <li key={act.title} className="grid gap-3 sm:grid-cols-[6rem_1fr] sm:gap-6">
            <Reveal variant="left">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">Акт</div>
              <div className="noir-roman font-noir text-4xl font-semibold leading-none text-[var(--noir-crimson-bright)]">{ROMAN[i] ?? i + 1}</div>
            </Reveal>
            <Reveal delay={140}>
              <h3 className="font-noir text-2xl font-semibold text-ink">{act.title}</h3>
              <div className="mt-3 space-y-3 leading-relaxed text-ink/75">
                {act.paragraphs.map((p) => <p key={p}>{p}</p>)}
              </div>
              {act.sealed && (
                <div className="relative mt-4 inline-block">
                  <Sealed>{act.sealed}</Sealed>
                  <ShotOnView x="78%" y="50%" size={0.55} />
                </div>
              )}
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function NoirCharacters({ story }: { story: EventStory }) {
  return (
    <section>
      <NoirHeading>Персонажи и роли</NoirHeading>
      <Reveal delay={90}>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink/70">{story.charactersIntro}</p>
      </Reveal>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {story.characters.map((c, i) => (
          // Внешний слой плывёт при прокрутке (колонки с разной скоростью), внутренний — выезжает при появлении.
          <div key={c.name} data-parallax={i % 2 === 0 ? 0.028 : -0.028} data-pmax="26" className="flex">
            <Reveal variant={i % 2 === 0 ? 'left' : 'right'} delay={(i % 2) * 140} className="flex w-full">
              <article className="glass noir-card flex w-full flex-col rounded-2xl p-6">
                <div className="flex items-center gap-4">
                  <div className="noir-ico flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold">
                    <CharacterGlyph icon={c.icon} />
                  </div>
                  <div>
                    <h3 className="font-noir text-xl font-semibold leading-tight text-ink">{c.name}</h3>
                    <div className="text-sm text-ink/60">{c.epithet}</div>
                  </div>
                </div>
                <div className="mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">{c.keywords}</div>
                <p className="mt-3 text-sm leading-relaxed text-ink/75">{c.text}</p>
                <div className="flex-1" />
                <dl className="mt-4 space-y-3 border-t border-ink/10 pt-4 text-sm">
                  <div>
                    <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink/45">Мотив</dt>
                    <dd className="mt-0.5 text-ink/80">{c.motive}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink/45">Символизирует</dt>
                    <dd className="mt-0.5 text-ink/80">{c.symbol}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-ink/45">Улика</dt>
                    <dd className="mt-1"><Sealed>Раскроется на вечере</Sealed></dd>
                  </div>
                </dl>
              </article>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  )
}
