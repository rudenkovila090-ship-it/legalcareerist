import type { ReactNode } from 'react'
import type { EventItem } from '../../types'
import type { CharacterIcon, EventStory } from '../../data/eventStories'
import { eventTimeRange } from '../../lib/eventTime'

// Блоки страницы мероприятия в тёмной «нуарной» теме (см. .theme-noir в index.css).
// Заголовочный шрифт — Playfair Display (с кириллицей), подгружается только на такой странице.

/** «Юридическая ночь джаза 2» → ['Юридическая ночь джаза', '2']; без цифры в конце — [текст, '']. */
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

/** Ромб-разделитель, как на афише: линия — ромб — линия. */
function Diamond({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-gold ${className}`} aria-hidden="true">
      <span className="h-px w-14 bg-current opacity-50" />
      <span className="h-1.5 w-1.5 rotate-45 bg-current" />
      <span className="h-px w-14 bg-current opacity-50" />
    </div>
  )
}

interface NoirHeroProps {
  event: EventItem
  story: EventStory
  onBuy: () => void
  favorite: boolean
  onToggleFavorite: () => void
  share: ReactNode
  views: string | null
  heart: ReactNode
}

export function NoirHero({ event, story, onBuy, favorite, onToggleFavorite, share, views, heart }: NoirHeroProps) {
  const [ru, en] = event.title.split(' / ')
  const [ruText, ruNumber] = splitTrailingNumber(ru)
  const date = new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <section className="noir-hero relative mt-4 overflow-hidden">
      <img src={story.heroImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[60%_30%] opacity-20 lg:hidden" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0506]/40 to-[#0b0506] lg:hidden" aria-hidden="true" />

      <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-gold">
            <span>{story.caseLabel}</span>
          </div>

          <div className="mt-6 flex flex-col gap-x-4 gap-y-1 text-base font-semibold text-ink sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-2 sm:text-lg">
            <span>{date}</span>
            <span className="hidden h-5 w-px shrink-0 bg-ink/30 sm:block" aria-hidden="true" />
            <span>{eventTimeRange(event)} по Москве</span>
            <span className="hidden h-5 w-px shrink-0 bg-ink/30 sm:block" aria-hidden="true" />
            <span>{event.city}</span>
          </div>

          <h1 className="font-noir mt-5 text-ink">
            <span className="block text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
              {ruText}
              {ruNumber && <span className="ml-3 text-[var(--noir-crimson-bright)]">{ruNumber}</span>}
            </span>
            {en && <span className="mt-3 block text-2xl font-medium italic text-ink/70 sm:text-3xl">{en}</span>}
          </h1>

          <Diamond className="mt-8" />

          <p className="font-noir mt-6 text-2xl italic text-ink sm:text-3xl">{story.tagline}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">{story.taglineEn}</p>

          {event.description && <p className="mt-6 max-w-xl leading-relaxed text-ink/75">{event.description}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBuy}
              className="rounded-full bg-[var(--noir-crimson)] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--noir-crimson-bright)]"
            >
              Приобрести билет
            </button>
            <button
              type="button"
              onClick={onToggleFavorite}
              aria-pressed={favorite}
              className="flex items-center gap-2 rounded-full border border-ink/30 px-5 py-3 text-sm font-semibold text-ink hover:bg-ink/10"
            >
              {heart}
              {favorite ? 'В избранном' : 'В избранное'}
            </button>
            {share}
            {views && <span className="text-sm text-ink/50">{views}</span>}
          </div>
        </div>

        <div className="relative mx-auto hidden w-full max-w-sm lg:block">
          <div className="absolute -inset-3 rounded-t-[999px] border border-gold/30" aria-hidden="true" />
          <img src={story.heroImage} alt="" aria-hidden="true" className="relative aspect-[3/4] w-full rounded-t-[999px] object-cover object-[50%_35%]" />
          <div className="absolute inset-0 rounded-t-[999px] bg-gradient-to-t from-[#0b0506]/70 via-transparent to-transparent" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

export function NoirIntro({ story }: { story: EventStory }) {
  return (
    <section className="grid gap-8 md:grid-cols-[1fr_14rem]">
      <div>
        <h2 className="font-noir text-3xl font-semibold text-ink">О вечере</h2>
        <p className="font-noir mt-4 text-2xl italic leading-snug text-ink">{story.introLead}</p>
        <div className="mt-5 space-y-4 leading-relaxed text-ink/75">
          {story.intro.map((p) => <p key={p}>{p}</p>)}
        </div>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{story.questionLead}</p>
          <p className="font-noir mt-3 text-2xl font-medium italic leading-snug text-ink sm:text-[1.7rem]">
            <span className="mr-1 text-[var(--noir-crimson-bright)]" aria-hidden="true">«</span>
            {story.question}
            <span className="ml-1 text-[var(--noir-crimson-bright)]" aria-hidden="true">»</span>
          </p>
        </div>
      </div>

      <figure className="hidden md:block">
        <img src={story.portraitImage} alt="" aria-hidden="true" className="aspect-[2/3] w-full rounded-2xl object-cover object-[60%_50%]" />
        <figcaption className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/50">{story.caseLabel}</figcaption>
      </figure>
    </section>
  )
}

export function NoirFacts({ story }: { story: EventStory }) {
  return (
    <section>
      <h2 className="font-noir text-3xl font-semibold text-ink">Досье вечера</h2>
      <dl className="mt-5 divide-y divide-ink/10 rounded-2xl border border-ink/15 bg-black/20">
        {story.facts.map((f) => (
          <div key={f.label} className="grid gap-1 p-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold sm:pt-1">{f.label}</dt>
            <dd className="leading-relaxed text-ink/80">{f.text}</dd>
          </div>
        ))}
      </dl>
      <p className="font-noir mt-6 text-xl italic leading-snug text-ink/90">{story.principle}</p>
    </section>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** Закрытая плашка — спойлер, который не показываем до вечера. */
function Sealed({ children }: { children: ReactNode }) {
  return <div className="noir-sealed rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">{children}</div>
}

export function NoirStory({ story }: { story: EventStory }) {
  return (
    <section>
      <h2 className="font-noir text-3xl font-semibold text-ink">Сюжет вечера</h2>
      <p className="mt-2 text-sm text-ink/55">Три акта расследования.</p>
      <ol className="mt-6 space-y-8">
        {story.acts.map((act, i) => (
          <li key={act.title} className="grid gap-3 sm:grid-cols-[6rem_1fr] sm:gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">Акт</div>
              <div className="font-noir text-4xl font-semibold leading-none text-[var(--noir-crimson-bright)]">{ROMAN[i] ?? i + 1}</div>
            </div>
            <div>
              <h3 className="font-noir text-2xl font-semibold text-ink">{act.title}</h3>
              <div className="mt-3 space-y-3 leading-relaxed text-ink/75">
                {act.paragraphs.map((p) => <p key={p}>{p}</p>)}
              </div>
              {act.sealed && <div className="mt-4"><Sealed>{act.sealed}</Sealed></div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function NoirCharacters({ story }: { story: EventStory }) {
  return (
    <section>
      <h2 className="font-noir text-3xl font-semibold text-ink">Персонажи и роли</h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-ink/70">{story.charactersIntro}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {story.characters.map((c) => (
          <article key={c.name} className="glass flex flex-col rounded-2xl p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold">
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
        ))}
      </div>
    </section>
  )
}
