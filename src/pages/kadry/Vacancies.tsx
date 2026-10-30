import { useMemo, useState } from 'react'
import PageHero from '../../components/PageHero'
import { VacancyCard } from '../../components/cards'
import { vacancies } from '../../data/vacancies'
import { IndustryFilter, EducationFilter } from '../../components/VacancyFilters'
import { pluralRu } from '../../lib/plural'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { TwoColumn } from '../../components/layouts'
import {
  SPECIALIZATIONS, EMPLOYMENT_TYPES, WORK_SCHEDULES, WORK_FORMATS, EXPERIENCE_BUCKETS,
  type Specialization, type WorkFormat, type EmploymentType, type WorkSchedule,
  type ExperienceBucket, type EducationLevel,
} from '../../types'

// Раздел «Направления» на доске вакансий — намеренно короче общего справочника
// специализаций: только направления, актуальные для этого раздела.
const vacancySpecIds: Specialization[] = ['inhouse', 'consulting', 'advocacy', 'notary', 'law_enforcement', 'government']
const vacancySpecs = vacancySpecIds.map((id) => SPECIALIZATIONS.find((s) => s.id === id)!)

const cityOptions = ['Москва', 'Санкт-Петербург', 'Екатеринбург']

function parseMinSalary(text: string) {
  return Number(text.replace(/\D/g, '')) || 0
}

export default function Vacancies() {
  useDocumentTitle('Доска вакансий')
  const [spec, setSpec] = useState<Specialization | 'all'>('all')
  const [format, setFormat] = useState<WorkFormat | 'any'>('any')
  const [schedule, setSchedule] = useState<WorkSchedule | 'any'>('any')
  const [employment, setEmployment] = useState<EmploymentType | 'any'>('any')
  const [city, setCity] = useState('')
  const [experience, setExperience] = useState<ExperienceBucket | 'any'>('any')
  const [salaryText, setSalaryText] = useState('')
  const [educationSel, setEducationSel] = useState<Set<EducationLevel>>(new Set())
  const [industrySel, setIndustrySel] = useState<Set<string>>(new Set())

  const minSalary = parseMinSalary(salaryText)

  const filtered = useMemo(() => {
    return vacancies.filter((v) => {
      if (v.status !== 'open') return false
      if (spec !== 'all' && !v.specialization.includes(spec)) return false
      if (format !== 'any' && v.format !== format) return false
      if (schedule !== 'any' && v.schedule !== schedule) return false
      if (employment !== 'any' && v.employment !== employment) return false
      if (city && v.city !== city) return false
      if (experience !== 'any' && v.experience !== experience) return false
      if (educationSel.size > 0 && !v.education.some((e) => educationSel.has(e))) return false
      if (industrySel.size > 0 && !v.companyIndustry.some((t) => industrySel.has(t))) return false
      if (minSalary > 0 && (v.salaryFrom ?? 0) < minSalary && (v.salaryTo ?? 0) < minSalary) return false
      return true
    })
  }, [spec, format, schedule, employment, city, experience, educationSel, industrySel, minSalary])

  return (
    <div>
      <PageHero
        eyebrow="Кадры"
        title="Доска вакансий"
        description="Актуальные вакансии для юристов: фильтры по направлению, городу, формату работы, опыту и зарплате."
      />
      <div className="container-page py-10">
        {/* Схема Two Column: фильтры слева (на телефоне сворачиваются), список справа. Колонка фильтров поднята над списком (z-20 в TwoColumn),
            иначе раскрывающиеся списки отраслей и образования оказывались бы под карточками вакансий. */}
        <TwoColumn collapseLabel="Фильтры" aside={
        <div className="glass space-y-4 rounded-xl p-4">
          <div className="grid gap-3 [&_input]:w-full [&_select]:w-full [&>*]:min-w-0">
            <select aria-label="Направление"
              value={spec}
              onChange={(e) => setSpec(e.target.value as Specialization | 'all')}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="all" disabled hidden>Направление</option>
              {spec !== 'all' && <option value="all">Все направления</option>}
              {vacancySpecs.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <IndustryFilter value={industrySel} onChange={setIndustrySel} />
            <EducationFilter value={educationSel} onChange={setEducationSel} />
            <select aria-label="Город"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="" disabled hidden>Город</option>
              {city && <option value="">Все города</option>}
              {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Опыт работы"
              value={experience}
              onChange={(e) => setExperience(e.target.value as ExperienceBucket | 'any')}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="any" disabled hidden>Опыт работы</option>
              {experience !== 'any' && <option value="any">Любой опыт</option>}
              {EXPERIENCE_BUCKETS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            <input aria-label="Заработная плата, ₽ (например, 100 000)"
              value={salaryText}
              onChange={(e) => setSalaryText(e.target.value)}
              placeholder="Заработная плата, ₽ (например, 100 000)"
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
            <select aria-label="Формат"
              value={format}
              onChange={(e) => setFormat(e.target.value as WorkFormat | 'any')}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="any" disabled hidden>Формат</option>
              {format !== 'any' && <option value="any">Любой формат</option>}
              {WORK_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            <select aria-label="График"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as WorkSchedule | 'any')}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="any" disabled hidden>График</option>
              {schedule !== 'any' && <option value="any">Любой график</option>}
              {WORK_SCHEDULES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <select aria-label="Занятость"
              value={employment}
              onChange={(e) => setEmployment(e.target.value as EmploymentType | 'any')}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              <option value="any" disabled hidden>Занятость</option>
              {employment !== 'any' && <option value="any">Любая занятость</option>}
              {EMPLOYMENT_TYPES.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

        </div>
        }>
          <div className="mb-3 text-sm text-ink/50">{filtered.length} {pluralRu(filtered.length, ['вакансия', 'вакансии', 'вакансий'])}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((v) => (
              <VacancyCard key={v.id} v={v} />
            ))}
            {filtered.length === 0 && <p className="text-ink/50">По заданным фильтрам вакансий не найдено.</p>}
          </div>
        </TwoColumn>
      </div>
    </div>
  )
}
