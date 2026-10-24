import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fetchSupport, sendSupport, type SupportMessage } from '../../lib/cabinet'
import { icon } from './sections'
import { Card, IconBubble } from './ui'
import { dayTitle, fieldClass, timeOfDay } from './shared'
import { FAQ } from './faq'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

// ---- Помощь и FAQ ----
export function HelpSection() {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const found = FAQ.filter((f) => !q || f.q.toLowerCase().includes(q) || f.group.toLowerCase().includes(q))
    return [...new Set(found.map((f) => f.group))].map((group) => ({ group, items: found.filter((f) => f.group === group) }))
  }, [q])

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <ContactTile to="/cabinet/support" icon={icon.lifebuoy} title="Чат поддержки" note="Ответ придёт сюда и на почту" />
        <ContactTile href="mailto:info@legalcareerist.ru" icon={icon.mail} title="Почта" note="info@legalcareerist.ru" />
        <ContactTile href="https://t.me/legalcareerist_support" icon={icon.telegram} title="Telegram" note="@legalcareerist_support" />
      </div>

      <div>
        <label htmlFor="faq-search" className="sr-only">Поиск по вопросам</label>
        <input id="faq-search" value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Найти вопрос: пароль, билет, подписка…" className={fieldClass} />
      </div>

      {groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <IconBubble tone="soft">{icon.help}</IconBubble>
          <p className="text-sm text-ink/60">Ничего не нашли по запросу «{query.trim()}».</p>
          <Link to="/cabinet/support" className={`rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 ${focusRing}`}>Спросить в чате</Link>
        </Card>
      ) : (
        groups.map(({ group, items }) => (
          <section key={group} aria-label={group}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink/40">{group}</h2>
            <div className="glass divide-y divide-ink/10 rounded-2xl">
              {items.map((f) => (
                <details key={f.id} className="group px-4 py-3.5" open={Boolean(q) && items.length === 1}>
                  <summary className={`flex min-h-6 cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-semibold ${focusRing}`}>
                    {f.q}
                    <span className="shrink-0 text-lg leading-none text-ink/40 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                  </summary>
                  <div className="mt-2.5 text-sm leading-relaxed text-ink/70">{f.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
      <p className="px-1 text-xs text-ink/50">Не нашли ответ? <Link to="/cabinet/support" className="underline hover:text-ink">Напишите в чат поддержки</Link>.</p>
    </div>
  )
}

function ContactTile({ to, href, icon: ic, title, note }: { to?: string; href?: string; icon: ReactNode; title: string; note: string }) {
  const inner = (
    <>
      <IconBubble>{ic}</IconBubble>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-ink/50">{note}</div>
      </div>
    </>
  )
  const cls = `glass flex min-w-0 items-center gap-3 rounded-2xl p-4 ${focusRing}`
  return to ? <Link to={to} className={cls}>{inner}</Link> : <a href={href} className={cls} {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{inner}</a>
}

// ---- Чат поддержки ----
const SUGGESTIONS = ['Не пришёл билет на мероприятие', 'Вопрос по подписке', 'Проблема со входом в кабинет', 'Хочу сменить почту аккаунта']

const sendError = (code: string): string =>
  ({
    too_many_attempts: 'Слишком много сообщений за час. Попробуйте позже или напишите на info@legalcareerist.ru.',
    empty: 'Напишите текст сообщения.',
    unauthorized: 'Сессия закончилась. Войдите снова.',
    network: 'Не получилось связаться с сервером. Сообщение не отправлено, попробуйте ещё раз.',
  })[code] ?? 'Не получилось отправить. Попробуйте ещё раз.'

/** Сколько секунд между обновлениями чата, пока он открыт: так ответ поддержки появляется без перезагрузки. */
const POLL_MS = 20_000

export function SupportSection({ onRead }: { onRead: () => void }) {
  const [messages, setMessages] = useState<SupportMessage[] | null>(null)
  const [max, setMax] = useState(2000)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const r = await fetchSupport()
      if (!active) return
      if (r.ok) {
        setMessages((prev) => (prev && prev.length === r.data.messages.length && prev.at(-1)?.id === r.data.messages.at(-1)?.id ? prev : r.data.messages))
        setMax(r.data.maxLength)
        if (r.data.unread > 0) onRead()
      } else setMessages((prev) => prev ?? [])
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [onRead])

  // К последнему сообщению — при открытии и когда пришло новое.
  const lastId = messages?.at(-1)?.id
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId])

  function resize() {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')
    setNote('')
    const r = await sendSupport(body)
    setBusy(false)
    if (!r.ok) {
      setError(sendError(r.error))
      return
    }
    setMessages((prev) => [...(prev ?? []), r.data.message])
    setText('')
    window.setTimeout(resize, 0)
    if (!r.data.notified) setNote('Сообщение сохранено, но сразу передать его нам не получилось. Мы увидим его позже; срочные вопросы лучше написать на info@legalcareerist.ru.')
  }

  // На компьютере Enter отправляет, Shift+Enter переносит строку; на телефоне Enter всегда переносит строку.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
      e.preventDefault()
      void submit()
    }
  }

  const list = messages ?? []
  return (
    <div className="flex h-[min(42rem,calc(100svh-9rem))] min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white/70 shadow-sm">
      <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3.5 sm:px-5">
        <IconBubble>{icon.lifebuoy}</IconBubble>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Служба поддержки</div>
          <div className="truncate text-xs text-ink/50">Ответ придёт сюда, на почту и в Telegram, если он привязан</div>
        </div>
      </div>

      <div ref={listRef} role="log" aria-live="polite" aria-label="Переписка с поддержкой" className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
        {messages === null && <p className="py-10 text-center text-sm text-ink/50">Загружаем…</p>}
        {messages !== null && list.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
            <IconBubble tone="soft">{icon.chat}</IconBubble>
            <div>
              <p className="text-sm font-semibold">Задайте вопрос</p>
              <p className="mt-1 max-w-xs text-xs text-ink/60">Опишите, что случилось. Не присылайте пароли и данные банковских карт.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => { setText(s); window.setTimeout(() => { areaRef.current?.focus(); resize() }, 0) }} className={`rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-ink/30 hover:text-ink ${focusRing}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {list.map((m, i) => {
          const mine = m.from === 'user'
          const newDay = i === 0 || dayTitle(list[i - 1].at) !== dayTitle(m.at)
          return (
            <div key={m.id}>
              {newDay && <div className="mb-3 text-center text-xs font-medium text-ink/40">{dayTitle(m.at)}</div>}
              <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%] ${mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-ink/[0.06] text-ink'}`}>{m.text}</div>
                <div className="mt-1 px-1 text-[11px] text-ink/40">{mine ? 'Вы' : 'Поддержка'} · {timeOfDay(m.at)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="border-t border-ink/10 bg-white/80 px-3 py-3 sm:px-4">
        {(error || note) && <p role={error ? 'alert' : 'status'} className={`mb-2 px-1 text-xs ${error ? 'text-red-600' : 'text-ink/60'}`}>{error || note}</p>}
        <div className="flex items-end gap-2">
          <label htmlFor="support-text" className="sr-only">Сообщение</label>
          <textarea
            id="support-text"
            ref={areaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); resize() }}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={max}
            placeholder="Напишите сообщение…"
            className={`${fieldClass} max-h-40 resize-none`}
          />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Отправить" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90 disabled:opacity-40 ${focusRing}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="m5 12 14-7-5 14-2.5-5.5L5 12Z" /></svg>
          </button>
        </div>
        {text.length > max - 200 && <div className="mt-1 px-1 text-right text-[11px] text-ink/40">{text.length} / {max}</div>}
      </form>
    </div>
  )
}
