import { useState, type FormEvent } from 'react'
import { submitLead } from '../lib/leads'
import type { LeadSourceBlock } from '../types'

interface LeadFormProps {
  sourceBlock: LeadSourceBlock
  formType: string
  title: string
  description?: string
  contactLabel?: string
  interestOptions?: string[]
}

// LeadCapture UI — единая форма, переиспользуемая во всех разделах сайта.
// Любая отправка попадает в общую таблицу лидов (см. src/lib/leads.ts),
// вне зависимости от того, с какой страницы она отправлена.
export default function LeadForm({
  sourceBlock,
  formType,
  title,
  description,
  contactLabel = 'Телефон или email',
  interestOptions,
}: LeadFormProps) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [interest, setInterest] = useState<string[]>([])
  const [sent, setSent] = useState(false)

  function toggleInterest(value: string) {
    setInterest((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !contact.trim()) return
    submitLead({ sourceBlock, formType, name, contact, interest })
    setSent(true)
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
        <div className="font-semibold">Заявка отправлена</div>
        <p className="mt-1 text-sm">Мы свяжемся с вами в ближайшее время. Заявка зафиксирована в CRM с пометкой источника.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-xl p-6">
      <div className="font-semibold">{title}</div>
      {description && <p className="mt-1 text-sm text-ink/60">{description}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя"
          required
          className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={contactLabel}
          required
          className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
        />
      </div>

      {interestOptions && interestOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {interestOptions.map((opt) => (
            <button
              type="button"
              key={opt}
              onClick={() => toggleInterest(opt)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                interest.includes(opt)
                  ? 'border-ink bg-ink text-white'
                  : 'border-ink/15 text-ink/60 hover:border-ink/40'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <button
        type="submit"
        className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90 sm:w-auto sm:px-6"
      >
        Отправить заявку
      </button>
      <p className="mt-2 text-xs text-ink/40">Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.</p>
    </form>
  )
}
