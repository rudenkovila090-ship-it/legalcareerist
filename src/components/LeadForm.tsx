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
  /** Показать отдельное поле номера телефона (в дополнение к основному полю контакта). */
  showPhone?: boolean
  /** Показать отдельное поле Telegram-контакта (в дополнение к телефону/почте). */
  showTelegram?: boolean
  /** Показать загрузку файла резюме (демо: имя файла попадает в заявку, реальной загрузки на сервер нет). */
  showResumeUpload?: boolean
  /** Показать загрузку мотивационного письма. */
  showMotivationUpload?: boolean
  /** Показать загрузку сопроводительного письма. */
  showCoverLetterUpload?: boolean
  /** Показать загрузку рекомендации — единственное необязательное поле среди загрузок. */
  showRecommendationUpload?: boolean
  /** Все показанные поля (кроме рекомендации) становятся обязательными для отправки. */
  requireAll?: boolean
  /** Slug вакансии — если задан, отклик учитывается в реальном счётчике откликов вакансии. */
  vacancySlug?: string
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
  showPhone = false,
  showTelegram = false,
  showResumeUpload = false,
  showMotivationUpload = false,
  showCoverLetterUpload = false,
  showRecommendationUpload = false,
  requireAll = false,
  vacancySlug,
}: LeadFormProps) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [telegram, setTelegram] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [motivationFile, setMotivationFile] = useState<File | null>(null)
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null)
  const [recommendationFile, setRecommendationFile] = useState<File | null>(null)
  const [interest, setInterest] = useState<string[]>([])
  const [sent, setSent] = useState(false)
  const [missingFields, setMissingFields] = useState(false)

  function toggleInterest(value: string) {
    setInterest((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMissingFields(false)

    const requiredOk =
      name.trim() &&
      contact.trim() &&
      (!requireAll || !showPhone || phone.trim()) &&
      (!requireAll || !showTelegram || telegram.trim()) &&
      (!requireAll || !showResumeUpload || resumeFile) &&
      (!requireAll || !showMotivationUpload || motivationFile) &&
      (!requireAll || !showCoverLetterUpload || coverLetterFile)
      // Рекомендация намеренно не входит в обязательные — даже при requireAll.

    if (!requiredOk) {
      setMissingFields(true)
      return
    }

    submitLead({
      sourceBlock,
      formType,
      name,
      contact: [contact, phone, telegram].filter(Boolean).join(' / '),
      interest: [
        ...interest,
        resumeFile ? `Резюме: ${resumeFile.name}` : '',
        motivationFile ? `Мотивационное письмо: ${motivationFile.name}` : '',
        coverLetterFile ? `Сопроводительное письмо: ${coverLetterFile.name}` : '',
        recommendationFile ? `Рекомендация: ${recommendationFile.name}` : '',
      ].filter(Boolean),
      vacancySlug,
    })
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

      {(showPhone || showTelegram) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {showPhone && (
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Номер телефона"
              required={requireAll}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
            />
          )}
          {showTelegram && (
            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="Telegram-контакт"
              required={requireAll}
              className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
            />
          )}
        </div>
      )}

      {showResumeUpload && (
        <FileField label="Загрузить резюме (PDF)" required={requireAll} file={resumeFile} onChange={setResumeFile} />
      )}
      {showMotivationUpload && (
        <FileField label="Загрузить мотивационное письмо (PDF)" required={requireAll} file={motivationFile} onChange={setMotivationFile} />
      )}
      {showCoverLetterUpload && (
        <FileField label="Загрузить сопроводительное письмо (PDF)" required={requireAll} file={coverLetterFile} onChange={setCoverLetterFile} />
      )}
      {showRecommendationUpload && (
        <FileField label="Загрузить рекомендацию (необязательно)" required={false} file={recommendationFile} onChange={setRecommendationFile} />
      )}

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

      {missingFields && (
        <p className="mt-3 text-sm text-red-600">Заполните все обязательные поля — все, кроме рекомендации.</p>
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

function FileField({ label, required, file, onChange }: { label: string; required: boolean; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-ink/20 px-3 py-2 text-sm text-ink/50 hover:border-ink/40">
      <span>{file ? file.name : required ? `${label} *` : label}</span>
      <span className="shrink-0 rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-ink">Выбрать файл</span>
      <input type="file" accept=".pdf" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  )
}
