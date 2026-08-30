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
}

export interface LeadInput {
  sourceBlock: LeadSourceBlock
  formType: string
  name: string
  contact: string
  interest?: string[]
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
  notifyTelegram(lead)

  return lead
}

/** Уведомление админу в Telegram — не блокирует отправку формы при ошибке/недоступности бэкенда. */
function notifyTelegram(lead: Lead) {
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
    }),
  }).catch(() => {
    // Бэкенд недоступен/не настроен — заявка все равно сохранена в localStorage, не мешаем пользователю.
  })
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
