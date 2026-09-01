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
  const hasContacts = vacancy.contactPhone || vacancy.contactEmail
  const hasFooter = vacancy.companyWebsite || vacancy.companyAddress

  return (
    <div className="container-page py-12">
      <Link to="/kadry/vacancies" className="text-sm text-ink/50 hover:text-ink">← Все вакансии</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          {vacancy.technicalExample && (
            <div className="mb-4 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Технический пример — показывает структуру страницы вакансии, не реальное предложение о работе.
            </div>
          )}

          {vacancy.companyTagline && (
            <div className="text-sm font-medium uppercase tracking-wide text-gold">{vacancy.companyTagline}</div>
          )}
          <h1 className="mt-1 text-3xl font-semibold">{vacancy.title}</h1>
          <div className="mt-2 text-ink/60">{vacancy.anonymous ? 'Компания скрыта' : vacancy.company} · {vacancy.city}</div>
          <div className="mt-3">
            <TagRow specialization={vacancy.specialization} industry={vacancy.industry} />
          </div>

          <div className="mt-6 text-lg font-medium">
            {vacancy.salaryFrom ? `от ${money.format(vacancy.salaryFrom)} ₽` : 'По договоренности'}
            {vacancy.salaryTo ? ` до ${money.format(vacancy.salaryTo)} ₽` : ''}
          </div>

          <p className="mt-6 leading-relaxed text-ink/80">{vacancy.description}</p>

          {vacancy.highlights && vacancy.highlights.length > 0 && (
            <div className="mt-8">
              <h2 className="font-semibold">Почему эта вакансия интересна</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {vacancy.highlights.map((h) => (
                  <div key={h.title} className="glass rounded-xl p-4">
                    <div className="font-medium">{h.title}</div>
                    <div className="mt-1 text-sm text-ink/60">{h.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vacancy.responsibilities && vacancy.responsibilities.length > 0 ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <h2 className="font-semibold">Что предстоит делать</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
                  {vacancy.responsibilities.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
              <div>
                <h2 className="font-semibold">Кого мы ищем</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
                  {vacancy.requirements.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <h2 className="font-semibold">Требования</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
                {vacancy.requirements.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-8 rounded-xl bg-ink/[0.04] p-5">
            <h2 className="font-semibold">Условия</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {vacancy.conditions.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>

          {vacancy.practiceAreas && vacancy.practiceAreas.length > 0 && (
            <div className="mt-8">
              <h2 className="font-semibold">Направления деятельности компании</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {vacancy.practiceAreas.map((p) => (
                  <span key={p} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/70">{p}</span>
                ))}
              </div>
            </div>
          )}

          {(hasContacts || hasFooter) && (
            <div className="mt-8 rounded-xl border border-ink/10 p-5 text-sm">
              {hasContacts && (
                <>
                  <div className="font-semibold">Контакты по вакансии</div>
                  <div className="mt-2 space-y-1 text-ink/70">
                    {vacancy.contactPhone && <div>Телефон: {vacancy.contactPhone}</div>}
                    {vacancy.contactEmail && <div>Эл. почта: {vacancy.contactEmail}</div>}
                  </div>
                </>
              )}
              {hasFooter && (
                <div className={hasContacts ? 'mt-4 border-t border-ink/10 pt-4 text-ink/50' : 'text-ink/50'}>
                  {vacancy.companyWebsite && <div>{vacancy.companyWebsite}</div>}
                  {vacancy.companyAddress && <div>{vacancy.companyAddress}</div>}
                </div>
              )}
            </div>
          )}

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
