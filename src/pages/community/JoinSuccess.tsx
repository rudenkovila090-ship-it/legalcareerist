import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { openTelegramBot } from '../../lib/telegram'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { usePaymentGoal } from '../../lib/paymentGoal'

// Страница, на которую Prodamus возвращает человека после успешной оплаты подписки (urlSuccess в server/index.js).
// Токен из адреса связывает оплату с карточкой подписки. Страница опрашивает сервер, пока вебхук Prodamus не подтвердит оплату,
// и показывает личную одноразовую ссылку на вступление в закрытый чат (она же уходит на почту и в бота). Бот остаётся запасным
// и дополнительным каналом: уведомления и кабинет в Telegram.
interface Invite {
  url: string
  expiresAt: number
}
interface Access {
  known: boolean
  paid: boolean
  joined?: boolean
  invite?: Invite | null
}

const TOKEN_RE = /^[0-9a-f]{8,64}$/i
const POLL_MS = 3000
const MAX_ATTEMPTS = 40

const until = (ts: number) => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function JoinSuccess() {
  useDocumentTitle('Оплата прошла успешно')
  const [params] = useSearchParams()
  const token = params.get('token')
  const valid = Boolean(token && TOKEN_RE.test(token))
  usePaymentGoal('community', token)

  const [access, setAccess] = useState<Access | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    const check = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/community/access?token=${token}`)
        const data = (await res.json()) as Access & { ok?: boolean }
        if (cancelled) return
        if (data.ok !== false) {
          setAccess(data)
          if (!data.known || data.paid) return
        }
      } catch {
        // сеть или сервер недоступны: повторим
      }
      if (cancelled) return
      if (attempts < MAX_ATTEMPTS) timer = window.setTimeout(check, POLL_MS)
      else setGaveUp(true)
    }
    void check()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [token, valid])

  async function reissue() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/community/access/reissue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const data = (await res.json()) as { ok?: boolean; invite?: Invite; error?: string }
      if (data.ok && data.invite) setAccess((a) => ({ known: true, paid: true, ...a, joined: false, invite: data.invite }))
      else setError(data.error === 'too_many_attempts' ? 'Слишком много попыток. Попробуйте через час или напишите в поддержку.' : 'Не получилось выдать ссылку. Напишите в поддержку, мы пришлём вручную.')
    } catch {
      setError('Нет связи с сервером. Попробуйте ещё раз.')
    }
    setBusy(false)
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен: ссылка видна на странице
    }
  }

  const btn = 'rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60'
  const ghost = 'rounded-full border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink'

  let body
  if (!valid || (access && !access.known)) {
    body = <p className="text-sm text-red-600">Не нашли данные об оплате. Если ссылка не сработала, напишите нам в поддержку.</p>
  } else if (!access?.paid) {
    body = (
      <p className="text-sm leading-relaxed text-ink/70" role="status">
        {gaveUp
          ? 'Оплата ещё не подтвердилась. Обычно это занимает меньше минуты: ссылка на вступление придёт на почту и в бота. Если письма нет, напишите нам в поддержку.'
          : 'Подтверждаем оплату, обычно это занимает меньше минуты…'}
      </p>
    )
  } else if (access.joined) {
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink/70">Вы уже в закрытом сообществе. Если вышли из чата и хотите вернуться, получите новую личную ссылку.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => void reissue()} disabled={busy} className={btn}>{busy ? 'Выдаём…' : 'Получить новую ссылку'}</button>
        </div>
      </>
    )
  } else if (access.invite) {
    const invite = access.invite
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink/70">Подписка оформлена. Нажмите кнопку, подайте заявку на вступление, и мы одобрим её автоматически.</p>
        <a href={invite.url} target="_blank" rel="noopener noreferrer" className={`mt-6 inline-block ${btn}`}>Вступить в сообщество</a>
        <p className="mt-4 break-all text-xs text-ink/50">{invite.url}</p>
        <button type="button" onClick={() => void copy(invite.url)} className="mt-2 text-xs font-semibold text-ink/70 underline hover:text-ink">{copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
        <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-ink/60">
          Ссылка личная и одноразовая, действует до {until(invite.expiresAt)} (мск). Не передавайте её другим: вступит тот, кто нажмёт первым. Мы продублировали её на почту и пришлём в бота, как только вы его запустите.
        </p>
        <button type="button" onClick={() => void reissue()} disabled={busy} className="mt-3 text-xs font-semibold text-ink/70 underline hover:text-ink disabled:opacity-60">{busy ? 'Выдаём…' : 'Нужна новая ссылка?'}</button>
      </>
    )
  } else {
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink/70">Подписка оформлена, но ссылку на вступление не получилось выдать автоматически. Нажмите кнопку ниже, чтобы получить её ещё раз, или напишите в поддержку: мы пришлём вручную.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => void reissue()} disabled={busy} className={btn}>{busy ? 'Выдаём…' : 'Получить ссылку'}</button>
        </div>
      </>
    )
  }

  return (
    <div>
      <PageHero eyebrow="Сообщество" title="Оплата прошла успешно" description="Осталось вступить в закрытый чат сообщества, это займёт одну минуту." />
      <section className="container-page pb-16">
        <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
          <div className="mb-3 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
          </div>
          {body}
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          {valid && access?.paid && (
            <div className="mt-8 border-t border-ink/10 pt-6">
              <p className="text-xs leading-relaxed text-ink/60">Бот пришлёт напоминания о списании и откроет личный кабинет резидента в Telegram. Запускать его необязательно: подписка уже учтена.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => openTelegramBot(`access_${token}`)} className={ghost}>Открыть бота</button>
                <a href="/cabinet" className={ghost}>Личный кабинет</a>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
