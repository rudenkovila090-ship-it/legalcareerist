import { Link, useParams } from 'react-router-dom'
import { vacancies } from '../data/vacancies'
import { VacancyCard } from '../components/cards'
import VacancyDetailBody, { VacancyContactsBlock } from '../components/VacancyDetailBody'
import LeadForm from '../components/LeadForm'
import { getRelatedContent, getSimilar } from '../lib/related'
import { trackEvent } from '../lib/leads'

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

  // Лимит побольше, чем нужно на экран (2 мероприятия + 2 статьи) — из
  // общей релевантной подборки берём по типу отдельно, а не всё подряд.
  const related = getRelatedContent(vacancy, 'vacancy', vacancy.id, 12)
  const relatedEvents = related.filter((r) => r.type === 'event').slice(0, 2)
  const relatedArticles = related.filter((r) => r.type === 'article').slice(0, 2)
  const similar = getSimilar(vacancies, vacancy)
  const hasRelated = similar.length > 0 || relatedEvents.length > 0 || relatedArticles.length > 0

  return (
    <div className="container-page py-12">
      <Link to="/kadry/vacancies" className="text-xl font-semibold text-gold hover:text-ink">← Все вакансии</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div>
          <VacancyDetailBody vacancy={vacancy} />

          {hasRelated && (
            <div className="mt-14">
              <h2 className="mb-1 text-xl font-semibold">Связанное</h2>
              <p className="mb-5 text-sm text-ink/60">Подобрано автоматически по совпадению специализации и отрасли.</p>
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  {similar.length > 0 && (
                    <>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/50">Похожие вакансии</h3>
                      <div className="space-y-4">
                        {similar.map((v) => <VacancyCard key={v.id} v={v} />)}
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-6">
                  {relatedEvents.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/50">Мероприятия</h3>
                      <div className="space-y-4">
                        {relatedEvents.map((item) => (
                          <Link
                            key={`${item.type}-${item.id}`}
                            to={item.href}
                            onClick={() => trackEvent('related_content_click', { type: item.type, id: item.id, target: item.href })}
                            className="glass block rounded-xl p-4"
                          >
                            <span className="mb-2 inline-block rounded-full bg-ink/45 px-2 py-0.5 text-xs font-medium text-white">Мероприятие</span>
                            <div className="font-medium leading-snug text-ink">{item.title}</div>
                            <div className="mt-1 text-xs text-ink/50">{item.meta}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {relatedArticles.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/50">База знаний</h3>
                      <div className="space-y-4">
                        {relatedArticles.map((item) => (
                          <Link
                            key={`${item.type}-${item.id}`}
                            to={item.href}
                            onClick={() => trackEvent('related_content_click', { type: item.type, id: item.id, target: item.href })}
                            className="glass block rounded-xl p-4"
                          >
                            <span className="mb-2 inline-block rounded-full bg-ink/70 px-2 py-0.5 text-xs font-medium text-white">База знаний</span>
                            <div className="font-medium leading-snug text-ink">{item.title}</div>
                            <div className="mt-1 text-xs text-ink/50">{item.meta}</div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside>
          {/* top-20 — под закрепленной шапкой сайта (h-16 = 64px) с запасом,
              иначе заголовок формы уезжает под нее при прокрутке. */}
          <div className="space-y-6 lg:sticky lg:top-20">
            <LeadForm
              sourceBlock="kadry"
              formType="vacancy_application"
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
            />
            <VacancyContactsBlock vacancy={vacancy} />
          </div>
        </aside>
      </div>
    </div>
  )
}
