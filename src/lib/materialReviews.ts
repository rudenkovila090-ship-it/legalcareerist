// Отзывы о полезных материалах (маркетплейс): рейтинг складывается из звёзд покупателей.
// Оставить отзыв может только покупатель — по ссылке с токеном покупки из письма
// (/materials/<slug>?review=<токен>). Сервер: server/lib/materialReviews.js.
import { useEffect, useState } from 'react'
import type { ConsentChoice } from './consent'

export interface PublicReview {
  name: string
  rating: number
  text: string
  date: number
}

export interface RatingSummary {
  sum: number
  count: number
}

let ratingsPromise: Promise<Record<string, RatingSummary>> | null = null

/** Сводка рейтингов по всем материалам (один запрос на страницу). */
export function fetchRatings(): Promise<Record<string, RatingSummary>> {
  ratingsPromise ??= fetch('/api/materials/ratings')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return ratingsPromise
}

export function useMaterialRatings(): Record<string, RatingSummary> {
  const [ratings, setRatings] = useState<Record<string, RatingSummary>>({})
  useEffect(() => {
    let active = true
    fetchRatings().then((r) => active && setRatings(r))
    return () => {
      active = false
    }
  }, [])
  return ratings
}

/**
 * Итоговая оценка: исторические цифры из данных материала (rating/reviewsCount, накопленные до запуска формы)
 * плюс новые отзывы с сайта. null — оценок ещё нет.
 */
export function combineRating(base: { rating?: number; reviewsCount?: number }, real?: RatingSummary): { avg: number; count: number } | null {
  const baseCount = base.reviewsCount ?? 0
  const count = baseCount + (real?.count ?? 0)
  if (count <= 0) return null
  const sum = (base.rating ?? 0) * baseCount + (real?.sum ?? 0)
  return { avg: sum / count, count }
}

/** Склонение: 1 отзыв, 2 отзыва, 5 отзывов. */
export function reviewsWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'отзыв'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'отзыва'
  return 'отзывов'
}

export async function fetchReviews(slug: string): Promise<PublicReview[]> {
  try {
    const res = await fetch(`/api/materials/${slug}/reviews`)
    if (!res.ok) return []
    return ((await res.json()) as { reviews: PublicReview[] }).reviews
  } catch {
    return []
  }
}

export interface MyReview {
  rating: number
  text: string
  /** Подпись, под которой отзыв уже опубликован. */
  name?: string
}

/** Проверка ссылки на отзыв: ok — покупка оплачена и относится к этому материалу; review — прежний отзыв, если есть. */
export async function checkReviewAccess(slug: string, token: string): Promise<{ ok: boolean; review: MyReview | null }> {
  try {
    const res = await fetch(`/api/materials/${slug}/review-access?token=${encodeURIComponent(token)}`)
    if (!res.ok) return { ok: false, review: null }
    const data = (await res.json()) as { review: MyReview | null }
    return { ok: true, review: data.review }
  } catch {
    return { ok: false, review: null }
  }
}

export async function submitReview(
  slug: string,
  body: { token: string; rating: number; text: string; displayName: string; consent: ConsentChoice; consentVersion: string; publishConsent: boolean; publishConsentVersion: string },
): Promise<boolean> {
  try {
    const res = await fetch(`/api/materials/${slug}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return res.ok
  } catch {
    return false
  }
}
