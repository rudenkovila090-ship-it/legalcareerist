// Единая таксономия и модель данных — раздел 3–4 ТЗ.
// Ось 1: специализация — обязательна на вакансиях, статьях, мероприятиях, клубах.
export type Specialization =
  | 'advocacy'
  | 'consulting'
  | 'inhouse'
  | 'law_enforcement'
  | 'government'
  | 'fns'
  | 'fas'
  | 'fssp'
  | 'notary'
  | 'prosecution'
  | 'private_practice'

export const SPECIALIZATIONS: { id: Specialization; label: string }[] = [
  { id: 'advocacy', label: 'Адвокатура' },
  { id: 'consulting', label: 'Консалтинг' },
  { id: 'inhouse', label: 'Инхаус' },
  { id: 'law_enforcement', label: 'Правоохранительные органы' },
  { id: 'government', label: 'Государственная служба' },
  { id: 'fns', label: 'ФНС' },
  { id: 'fas', label: 'ФАС' },
  { id: 'fssp', label: 'ФССП' },
  { id: 'notary', label: 'Нотариат' },
  { id: 'prosecution', label: 'Прокуратура' },
  { id: 'private_practice', label: 'Частный юрист' },
]

export type EmploymentType = 'full' | 'part' | 'project'
export const EMPLOYMENT_TYPES: { id: EmploymentType; label: string }[] = [
  { id: 'full', label: 'Полная' },
  { id: 'part', label: 'Частичная' },
  { id: 'project', label: 'Проектная' },
]

// Ось 2: отрасль/область права — множественный выбор, редактируется через админку.
export type Industry =
  | 'labor'
  | 'corporate'
  | 'tax'
  | 'bankruptcy'
  | 'disputes'
  | 'ip_it'
  | 'compliance'
  | 'gr'
  | 'realestate'

export const INDUSTRIES: { id: Industry; label: string }[] = [
  { id: 'labor', label: 'Трудовое право' },
  { id: 'corporate', label: 'Корпоративное право / M&A' },
  { id: 'tax', label: 'Налоги' },
  { id: 'bankruptcy', label: 'Банкротство' },
  { id: 'disputes', label: 'Разрешение споров' },
  { id: 'ip_it', label: 'IP / IT-право' },
  { id: 'compliance', label: 'Комплаенс' },
  { id: 'gr', label: 'GR' },
  { id: 'realestate', label: 'Недвижимость' },
]

// Ось 3: аудитория контента Базы знаний.
export type Audience = 'candidates' | 'employers' | 'community' | 'events'

export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'candidates', label: 'Соискателям' },
  { id: 'employers', label: 'Работодателям' },
  { id: 'community', label: 'Сообществу' },
  { id: 'events', label: 'Участникам мероприятий' },
]

export type ArticleKind = 'article' | 'faq' | 'glossary' | 'checklist'

export interface Tagged {
  specialization: Specialization[]
  industry: Industry[]
}

// ---- Основные сущности (раздел 4) ----

export type UserRole = 'candidate' | 'employer' | 'community_member' | 'admin'

export interface User {
  id: string
  roles: UserRole[]
  name: string
  email: string
  phone?: string
  telegramId?: string
  specialization: Specialization[]
  industry: Industry[]
  newsletterOptIn: boolean
  registeredAt: string
}

export type CandidateVisibility = 'open' | 'anonymous'
export type CandidateLevel = 'junior' | 'middle' | 'senior'
export type WorkFormat = 'office' | 'remote' | 'hybrid'
export type CandidateStatus = 'looking' | 'considering' | 'not_looking'

export interface CandidateProfile extends Tagged {
  userId: string
  resumeFileUrl?: string
  anonymousSummary: string
  experienceYears: number
  city: string
  format: WorkFormat[]
  level: CandidateLevel
  salaryExpectation: number
  status: CandidateStatus
  visibility: CandidateVisibility
}

export interface EmployerProfile {
  userId: string
  company: string
  inn?: string
  contactPerson: string
  vacancyIds: string[]
}

export type VacancyStatus = 'open' | 'closed'

