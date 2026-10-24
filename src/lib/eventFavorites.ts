// Избранные мероприятия участника — тот же принцип, что и lib/favorites.ts
// (избранные вакансии): localStorage, хранит id мероприятий из data/events.ts.
const KEY = 'ky_candidate_favorite_events'

export function getFavoriteEventIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function isFavoriteEvent(eventId: string): boolean {
  return getFavoriteEventIds().includes(eventId)
}

export function toggleFavoriteEvent(eventId: string): string[] {
  const all = getFavoriteEventIds()
  const next = all.includes(eventId) ? all.filter((id) => id !== eventId) : [...all, eventId]
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
