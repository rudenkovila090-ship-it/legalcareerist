import { useEffect, useState } from 'react'

/**
 * Реальные просмотры всех вакансий для карточек в списке: { адрес вакансии: число }. Только чтение — счётчик не увеличивается
 * (+1 даёт открытие страницы вакансии, см. VacancyDetailBody). Пока ответа нет, возвращает null: число не показываем,
 * чтобы не мигало «0». Меняйте refreshKey, чтобы перечитать (например, когда человек вернулся из вакансии в список).
 */
export function useVacancyViewCounts(refreshKey: unknown = null): Record<string, number> | null {
  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/vacancies/views')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') setCounts(data as Record<string, number>)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return counts
}
