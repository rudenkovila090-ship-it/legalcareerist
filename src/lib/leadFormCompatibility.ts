// Bridge the UI helpers across deployed lead modules. Keep the existing transport
// and its acknowledgement contract: this UI release does not upgrade /api/notify.
import type { FormEvent } from 'react'
import type { Lead } from '../types'
import { getLeads, submitLead as submitExistingLead, type LeadInput as ExistingLeadInput } from './leads'
export * from './leads'
type LeadInput = ExistingLeadInput & { requestId?: string }

export function submitLead(input: LeadInput) {
  return submitExistingLead(input)
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

/** Prototype account actions are local drafts, never customer notifications. */
export function submitDraftLead(input: LeadInput): Lead {
  const lead = buildLead(input)
  try {
    const all = getLeads()
    all.unshift(lead)
    localStorage.setItem('ky_leads', JSON.stringify(all))
  } catch { /* Local drafts remain optional. */ }
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

