// LeadCapture — единый обработчик всех форм сайта (раздел 7 ТЗ).
// В проде пишет в таблицу Lead + создает/обновляет User, дублирует в Telegram-бот админу.
// В этом фронтенд-MVP — сохраняет в localStorage, эмулируя единую CRM-таблицу лидов,
// и триггерит analytics-событие (раздел 8: цели на каждую форму).
// Дублирование в Telegram — настоящее (не демо): каждая заявка летит на бэкенд
// (/api/notify), который шлет сообщение админу через Bot API. Бэкенд сам решает,
// настроен ли токен/chat_id — если нет, просто отвечает ok:false, страница это не блокирует.
import type { Lead, LeadSourceBlock } from '../types'

const LEADS_KEY = 'ky_leads'

// «Направление» в уведомлении админу — Кадры разделены на работодателя и
// соискателя по formType (см. KADRY_EMPLOYER_TYPES/KADRY_CANDIDATE_TYPES
// ниже), остальные разделы соответствуют sourceBlock один в один.
const sourceLabels: Record<LeadSourceBlock, string> = {
  kadry: 'Кадры',
  community: 'Сообщество',
  events: 'Мероприятия',
  home: 'Карьерный юрист',
  marketplace: 'Маркетплейс',
}

const KADRY_EMPLOYER_TYPES = new Set([
  'employer_request', 'service_order', 'candidates_selection_request',
  'candidate_contact_request', 'candidate_contact_purchase',
  'event_placement_purchase', 'vacancy_credits_purchase',
])
const KADRY_CANDIDATE_TYPES = new Set([
  'candidate_application', 'reserve_join_request', 'consultation_help_request',
  'consultation_order', 'resume_credits_purchase', 'vacancy_application',
  'salary_report_request',
])

// «Услуга» — человекочитаемая расшифровка formType для уведомления. Ключ,
// которого здесь нет, просто не покажет строку "Услуга" — форма всё равно
// уйдет по остальным полям, ничего не потеряется.
const SERVICE_LABELS: Record<string, string> = {
  employer_request: 'Рекрутинг — заявка на подбор',
  service_order: 'Рекрутинг — расчет и заказ услуги',
  candidates_selection_request: 'Рекрутинг — запрос контактов кандидатов из базы',
  candidate_contact_request: 'Рекрутинг — запрос контакта кандидата (кабинет)',
  candidate_contact_purchase: 'Рекрутинг — покупка контакта кандидата (кабинет)',
  event_placement_purchase: 'Размещение вакансии на мероприятии (кабинет)',
  vacancy_credits_purchase: 'Покупка пакета публикаций вакансий (кабинет)',
  consultation_help_request: 'Карьерная консультация — вопрос без выбора услуг',
  consultation_order: 'Карьерная консультация — заказ',
  candidate_application: 'Кадровый резерв — заявка кандидата',
  reserve_join_request: 'Кадровый резерв — вступление',
  vacancy_application: 'Отклик на вакансию',
  salary_report_request: 'Запрос отчета по зарплатам',
  resume_credits_purchase: 'Покупка генераций резюме (кабинет)',
  community_join: 'Вступление в сообщество',
  ambassador_application: 'Заявка амбассадора сообщества',
  event_registration: 'Покупка билета на мероприятие',
  event_partner_application: 'Партнерство (со страницы мероприятия)',
  event_submission: 'Мероприятия — подать свое мероприятие',
  event_order: 'Мероприятия — заказать мероприятие под ключ',
  partner_application: 'Мероприятия — стать партнером',
  support_request: 'Поддержка — вопрос',
  contact: 'Обращение через форму контактов',
  material_purchase: 'Покупка полезного материала',
}

function directionLabel(sourceBlock: LeadSourceBlock, formType: string): string {
  if (sourceBlock === 'kadry') {
    if (KADRY_EMPLOYER_TYPES.has(formType)) return 'Кадры — работодатель'
    if (KADRY_CANDIDATE_TYPES.has(formType)) return 'Кадры — соискатель'
  }
  return sourceLabels[sourceBlock] ?? sourceBlock
}

