// LeadCapture — единый обработчик всех форм сайта (раздел 7 ТЗ).
// В проде пишет в таблицу Lead + создает/обновляет User, дублирует в Telegram-бот админу.
// В этом фронтенд-MVP — сохраняет в localStorage, эмулируя единую CRM-таблицу лидов,
// и триггерит analytics-событие (раздел 8: цели на каждую форму).
// Дублирование в Telegram — настоящее (не демо): каждая заявка летит на бэкенд
// (/api/notify), который шлет сообщение админу через Bot API. Бэкенд сам решает,
// настроен ли токен/chat_id — если нет, просто отвечает ok:false, страница это не блокирует.
import type { Lead, LeadSourceBlock } from '../types'

const LEADS_KEY = 'ky_leads'

const sourceLabels: Record<LeadSourceBlock, string> = {
  kadry: 'Кадры',
  community: 'Сообщество',
  events: 'Мероприятия',
  home: 'Главная',
  marketplace: 'Маркетплейс',
}

export interface LeadInput {
  sourceBlock: LeadSourceBlock
  formType: string
  name: string
  contact: string
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
      source: sourceLabels[lead.sourceBlock] ?? lead.sourceBlock,
      formType: lead.formType,
      name: lead.name,
      contact: lead.contact,
      interest: lead.interest,
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
