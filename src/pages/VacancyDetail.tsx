import { useLayoutEffect, useRef } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { vacancies } from '../data/vacancies'
import { VacancyCard } from '../components/cards'
import VacancyDetailBody from '../components/VacancyDetailBody'
import VacancyApplyPanel from '../components/VacancyApplyPanel'
import { getRelatedContent, getSimilar } from '../lib/related'
import { trackEvent } from '../lib/leads'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useSocialMeta } from '../lib/useSocialMeta'
import { useNoindex } from '../lib/pageMeta'

export default function VacancyDetail() {
  const { slug } = useParams()
  const location = useLocation()
  const from = location.state?.vacancyReturnTo
  const backTo = typeof from === 'string' && /^\/kadry\/(?:candidates|vacancies)(?:\?|$)/.test(from) ? from : '/kadry/vacancies'
  const vacancy = vacancies.find((v) => v.slug === slug)
  const layoutRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const header = document.querySelector('header')
    if (!header) return
    const measure = () => layoutRef.current?.style.setProperty('--vacancy-sticky-top', `${Math.ceil(header.getBoundingClientRect().height) + 16}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
  }, [vacancy?.slug])
  useDocumentTitle(vacancy?.title ?? 'Вакансия не найдена')
  useNoindex(!vacancy)
  useSocialMeta({
    title: vacancy?.title,
    description: vacancy ? `${vacancy.anonymous ? 'Вакансия' : vacancy.company}${vacancy.city ? ` · ${vacancy.city}` : ''}` : undefined,
    path: slug ? `/vacancies/${slug}` : undefined,
  })

  if (!vacancy) {
    return (
      <div className="container-page py-16">
        <h1 className="text-2xl font-semibold">Вакансия не найдена</h1>
        <p className="mt-3"><Link className="underline" to="/kadry/vacancies">Вернуться к списку</Link></p>
      </div>
    )
  }

  // Лимит побольше, чем нужно на экран (2 мероприятия + 2 статьи) — из
  // общей релевантной подборки берем по типу отдельно, а не все подряд.
  const related = getRelatedContent(vacancy, 'vacancy', vacancy.id, 12)
  const relatedEvents = related.filter((r) => r.type === 'event').slice(0, 2)
  const relatedArticles = related.filter((r) => r.type === 'article').slice(0, 2)
  const similar = getSimilar(vacancies, vacancy)
  const hasRelated = similar.length > 0 || relatedEvents.length > 0 || relatedArticles.length > 0

  return (
    <div ref={layoutRef} className="mx-auto max-w-[90rem] px-5 py-8 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:py-12">
      <nav aria-label="Навигация по вакансиям" className="sticky top-[var(--vacancy-sticky-top,8rem)] z-30 -mx-5 mb-6 flex justify-start border-b border-ink/10 bg-white/95 px-5 py-3 backdrop-blur-sm lg:mx-0 lg:mb-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Link to={backTo} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gold/30 bg-gold/[0.08] px-4 py-2.5 text-sm font-semibold text-gold transition-colors hover:bg-gold/[0.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold lg:w-full">← Все вакансии</Link>
      </nav>

      <div className="min-w-0 grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr]">
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
          {/* Both side columns follow the actual header height, including its second row. */}
          <div className="space-y-6 lg:sticky lg:top-[var(--vacancy-sticky-top,8rem)]">
            <VacancyApplyPanel vacancy={vacancy} />
          </div>
        </aside>
      </div>
    </div>
  )
}
