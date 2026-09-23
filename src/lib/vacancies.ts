// Хранилище вакансий работодателя (конструктор) — как и резюме (lib/resumes.ts)
// и лиды (lib/leads.ts), в этом фронтенд-прототипе живет в localStorage,
// эмулируя таблицу на сервере.
import type { VacancyFormData, SavedVacancy, VacancyVisibilityStage } from '../types'
import { OWNER_ID } from './team'

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

const TECHNICAL_VACANCY_ID = 'vac_technical_example'

/** Технический пример опубликованной вакансии с откликами — работодатель
 *  видит на нем, как выглядит раздел «Отклики» в кабинете, не дожидаясь
 *  первого реального отклика (см. lib/applications.ts). Сеется один раз
 *  при первом обращении к хранилищу и дальше ведет себя как обычная
 *  запись (можно закрыть/удалить, как и любую вакансию работодателя). */
function technicalExampleVacancy(): SavedVacancy {
  return {
    id: TECHNICAL_VACANCY_ID,
    createdAt: '2026-05-10T09:00:00.000Z',
    technicalExample: true,
    responsibleId: OWNER_ID,
    data: {
      title: 'Юрист M&A, инхаус',
      company: '«Гарант-Право»',
      anonymous: false,
      city: 'Москва',
      format: 'hybrid',
      employment: 'full',
      schedule: '5/2',
      level: 'middle',
      experience: 'from1to3',
      education: ['bachelor'],
      specialization: ['inhouse'],
      industry: ['corporate'],
      salaryFrom: 150000,
      salaryTo: 220000,
      description: 'Сопровождение сделок M&A: due diligence, договорная работа, корпоративное управление.\nВзаимодействие с внешними консультантами и регуляторами.',
      requirements: 'Опыт в корпоративном праве от 1 года.\nАнглийский язык от Intermediate.',
      conditions: 'Оформление по ТК РФ.\nДМС после испытательного срока.',
      contactPhone: '+7 999 555-12-34',
      contactEmail: 'i.sokolova@garant-pravo.example',
    },
    moderationStatus: 'published',
    visibilityStage: 'public',
    publishedAt: '2026-05-12T09:00:00.000Z',
    mailings: [
      { stage: 'residents', sentAt: '2026-05-12T09:05:00.000Z', recipientsCount: stageAudienceSize.residents },
      { stage: 'talent_pool', sentAt: '2026-05-14T09:05:00.000Z', recipientsCount: stageAudienceSize.talent_pool },
    ],
  }
}

export function getVacancies(): SavedVacancy[] {
  try {
    const raw = localStorage.getItem(KEY)
    const all = raw ? (JSON.parse(raw) as SavedVacancy[]) : []
    if (!all.some((v) => v.technicalExample)) {
      const seeded = [...all, technicalExampleVacancy()]
      writeAll(seeded)
      return seeded
    }
    return all
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
    responsibleId: OWNER_ID,
  }
  const all = getVacancies()
  all.unshift(vacancy)
  writeAll(all)
  return vacancy
}

export function updateVacancyData(id: string, data: VacancyFormData): SavedVacancy | undefined {
  return updateOne(id, { data })
}

const emptyVacancyForm = (): VacancyFormData => ({
  title: 'Новая вакансия (черновик)',
  company: '',
  anonymous: false,
  city: '',
  format: 'office',
  employment: 'full',
  schedule: '5/2',
  level: 'middle',
  experience: 'from1to3',
  education: [],
  specialization: [],
  industry: [],
  salaryFrom: 0,
  salaryTo: 0,
  description: '',
  requirements: '',
  conditions: '',
  contactPhone: '',
  contactEmail: '',
})

/** Черновик — не уходит на модерацию сразу, дорабатывается в конструкторе
 *  (тот же экран «Изменить», что и у обычной вакансии) и отправляется
 *  вручную через submitDraftForModeration. */
export function createDraftVacancy(data?: VacancyFormData): SavedVacancy {
  const vacancy: SavedVacancy = {
    id: `vac_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    data: data ?? emptyVacancyForm(),
    moderationStatus: 'draft',
    visibilityStage: 'residents',
    mailings: [],
    responsibleId: OWNER_ID,
  }
  const all = getVacancies()
  all.unshift(vacancy)
  writeAll(all)
  return vacancy
}

export function submitDraftForModeration(id: string): SavedVacancy | undefined {
  return updateOne(id, { moderationStatus: 'pending_moderation' })
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

/** Кто в команде компании ведет эту вакансию (см. lib/team.ts). */
export function setVacancyResponsible(id: string, responsibleId: string): SavedVacancy | undefined {
  return updateOne(id, { responsibleId })
}

/** Режим уведомлений об откликах на конкретную вакансию (см. SavedVacancy.notifyMode). */
export function setVacancyNotifyMode(id: string, notifyMode: SavedVacancy['notifyMode']): SavedVacancy | undefined {
  return updateOne(id, { notifyMode })
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
