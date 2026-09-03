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
  { id: 'full', label: 'Полная занятость' },
  { id: 'part', label: 'Частичная занятость' },
  { id: 'project', label: 'Проектная занятость' },
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

export type WorkSchedule = '5/2' | 'flexible' | 'other'
export const WORK_SCHEDULES: { id: WorkSchedule; label: string }[] = [
  { id: '5/2', label: '5/2' },
  { id: 'flexible', label: 'Свободный' },
  { id: 'other', label: 'Другое' },
]

export type ExperienceBucket = 'none' | 'from1' | 'from1to3' | 'from3to5' | 'from5to9' | 'from9'
export const EXPERIENCE_BUCKETS: { id: ExperienceBucket; label: string }[] = [
  { id: 'none', label: 'Без опыта' },
  { id: 'from1', label: 'От 1 года' },
  { id: 'from1to3', label: 'От 1 до 3 лет' },
  { id: 'from3to5', label: 'От 3 до 5 лет' },
  { id: 'from5to9', label: 'От 5 до 9 лет' },
  { id: 'from9', label: 'Более 9 лет' },
]

export type EducationLevel = 'college' | 'bachelor' | 'master' | 'specialist'
export const EDUCATION_LEVELS: { id: EducationLevel; label: string }[] = [
  { id: 'college', label: 'Среднее специальное' },
  { id: 'bachelor', label: 'Бакалавриат' },
  { id: 'master', label: 'Магистратура' },
  { id: 'specialist', label: 'Специалитет' },
]

// Отрасль компании — категории с подкатегориями (справочник для фильтра
// вакансий), выбор множественный: категория и/или отдельные подкатегории.
export const COMPANY_INDUSTRY_TREE: { category: string; items: string[] }[] = [
  { category: 'Адвокатура', items: ['Адвокатский кабинет', 'Адвокатская консультация', 'Коллегия адвокатов', 'Адвокатское бюро'] },
  { category: 'Консалтинг', items: ['Частный юрист', 'Юридическая фирма', 'Юридический бутик'] },
  { category: 'Правоохранительные органы', items: ['МВД', 'Следственный комитет', 'ФССП', 'Прокуратура'] },
  { category: 'Суд', items: [
    'Конституционный Суд РФ', 'Верховный Суд РФ', 'Кассационный суд общей юрисдикции',
    'Апелляционный суд общей юрисдикции', 'Верховный суд республики', 'Краевой суд', 'Областной суд',
    'Суд города федерального значения', 'Суд автономной области', 'Суд автономного округа',
    'Районный суд', 'Городской суд', 'Межрайонный суд', 'Военный суд',
    'Окружной (флотский) военный суд', 'Гарнизонный военный суд', 'Арбитражный суд округа',
    'Арбитражный апелляционный суд', 'Арбитражный суд субъекта РФ', 'Суд по интеллектуальным правам',
    'Мировой судья',
  ] },
  { category: 'Государственная служба', items: ['Министерство юстиции', 'ФНС', 'РКН', 'ФАС', 'Росреестр'] },
]

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
  schedule: WorkSchedule
  experience: ExperienceBucket
  education: EducationLevel[]
  companyIndustry: string[]
  description: string
  requirements: string[]
  conditions: string[]
  status: VacancyStatus
  visibilityStage: VacancyVisibilityStage
  publishedAt: string
  urgent: boolean
  employerId: string
  /** Короткая метка над названием компании — например, статус/направление практики (см. страницу вакансии). */
  companyTagline?: string
  /** «Почему вакансия интересна» — карточки на странице вакансии. */
  highlights?: { title: string; description: string }[]
  /** «Что предстоит делать» — если задано, requirements выводится рядом как «Кого мы ищем». */
  responsibilities?: string[]
  /** Направления деятельности компании — теги под условиями. */
  practiceAreas?: string[]
  contactPhone?: string
  contactEmail?: string
  companyWebsite?: string
  companyAddress?: string
  /** Координаты офиса для карты на странице вакансии (Яндекс.Карты). */
  officeCoords?: { lat: number; lng: number }
  /** «О компании» — короткий блок на странице вакансии (на месте, где раньше была зарплата). */
  aboutCompany?: string
  /** Помечает вакансию как технический пример структуры страницы — не реальное предложение о работе. */
  technicalExample?: boolean
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

export type MaterialKind = 'guide' | 'checklist' | 'recording' | 'longlist' | 'article' | 'webinar' | 'presentation'

// Направление — отдельный справочник для фильтра маркетплейса, по темам
// материалов (шире, чем специализация кандидата/вакансии).
export type MarketplaceDirection = 'notary' | 'career' | 'personal_brand' | 'advocacy' | 'inhouse' | 'consulting' | 'events' | 'finance'
export const MARKETPLACE_DIRECTIONS: { id: MarketplaceDirection; label: string }[] = [
  { id: 'notary', label: 'Нотариат' },
  { id: 'career', label: 'Карьера юриста' },
  { id: 'personal_brand', label: 'Личный бренд' },
  { id: 'advocacy', label: 'Адвокатура' },
  { id: 'inhouse', label: 'In-house' },
  { id: 'consulting', label: 'Консалтинг' },
  { id: 'events', label: 'Мероприятия' },
  { id: 'finance', label: 'Финансы' },
]

export interface MaterialItem extends Tagged {
  id: string
  slug: string
  title: string
  kind: MaterialKind
  direction: MarketplaceDirection[]
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
  /** Настоящая оплата через Prodamus вместо демо-гейта (см. server/lib/prodamus.js MATERIALS). */
  realPurchase?: boolean
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
