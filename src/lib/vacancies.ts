// Хранилище вакансий работодателя (конструктор) — как и резюме (lib/resumes.ts)
// и лиды (lib/leads.ts), в этом фронтенд-прототипе живет в localStorage,
// эмулируя таблицу на сервере.
import type { VacancyFormData, SavedVacancy, VacancyVisibilityStage } from '../types'

const KEY = 'ky_employer_vacancies'

const stageOrder: VacancyVisibilityStage[] = ['residents', 'talent_pool', 'public']

// Правдоподобный (не выдуманный на глаз) размер аудитории каждого этапа —
// ориентир из реальных цифр бизнеса: резиденты — активное сообщество,
// кадровый резерв — база 3200+ контактов (см. базу знаний работодателя).
const stageAudienceSize: Record<VacancyVisibilityStage, number> = {
  residents: 140,
  talent_pool: 3200,
  public: 0, // открытый сайт — не рассылка, а постоянная видимость в поиске
}

export function getVacancies(): SavedVacancy[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedVacancy[]) : []
  } catch {
    return []
  }
}

export function getVacancy(id: string): SavedVacancy | undefined {
  return getVacancies().find((v) => v.id === id)
}

function writeAll(all: SavedVacancy[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

function updateOne(id: string, patch: Partial<SavedVacancy>): SavedVacancy | undefined {
  const all = getVacancies()
  const idx = all.findIndex((v) => v.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], ...patch }
  writeAll(all)
  return all[idx]
}

/** Новая вакансия — сразу уходит "на модерацию" (см. EmployerAccount.tsx: демо-кнопки модератора вместо реального бэкенда). */
export function createVacancy(data: VacancyFormData): SavedVacancy {
  const vacancy: SavedVacancy = {
    id: `vac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    data,
    moderationStatus: 'pending_moderation',
    visibilityStage: 'residents',
    mailings: [],
  }
  const all = getVacancies()
  all.unshift(vacancy)
  writeAll(all)
  return vacancy
}

export function updateVacancyData(id: string, data: VacancyFormData): SavedVacancy | undefined {
  return updateOne(id, { data })
}

export function approveVacancy(id: string): SavedVacancy | undefined {
  return updateOne(id, { moderationStatus: 'published', publishedAt: new Date().toISOString() })
}

export function rejectVacancy(id: string, reason: string): SavedVacancy | undefined {
  return updateOne(id, { moderationStatus: 'rejected', rejectionReason: reason })
}

export function closeVacancy(id: string): SavedVacancy | undefined {
  return updateOne(id, { moderationStatus: 'closed', closedAt: new Date().toISOString() })
}

export function deleteVacancy(id: string) {
  writeAll(getVacancies().filter((v) => v.id !== id))
}

/** Рассылка по текущему этапу каскада видимости + переход к следующему (см. базу знаний — «Правила опубликования вакансии»). */
export function sendStageMailing(id: string): SavedVacancy | undefined {
  const vacancy = getVacancy(id)
  if (!vacancy) return undefined
  const stage = vacancy.visibilityStage
  const mailing = { stage, sentAt: new Date().toISOString(), recipientsCount: stageAudienceSize[stage] }
  const nextIdx = stageOrder.indexOf(stage) + 1
  const nextStage = stageOrder[nextIdx] ?? stage
  return updateOne(id, { mailings: [...vacancy.mailings, mailing], visibilityStage: nextStage })
}
