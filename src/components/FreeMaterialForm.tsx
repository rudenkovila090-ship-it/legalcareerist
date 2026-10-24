import { useState, type FormEvent } from 'react'
import ConsentCheck from './ConsentCheck'
import HowHeardField from './HowHeardField'
import { CONSENT_VERSION, MARKETING_CONSENT_VERSION, consentOf } from '../lib/consent'

const field = 'rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none'

const ERRORS: Record<string, string> = {
  too_many_attempts: 'Слишком много запросов. Попробуйте через час.',
  file_missing: 'Файл материала сейчас недоступен. Напишите в поддержку — пришлём вручную.',
  mail_failed: 'Не получилось отправить письмо. Проверьте адрес и попробуйте ещё раз через минуту.',
}

interface Props {
  slug: string
  /** Дней действия личной ссылки — для подписи под кнопкой. */
  linkDays?: number
}

// Бесплатный гайд: почта и согласия вместо оплаты. Файл на странице не показывается — личная ссылка уходит на почту,
// поэтому получить его может только владелец ящика (сервер: POST /api/marketplace/free).
export default function FreeMaterialForm({ slug, linkDays = 7 }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [howHeard, setHowHeard] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const consent = consentOf(e)
    if (!consent.policy || !consent.processing || !email.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/marketplace/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialSlug: slug, name, email, howHeard, consent, consentVersion: CONSENT_VERSION, marketingVersion: MARKETING_CONSENT_VERSION }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(ERRORS[data.error ?? ''] ?? 'Не получилось отправить материал. Попробуйте ещё раз через минуту.')
        return
      }
      setSentTo(email.trim())
    } catch {
      setError('Не получилось отправить материал. Проверьте интернет и попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className="mt-4 text-center" role="status">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
        <div className="mt-3 font-semibold">Письмо отправлено</div>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          Личная ссылка на гайд — на {sentTo}. Она действует {linkDays} дней: скачайте файл за это время. Письма нет? Загляните в «Спам».
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3">
      <input aria-label="Имя" autoComplete="name" placeholder="Имя (необязательно)" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={field} />
      <input aria-label="Почта — сюда пришлём ссылку на файл" type="email" autoComplete="email" required placeholder="Почта — сюда пришлём ссылку" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      <HowHeardField value={howHeard} onChange={setHowHeard} className={field} />
      <button
        id="btn-material-free"
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
      >
        {busy ? 'Отправляем…' : 'Получить бесплатно'}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <ConsentCheck />
      <p className="text-xs leading-relaxed text-ink/60">Пришлём личную ссылку на PDF — она действует {linkDays} дней.</p>
    </form>
  )
}
