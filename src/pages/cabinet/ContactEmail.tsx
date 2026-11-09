import { useState, type FormEvent } from 'react'
import { requestContactEmail, confirmContactEmail, type CabinetUser } from '../../lib/cabinet'
import { fieldClass, labelClass } from './shared'
const errors: Record<string, string> = { bad_password: 'Текущий пароль неверный.', bad_email: 'Проверьте адрес почты.', bad_code: 'Код неверный или срок истёк. Запросите новый код.', too_many_attempts: 'Слишком много попыток. Попробуйте позже.', mail_unavailable: 'Отправка писем сейчас недоступна.', mail_failed: 'Не удалось отправить письмо. Повторите через минуту.', demo_shared_account: 'В общем демо-аккаунте смена почты отключена.' }
export default function ContactEmail({ user, onSaved }: { user: CabinetUser; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(user.contact.email)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false)
    const r = pending ? await confirmContactEmail(code) : await requestContactEmail(email, password)
    if (!r.ok) setError(errors[r.error] || 'Не удалось сохранить почту. Попробуйте ещё раз.')
    else if (pending) { await onSaved(); setPending(''); setCode(''); setSaved(true) }
    else { setPending(r.data.email); setPassword('') }
    setBusy(false)
  }
  return <form onSubmit={submit} className="glass space-y-4 rounded-2xl p-6"><h2 className="text-lg font-semibold">Почта для связи</h2><p className="text-sm text-ink/60">Новый адрес подтверждается кодом из письма. Адрес для входа: <span className="break-all font-medium">{user.email || user.contact.email}</span>.</p>{pending ? <><p className="text-sm">Код отправлен на {pending}. Он действует 10 минут.</p><label className={labelClass}>Код из письма<input required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="one-time-code" minLength={8} maxLength={8} className={`${fieldClass} mt-1.5`} /></label><button type="button" onClick={() => {setPending(''); setCode('')}} className="text-xs underline">Указать другой адрес / запросить новый код</button></> : <><label className={labelClass}>Контактная почта<input required type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} autoComplete="email" className={`${fieldClass} mt-1.5`} /></label><label className={labelClass}>Текущий пароль<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" maxLength={256} className={`${fieldClass} mt-1.5`} /></label></>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button type="submit" disabled={busy} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Подождите…' : pending ? 'Подтвердить почту' : 'Получить код'}</button>{saved && <p role="status" className="text-sm text-emerald-700">Контактная почта обновлена.</p>}</form>
}
