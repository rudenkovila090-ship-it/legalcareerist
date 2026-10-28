import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { vacancies } from '../../data/vacancies'
import { pluralRu } from '../../lib/plural'
import { WORK_FORMATS, type Vacancy } from '../../types'

// Раздел «Вакансии» кабинета: показывает то, что уже есть на сайте (каталог вакансий), чтобы резидент не искал это отдельно.
// Новые вакансии добавляются в src/data/vacancies.ts. Подкаст теперь — заявка гостя во вкладке «Построение карьеры».

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const SHOWN_VACANCIES = 6

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
