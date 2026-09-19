import { useState, type FormEvent } from 'react'
import PageHero from '../components/PageHero'
import PhoneInput from '../components/PhoneInput'
import LeadSuccessCard from '../components/LeadSuccessCard'
import { submitLead, makeTicketNumber } from '../lib/leads'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { LeadSourceBlock } from '../types'

export default function Contacts({ eyebrow, sourceBlock }: { eyebrow: string; sourceBlock: LeadSourceBlock }) {
  useDocumentTitle(`${eyebrow} — Контакты`)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [telegram, setTelegram] = useState('')
  const [question, setQuestion] = useState('')
  const [missingFields, setMissingFields] = useState(false)
  const [ticket, setTicket] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMissingFields(false)

    if (!name.trim() || !phone.trim() || !question.trim()) {
      setMissingFields(true)
      return
    }

    submitLead({
      sourceBlock,
      formType: 'contact',
      name,
      contact: [phone, email, telegram].filter(Boolean).join(' / '),
      phone: phone || undefined,
      email: email || undefined,
      telegram: telegram || undefined,
      interest: [question],
    })
    setTicket(makeTicketNumber())
  }

  return (
    <div>
      <PageHero title="Контакты" />
      <div className="container-page grid gap-8 py-12 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Email</div>
            <div className="font-medium">info@legalcareerist.ru</div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Телефон</div>
            <div className="font-medium">+7 932 262 13 44</div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Telegram</div>
            <div className="font-medium">@LegalcareeristBot</div>
          </div>
        </div>

        {ticket ? (
          <LeadSuccessCard ticket={ticket} description="Мы свяжемся с вами в ближайшее время." />
        ) : (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6">
            <div className="font-semibold">Задать вопрос</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ФИО"
                required
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
              />
              <PhoneInput
                value={phone}
                onChange={setPhone}
                required
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Почта"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
              />
              <input
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="Telegram"
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
              />
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Вопрос"
              required
              rows={4}
              className="mt-3 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink/40"
            />

            {missingFields && (
              <p className="mt-3 text-sm text-red-600">Заполните ФИО, телефон и вопрос.</p>
            )}

            <button
              type="submit"
              className="mt-4 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
            >
              Отправить
            </button>
            <p className="mt-2 text-center text-xs text-ink/40">Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.</p>
          </form>
        )}
      </div>
    </div>
  )
}
