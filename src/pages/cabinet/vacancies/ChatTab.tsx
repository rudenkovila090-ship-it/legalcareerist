import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchChat, fetchChats, sendChatMessage, type ChatMessage, type ChatThread, type ChatThreadSummary, type ChatVacancy } from '../../../lib/vacanciesCabinet'
import { icon } from '../sections'
import { relativeTime, timeOfDay } from '../shared'

/** «5 минут назад», «сегодня, 14:30», «вчера, 9:05», а для давних — «12 октября, 14:30». */
const chatTime = (at: number) => {
  const r = relativeTime(at)
  return /назад|только что|,/.test(r) ? r : `${r}, ${timeOfDay(at)}`
}
import { EmptyNote, Surface } from '../kit'
import { accent, btnPrimary, focusRing } from '../kitStyles'

// Чат с рекрутером: отдельная переписка по каждой вакансии, чтобы разговоры не путались. Слева список переписок и выбор вакансии
// для нового разговора, справа сама переписка. Выбранная вакансия хранится в адресе (?v=адрес-вакансии): ссылку на чат по
// вакансии можно открыть из списка вакансий и откликов. Ответ рекрутера приходит сюда, в уведомления и в Telegram (если привязан).

const POLL_MS = 20000
const isWide = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.from === 'user'
  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[75%] ${mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-ink/[0.06] text-ink'}`}>
        {!mine && <div className="mb-0.5 text-[11px] font-semibold text-gold">Рекрутер</div>}
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        <div className={`mt-1 text-[11px] ${mine ? 'text-white/55' : 'text-ink/40'}`}>{chatTime(m.at)}</div>
      </div>
    </li>
  )
}

