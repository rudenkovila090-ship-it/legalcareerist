import type { Vacancy } from '../types'

const money = new Intl.NumberFormat('ru-RU')

/** Зарплата для карточки и страницы вакансии: «от 100 000 ₽ до 150 000 ₽». Если работодатель её не указал — null, строку не показываем. */
export function salaryLabel(v: Pick<Vacancy, 'salaryFrom' | 'salaryTo'>): string | null {
  const parts = [v.salaryFrom ? `от ${money.format(v.salaryFrom)} ₽` : null, v.salaryTo ? `до ${money.format(v.salaryTo)} ₽` : null].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}
