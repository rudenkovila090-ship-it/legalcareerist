import { useEffect, useState } from 'react'

/**
 * Реальный (не демо) счетчик просмотров новости — +1 при каждом открытии
 * детальной страницы /news/:slug. По аналогии с useArticleViews.
 */
export function useNewsViews(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/news/${slug}/view`, { method: 'POST' })
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
 * Только чтение — для карточек новости в списках (Главная, /news, вкладка
 * «Блог»). Не увеличивает счетчик — иначе каждый рендер списка сам
 * накручивал бы просмотры.
 */
export function useNewsViewCount(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/news/${slug}/views`)
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
