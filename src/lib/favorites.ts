// Избранные вакансии соискателя — localStorage, как и остальные данные
// кабинета (резюме, отклики). Хранит id вакансий из общего каталога
// (data/vacancies.ts).
const KEY = 'ky_candidate_favorite_vacancies'

export function getFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function isFavorite(vacancyId: string): boolean {
  return getFavoriteIds().includes(vacancyId)
}

export function toggleFavorite(vacancyId: string): string[] {
  const all = getFavoriteIds()
  const next = all.includes(vacancyId) ? all.filter((id) => id !== vacancyId) : [...all, vacancyId]
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
