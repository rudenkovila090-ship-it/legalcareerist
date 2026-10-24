import type { Vacancy } from '../types'
import LeadForm from './LeadForm'
import { VacancyContactsBlock, VacancyHowToApplyCard } from './VacancyDetailBody'

/** Правая колонка страницы вакансии: форма отклика и контакты либо, если отклики принимает работодатель, карточка «Как откликнуться». */
export default function VacancyApplyPanel({ vacancy }: { vacancy: Vacancy }) {
  if (vacancy.directApply) return <VacancyHowToApplyCard vacancy={vacancy} />
  return (
    <>
      <LeadForm
        sourceBlock="kadry"
        formType="vacancy_application"
        submitId="btn-vacancy-apply"
        title="Откликнуться на вакансию"
        description={`«${vacancy.title}»`}
        contactLabel="Почта"
        showPhone
        showTelegram
        showResumeUpload
        showMotivationUpload
        showCoverLetterUpload
        showRecommendationUpload
        requireAll
        vacancySlug={vacancy.slug}
        vacancyTitle={vacancy.title}
        vacancyNumber={vacancy.number}
      />
      <VacancyContactsBlock vacancy={vacancy} />
    </>
  )
}
