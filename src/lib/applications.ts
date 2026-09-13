// Отклики соискателей на вакансии работодателя — как и вакансии/резюме,
// в этом фронтенд-прототипе живут в localStorage, эмулируя таблицу на
// сервере. Демо-отклики на технический пример вакансии (см. vacancies.ts)
// сеются один раз, чтобы работодатель сразу видел, как выглядит раздел
// «Отклики», не дожидаясь первого реального отклика.
import type { EmployerVacancyResponse } from '../types'

const KEY = 'ky_employer_vacancy_responses'
const TECHNICAL_VACANCY_ID = 'vac_technical_example'

function seedResponses(): EmployerVacancyResponse[] {
  return [
    {
      id: 'resp1',
      vacancyId: TECHNICAL_VACANCY_ID,
      name: 'Мария Кузнецова',
      city: 'Москва',
      level: 'middle',
      experienceYears: 2,
      specialization: ['inhouse', 'consulting'],
      industry: ['corporate', 'tax'],
      coverLetter: 'Веду сопровождение сделок M&A и due diligence последние два года, интересна именно инхаус-позиция с ростом до старшего юриста.',
      appliedAt: '2026-08-16T10:20:00.000Z',
      status: 'in_review',
      contactRevealed: false,
      phone: '+7 999 123-45-67',
      email: 'maria.kuznetsova@example.com',
      skillScore: 83,
      softSkillScore: 76,
    },
    {
      id: 'resp2',
      vacancyId: TECHNICAL_VACANCY_ID,
      name: 'Дмитрий Волков',
      city: 'Москва',
      level: 'junior',
      experienceYears: 0,
      specialization: ['consulting'],
      industry: ['corporate'],
      coverLetter: 'Студент 4 курса, стажировался в юридической фирме на договорном направлении — хочу развиваться именно в корпоративном праве.',
      appliedAt: '2026-08-17T14:05:00.000Z',
      status: 'new',
      contactRevealed: false,
      phone: '+7 999 222-33-44',
      email: 'd.volkov@example.com',
    },
    {
      id: 'resp3',
      vacancyId: TECHNICAL_VACANCY_ID,
      name: 'Анна Светлова',
      city: 'Санкт-Петербург',
      level: 'middle',
      experienceYears: 3,
      specialization: ['inhouse'],
      industry: ['corporate', 'disputes'],
      coverLetter: 'Три года в инхаус-команде производственной компании, готова к переезду в Москву.',
      appliedAt: '2026-08-14T09:40:00.000Z',
      status: 'offer',
      contactRevealed: true,
      phone: '+7 999 777-88-99',
      email: 'a.svetlova@example.com',
      skillScore: 100,
      softSkillScore: 88,
    },
    {
      id: 'resp4',
      vacancyId: TECHNICAL_VACANCY_ID,
      name: 'Игорь Панов',
      city: 'Москва',
      level: 'junior',
      experienceYears: 1,
      specialization: ['consulting'],
      industry: ['corporate'],
      coverLetter: 'Год в юридической фирме на позиции помощника юриста, ищу переход в инхаус.',
      appliedAt: '2026-08-18T11:15:00.000Z',
      status: 'rejected',
      contactRevealed: false,
      phone: '+7 999 444-55-66',
      email: 'i.panov@example.com',
    },
  ]
}

export function getResponses(): EmployerVacancyResponse[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as EmployerVacancyResponse[]
    const seeded = seedResponses()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

export function getResponsesForVacancy(vacancyId: string): EmployerVacancyResponse[] {
  return getResponses().filter((r) => r.vacancyId === vacancyId)
}

function writeAll(all: EmployerVacancyResponse[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function setResponseStatus(id: string, status: EmployerVacancyResponse['status']): EmployerVacancyResponse | undefined {
  const all = getResponses()
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], status }
  writeAll(all)
  return all[idx]
}

/** Демо-открытие контактов (как и покупка генераций — без реальной оплаты,
 *  заявка фиксируется лидом, см. EmployerAccount.tsx). */
export function revealContact(id: string): EmployerVacancyResponse | undefined {
  const all = getResponses()
  const idx = all.findIndex((r) => r.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], contactRevealed: true }
  writeAll(all)
  return all[idx]
}

/** Стоимость открытия контакта растет с опытом кандидата (см. FAQ раздела
 *  «Кадры»: от 1000 ₽ без опыта до 2500 ₽ от 3 лет). */
export function contactPrice(experienceYears: number): number {
  if (experienceYears <= 0) return 1000
  if (experienceYears < 3) return 1750
  return 2500
}
