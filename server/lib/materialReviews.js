// Отзывы покупателей о полезных материалах: оценка 1–5 звёзд + «что понравилось» / «что не понравилось».
// Оставить отзыв может только тот, кто купил материал: ссылка с токеном покупки приходит в письме и в боте.
// Один отзыв на одну покупку (повторная отправка обновляет его). Админ может скрыть отзыв (в боте).
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('material-reviews.json')

const cleanText = (value, max = 1000) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max)

/** Только имя без фамилии — на сайте показываем его (в форме покупатель соглашается на публикацию). */
export const firstName = (fullName) => cleanText(fullName, 80).split(/\s+/)[0] || 'Покупатель'

export function listReviews() {
  return store
    .all()
    .sort((a, b) => a.number - b.number)
}

export function getReview(number) {
  return listReviews().find((r) => r.number === Number(number)) ?? null
}

export function getReviewByPurchase(purchaseToken) {
  return listReviews().find((r) => r.purchaseToken === purchaseToken) ?? null
}

/** Создаёт отзыв или обновляет прежний по этой покупке. Возвращает { review, updated }. */
export function saveReview({ materialSlug, purchaseToken, name, rating, liked, disliked }) {
  const fields = { rating: Math.min(5, Math.max(1, Math.round(Number(rating)))), liked: cleanText(liked), disliked: cleanText(disliked) }
  const existing = getReviewByPurchase(purchaseToken)
  if (existing) {
    const review = store.update(existing.token, (x) => ({ ...x, ...fields, updatedAt: Date.now() }))
    return { review: { ...review, token: existing.token }, updated: true }
  }
  const number = listReviews().reduce((max, r) => Math.max(max, r.number), 0) + 1
  const token = store.create({ number, materialSlug, purchaseToken, name: firstName(name), ...fields, hidden: false })
  return { review: { token, ...store.get(token) }, updated: false }
}

export function setReviewHidden(number, hidden) {
  const r = getReview(number)
  return r ? store.update(r.token, (x) => ({ ...x, hidden })) && getReview(number) : null
}

const visible = (r) => !r.hidden

/** Сводка для рейтинга: { slug: { sum, count } } по видимым отзывам. */
export function ratingsSummary() {
  const out = {}
  for (const r of listReviews().filter(visible)) {
    const e = (out[r.materialSlug] ??= { sum: 0, count: 0 })
    e.sum += r.rating
    e.count += 1
  }
  return out
}

/** Публичный список отзывов материала: имя, оценка, тексты, дата (без токенов и контактов). */
export function publicReviews(materialSlug) {
  return listReviews()
    .filter((r) => visible(r) && r.materialSlug === materialSlug)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({ name: r.name, rating: r.rating, liked: r.liked, disliked: r.disliked, date: r.createdAt }))
}
