import { useEffect, useState } from 'react'

/**
 * Реальный (не демо) счетчик просмотров статьи базы знаний — +1 к счетчику
 * при каждом открытии. По аналогии с useVacancyStats в VacancyDetailBody.tsx:
 * хранит slug вместе с результатом и сверяет его с текущим при рендере,
 * чтобы при переключении между статьями (без перезагрузки страницы, как во
 * вкладке «База знаний») не мелькнули цифры чужой статьи.
 */
export function useArticleViews(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/article/${slug}/view`, { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setState({ slug, views: data.views })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  return state && state.slug === slug ? state.views : null
}

/**
 * Только чтение — для карточек статьи в списке базы знаний. Не увеличивает
 * счетчик (в отличие от useArticleViews), иначе каждый рендер списка сам
 * накручивал бы просмотры.
 */
export function useArticleViewCount(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/article/${slug}/views`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setState({ slug, views: data.views })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  return state && state.slug === slug ? state.views : null
}
