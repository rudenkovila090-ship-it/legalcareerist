import { Link, useParams } from 'react-router-dom'
import { vacancies } from '../data/vacancies'
import { TagRow } from '../components/Tag'
import { VacancyCard } from '../components/cards'
import RelatedContentBlock from '../components/RelatedContentBlock'
import LeadForm from '../components/LeadForm'
import { getRelatedContent, getSimilar } from '../lib/related'

const money = new Intl.NumberFormat('ru-RU')

export default function VacancyDetail() {
  const { slug } = useParams()
  const vacancy = vacancies.find((v) => v.slug === slug)

  if (!vacancy) {
    return (
      <div className="container-page py-16">
        <p>Вакансия не найдена. <Link className="underline" to="/kadry/vacancies">Вернуться к списку</Link></p>
      </div>
    )
  }

  const related = getRelatedContent(vacancy, 'vacancy', vacancy.id)
  const similar = getSimilar(vacancies, vacancy)

  return (
    <div className="container-page py-12">
      <Link to="/kadry/vacancies" className="text-sm text-ink/50 hover:text-ink">← Все вакансии</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="text-3xl font-semibold">{vacancy.title}</h1>
          <div className="mt-2 text-ink/60">{vacancy.anonymous ? 'Компания скрыта' : vacancy.company} · {vacancy.city}</div>
          <div className="mt-3">
            <TagRow specialization={vacancy.specialization} industry={vacancy.industry} />
          </div>

          <div className="mt-6 text-lg font-medium">
            {vacancy.salaryFrom ? `от ${money.format(vacancy.salaryFrom)} ₽` : 'По договорённости'}
            {vacancy.salaryTo ? ` до ${money.format(vacancy.salaryTo)} ₽` : ''}
          </div>

          <p className="mt-6 leading-relaxed text-ink/80">{vacancy.description}</p>

          <div className="mt-6">
            <h2 className="font-semibold">Требования</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {vacancy.requirements.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>

          <div className="mt-6">
            <h2 className="font-semibold">Условия</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {vacancy.conditions.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>

          {similar.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-4 text-xl font-semibold">Похожие вакансии</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {similar.map((v) => <VacancyCard key={v.id} v={v} />)}
              </div>
            </div>
          )}

          <RelatedContentBlock items={related} />
        </div>

        <aside>
          <LeadForm
            sourceBlock="kadry"
            formType="vacancy_application"
            title="Откликнуться на вакансию"
            description={`Заявка на позицию «${vacancy.title}»`}
          />
        </aside>
      </div>
    </div>
  )
}
