import { api, downloadApiFile } from './cabinet'
import { patchMemo, recall, remember } from './cabinetMemo'
import { CONSENT_VERSION } from './consent'

// Вкладка «Построение карьеры» личного кабинета: карьерный план, подготовка к интервью, шаблоны, рекомендация, подкаст,
// портфолио (сервер: server/lib/careerCabinet.js, содержимое — server/content/career, docs/career-content.md).

export interface Option { id: string; label: string }
export interface StepLink { to: string; label: string }
export interface PlanStep { id: string; title: string; text?: string; group: string; link?: StepLink | null; custom?: boolean; done: boolean; doneAt: number | null }
export interface CareerPlan { from: string; to: string; area: string; term: string; goal: string; createdAt: number; updatedAt: number; steps: PlanStep[] }
export interface PlanInput { from: string; to: string; area: string; term: string; goal: string }

export interface Achievement { id: string; title: string; category: string; year: number | null; description: string; link: string; createdAt: number }
export interface AchievementInput { title: string; category: string; year: string; description: string; link: string }

export interface CapitalField { id: string; label: string; hint: string; type: 'text' | 'textarea' }
export interface CapitalSection { id: string; title: string; hint: string; fields: CapitalField[] }
export interface CapitalState { schema: { intro: string; sections: CapitalSection[] }; values: Record<string, string>; updatedAt: number | null }

export interface Mediakit { headline?: string; about?: string; topics?: string; showEmail?: boolean; showTelegram?: boolean; showPhone?: boolean; includeAchievements?: boolean; includeCapital?: boolean; updatedAt?: number }

export interface CareerState {
  meta: { stages: Option[]; areas: Option[]; terms: Option[]; groups: Option[] }
  categories: Record<string, string>
  contact: { name: string; email: string; phone: string; telegram: string }
  plan: CareerPlan | null
  achievements: Achievement[]
  capital: CapitalState
  mediakit: Mediakit
  interview: { total: number; done: number }
  templates: number
  podcast: { status: string; updatedAt: number } | null
  recommendations: { active: number; ready: number }
}

const KEY = 'career'
export const fetchCareer = () => remember(KEY, api<CareerState>('/api/account/career'))
export const peekCareer = () => recall<CareerState>(KEY)
/** Запомнить изменение состояния (после сохранения плана, достижений и т. п.). */
export const patchCareer = (patch: Partial<CareerState>) => patchMemo<CareerState>(KEY, patch)

