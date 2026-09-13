import { useEffect, useState } from 'react'

interface EventStats {
  slug: string
  views: number
  registrations: number
}

/**
 * Реальный (не демо) счетчик просмотров мероприятия — +1 при каждом
 * открытии детальной страницы. По аналогии с useArticleViews/useNewsViews.
 * Возвращает и views, и registrations (переходы к регистрации) — второе
 * число не увеличивается этим хуком, только читается вместе с первым.
 */
export function useEventViews(slug: string) {
  const [state, setState] = useState<EventStats | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/event/${slug}/view`, { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setState({ slug, views: data.views, registrations: data.registrations ?? 0 })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  return state && state.slug === slug ? state.views : null
}

/** Только чтение — для кабинета организатора (список мероприятий), не
 *  увеличивает счетчик. Возвращает { views, registrations } или null,
 *  пока не пришел ответ. */
export function useEventViewCount(slug: string) {
  const [state, setState] = useState<EventStats | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetch(`/api/event/${slug}/views`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setState({ slug, views: data.views, registrations: data.registrations ?? 0 })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  return state && state.slug === slug ? state : null
}
