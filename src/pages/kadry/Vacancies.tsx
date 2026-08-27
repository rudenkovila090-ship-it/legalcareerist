import { useMemo, useState } from 'react'
import PageHero from '../../components/PageHero'
import { VacancyCard } from '../../components/cards'
import { vacancies } from '../../data/vacancies'
import { SPECIALIZATIONS, type Specialization, type WorkFormat } from '../../types'

const formats: { id: WorkFormat | 'any'; label: string }[] = [
  { id: 'any', label: 'Любой формат' },
  { id: 'office', label: 'Офис' },
  { id: 'remote', label: 'Удалённо' },
  { id: 'hybrid', label: 'Гибрид' },
]

export default function Vacancies() {
  const [spec, setSpec] = useState<Specialization | 'all'>('all')
  const [format, setFormat] = useState<WorkFormat | 'any'>('any')
  const [city, setCity] = useState('')

  const filtered = useMemo(() => {
    return vacancies.filter((v) => {
      if (v.status !== 'open') return false
      if (spec !== 'all' && !v.specialization.includes(spec)) return false
      if (format !== 'any' && v.format !== format) return false
      if (city && !v.city.toLowerCase().includes(city.toLowerCase())) return false
      return true
    })
  }, [spec, format, city])

  return (
    <div>
      <PageHero eyebrow="Кадры" title="Доска вакансий" description="Фильтр по специализации — обязательное поле, значения строго из единого справочника." />
      <div className="container-page py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-white p-4">
          <select
            value={spec}
            onChange={(e) => setSpec(e.target.value as Specialization | 'all')}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
          >
            <option value="all">Все специализации</option>
            {SPECIALIZATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as WorkFormat | 'any')}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
          >
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Город"
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
          />
          <div className="ml-auto text-sm text-ink/50">{filtered.length} вакансий</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VacancyCard key={v.id} v={v} />
          ))}
          {filtered.length === 0 && <p className="text-ink/50">По заданным фильтрам вакансий не найдено.</p>}
        </div>
      </div>
    </div>
  )
}
