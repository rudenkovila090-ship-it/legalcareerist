import type { Vacancy } from '../types'
import { INDUSTRIES, SPECIALIZATIONS } from '../types'
import { IndustryTag, SpecTag } from './Tag'
import { salaryLabel } from '../lib/vacancySalary'

export const vacancyCardClass = 'glass group block h-full min-w-0 rounded-xl p-3.5 text-left transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/50'

/** Одинаковые строки для каталога и вкладки соискателя; полная информация — внутри вакансии. */
export default function VacancyCardContent({ vacancy: v }: { vacancy: Vacancy }) {
  const company = v.anonymous ? 'Компания скрыта' : v.company
  const specs = v.specialization.slice(0, 1), industries = v.industry.slice(0, 1)
  const extra = v.specialization.length + v.industry.length - specs.length - industries.length
  const sphere = [...v.specialization.map(id => SPECIALIZATIONS.find(s => s.id === id)?.label), ...v.industry.map(id => INDUSTRIES.find(i => i.id === id)?.label)].filter(Boolean).join(', ')
  return <div className="grid grid-rows-[2.25rem_1rem_1rem_1.25rem_2.25rem_1.5rem] gap-y-1" data-vacancy-summary>
    <div className="flex min-w-0 items-start gap-2" data-vacancy-row="position">
      <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-[18px]" title={v.title}>{v.title}</h3>
      {(v.urgent || v.technicalExample) && <div className="max-w-20 shrink-0 space-y-0.5 text-right">{v.urgent && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">Срочно</span>}{v.technicalExample && <span className="block text-[10px] leading-3 text-amber-700">Технический пример</span>}</div>}
    </div>
    <div className="truncate text-xs leading-4 text-ink/65" title={company} data-vacancy-row="company">{company}</div>
    <div className="truncate text-xs leading-4 text-ink/55" data-vacancy-row="city">{v.city}</div>
    <div className="truncate text-[13px] font-medium leading-5 text-ink" title={salaryLabel(v) || 'Зарплата не указана'} data-vacancy-row="salary">{salaryLabel(v) || 'Зарплата не указана'}</div>
    <div className="flex flex-wrap content-start items-start gap-1 overflow-hidden [&>span]:px-2 [&>span]:py-0.5 [&>span]:text-[11px] [&>span]:leading-3" title={sphere} aria-label={`Сфера: ${sphere || 'Не указана'}`} data-vacancy-row="sphere">
      {specs.map(s => <SpecTag key={s} id={s} />)}{industries.map(i => <IndustryTag key={i} id={i} />)}
      {extra > 0 && <span className="rounded-full bg-ink/5 font-medium text-ink/65">+{extra}</span>}
    </div>
    <div className="flex items-center justify-between gap-2" data-vacancy-row="action">
      <span className="inline-flex items-center gap-1 rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold leading-3 text-ink transition-colors group-hover:bg-ink group-hover:text-white">Посмотреть вакансию <span aria-hidden="true">→</span></span>
    </div>
  </div>
}
