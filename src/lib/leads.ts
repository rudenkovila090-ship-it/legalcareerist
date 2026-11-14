// Published forms are acknowledged only after a durable server receipt.
// Browser storage is a convenience copy; prototype account forms stay local drafts.
import type { FormEvent } from 'react'
import type { Lead, LeadSourceBlock } from '../types'
import { getUtm } from './utm'
import { CONSENT_VERSION, MARKETING_CONSENT_VERSION, type ConsentChoice } from './consent'
import { goal } from './metrika'

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
  material_free: 'Получение бесплатного материала',
}

function directionLabel(sourceBlock: LeadSourceBlock, formType: string): string {
  if (sourceBlock === 'kadry') {
    if (KADRY_EMPLOYER_TYPES.has(formType)) return 'Кадры — работодатель'
    if (KADRY_CANDIDATE_TYPES.has(formType)) return 'Кадры — соискатель'
  }
  return sourceLabels[sourceBlock] ?? sourceBlock
}

// Расширенный формат уведомления (с иконками по полям) — только для заявок
// на рекрутинг (работодатель ищет сотрудника) и карьерную консультацию
// (соискатель). Остальные формы используют обычный текстовый формат выше.
const RICH_EMPLOYER_TYPES = new Set(['employer_request', 'service_order', 'candidates_selection_request'])
const RICH_CANDIDATE_TYPES = new Set([
  'consultation_help_request', 'consultation_order', 'vacancy_application',
  'candidate_application', 'reserve_join_request',
])

function richTemplate(sourceBlock: LeadSourceBlock, formType: string): 'kadry-employer' | 'kadry-candidate' | 'support' | undefined {
  if (RICH_EMPLOYER_TYPES.has(formType)) return 'kadry-employer'
  if (RICH_CANDIDATE_TYPES.has(formType)) return 'kadry-candidate'
  // Обращение через форму контактов (любой раздел) и «Не знаете, с чего
  // начать?» на /kadry/candidates — одна и та же «шапка поддержки».
  if (formType === 'contact') return 'support'
  if (sourceBlock === 'kadry' && formType === 'support_request') return 'support'
  return undefined
}

export interface LeadInput {
  requestId?: string
  sourceBlock: LeadSourceBlock
  formType: string
  name: string
  contact: string
  /** Телефон/почта/Telegram отдельными полями — попадают отдельными
   *  строками в уведомление админу (см. LeadInput в types.ts). */
  phone?: string
  email?: string
  telegram?: string
  /** Компания — для заявок работодателя (рекрутинг), см. Lead в types.ts. */
  company?: string
  /** Переопределяет «Услугу» в уведомлении — см. Lead в types.ts. */
  serviceOverride?: string
  /** Номер заявки (см. nextTicketNumber) — если задан, попадает в первую
   *  строку уведомления админу («Заявка №N»), тем же числом, что видит клиент. */
  ticketNumber?: string
  /** Ответ на «Откуда вы о нас узнали?» (свободный текст, необязательный). */
  howHeard?: string
  interest?: string[]
  /** Slug вакансии — если задан, бэкенд считает это в реальный счетчик откликов вакансии. */
  vacancySlug?: string
  /** Slug мероприятия — если задан, бэкенд считает это в реальный счетчик переходов к регистрации. */
  eventSlug?: string
  /** Что отметил человек под формой: Политика, обработка данных, реклама (consentOf(e) в src/lib/consent.ts). */
  consent?: ConsentChoice
  /** Цель Яндекс Метрики (lead_employer и т. п.): отправляется только после успешного ответа сервера на заявку, не по клику. */
  goal?: string
}

// Номер заявки — короткий, читаемый на слух номер для клиента (не технический
// id лида выше), чтобы было что назвать в переписке/по телефону при вопросе
// в поддержку. Используется формами обратной связи (Контакты, Поддержка).
// Сквозной, растёт с 1 — считает бэкенд (server/lib/ticketCounter.js), чтобы
// номер был общим для всех посетителей, а не начинался заново в каждой вкладке.
export async function nextTicketNumber(): Promise<string> {
  try {
    const res = await fetch('/api/ticket/next', { method: 'POST' })
    const data = await res.json()
    if (typeof data.number === 'number') return String(data.number)
  } catch {
    // бэкенд недоступен — не блокируем клиента
  }
  return String(100000 + (Date.now() % 900000))
}

function buildLead(input: LeadInput): Lead {
  const lead: Lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sourceBlock: input.sourceBlock,
    formType: input.formType,
    name: input.name,
    contact: input.contact,
    phone: input.phone,
    email: input.email,
    telegram: input.telegram,
    company: input.company,
    serviceOverride: input.serviceOverride,
    ticketNumber: input.ticketNumber,
    howHeard: input.howHeard?.trim() || undefined,
    interest: input.interest ?? [],
    status: 'new',
    date: new Date().toISOString(),
  }

  return lead
}

