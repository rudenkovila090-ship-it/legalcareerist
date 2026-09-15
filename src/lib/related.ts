// RelatedContent — единый сервис подбора связанного контента по пересечению тегов
// специализации/отрасли (раздел 3.4 ТЗ). Переиспользуется на всех детальных страницах:
// вакансия, статья БЗ, мероприятие, материал, клуб сообщества.
import type { Industry, Specialization, Tagged } from '../types'
import { vacancies } from '../data/vacancies'
import { articles } from '../data/articles'
import { events } from '../data/events'
import { materials } from '../data/materials'
import { clubs } from '../data/clubs'

export type ContentType = 'vacancy' | 'article' | 'event' | 'material' | 'club'

export interface RelatedItem {
  type: ContentType
  id: string
  slug: string
  title: string
  href: string
  meta: string
}

function score(a: Tagged, specialization: Specialization[], industry: Industry[]): number {
  const specHits = a.specialization.filter((s) => specialization.includes(s)).length
  const indHits = a.industry.filter((i) => industry.includes(i)).length
  // Специализация — основная ось (обязательна везде), поэтому весит больше отрасли.
  return specHits * 2 + indHits
}

/**
 * Возвращает связанные объекты других типов контента, отсортированные по
 * релевантности тегов. excludeType исключает текущий тип (например, на
 * странице вакансии не показываем «похожие вакансии» через этот сервис —
 * для них используется отдельная выборка того же типа).
 */
export function getRelatedContent(
  tags: Tagged,
  excludeType: ContentType,
  excludeId?: string,
  limit = 6,
): RelatedItem[] {
  const items: (RelatedItem & { score: number })[] = []

  if (excludeType !== 'vacancy') {
    for (const v of vacancies) {
      if (v.status !== 'open') continue
      const s = score(v, tags.specialization, tags.industry)
      if (s > 0) {
        items.push({
          type: 'vacancy',
          id: v.id,
          slug: v.slug,
          title: v.title,
          href: `/vacancies/${v.slug}`,
          meta: v.anonymous ? 'Вакансия · компания скрыта' : `Вакансия · ${v.company}`,
          score: s,
        })
      }
    }
  }

  if (excludeType !== 'article') {
    for (const a of articles) {
      const s = score(a, tags.specialization, tags.industry)
      if (s > 0) {
        items.push({
          type: 'article',
          id: a.id,
          slug: a.slug,
          title: a.title,
          href: `/knowledge/${a.slug}`,
          meta: 'Статья Базы знаний',
          score: s,
        })
      }
    }
  }

  if (excludeType !== 'event') {
    for (const e of events) {
      if (e.status !== 'open') continue
      const s = score(e, tags.specialization, tags.industry)
      if (s > 0) {
        items.push({
          type: 'event',
          id: e.id,
          slug: e.slug,
          title: e.title,
          href: `/events/${e.slug}`,
          meta: 'Мероприятие',
          score: s,
        })
      }
    }
  }

  if (excludeType !== 'material') {
    for (const m of materials) {
      const s = score(m, tags.specialization, tags.industry)
      if (s > 0) {
        items.push({
          type: 'material',
          id: m.id,
          slug: m.slug,
          title: m.title,
          href: `/materials/${m.slug}`,
          meta: 'Материал',
          score: s,
        })
      }
    }
  }

  if (excludeType !== 'club') {
    for (const c of clubs) {
      const s = score(c, tags.specialization, tags.industry)
      if (s > 0) {
        items.push({
          type: 'club',
          id: c.id,
          slug: c.slug,
          title: c.name,
          href: `/community/clubs/${c.slug}`,
          meta: 'Клуб сообщества',
          score: s,
        })
      }
    }
  }

  return items
    .filter((i) => i.id !== excludeId)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Похожие объекты того же типа (например, «похожие вакансии») — отдельно от RelatedContent. */
export function getSimilar<T extends Tagged & { id: string }>(
  all: T[],
  current: T,
  limit = 3,
): T[] {
  return all
    .filter((x) => x.id !== current.id)
    .map((x) => ({ item: x, s: score(x, current.specialization, current.industry) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.item)
}
