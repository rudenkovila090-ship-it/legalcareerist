import { useEffect, useState } from 'react'

/**
 * Реальный (не демо) счетчик просмотров мероприятия — +1 при каждом
 * открытии детальной страницы. По аналогии с useArticleViews/useNewsViews.
 */
export function useEventViews(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/event/${slug}/view`, { method: 'POST' })
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

/** Только чтение — для кабинета организатора (список мероприятий), не
 *  увеличивает счетчик. */
export function useEventViewCount(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number } | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/event/${slug}/views`)
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
