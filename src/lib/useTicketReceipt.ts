import { useEffect, useState } from 'react'

/** Всё, что сервер отдаёт для чека об оплате билета (GET /api/ticket/receipt): без почты и телефона. */
export interface TicketReceiptData {
  name: string
  tariff: string
  amount: number
  number: number
  paidAt: number | null
}

/**
 * checking — ждём подтверждения оплаты; paid — оплата подтверждена, чек можно печатать; timeout — банк так и не подтвердил за отведённое время;
 * unknown — такого заказа нет (чек не показываем); idle — ссылка возврата не с оплаты.
 */
export type TicketReceiptState = 'idle' | 'checking' | 'paid' | 'timeout' | 'unknown'

const TOKEN_RE = /^[0-9a-f]{8,64}$/i
const POLL_MS = 2500
const MAX_ATTEMPTS = 48

/**
 * Чек на странице возврата с оплаты. Оплату подтверждает сервер по подписанному уведомлению Prodamus (а не адресная строка),
 * а оно может прийти на несколько секунд позже, чем человек вернётся на сайт, поэтому страница опрашивает сервер до подтверждения (до 2 минут).
 */
export function useTicketReceipt(token: string | null | undefined) {
  const valid = Boolean(token && TOKEN_RE.test(token))
  const [state, setState] = useState<TicketReceiptState>(valid ? 'checking' : 'idle')
  const [ticket, setTicket] = useState<TicketReceiptData | null>(null)

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    const check = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/ticket/receipt?token=${token}`)
        const data = (await res.json()) as { known?: boolean; paid?: boolean } & Partial<TicketReceiptData>
        if (cancelled) return
        if (data.known === false) {
          setState('unknown')
          return
        }
        if (data.paid) {
          setTicket({ name: data.name ?? '', tariff: data.tariff ?? '', amount: Number(data.amount) || 0, number: Number(data.number) || 0, paidAt: data.paidAt ?? null })
          setState('paid')
          return
        }
      } catch {
        // сеть или сервер недоступны — повторим
      }
      if (cancelled) return
      if (attempts >= MAX_ATTEMPTS) setState('timeout')
      else timer = window.setTimeout(check, POLL_MS)
    }
    void check()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [valid, token])

  return { state, ticket }
}
