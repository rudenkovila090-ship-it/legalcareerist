import { useMemo, useState } from 'react'
import PageHero from '../../components/PageHero'
import LeadForm from '../../components/LeadForm'
import { vacancies } from '../../data/vacancies'
import RelatedContentBlock from '../../components/RelatedContentBlock'
import { getRelatedContent } from '../../lib/related'
import { SPECIALIZATIONS, type Specialization } from '../../types'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// /kadry/salary — Зарплатный навигатор (раздел 6.7): не было в исходном ТЗ,
// добавлено по итогам анализа конкурентов. Диапазон считается из mock-выборки
// вакансий (в проде — агрегированная статистика по базе + ручные апдейты).
export default function Salary() {
  useDocumentTitle('Зарплатный навигатор')
  const [spec, setSpec] = useState<Specialization>('inhouse')
  const [city, setCity] = useState('Москва')

  const sample = useMemo(
    () => vacancies.filter((v) => v.specialization.includes(spec) && v.city === city),
    [spec, city],
  )

  const range = useMemo(() => {
    const salaries = sample.flatMap((v) => [v.salaryFrom, v.salaryTo].filter(Boolean) as number[])
    if (salaries.length === 0) return null
    return { min: Math.min(...salaries), max: Math.max(...salaries) }
  }, [sample])

  const cities = Array.from(new Set(vacancies.map((v) => v.city)))
  const related = getRelatedContent({ specialization: [spec], industry: [] }, 'article', undefined, 3)

  return (
    <div>
      <PageHero
        eyebrow="Кадры"
        title="Зарплатный навигатор"
        description="Узнайте актуальный диапазон дохода по специализации, отрасли и городу."
        prototype
      />
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <div className="glass rounded-xl p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={spec} onChange={(e) => setSpec(e.target.value as Specialization)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                {SPECIALIZATIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="mt-6 rounded-lg bg-ink/[0.04] p-5">
              {range ? (
                <>
                  <div className="text-xs uppercase tracking-wide text-ink/50">Диапазон дохода</div>
                  <div className="mt-1 text-2xl font-semibold">
                    {range.min.toLocaleString('ru-RU')} – {range.max.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="mt-1 text-xs text-ink/40">По {sample.length} открытым вакансиям в выборке</div>
                </>
              ) : (
                <p className="text-sm text-ink/50">Недостаточно данных по выбранным параметрам — оставьте заявку, пришлем точный отчет.</p>
              )}
            </div>
          </div>

          <div className="mt-8">
            <RelatedContentBlock items={related} title="Статьи по теме" />
          </div>
        </div>

        <LeadForm
          sourceBlock="kadry"
          formType="salary_report_request"
          title="Получить точный отчет по вашей специализации"
          description="Пришлем развернутый отчет на email с разбивкой по грейдам."
        />
      </div>
    </div>
  )
}
