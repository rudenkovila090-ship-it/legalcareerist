import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { prefersReducedMotion } from '../../lib/motion'
import type { TicketReceiptData } from '../../lib/useTicketReceipt'
import '../../pages/events/noir.css'

// Чек об оплате билета: после оплаты человека возвращают на страницу вечера, и там из кассового аппарата «печатается» чек —
// «Добро пожаловать на джазовый вечер», имя гостя, оплата, когда и где, билет, номер, штрихкод и ссылка на чат участников.
// Бумага выезжает из щели рывками, как у настоящего принтера; после печати статус «шлёпается» красным штампом, штрихкод считывается, появляется «Спасибо!».

export interface ReceiptEvent {
  /** Название как на странице: «Джазовый вечер для юристов 2 / Legal Night Jazz 2». */
  title: string
  tagline?: string
  /** «28 ноября 2026». */
  dateText: string
  /** «18:00–22:00». */
  timeText: string
  /** «Санкт-Петербург, м. Балтийская, …». */
  place: string
  /** Ссылка на открытый чат участников в Telegram. */
  chat?: string
}

interface TicketReceiptProps {
  /** checking — ждём подтверждения оплаты (аппарат «думает»), paid — печатаем чек, timeout — банк не подтвердил в срок. */
  state: 'checking' | 'paid' | 'timeout'
  ticket: TicketReceiptData | null
  event: ReceiptEvent
  onClose: () => void
}

const money = new Intl.NumberFormat('ru-RU')

const pad = (n: number) => String(n).padStart(6, '0')

const moscow = (ms: number) => {
  const d = new Date(ms)
  const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' })
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
  return `${date} ${time}`
}

/** Полосы штрихкода: каждый номер даёт свой рисунок (но он декоративный и ничего не кодирует). */
function barsFor(seed: number) {
  let x = (Math.imul(seed || 1, 2654435761) >>> 0) || 1
  const rnd = () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 4294967296
  }
  const bars: { x: number; w: number }[] = []
  let pos = 1.5
  while (pos < 97) {
    const w = 0.5 + Math.floor(rnd() * 3) * 0.55
    if (pos + w > 98.5) break
    bars.push({ x: pos, w })
    pos += w + 0.45 + Math.floor(rnd() * 3) * 0.45
  }
  return bars
}

/** Рваный нижний край чека: зубцы по ширине листа. */
const TEETH = 24
const ZIGZAG = (() => {
  const pts = ['0 0', '100% 0']
  for (let i = TEETH; i >= 0; i--) pts.push(`${((i / TEETH) * 100).toFixed(2)}% ${i % 2 ? '100%' : 'calc(100% - 3.4cqw)'}`)
  return `polygon(${pts.join(',')})`
})()

const FEED_MS = 4300
const FEED_STEPS = 72
const FEED_DELAY_MS = 800

