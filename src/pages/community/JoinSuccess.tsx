import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { openTelegramBot } from '../../lib/telegram'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { usePaymentGoal } from '../../lib/paymentGoal'

// Страница, на которую Prodamus возвращает человека после успешной оплаты подписки (urlSuccess в server/index.js).
// Токен из адреса связывает оплату с карточкой подписки. Страница опрашивает сервер, пока вебхук Prodamus не подтвердит оплату,
// и показывает ссылку на вступление в закрытый чат (она же уходит на почту и в бота). Ссылка общая: заявку одобряет бот, и только
// оплатившим, опознавая человека по нику, который он указал при оплате. Бот остаётся запасным каналом: Start привязывает подписку к
// аккаунту без ника, дальше он присылает уведомления и открывает кабинет в Telegram.
interface Access {
  known: boolean
  paid: boolean
  joined?: boolean
  telegram?: string
  invite?: { url: string } | null
}

const TOKEN_RE = /^[0-9a-f]{8,64}$/i
const POLL_MS = 3000
const MAX_ATTEMPTS = 40

export default function JoinSuccess() {
  useDocumentTitle('Оплата прошла успешно')
  const [params] = useSearchParams()
  const token = params.get('token')
  const valid = Boolean(token && TOKEN_RE.test(token))
  usePaymentGoal('community', token)

  const [access, setAccess] = useState<Access | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
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

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // буфер недоступен: ссылка видна на странице
    }
  }

  const btn = 'rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90'
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
  } else if (access.invite) {
    const invite = access.invite
    body = (
      <>
        <p className="text-sm leading-relaxed text-ink/70">
          {access.joined ? 'Вы уже в закрытом сообществе. Ссылка нужна, только если вышли из чата и хотите вернуться.' : 'Подписка оформлена. Нажмите кнопку и подайте заявку на вступление: бот одобрит её автоматически.'}
        </p>
        <a href={invite.url} target="_blank" rel="noopener noreferrer" className={`mt-6 inline-block ${btn}`}>Вступить в сообщество</a>
        <p className="mt-4 break-all text-xs text-ink/50">{invite.url}</p>
        <button type="button" onClick={() => void copy(invite.url)} className="mt-2 text-xs font-semibold text-ink/70 underline hover:text-ink">{copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
        <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-ink/60">
          {access.telegram ? `Подавайте заявку с Telegram-аккаунта ${access.telegram} (ник указан при оплате): так бот узнает вашу оплату. ` : 'Подавайте заявку со своего Telegram-аккаунта. '}
          Если ник другой или его нет, откройте бота и нажмите Start: подписка привяжется к вашему аккаунту. Ссылку мы также отправили на почту.
        </p>
      </>
    )
  } else {
    body = <p className="text-sm leading-relaxed text-ink/70">Подписка оформлена. Ссылку на вступление в чат пришлёт поддержка в ближайшее время. Если ждать не хочется, напишите нам.</p>
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
