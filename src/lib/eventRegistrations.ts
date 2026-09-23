// Регистрации участника на мероприятия — localStorage, как и остальные
// данные кабинета (резюме, отклики, избранное). Сеется одной демо-записью
// (см. прежний demoEventRegistrations в lib/account.ts), дальше ведет себя
// как обычное хранилище: регистрация с детальной страницы мероприятия
// добавляет сюда новую запись, и она сразу видна в разделе «Сообщество и
// мероприятия» личного кабинета.
import type { EventRegistration } from '../types'

export type StoredEventRegistration = EventRegistration & { eventTitle: string; registeredAt: string }

const KEY = 'ky_candidate_event_registrations'
const DEMO_USER_ID = 'u_demo'

function seed(): StoredEventRegistration[] {
  return [
    {
      id: 'reg1',
      eventId: 'ev1',
      userId: DEMO_USER_ID,
      status: 'registered',
      eventTitle: 'Как тело и взгляд создают уверенного спикера',
      registeredAt: '2026-08-20T10:00:00.000Z',
    },
  ]
}

export function getRegistrations(): StoredEventRegistration[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as StoredEventRegistration[]
    const seeded = seed()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return seed()
  }
}

function writeAll(all: StoredEventRegistration[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function isRegistered(eventId: string): boolean {
  return getRegistrations().some((r) => r.eventId === eventId)
}

export function registerForEvent(eventId: string, eventTitle: string): StoredEventRegistration {
  const existing = getRegistrations().find((r) => r.eventId === eventId)
  if (existing) return existing
  const registration: StoredEventRegistration = {
    id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    eventId,
    userId: DEMO_USER_ID,
    status: 'registered',
    eventTitle,
    registeredAt: new Date().toISOString(),
  }
  writeAll([registration, ...getRegistrations()])
  return registration
}