// ---- Карьерный план ----
export const savePlan = (input: PlanInput) => api<{ plan: CareerPlan }>('/api/account/career/plan', { method: 'PUT', body: JSON.stringify(input) })
export const deletePlan = () => api<Record<string, never>>('/api/account/career/plan', { method: 'DELETE' })
export const setStepDone = (id: string, done: boolean) => api<{ plan: CareerPlan }>(`/api/account/career/plan/steps/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ done }) })
export const addOwnStep = (title: string) => api<{ plan: CareerPlan }>('/api/account/career/plan/steps', { method: 'POST', body: JSON.stringify({ title }) })
export const removeOwnStep = (id: string) => api<{ plan: CareerPlan }>(`/api/account/career/plan/steps/${encodeURIComponent(id)}`, { method: 'DELETE' })

// ---- Подготовка к интервью ----
export interface InterviewBlock { id: string; title: string; summary: string; icon: string; count: number; done: number }
export interface InterviewQuestion { id: string; q: string; a: string; done: boolean }
export interface InterviewBlockData { id: string; title: string; summary: string; lead: string; questions: InterviewQuestion[] }
export const fetchInterviewBlocks = () => remember('interview', api<{ blocks: InterviewBlock[] }>('/api/account/career/interview'))
export const peekInterviewBlocks = () => recall<{ blocks: InterviewBlock[] }>('interview')
export const fetchInterviewBlock = (id: string) => remember(`interview:${id}`, api<InterviewBlockData>(`/api/account/career/interview/${encodeURIComponent(id)}`))
export const peekInterviewBlock = (id: string) => recall<InterviewBlockData>(`interview:${id}`)
export const markQuestionDone = (id: string, done: boolean) => api<Record<string, never>>('/api/account/career/interview/done', { method: 'PUT', body: JSON.stringify({ id, done }) })

// ---- Шаблоны ----
export interface TemplateCategory { id: string; title: string; hint: string }
export interface TemplateItem { slug: string; category: string; title: string; summary: string; format: string }
export const fetchTemplates = () => remember('templates', api<{ categories: TemplateCategory[]; items: TemplateItem[] }>('/api/account/career/templates'))
export const peekTemplates = () => recall<{ categories: TemplateCategory[]; items: TemplateItem[] }>('templates')
export const downloadTemplate = (t: TemplateItem) => downloadApiFile(`/api/account/career/templates/${encodeURIComponent(t.slug)}/file`, `${t.slug}.${t.format || 'docx'}`)

// ---- Рекомендация ----
export type RecommendationStatus = 'new' | 'work' | 'ready' | 'declined'
export interface RecommendationRequest { id: string; number: number; target: string; company: string; link: string; deadline: string; focus: string; status: RecommendationStatus; statusLabel: string; result: string; createdAt: number; updatedAt: number; readyAt: number | null }
export const fetchRecommendations = () => remember('recommendations', api<{ items: RecommendationRequest[] }>('/api/account/career/recommendations'))
export const peekRecommendations = () => recall<{ items: RecommendationRequest[] }>('recommendations')
export const requestRecommendation = (f: { target: string; company: string; link: string; deadline: string; focus: string }, consent: { policy: boolean; processing: boolean }) =>
  api<{ item: RecommendationRequest }>('/api/account/career/recommendations', { method: 'POST', body: JSON.stringify({ ...f, consent, consentVersion: CONSENT_VERSION }) })
export const cancelRecommendationRequest = (id: string) => api<Record<string, never>>(`/api/account/career/recommendations/${id}`, { method: 'DELETE' })

// ---- Подкаст ----
export interface PodcastApplication { name: string; email: string; phone: string; telegram: string; about: string; topics: string; link: string; status: string; createdAt: number; updatedAt: number }
export interface PodcastInput { name: string; email: string; phone: string; telegram: string; about: string; topics: string; link: string }
export const fetchPodcast = () => remember('podcast', api<{ application: PodcastApplication | null; prefill: CareerState['contact'] }>('/api/account/career/podcast'))
export const peekPodcast = () => recall<{ application: PodcastApplication | null; prefill: CareerState['contact'] }>('podcast')
export const savePodcast = (f: PodcastInput, consent?: { policy: boolean; processing: boolean }) =>
  api<{ application: PodcastApplication }>('/api/account/career/podcast', { method: 'PUT', body: JSON.stringify({ ...f, ...(consent ? { consent, consentVersion: CONSENT_VERSION } : {}) }) })
export const withdrawPodcast = () => api<Record<string, never>>('/api/account/career/podcast', { method: 'DELETE' })

// ---- Портфолио ----
export const addAchievement = (f: AchievementInput) => api<{ item: Achievement }>('/api/account/career/achievements', { method: 'POST', body: JSON.stringify(f) })
export const updateAchievement = (id: string, f: AchievementInput) => api<{ item: Achievement }>(`/api/account/career/achievements/${id}`, { method: 'PUT', body: JSON.stringify(f) })
export const deleteAchievement = (id: string) => api<Record<string, never>>(`/api/account/career/achievements/${id}`, { method: 'DELETE' })
export const saveCapital = (values: Record<string, string>) => api<{ capital: CapitalState }>('/api/account/career/capital', { method: 'PUT', body: JSON.stringify({ values }) })
export const saveMediakit = (m: Mediakit) => api<{ mediakit: Mediakit }>('/api/account/career/mediakit', { method: 'PUT', body: JSON.stringify(m) })
