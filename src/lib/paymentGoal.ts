import { useEffect, useSyncExternalStore } from 'react'
import { getCookieChoice, goal, subscribeCookies } from './metrika'

type PaymentKind = 'community' | 'ticket' | 'product'

const GOALS: Record<PaymentKind, string> = { community: 'pay_community', ticket: 'pay_ticket', product: 'pay_product' }
const SENT_PREFIX = 'ky_goal_pay_'
const TOKEN_RE = /^[0-9a-f]{8,64}$/i
const POLL_MS = 3000
const MAX_ATTEMPTS = 40

const wasSent = (order: string) => {
  try {
    return localStorage.getItem(SENT_PREFIX + order) === '1'
  } catch {
    return false
  }
}
const markSent = (order: string) => {
  try {
    localStorage.setItem(SENT_PREFIX + order, '1')
  } catch {
    // хранилище недоступно — цель не повторится в рамках этой страницы
  }
}

/**
 * Цель Метрики об оплате (pay_community / pay_ticket / pay_product) на странице успеха. Оплата подтверждается сервером
 * (GET /api/payment/status — по подписанному уведомлению Prodamus), а не адресной строкой: вебхук может прийти на несколько секунд
 * позже возврата человека на сайт, поэтому страница опрашивает сервер до подтверждения (до 2 минут). Цель уходит один раз на заказ
 * (по номеру заказа в localStorage) и только если человек согласился на cookie. В параметрах — только сумма и валюта.
 */
export function usePaymentGoal(kind: PaymentKind, token: string | null | undefined) {
  const choice = useSyncExternalStore(subscribeCookies, getCookieChoice, () => null)
  useEffect(() => {
    if (choice !== 'accepted' || !token || !TOKEN_RE.test(token)) return
    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    const check = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/payment/status?kind=${kind}&token=${token}`)
        const data = (await res.json()) as { paid?: boolean; amount?: number; order?: string }
        if (cancelled) return
        if (data.paid && data.order && Number(data.amount) > 0) {
          if (wasSent(data.order)) return
          // goal() вернёт false, пока счётчик ещё не запущен: тогда повторим на следующем шаге.
          if (goal(GOALS[kind], { order_price: Number(data.amount), currency: 'RUB' })) {
            markSent(data.order)
            return
          }
        }
      } catch {
        // сеть или сервер недоступны — повторим
      }
      if (!cancelled && attempts < MAX_ATTEMPTS) timer = window.setTimeout(check, POLL_MS)
    }
    void check()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [choice, kind, token])
}
