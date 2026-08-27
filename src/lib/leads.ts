// LeadCapture — единый обработчик всех форм сайта (раздел 7 ТЗ).
// В проде пишет в таблицу Lead + создает/обновляет User, дублирует в Telegram-бот админу.
// В этом фронтенд-MVP — сохраняет в localStorage, эмулируя единую CRM-таблицу лидов,
// и триггерит analytics-событие (раздел 8: цели на каждую форму).
import type { Lead, LeadSourceBlock } from '../types'

const LEADS_KEY = 'ky_leads'

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

  return lead
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