function rememberLead(lead: Lead) {
  try {
    const all = getLeads()
    all.unshift(lead)
    localStorage.setItem(LEADS_KEY, JSON.stringify(all))
  } catch { /* The confirmed server receipt remains valid without browser storage. */ }
}

/** Prototype accounts remain local drafts and do not create real customer requests. */
export function submitDraftLead(input: LeadInput): Lead {
  const lead = buildLead(input)
  rememberLead(lead)
  return lead
}

const submissionIds = new WeakMap<object, string>()
export function leadSubmissionId(event: FormEvent): string {
  return submissionIds.get(event) ?? crypto.randomUUID()
}

/** Keep the form and its values until the server confirms a durable receipt. */
export function withLeadSubmission(handler: (event: FormEvent) => void | Promise<void>) {
  return async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (form.dataset.leadSubmitting === '1') return
    form.querySelector('[data-lead-submit-error]')?.remove()
    if (!form.dataset.leadInputListener) {
      form.addEventListener('input', () => { if (form.dataset.leadSubmitting !== '1') delete form.dataset.leadRequestId })
      form.dataset.leadInputListener = '1'
    }
    form.dataset.leadRequestId ??= crypto.randomUUID()
    submissionIds.set(event, form.dataset.leadRequestId)
    form.dataset.leadSubmitting = '1'
    form.setAttribute('aria-busy', 'true')
    const wasInert = form.inert
    form.inert = true
    const progress = document.createElement('p')
    progress.className = 'mt-3 text-sm'
    progress.setAttribute('role', 'status')
    progress.textContent = 'Отправляем заявку…'
    form.append(progress)
    try {
      await handler(event)
    } catch (error) {
      const message = document.createElement('p')
      message.dataset.leadSubmitError = '1'
      message.setAttribute('role', 'alert')
      message.className = 'mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800'
      message.textContent = error instanceof Error && error.message === 'file_not_received'
        ? 'Заявка сохранена, но файл принять не удалось. Проверьте соединение и повторите отправку. Заполненные поля сохранены.'
        : 'Не удалось подтвердить получение заявки. Проверьте соединение и попробуйте еще раз. Заполненные поля сохранены.'
      form.append(message)
    } finally {
      delete form.dataset.leadSubmitting
      form.removeAttribute('aria-busy')
      form.inert = wasInert
      progress.remove()
    }
  }
}

export async function submitLead(input: LeadInput): Promise<Lead & { receiptId: string }> {
  const lead = buildLead(input)
  const template = richTemplate(lead.sourceBlock, lead.formType)
  const direction = template === 'kadry-employer' ? 'Кадры → Работодатель'
    : template === 'kadry-candidate' ? 'Кадры → Соискатель'
    : template === 'support' ? `${sourceLabels[lead.sourceBlock] ?? lead.sourceBlock} → Поддержка`
    : directionLabel(lead.sourceBlock, lead.formType)
  const response = await fetch('/api/notify', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId, direction,
      service: lead.serviceOverride ?? (SERVICE_LABELS[lead.formType] ?? lead.formType),
      source: sourceLabels[lead.sourceBlock] ?? lead.sourceBlock,
      formType: lead.formType, template, name: lead.name, contact: lead.contact,
      phone: lead.phone, email: lead.email, telegram: lead.telegram, company: lead.company,
      ticketNumber: lead.ticketNumber, howHeard: lead.howHeard, interest: lead.interest, date: lead.date,
      vacancySlug: input.vacancySlug, eventSlug: input.eventSlug, consent: input.consent,
      consentVersion: CONSENT_VERSION, marketingVersion: MARKETING_CONSENT_VERSION, utm: getUtm(),
    }),
  })
  const result = await response.json()
  if (!response.ok || result.ok !== true || result.received !== true || typeof result.receiptId !== 'string') throw new Error('lead_not_received')
  rememberLead(lead)
  try {
    trackEvent('lead_submit', { source: input.sourceBlock, form: input.formType })
    if (input.goal) goal(input.goal, { form: lead.formType })
  } catch { /* Analytics cannot invalidate a confirmed receipt. */ }
  return { ...lead, ticketNumber: result.ticketNumber || lead.ticketNumber, receiptId: result.receiptId }
}

/** Attachments are acknowledged only after saving to the same durable server receipt. */
export async function uploadDocument(file: File | null, label: string, name: string, receiptId: string) {
  if (!file) return
  const body = new FormData()
  body.append('file', file)
  body.append('label', label)
  body.append('name', name)
  body.append('receiptId', receiptId)
  try {
    const response = await fetch('/api/upload-document', { method: 'POST', body, signal: AbortSignal.timeout(60000) })
    const result = await response.json()
    if (!response.ok || result.ok !== true || result.received !== true) throw new Error('file_not_received')
  } catch { throw new Error('file_not_received') }
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
