// Мероприятия организатора — личный кабинет (минимальная версия, как и
// требовалось в ТЗ раздела «Мероприятия»): добавление/редактирование своих
// мероприятий с демо-модерацией. Хранилище — localStorage, по той же схеме,
// что и lib/vacancies.ts (черновик → на модерации → опубликовано/отклонено
// → закрыто). Как и вакансии на витрине, эти мероприятия НЕ подмешиваются
// в публичную афишу (data/events.ts) — это отдельный демо-контур кабинета,
// сеется техническими примерами из каталога, чтобы раздел не был пустым.
import type { EventFormat, EventType } from '../types'
import { events as catalogEvents } from '../data/events'

export type OrganizerEventStatus = 'draft' | 'pending_moderation' | 'published' | 'rejected' | 'closed'

export interface OrganizerEventData {
  title: string
  type: EventType
  format: EventFormat
  city: string
  dateTime: string
  price: number
  description: string
  registrationLink: string
  socialLinks: string
}

export interface OrganizerEvent {
  id: string
  createdAt: string
  data: OrganizerEventData
  status: OrganizerEventStatus
  rejectionReason?: string
  /** slug в публичном каталоге — только у технических примеров, посеянных
   *  из data/events.ts. У собственных мероприятий организатора нет
   *  публичной страницы в этом прототипе, поэтому и нет slug. */
  catalogSlug?: string
}

const KEY = 'ky_organizer_events'

function emptyEventData(): OrganizerEventData {
  return {
    title: 'Новое мероприятие (черновик)',
    type: 'webinar',
    format: 'online',
    city: '',
    dateTime: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16),
    price: 0,
    description: '',
    registrationLink: '',
    socialLinks: '',
  }
}

function seed(): OrganizerEvent[] {
  return catalogEvents.map((e) => ({
    id: e.id,
    createdAt: e.dateTime,
    catalogSlug: e.slug,
    status: 'published' as const,
    data: {
      title: e.title,
      type: e.type,
      format: e.format,
      city: e.city ?? '',
      dateTime: e.dateTime,
      price: e.price,
      description: e.description,
      registrationLink: '',
      socialLinks: '',
    },
  }))
}

export function getOrganizerEvents(): OrganizerEvent[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as OrganizerEvent[]
    const seeded = seed()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return seed()
  }
}

function writeAll(all: OrganizerEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

function updateOne(id: string, patch: Partial<OrganizerEvent>): OrganizerEvent | undefined {
  const all = getOrganizerEvents()
  const idx = all.findIndex((e) => e.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], ...patch }
  writeAll(all)
  return all[idx]
}

export function createDraftOrganizerEvent(): OrganizerEvent {
  const event: OrganizerEvent = {
    id: `oev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: 'draft',
    data: emptyEventData(),
  }
  const all = getOrganizerEvents()
  all.unshift(event)
  writeAll(all)
  return event
}

export function updateOrganizerEventData(id: string, data: OrganizerEventData): OrganizerEvent | undefined {
  return updateOne(id, { data })
}

export function submitOrganizerEventForModeration(id: string): OrganizerEvent | undefined {
  return updateOne(id, { status: 'pending_moderation' })
}

export function approveOrganizerEvent(id: string): OrganizerEvent | undefined {
  return updateOne(id, { status: 'published' })
}

export function rejectOrganizerEvent(id: string, reason: string): OrganizerEvent | undefined {
  return updateOne(id, { status: 'rejected', rejectionReason: reason })
}

export function closeOrganizerEvent(id: string): OrganizerEvent | undefined {
  return updateOne(id, { status: 'closed' })
}

export function deleteOrganizerEvent(id: string) {
  writeAll(getOrganizerEvents().filter((e) => e.id !== id))
}
