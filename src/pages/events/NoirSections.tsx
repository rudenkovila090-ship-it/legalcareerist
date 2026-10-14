import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { EventItem } from '../../types'
import type { EventSpeaker, EventStory, ProgramAct, ProgramSlot } from '../../data/eventStories'
import { eventTimeRange } from '../../lib/eventTime'
import { prefersReducedMotion } from '../../lib/motion'
import Reveal from '../../components/noir/Reveal'
import CaseFile from '../../components/noir/CaseFile'
import EvidenceBoard from '../../components/noir/EvidenceBoard'
import SpeakerFiles from '../../components/noir/SpeakerFiles'
import RadioStory from '../../components/noir/RadioStory'
import Newspaper from '../../components/noir/Newspaper'
import { CharacterGlyph } from '../../components/noir/CharacterGlyph'
import { ShotFx } from '../../components/noir/ShotFx'
import { NoirDust, NoirMarquee } from '../../components/noir/NoirAmbient'
import './noir.css'

// Блоки страницы мероприятия в тёмной «нуарной» теме (см. .theme-noir в index.css, анимации — в noir.css).
// Заголовочный шрифт — Playfair Display (с кириллицей), подгружается только на такой странице.

/** «Джазовый вечер для юристов 2» → ['Джазовый вечер для юристов', '2']; без цифры в конце — [текст, '']. */
function splitTrailingNumber(text: string): [string, string] {
  const m = text.match(/^(.*?)\s+(\d+)$/)
  return m ? [m[1], m[2]] : [text, '']
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
              {story.venue && (
                <div className="mt-2 flex items-start gap-2 text-base font-medium text-ink/85 sm:text-lg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mt-[0.3em] h-[1.05em] w-[1.05em] shrink-0 text-gold" aria-hidden="true">
                    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
                    <circle cx="12" cy="9.5" r="2.5" />
                  </svg>
                  <span>{story.venue}</span>
                </div>
              )}
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
      </div>

      <Reveal variant="zoom" delay={150} className="hidden md:block">
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl">
          <div data-parallax="0.07" data-pmax="34" className="absolute inset-x-0 -inset-y-9">
            <img src={story.portraitImage} alt="" aria-hidden="true" className="noir-kb h-full w-full object-cover object-[60%_50%]" />
          </div>
          <div className="noir-sweep" aria-hidden="true" />
        </div>
      </Reveal>

      {/* Вопрос вечера — на всю ширину блока (под текстом и портретом): в узкой колонке одно слово повисало на отдельной строке. */}
      <Reveal className="md:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{story.questionLead}</p>
        <p className="font-noir mt-3 text-pretty text-2xl font-medium italic leading-snug text-ink sm:text-[1.7rem]">
          <span className="noir-q mr-1 text-[var(--noir-crimson-bright)]" aria-hidden="true">«</span>
          {story.question}
          <span className="noir-q ml-1 text-[var(--noir-crimson-bright)]" aria-hidden="true">»</span>
        </p>
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

/** «Сюжет вечера» — ламповый приемник: три волны — акты расследования, остальные — ночной эфир города. */
export function NoirStory({ story }: { story: EventStory }) {
  return (
    <section id="story" className="scroll-mt-24">
      <NoirHeading>Сюжет вечера</NoirHeading>
      <Reveal delay={80}>
        <p className="mt-2 text-sm text-ink/55">Три акта расследования</p>
        <p className="mt-1 text-sm text-ink/55">Покрутите ручку настройки или нажмите клавишу: на каждой волне свой эфир.</p>
      </Reveal>
      <Reveal className="mt-6">
        <RadioStory acts={story.acts} extras={story.radio} />
      </Reveal>
    </section>
  )
}

/** «Члены семьи» — партнёры вечера. Пока имена не объявлены, показываем вводную и ссылку на заявку о партнёрстве. */
export function NoirFamily({ story }: { story: EventStory }) {
  const { intro, groups } = story.family
  return (
    <section id="family" className="scroll-mt-24">
      <NoirHeading>Члены семьи</NoirHeading>
      <Reveal delay={90}>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink/70">{intro}</p>
      </Reveal>
      {groups.map((g) => (
        <div key={g.title} className="mt-6">
          <Reveal>
            <h3 className="font-noir text-lg font-semibold text-ink">{g.title}</h3>
          </Reveal>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-6">
            {g.members.map((m, i) => (
              <Reveal key={m.name} variant="zoom" delay={i * 120}>
                <div className="flex w-full max-w-[12.5rem] flex-col items-center text-center">
                  {m.logo &&
                    (m.link ? (
                      // Картинка тоже ведёт по ссылке, но для клавиатуры и скринридеров ссылка одна — подпись под ней.
                      <a href={m.link.href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="fam-ava">
                        <img src={m.logo} alt="" draggable={false} />
                      </a>
                    ) : (
                      <span className="fam-ava">
                        <img src={m.logo} alt={m.name} draggable={false} />
                      </span>
                    ))}
                  <p className="font-noir mt-3 text-base font-semibold leading-snug text-ink">{m.name}</p>
                  {m.description && <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink/65">{m.description}</p>}
                  {m.link && (
                    <a href={m.link.href} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[0.8125rem] [overflow-wrap:anywhere] font-semibold text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold-light">
                      {m.link.label}
                    </a>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      ))}
      <Reveal delay={150} className="mt-8">
        <a href="#partner" className="inline-block rounded-full border border-ink/25 px-6 py-2.5 text-sm font-semibold text-ink/80 transition-colors hover:border-gold hover:text-gold">
          Стать партнером вечера
        </a>
      </Reveal>
    </section>
  )
}

/** «Новости бара» — газета на столе; листается по клику. Дата, место и цена берутся из самого мероприятия. */
export function NoirNewspaper({ story, event }: { story: EventStory; event: EventItem }) {
  if (!story.paper) return null
  const [ru] = event.title.split(' / ')
  const [, issue] = splitTrailingNumber(ru)
  const facts = {
    issue: issue || '1',
    date: new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: eventTimeRange(event),
    city: event.city ?? '',
    venue: story.venue,
    price: `${event.price.toLocaleString('ru-RU')} ₽`,
    question: story.question,
    photo: story.heroImage,
  }
  return (
    <section id="news" className="scroll-mt-24">
      <NoirHeading>{story.paper.name}</NoirHeading>
      <Reveal delay={90}>
        <p className="mt-2 text-sm text-ink/55">{story.paper.pages.length > 1 ? 'Свежий номер: нажмите на страницу, чтобы перевернуть.' : 'Свежий номер закрытого клуба.'}</p>
      </Reveal>
      <Reveal variant="zoom" className="mt-5">
        <Newspaper paper={story.paper} facts={facts} />
      </Reveal>
    </section>
  )
}

/** Часы из референса программы: серый диск со стрелками. */
function ClockIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 text-ink/45 ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M12 6.5V12l3.6 2.2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--noir-ground)' }} />
    </svg>
  )
}

/** Строка программы: часы, время, название капсом — как на референсе. */
function ProgramRow({ time, title, note }: { time: string; title: string; note?: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="flex items-center gap-2.5 text-lg text-ink sm:text-xl">
          <ClockIcon />
          {time}
        </span>
        <span className="text-lg uppercase tracking-wide text-ink sm:text-xl">{title}</span>
      </div>
      {note && <p className="mt-2 text-sm text-ink/60 sm:pl-[1.875rem]">{note}</p>}
    </div>
  )
}

/** Время акта — от начала первого слота до конца последнего. */
function actTime(act: ProgramAct) {
  return `${act.slots[0].time.split('–')[0]}–${act.slots[act.slots.length - 1].time.split('–')[1]}`
}

/** Подпись под названием выступления: гость и тема — по мере того, как их объявляют. */
function speechCaption(speaker: EventSpeaker | undefined) {
  if (!speaker) return 'Имя гостя и тему выступления объявим позже.'
  if (speaker.topic) return `${speaker.name} · «${speaker.topic}»`
  return `${speaker.name}${speaker.position ? ` · ${speaker.position}` : ''}. Тему выступления объявим позже.`
}

/** Карточка выступления: время, роль, название и — если гость уже объявлен — его имя и тема. */
function SpeechCard({ slot, story }: { slot: ProgramSlot; story: EventStory }) {
  const character = story.characters.find((c) => c.name === slot.role)
  const speaker = character?.speaker
  return (
    <article className="glass noir-card noir-speech flex flex-col rounded-2xl p-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold uppercase tracking-wide text-ink/70">
        <span className="flex items-center gap-2">
          <ClockIcon className="h-4 w-4" />
          {slot.time}
        </span>
        {character && (
          <span className="flex items-center gap-2">
            <span className="text-gold [&>svg]:h-4 [&>svg]:w-4">
              <CharacterGlyph icon={character.icon} />
            </span>
            {character.name}
          </span>
        )}
      </div>
      <h3 className="font-noir mt-5 text-2xl font-semibold leading-snug text-ink">{slot.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink/60">{speechCaption(speaker)}</p>
    </article>
  )
}

/** Акт: заголовок со временем, подряд идущие выступления — карточками в две колонки, остальное (перерыв, финал) — строками. */
function ProgramActView({ act, story }: { act: ProgramAct; story: EventStory }) {
  const groups: { cards: ProgramSlot[] | null; row?: ProgramSlot }[] = []
  for (const slot of act.slots) {
    const last = groups[groups.length - 1]
    if (slot.role) {
      if (last?.cards) last.cards.push(slot)
      else groups.push({ cards: [slot] })
    } else {
      groups.push({ cards: null, row: slot })
    }
  }
  return (
    <div>
      <ProgramRow time={actTime(act)} title={act.title} />
      <div className="mt-6 space-y-6">
        {groups.map((g, i) =>
          g.cards ? (
            <div key={i} className="grid gap-5 sm:grid-cols-2">
              {g.cards.map((slot) => (
                <SpeechCard key={slot.title} slot={slot} story={story} />
              ))}
            </div>
          ) : (
            g.row && (
              <div key={i} className="border-t border-ink/10 pt-6">
                <ProgramRow time={g.row.time} title={g.row.title} />
              </div>
            )
          ),
        )}
      </div>
    </div>
  )
}

/** «Программа» — по референсу: строки со временем, акты и карточки выступлений. */
export function NoirProgram({ story }: { story: EventStory }) {
  const host = story.characters.find((c) => c.name === story.hostRole)?.speaker
  return (
    <section id="program" className="scroll-mt-24">
      <NoirHeading>Программа</NoirHeading>
      {host && (
        <Reveal delay={60} className="mt-5">
          <div className="flex items-center gap-4">
            {host.photo && <img src={host.photo} alt="" draggable={false} className="h-14 w-14 shrink-0 rounded-full border border-gold/40 object-cover object-[50%_20%]" />}
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Ведущая вечера</div>
              <div className="font-noir text-xl font-semibold text-ink">{host.name}</div>
            </div>
          </div>
        </Reveal>
      )}
      <ol className="mt-6 border-b border-ink/10">
        {story.program.map((entry, i) => (
          <li key={entry.title} className="border-t border-ink/10 py-6 sm:py-7">
            <Reveal delay={Math.min(i, 3) * 70}>{'slots' in entry ? <ProgramActView act={entry} story={story} /> : <ProgramRow time={entry.time} title={entry.title} note={entry.note} />}</Reveal>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** «Спикеры» — папки с делами гостей по ролям вечера; по клику открывается карточка дела. */
export function NoirSpeakers({ story, event }: { story: EventStory; event: EventItem }) {
  const when = new Date(event.dateTime)
  const dateLabel = when.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <section id="speakers" className="scroll-mt-24">
      <NoirHeading>Спикеры</NoirHeading>
      <Reveal delay={90}>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink/70">{story.speakersIntro}</p>
      </Reveal>
      <Reveal className="mt-8">
        <SpeakerFiles characters={story.characters} dateLabel={dateLabel} />
      </Reveal>
    </section>
  )
}
