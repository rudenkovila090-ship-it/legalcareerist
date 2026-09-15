// Шаблоны вакансий — сохраненные заготовки формы конструктора, чтобы не
// заполнять одни и те же поля заново для похожих позиций (см. «Сохранить
// как шаблон» / «Создать из шаблона» в кабинете работодателя).
import type { VacancyFormData } from '../types'

export interface VacancyTemplate {
  id: string
  name: string
  data: VacancyFormData
  savedAt: string
}

const KEY = 'ky_employer_vacancy_templates'

export function getTemplates(): VacancyTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as VacancyTemplate[]) : []
  } catch {
    return []
  }
}

function writeAll(all: VacancyTemplate[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function saveTemplate(name: string, data: VacancyFormData): VacancyTemplate {
  const template: VacancyTemplate = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    data,
    savedAt: new Date().toISOString(),
  }
  writeAll([template, ...getTemplates()])
  return template
}

export function deleteTemplate(id: string) {
  writeAll(getTemplates().filter((t) => t.id !== id))
}