// Каскад видимости вакансии (уточнено заказчиком): сначала предлагается
// резидентам платного Сообщества → если отклика нет, направляется в
// кадровый резерв (база 3200+ контактов) → и только если кандидат не
// найден ни там, ни там, вакансия публикуется в открытом доступе на сайте.
export type VacancyVisibilityStage = 'residents' | 'talent_pool' | 'public'

export interface Vacancy extends Tagged {
  id: string
  slug: string
  title: string
  company: string
  anonymous: boolean
  city: string
  format: WorkFormat
  employment: EmploymentType
  level: CandidateLevel
  salaryFrom?: number
  salaryTo?: number
  description: string
  requirements: string[]
  conditions: string[]
  status: VacancyStatus
  visibilityStage: VacancyVisibilityStage
  publishedAt: string
  urgent: boolean
  employerId: string
}

export type ApplicationStatus = 'new' | 'in_review' | 'rejected' | 'offer'

export interface Application {
  id: string
  vacancyId: string
  candidateId: string
  date: string
  status: ApplicationStatus
  coverLetter?: string
}

export interface Article extends Tagged {
  id: string
  slug: string
  title: string
  audience: Audience[]
  kind: ArticleKind
  excerpt: string
  body: string
  author: string
  date: string
  tags: string[]
}

export type EventType = 'conference' | 'webinar' | 'breakfast' | 'intensive' | 'tour'
export type EventFormat = 'online' | 'offline'
export type EventStatus = 'open' | 'completed'

export interface EventItem extends Tagged {
  id: string
  slug: string
  title: string
  type: EventType
  format: EventFormat
  dateTime: string
  city?: string
  price: number
  promoCode?: string
  status: EventStatus
  speakers: string[]
  program: string[]
  location: string
  description: string
  /** Организовано партнером — показывается отдельной строкой на афише мероприятий. */
  partner?: string
  /** Обложка афиши — если нет, используется цветовая заглушка по типу мероприятия. */
  cover?: string
  /** Для прошедших мероприятий — что можно купить: запись, материалы, или оба. */
  sale?: { recording?: number; materials?: number; bundle?: number }
}

export type RegistrationStatus = 'registered' | 'paid' | 'attended'

export interface EventRegistration {
  id: string
  eventId: string
  userId: string
  status: RegistrationStatus
  paymentMethod?: string
  receiptUrl?: string
}

export type MaterialKind = 'guide' | 'checklist' | 'recording' | 'longlist' | 'article' | 'webinar'

export interface MaterialItem extends Tagged {
  id: string
  slug: string
  title: string
  kind: MaterialKind
  price: number
  description: string
  forWhom: string
  /** Метрики маркетплейса — сколько купили, рейтинг, отзывы, ответы на вопросы. */
  purchases?: number
  rating?: number
  reviewsCount?: number
  qnaCount?: number
  /** Для вебинаров: часть доступна бесплатно для просмотра, часть — в продаже (запись/материалы/оба). */
  freePreview?: boolean
  sale?: { recording?: number; materials?: number; bundle?: number }
}

export interface MaterialPurchase {
  id: string
  materialId: string
  userId: string
  date: string
  paid: boolean
  accessUrl: string
}

export interface CommunityClub extends Tagged {
  id: string
  slug: string
  name: string
  description: string
  telegramLink: string
  coordinator: string
}

export type MembershipTier = 'free' | 'paid'

export interface CommunityMembership {
  id: string
  userId: string
  tier: MembershipTier
  joinedAt: string
  active: boolean
}

export type ConsultationType = 'free' | 'paid'

export interface Consultation {
  id: string
  userId: string
  type: ConsultationType
  requestedAt: string
  status: 'new' | 'scheduled' | 'done'
  consultant?: string
}

export type LeadSourceBlock = 'kadry' | 'community' | 'events' | 'home'

// LeadCapture — единая точка входа для всех форм сайта (раздел 7).
export interface Lead {
  id: string
  sourceBlock: LeadSourceBlock
  formType: string
  name: string
  contact: string
  interest: string[]
  utm?: Record<string, string>
  status: 'new' | 'processing' | 'done'
  date: string
}

export interface Testimonial {
  id: string
  from: 'candidate' | 'employer'
  text: string
  companyOrRole: string
  date: string
  published: boolean
}
