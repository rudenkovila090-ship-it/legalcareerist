import { Link, useParams } from 'react-router-dom'
import { vacancies } from '../data/vacancies'
import { VacancyCard } from '../components/cards'
import VacancyDetailBody from '../components/VacancyDetailBody'
import RelatedContentBlock from '../components/RelatedContentBlock'
import LeadForm from '../components/LeadForm'
import { getRelatedContent, getSimilar } from '../lib/related'

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
          <VacancyDetailBody vacancy={vacancy} />

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
            contactLabel="Почта"
            showPhone
            showTelegram
            showResumeUpload
          />
        </aside>
      </div>
    </div>
  )
}
