// Отзывы соискателей о работодателе + расчет рейтинга (личный кабинет
// работодателя). Как и отклики/вакансии, в этом прототипе живет в
// localStorage — здесь только демо-данные под одну компанию
// (demoEmployerCompany), реальной привязки к разным работодателям пока нет.
export type ReviewContext = 'company' | 'interview'

export interface EmployerReview {
  id: string
  authorName: string
  rating: number // 1–5
  text: string
  date: string
  /** О чем отзыв — о компании в целом или конкретно о собеседовании. */
  context?: ReviewContext
  /** Публичный ответ работодателя на отзыв — виден вместе с отзывом. */
  reply?: { text: string; date: string }
}

const KEY = 'ky_employer_reviews'

function seedReviews(): EmployerReview[] {
  return [
    {
      id: 'rev1',
      authorName: 'Мария К.',
      rating: 5,
      text: 'Прозрачный процесс собеседования, обратную связь дали быстро. Условия совпали с тем, что было в вакансии.',
      date: '2026-07-02',
    },
    {
      id: 'rev2',
      authorName: 'Дмитрий В.',
      rating: 4,
      text: 'Хорошая команда, адекватный руководитель. Испытательный срок описали заранее, без сюрпризов.',
      date: '2026-06-18',
    },
    {
      id: 'rev3',
      authorName: 'Анна С.',
      rating: 5,
      text: 'Взяли без опыта на инхаус-позицию с нормальной зарплатой — большая редкость на рынке.',
      date: '2026-05-27',
    },
  ]
}

export function getReviews(): EmployerReview[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as EmployerReview[]
    const seeded = seedReviews()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

function writeAll(all: EmployerReview[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

/** Новый отзыв соискателя — из личного кабинета соискателя, см. CandidateAccount.tsx. */
export function addReview(authorName: string, rating: number, text: string, context: ReviewContext): EmployerReview {
  const review: EmployerReview = {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    authorName,
    rating,
    text,
    context,
    date: new Date().toISOString(),
  }
  writeAll([review, ...getReviews()])
  return review
}

/** Публичный ответ работодателя на отзыв соискателя. */
export function addReviewReply(id: string, text: string): EmployerReview | undefined {
  const all = getReviews()
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], reply: { text, date: new Date().toISOString() } }
  writeAll(all)
  return all[idx]
}

export interface EmployerRating {
  averageRating: number // 0–5
  reviewsCount: number
  /** Итоговый балл 0–100: средняя оценка по отзывам + бонус за подтвержденные
   *  места во внешних рейтингах (см. lib/rankings.ts) — черновая демо-формула,
   *  не окончательный алгоритм. */
  score: number
}

/** rankingBonus — очки сверх базовой оценки по отзывам, 0–20 (по 5 очков за
 *  место в топ-3 подтвержденного рейтинга, см. lib/rankings.ts). */
export function computeEmployerRating(reviews: EmployerReview[], rankingBonus = 0): EmployerRating {
  const reviewsCount = reviews.length
  const averageRating = reviewsCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount : 0
  const base = (averageRating / 5) * 80 // отзывы — до 80 очков из 100
  const score = Math.round(Math.min(100, base + Math.min(20, rankingBonus)))
  return { averageRating: Math.round(averageRating * 10) / 10, reviewsCount, score }
}
