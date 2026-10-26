import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { vacancies } from '../../data/vacancies'
import { podcastEpisodes } from '../../data/podcast'
import { pluralRu } from '../../lib/plural'
import { WORK_FORMATS, type Vacancy } from '../../types'
import { Chip, IconBubble } from './ui'
import { icon } from './sections'

// Разделы «Вакансии» и «Подкаст» кабинета: показывают то, что уже есть на сайте (каталог вакансий и выпуски подкаста),
// чтобы резидент не искал это отдельно. Новые вакансии и выпуски добавляются в src/data/vacancies.ts и src/data/podcast.ts.

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const SHOWN_VACANCIES = 6
const SHOWN_EPISODES = 6

const money = (n: number) => n.toLocaleString('ru-RU')
function salaryText(v: Vacancy): string {
  if (v.salaryFrom && v.salaryTo) return `${money(v.salaryFrom)}–${money(v.salaryTo)} ₽`
  if (v.salaryFrom) return `от ${money(v.salaryFrom)} ₽`
  if (v.salaryTo) return `до ${money(v.salaryTo)} ₽`
  return ''
}

/** Свежие открытые вакансии каталога сайта. */
export function VacanciesSection() {
  const open = useMemo(() => vacancies.filter((v) => v.status === 'open').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), [])
  const shown = open.slice(0, SHOWN_VACANCIES)
  if (!shown.length) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-ink/70">
        Открытых вакансий сейчас нет. Новые появятся здесь и в Telegram-боте, мы сообщим в сообществе.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {shown.map((v) => {
          const format = WORK_FORMATS.find((f) => f.id === v.format)?.label ?? ''
          const salary = salaryText(v)
          return (
            <Link key={v.id} to={`/vacancies/${v.slug}`} className={`glass flex min-w-0 flex-col gap-1 rounded-xl p-4 ${focusRing}`}>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-semibold leading-snug">{v.title}</span>
                {v.urgent && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">срочно</span>}
              </span>
              <span className="truncate text-sm text-ink/60">{v.anonymous ? 'Компания не раскрывается' : v.company}</span>
              <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-ink/50">
                {[v.city, format, salary].filter(Boolean).map((t) => <span key={t}>{t}</span>)}
              </span>
            </Link>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-ink/60">{open.length} {pluralRu(open.length, ['открытая вакансия', 'открытые вакансии', 'открытых вакансий'])} на сайте</span>
        <Link to="/kadry/vacancies" className={`rounded font-medium text-gold hover:text-ink ${focusRing}`}>Вся доска вакансий →</Link>
      </div>
    </div>
  )
}

/** Выпуски подкаста «Карьерный юрист»: сначала свежие, слушать — на площадке подкаста. */
export function PodcastSection() {
  const episodes = useMemo(() => [...podcastEpisodes].sort((a, b) => b.season - a.season || b.episode - a.episode), [])
  const [all, setAll] = useState(false)
  const shown = all ? episodes : episodes.slice(0, SHOWN_EPISODES)
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 lg:grid-cols-2">
        {shown.map((ep) => (
          <li key={`${ep.season}-${ep.episode}`}>
            <a
              href={ep.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`glass flex h-full min-w-0 items-center gap-3 rounded-xl p-3 ${focusRing}`}
            >
              <IconBubble tone="soft">{icon.headphones}</IconBubble>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{ep.title}</span>
                <span className="mt-0.5 block text-xs text-ink/50">Сезон {ep.season}, выпуск {ep.episode} · {ep.date}</span>
              </span>
              <Chip>Слушать</Chip>
            </a>
          </li>
        ))}
      </ul>
      {episodes.length > SHOWN_EPISODES && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className={`rounded-full border border-ink/15 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:text-ink ${focusRing}`}>
          {all ? 'Свернуть список' : `Показать все выпуски (${episodes.length})`}
        </button>
      )}
      <p className="text-sm text-ink/60">
        Подписка на подкаст и все площадки:{' '}
        <a href="https://legalcareerist.mave.digital/" target="_blank" rel="noopener noreferrer" className={`rounded font-medium text-gold hover:text-ink ${focusRing}`}>legalcareerist.mave.digital</a>
      </p>
    </div>
  )
}