export default function TicketReceipt({ state, ticket, event, onClose }: TicketReceiptProps) {
  const reduced = prefersReducedMotion()
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  // feeding — бумага выезжает; done — чек напечатан (после этого штамп, штрихкод и «Спасибо!»).
  const [phase, setPhase] = useState<'feeding' | 'done'>(reduced ? 'done' : 'feeding')
  const paid = state === 'paid' && ticket !== null
  const [titleRu, titleEn] = event.title.split(' / ')
  const bars = useMemo(() => barsFor(ticket?.number ?? 0), [ticket?.number])
  // Время печати чека: оплата, а если в кабинете её отметили вручную и времени нет — момент открытия чека.
  const [openedAt] = useState(() => Date.now())

  // Бумага: плавное замедление, но движется ступеньками (шаговый двигатель) и чуть подрагивает в стороны.
  useEffect(() => {
    const el = paperRef.current
    if (!paid || reduced || !el) return
    let raf = 0
    let start = 0
    const frame = (now: number) => {
      if (!start) start = now
      const p = Math.min(1, Math.max(0, (now - start - FEED_DELAY_MS) / FEED_MS))
      const eased = 1 - Math.pow(1 - p, 2.2)
      const step = Math.round(eased * FEED_STEPS)
      const jitter = p < 1 && step % 2 ? 0.7 : 0
      el.style.transform = `translate3d(${jitter}px, ${(step / FEED_STEPS - 1) * 100}%, 0)`
      if (p < 1) raf = requestAnimationFrame(frame)
      else {
        el.style.transform = 'none'
        setPhase('done')
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [paid, reduced])

  // Окно модальное: страница под ним не прокручивается, фокус не уходит за его пределы, Esc закрывает.
  useEffect(() => {
    closeRef.current?.focus()
    const { overflow, paddingRight } = document.body.style
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const items = [...(overlayRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
    }
  }, [onClose])

  const chatLabel = event.chat?.replace(/^https?:\/\//, '')

  return createPortal(
    <div ref={overlayRef} className="rc-overlay" role="dialog" aria-modal="true" aria-label="Чек об оплате билета" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <button ref={closeRef} type="button" className="rc-close" onClick={onClose} aria-label="Закрыть чек">
        ×
      </button>

      <div className="rc-stage" data-phase={paid ? phase : undefined}>
        <div className="rc-printer" aria-hidden="true">
          <span className="rc-plate">Касса · Legal Night Jazz</span>
          <i className="rc-led" data-state={paid ? (phase === 'done' ? 'ready' : 'busy') : state === 'timeout' ? 'idle' : 'busy'} />
          <span className="rc-slot" />
        </div>

        {state === 'checking' && (
          <p className="rc-wait" role="status">
            Ждем подтверждение оплаты от банка<span className="rc-dots" aria-hidden="true" />
            <small>Не закрывайте страницу — чек напечатается сам.</small>
          </p>
        )}

        {state === 'timeout' && (
          <p className="rc-wait" role="status">
            Банк пока не подтвердил оплату.
            <small>Если деньги списались, подтверждение придет на почту, а чек появится на этой странице при следующем открытии. Вопросы — @legalcareerist_support.</small>
          </p>
        )}

        {paid && ticket && (
          <>
            <p className="sr-only" role="status">
              Оплата получена. {ticket.name ? `${ticket.name}, вы` : 'Вы'} в списке гостей. Номер билета {pad(ticket.number)}.
            </p>
            <div className="rc-feed">
              <div ref={paperRef} className="rc-sheet" data-phase={phase}>
                <article className="rc-paper" style={{ clipPath: ZIGZAG } as CSSProperties}>
                  <header className="rc-band">
                    <span>Чек</span>
                    <span>№ {pad(ticket.number)}</span>
                  </header>

                  <div className="rc-brand">
                    <p className="rc-logo" aria-label={titleRu}>
                      {titleEn ?? titleRu}
                    </p>
                    {event.tagline && <p className="rc-tag">/{event.tagline}/</p>}
                  </div>

                  <hr className="rc-dash" />
                  <p className="rc-when">
                    <span>Оплачен:</span> {moscow(ticket.paidAt ?? openedAt)}
                  </p>

                  <h2 className="rc-welcome">Добро пожаловать на джазовый вечер</h2>
                  {ticket.name && (
                    <p className="rc-guest">
                      <span>Гость</span>
                      <b>{ticket.name}</b>
                    </p>
                  )}
                  <p className="rc-status">
                    <i aria-hidden="true">✓</i> Оплата получена · вы в списке гостей
                  </p>

                  <hr className="rc-dash" />
                  <dl className="rc-lines">
                    <div className="rc-block">
                      <dt>Когда</dt>
                      <dd>
                        {event.dateText}, {event.timeText}
                      </dd>
                    </div>
                    <div className="rc-block">
                      <dt>Где</dt>
                      <dd>{event.place}</dd>
                    </div>
                    <div className="rc-row">
                      <dt>Тариф</dt>
                      <dd>{ticket.tariff || 'Билет'}</dd>
                    </div>
                    <div className="rc-row">
                      <dt>Номер</dt>
                      <dd>№ {pad(ticket.number)}</dd>
                    </div>
                  </dl>

                  <hr className="rc-dash" />
                  <p className="rc-total">
                    <span>Итого:</span>
                    <b>{ticket.amount > 0 ? `${money.format(ticket.amount)} ₽` : '—'}</b>
                  </p>

                  <div className="rc-code" aria-hidden="true">
                    <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                      {bars.map((b) => (
                        <rect key={b.x} x={b.x} y={0} width={b.w} height={24} />
                      ))}
                    </svg>
                  </div>

                  {event.chat && (
                    <a className="rc-chat" href={event.chat} target="_blank" rel="noopener noreferrer">
                      <span>Чат участников вечера</span>
                      <b>{chatLabel}</b>
                    </a>
                  )}

                  <p className="rc-thanks">Спасибо!</p>
                  <p className="rc-foot">
                    Подтверждение придет на вашу почту
                    <br />
                    legalcareerist.ru
                  </p>
                </article>
              </div>
            </div>
          </>
        )}

        {(paid ? phase === 'done' : state === 'timeout') && (
          <button type="button" className="rc-ok" onClick={onClose}>
            Закрыть
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