export default function ChatTab({ onRead }: { onRead: () => void }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const slug = params.get('v') ?? ''
  const [threads, setThreads] = useState<ChatThreadSummary[] | null>(null)
  const [vacancies, setVacancies] = useState<ChatVacancy[]>([])
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLUListElement>(null)

  const loadList = useCallback(async () => {
    const r = await fetchChats()
    if (r.ok) {
      setThreads(r.data.threads)
      setVacancies(r.data.vacancies)
    } else setLoadError(true)
  }, [])

  useEffect(() => {
    let live = true
    fetchChats().then((r) => {
      if (!live) return
      if (r.ok) {
        setThreads(r.data.threads)
        setVacancies(r.data.vacancies)
      } else setLoadError(true)
    })
    return () => {
      live = false
    }
  }, [])

  // На широком экране по умолчанию открываем последнюю переписку; на телефоне сначала список.
  useEffect(() => {
    if (threads && !slug && threads.length > 0 && isWide()) navigate(`/cabinet/chat?v=${threads[0].slug}`, { replace: true })
  }, [threads, slug, navigate])

  // Переписка по выбранной вакансии: открытие отмечает ответы прочитанными; пока открыта — обновляется раз в 20 секунд.
  useEffect(() => {
    if (!slug) return
    let live = true
    let first = true
    const pull = async () => {
      const r = await fetchChat(slug)
      if (!live) return
      if (r.ok) {
        setThread(r.data)
        setLoadError(false)
        if (first && r.data.unread > 0) onRead()
        first = false
      } else if (first) {
        setThread(null)
        setLoadError(true)
      }
    }
    void pull()
    const t = window.setInterval(() => void pull(), POLL_MS)
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [slug, onRead])

  const current = thread && thread.slug === slug ? thread : null
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [current?.messages.length, slug])

  const withoutThread = useMemo(() => vacancies.filter((v) => !threads?.some((t) => t.slug === v.slug)), [vacancies, threads])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending || !slug) return
    setSending(true)
    setError('')
    const r = await sendChatMessage(slug, body)
    setSending(false)
    if (!r.ok) {
      setError(r.error === 'too_many_attempts' ? 'Слишком много сообщений за час. Попробуйте позже.' : r.error === 'too_many_threads' ? 'Слишком много переписок. Напишите в поддержку.' : 'Не получилось отправить. Попробуйте ещё раз.')
      return
    }
    setText('')
    setThread((prev) => (prev && prev.slug === slug ? { ...prev, messages: [...prev.messages, r.data.message] } : prev))
    void loadList()
    if (!current) {
      const r2 = await fetchChat(slug)
      if (r2.ok) setThread(r2.data)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  if (loadError && !threads) return <Surface><p className="text-sm text-ink/60">Не получилось загрузить чаты. Обновите страницу через минуту.</p></Surface>
  if (!threads) return <Surface><p className="text-sm text-ink/50">Загружаем чаты…</p></Surface>

  const showList = !slug
  const title = current?.title ?? vacancies.find((v) => v.slug === slug)?.title ?? slug
  const company = current?.company ?? vacancies.find((v) => v.slug === slug)?.company ?? ''

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/* Список переписок */}
      <Surface className={`${showList ? '' : 'hidden lg:block'} !p-3 lg:max-h-[38rem] lg:overflow-y-auto`}>
        <div className="px-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/40">Переписки по вакансиям</div>
        {threads.length === 0 ? (
          <p className="px-1.5 pb-3 text-sm text-ink/55">Пока ни одной. Выберите вакансию ниже и задайте вопрос рекрутеру.</p>
        ) : (
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.slug}>
                <Link to={`/cabinet/chat?v=${t.slug}`} aria-current={t.slug === slug ? 'true' : undefined} className={`block rounded-2xl px-3 py-2.5 transition-colors ${t.slug === slug ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.04]'} ${focusRing}`}>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.title}</span>
                    {t.unread > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${accent}`}>{t.unread}</span>}
                  </span>
                  {t.last && (
                    <span className="mt-0.5 flex items-baseline gap-2 text-xs text-ink/50">
                      <span className="min-w-0 flex-1 truncate">{t.last.from === 'user' ? 'Вы: ' : ''}{t.last.text}</span>
                      <span className="shrink-0">{relativeTime(t.last.at)}</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {withoutThread.length > 0 && (
          <div className="mt-3 border-t border-ink/10 px-1.5 pt-3">
            <label htmlFor="new-chat" className="block text-xs font-medium text-ink/55">Новый разговор по вакансии</label>
            <select
              id="new-chat"
              value=""
              onChange={(e) => e.target.value && navigate(`/cabinet/chat?v=${e.target.value}`)}
              className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base focus:border-ink/40 focus:outline-none sm:text-sm"
            >
              <option value="">Выберите вакансию</option>
              {withoutThread.map((v) => <option key={v.slug} value={v.slug}>{v.title} · {v.company}</option>)}
            </select>
          </div>
        )}
      </Surface>

      {/* Переписка */}
      <Surface className={`${showList ? 'hidden lg:flex' : 'flex'} min-h-[26rem] flex-col !p-0 lg:max-h-[38rem]`}>
        {!slug ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyNote icon={icon.chat} title="Выберите переписку">
              Для каждой вакансии у вас отдельный чат с рекрутером: вопросы по одной вакансии не смешиваются с другими.
            </EmptyNote>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3">
              <Link to="/cabinet/chat" className={`rounded-full p-1.5 text-ink/50 hover:bg-ink/[0.06] hover:text-ink lg:hidden ${focusRing}`} aria-label="К списку переписок">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              </Link>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold leading-tight">{title}</h2>
                <p className="truncate text-xs text-ink/50">{company}{current && !current.open ? ' · вакансия закрыта' : ''}</p>
              </div>
              <Link to={`/vacancies/${slug}`} className={`shrink-0 rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>Вакансия →</Link>
            </div>

            {loadError && !current ? (
              <div className="flex-1 p-6 text-sm text-ink/60">Не нашли такую вакансию. Выберите переписку из списка.</div>
            ) : (
              <ul ref={listRef} role="log" aria-live="polite" aria-label="Переписка" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
                {current && current.messages.length > 0 ? (
                  current.messages.map((m) => <Bubble key={m.id} m={m} />)
                ) : (
                  <li className="py-8 text-center text-sm text-ink/50">Задайте вопрос рекрутеру по этой вакансии. Ответ придёт сюда, в уведомления и в Telegram, если он привязан.</li>
                )}
              </ul>
            )}

            <form onSubmit={send} className="border-t border-ink/10 p-3">
              <label htmlFor="chat-text" className="sr-only">Сообщение рекрутеру</label>
              <div className="flex items-end gap-2">
                <textarea
                  id="chat-text"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, current?.maxLength ?? 2000))}
                  onKeyDown={onKey}
                  rows={2}
                  placeholder="Ваш вопрос по вакансии"
                  className="min-h-[3.25rem] flex-1 resize-none rounded-2xl border border-ink/15 bg-white px-3.5 py-2.5 text-base placeholder:text-ink/40 focus:border-ink/40 focus:outline-none sm:text-sm"
                />
                <button type="submit" disabled={sending || !text.trim()} className={btnPrimary}>{sending ? 'Отправляем…' : 'Отправить'}</button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink/40">
                <span>Ctrl или ⌘ + Enter — отправить</span>
                <span className="tabular-nums">{text.length} / {current?.maxLength ?? 2000}</span>
              </div>
              {error && <p role="alert" className="mt-1 px-1 text-sm text-red-600">{error}</p>}
            </form>
          </>
        )}
      </Surface>
    </div>
  )
}
