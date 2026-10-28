import { api, type ApiResult } from './cabinet'
import { recall, remember } from './cabinetMemo'
import { CONSENT_VERSION } from './consent'

// Вкладка «Вакансии» личного кабинета: отклики, чат с рекрутером по вакансии, уведомления, кадровый резерв
// (сервер: server/lib/vacanciesCabinet.js, docs/cabinet-todo.md).

export type ApplicationStatus = 'sent' | 'forwarded' | 'interview' | 'offer' | 'rejected' | 'withdrawn'

/** Шаги пути отклика по порядку; отказ и отзыв — концы пути вне цепочки. */
export const APPLICATION_STEPS: { id: ApplicationStatus; label: string }[] = [
  { id: 'sent', label: 'Отправлен' },
  { id: 'forwarded', label: 'Передан работодателю' },
  { id: 'interview', label: 'Собеседование' },
  { id: 'offer', label: 'Оффер' },
]

export interface CabinetApplication {
  number: number
  vacancySlug: string
  vacancyTitle: string
  createdAt: number
  status: ApplicationStatus
  statusLabel: string
  statusAt: number
  history: { status: ApplicationStatus; label: string; at: number }[]
  vacancyOpen: boolean
}

export interface ChatMessage { id: string; from: 'user' | 'recruiter'; text: string; at: number }
export interface ChatThreadSummary { slug: string; title: string; last: ChatMessage | null; count: number; unread: number }
export interface ChatVacancy { slug: string; title: string; company: string }
export interface ChatThread { slug: string; title: string; company: string; open: boolean; messages: ChatMessage[]; unread: number; maxLength: number }

export interface CabinetNotification { id: string; kind: 'chat_reply' | 'application_status' | 'support_reply' | 'reserve' | 'career'; title: string; text: string; link: string; at: number; readAt: number | null }

export interface ReserveInfo { number: number; name: string; city: string; university: string; position: string; joinedAt: number; renewedAt: number | null; until: number; fromSite: boolean }
export interface ReserveState { reserve: ReserveInfo | null; prefill: { name: string; city: string; position: string }; hasContact: boolean }

export { forgetCabinetData } from './cabinetMemo'

type ApplicationsData = { applications: CabinetApplication[] }
type ChatsData = { threads: ChatThreadSummary[]; vacancies: ChatVacancy[]; maxLength: number }
type NotificationsData = { items: CabinetNotification[]; unread: number; settings: { telegram: boolean }; telegramLinked: boolean }
export const peekApplications = () => recall<ApplicationsData>('applications')
export const peekChats = () => recall<ChatsData>('chats')
export const peekNotifications = () => recall<NotificationsData>('notifications')
export const peekReserve = () => recall<ReserveState>('reserve')

export const fetchApplications = () => remember('applications', api<ApplicationsData>('/api/account/applications'))
export const withdrawApplication = (number: number, reason: string) => api<Record<string, never>>(`/api/account/applications/${number}/withdraw`, { method: 'POST', body: JSON.stringify({ reason }) })

export const fetchChats = () => remember('chats', api<ChatsData>('/api/account/recruiter'))
/** Открытие переписки отмечает ответы рекрутера прочитанными. */
export const fetchChat = (slug: string) => api<ChatThread>(`/api/account/recruiter/${encodeURIComponent(slug)}`)
export const sendChatMessage = (slug: string, text: string) => api<{ message: ChatMessage; notified: boolean }>(`/api/account/recruiter/${encodeURIComponent(slug)}`, { method: 'POST', body: JSON.stringify({ text }) })

export const fetchNotifications = () => remember('notifications', api<NotificationsData>('/api/account/notifications'))
export const markNotificationsRead = (ids?: string[]) => api<{ unread: number }>('/api/account/notifications/read', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) })
export const setNotificationTelegram = (telegram: boolean) => api<{ settings: { telegram: boolean } }>('/api/account/notifications/settings', { method: 'PUT', body: JSON.stringify({ telegram }) })

export const fetchReserve = () => remember('reserve', api<ReserveState>('/api/account/reserve'))
export const joinReserve = (fields: { position: string; city: string; university: string }, consent?: { policy: boolean; processing: boolean }) =>
  api<ReserveState>('/api/account/reserve', { method: 'POST', body: JSON.stringify({ ...fields, ...(consent ? { consent, consentVersion: CONSENT_VERSION } : {}) }) })
export const renewReserve = () => api<ReserveState>('/api/account/reserve/renew', { method: 'POST', body: JSON.stringify({ consent: { policy: true, processing: true }, consentVersion: CONSENT_VERSION }) })
export const leaveReserve = () => api<ReserveState>('/api/account/reserve', { method: 'DELETE' })

export type { ApiResult }
