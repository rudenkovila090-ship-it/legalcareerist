// Команда компании работодателя — несколько сотрудников на один аккаунт,
// каждая вакансия может быть закреплена за конкретным человеком (см.
// responsibleId в SavedVacancy). Как и остальные данные кабинета, в этом
// фронтенд-прототипе живет в localStorage, эмулируя таблицу на сервере —
// это не отдельные логины, а общий список внутри одного демо-аккаунта.
import type { TeamMember } from '../types'

const KEY = 'ky_employer_team'

// Владелец аккаунта — фиксированный id, чтобы на него можно было ссылаться
// из демо-вакансии (см. TECHNICAL_VACANCY_ID в lib/vacancies.ts) без
// обращения к lib/account.ts (нет кругового импорта).
export const OWNER_ID = 'tm_owner'

function seedTeam(): TeamMember[] {
  return [
    { id: OWNER_ID, name: 'Ирина Соколова', position: 'HR-директор', email: 'i.sokolova@garant-pravo.example', role: 'owner' },
    { id: 'tm_recruiter1', name: 'Павел Игнатов', position: 'Рекрутер', email: 'p.ignatov@garant-pravo.example', role: 'recruiter' },
  ]
}

export function getTeamMembers(): TeamMember[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as TeamMember[]
    const seeded = seedTeam()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

function writeAll(all: TeamMember[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function addTeamMember(data: Omit<TeamMember, 'id' | 'role'>): TeamMember {
  const member: TeamMember = { ...data, id: `tm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, role: 'recruiter' }
  const all = [...getTeamMembers(), member]
  writeAll(all)
  return member
}

export function removeTeamMember(id: string) {
  if (id === OWNER_ID) return // владельца аккаунта нельзя удалить из демо-команды
  writeAll(getTeamMembers().filter((m) => m.id !== id))
}