export interface LeadInput {
  sourceBlock: LeadSourceBlock
  formType: string
  name: string
  contact: string
  /** Телефон/почта/Telegram отдельными полями — попадают отдельными
   *  строками в уведомление админу (см. LeadInput в types.ts). */
  phone?: string
  email?: string
  telegram?: string
  interest?: string[]
  /** Slug вакансии — если задан, бэкенд считает это в реальный счетчик откликов вакансии. */
  vacancySlug?: string
  /** Slug мероприятия — если задан, бэкенд считает это в реальный счетчик переходов к регистрации. */
  eventSlug?: string
}

// Номер заявки — короткий, читаемый на слух номер для клиента (не техничный
// id лида выше), чтобы было что назвать в переписке/по телефону при вопросе
// в поддержку. Используется формами обратной связи (Контакты, Поддержка).
export function makeTicketNumber(): string {
  return String(100000 + (Date.now() % 900000))
}

export function submitLead(input: LeadInput): Lead {
  const lead: Lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sourceBlock: input.sourceBlock,
    formType: input.formType,
    name: input.name,
    contact: input.contact,
    phone: input.phone,
    email: input.email,
    telegram: input.telegram,
    interest: input.interest ?? [],
    status: 'new',
    date: new Date().toISOString(),
  }

  const all = getLeads()
  all.unshift(lead)
  localStorage.setItem(LEADS_KEY, JSON.stringify(all))

  trackEvent('lead_submit', { source: input.sourceBlock, form: input.formType })
  notifyTelegram(lead, input.vacancySlug, input.eventSlug)

  return lead
}

/** Уведомление админу в Telegram — не блокирует отправку формы при ошибке/недоступности бэкенда.
 *  vacancySlug/eventSlug (если есть) заодно учитываются бэкендом в реальном счетчике
 *  откликов вакансии / переходов к регистрации на мероприятие. */
function notifyTelegram(lead: Lead, vacancySlug?: string, eventSlug?: string) {
  if (typeof fetch === 'undefined') return
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: directionLabel(lead.sourceBlock, lead.formType),
      service: SERVICE_LABELS[lead.formType] ?? lead.formType,
      source: sourceLabels[lead.sourceBlock] ?? lead.sourceBlock,
      formType: lead.formType,
      name: lead.name,
      contact: lead.contact,
      phone: lead.phone,
      email: lead.email,
      telegram: lead.telegram,
      interest: lead.interest,
      date: lead.date,
      vacancySlug,
      eventSlug,
    }),
  }).catch(() => {
    // Бэкенд недоступен/не настроен — заявка все равно сохранена в localStorage, не мешаем пользователю.
  })
}

/** Отдельный, не завязанный на лид-форму счетчик перехода к регистрации —
 *  для клика по внешней ссылке организатора (TimePad и т.п.), где нет
 *  формы для submitLead. Тот же счетчик на бэкенде, что и у внутренней
 *  регистрации (см. /api/event/:slug/register). */
export function pingEventRegistrationClick(eventSlug: string) {
  if (typeof fetch === 'undefined') return
  fetch(`/api/event/${eventSlug}/register`, { method: 'POST' }).catch(() => {})
}

export function getLeads(): Lead[] {
  try {
    const raw = localStorage.getItem(LEADS_KEY)
    return raw ? (JSON.parse(raw) as Lead[]) : []
  } catch {
    return []
  }
}

/** Аналитика: цели на формы + отдельное событие related_content_click (раздел 8). */
export function trackEvent(name: string, payload: Record<string, unknown> = {}): void {
  // Заглушка интеграции с Яндекс.Метрикой/GA — в проде здесь вызов ym()/gtag().
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ky:analytics', { detail: { name, payload } }))
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', name, payload)
  }
}
