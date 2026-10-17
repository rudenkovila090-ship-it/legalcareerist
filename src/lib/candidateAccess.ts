// Доступ к базе резюме — покупка пакетами (личный кабинет работодателя,
// раздел «Кандидаты»). Матрица «количество контактов × срок доступа» —
// цифры клиента: 10 контактов/30 дней — 8000 ₽, 20 контактов/30 дней —
// 15000 ₽. Остальные сроки (24 часа/неделя/3/6/12 месяцев) — демо-цены,
// экстраполированные по той же логике (короче срок — дешевле, длиннее —
// оптовая скидка); не согласованы с клиентом, показывают механику раздела.
export interface AccessDuration {
  id: '24h' | 'week' | '30d' | '3m' | '6m' | '12m'
  label: string
  days: number
}

export const ACCESS_DURATIONS: AccessDuration[] = [
  { id: '24h', label: '24 часа', days: 1 },
  { id: 'week', label: 'Неделя', days: 7 },
  { id: '30d', label: '30 дней', days: 30 },
  { id: '3m', label: '3 месяца', days: 90 },
  { id: '6m', label: '6 месяцев', days: 180 },
  { id: '12m', label: '12 месяцев', days: 365 },
]

const durationMultiplier: Record<AccessDuration['id'], number> = {
  '24h': 0.5,
  week: 0.7,
  '30d': 1,
  '3m': 2.5,
  '6m': 4,
  '12m': 7,
}

export interface ContactPack {
  count: 10 | 20
  /** Цена за 30 дней — базовая цифра клиента. */
  basePrice30d: number
}

export const CONTACT_PACKS: ContactPack[] = [
  { count: 10, basePrice30d: 8000 },
  { count: 20, basePrice30d: 15000 },
]

export function priceFor(pack: ContactPack, duration: AccessDuration): number {
  return Math.round((pack.basePrice30d * durationMultiplier[duration.id]) / 500) * 500
}

export interface CandidateAccessPurchase {
  id: string
  count: number
  contactsUsed: number
  durationLabel: string
  purchasedAt: string
  expiresAt: string
  price: number
}

const KEY = 'ky_employer_candidate_access'

export function getPurchases(): CandidateAccessPurchase[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CandidateAccessPurchase[]) : []
  } catch {
    return []
  }
}

function writeAll(all: CandidateAccessPurchase[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function purchaseAccess(pack: ContactPack, duration: AccessDuration): CandidateAccessPurchase {
  const now = new Date()
  const purchase: CandidateAccessPurchase = {
    id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    count: pack.count,
    contactsUsed: 0,
    durationLabel: duration.label,
    purchasedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + duration.days * 86400000).toISOString(),
    price: priceFor(pack, duration),
  }
  writeAll([purchase, ...getPurchases()])
  return purchase
}

/** Активный (не истекший, есть остаток контактов) пакет — используется для
 *  списания при открытии контакта кандидата. */
export function activeAccess(): CandidateAccessPurchase | undefined {
  const now = Date.now()
  return getPurchases().find((p) => new Date(p.expiresAt).getTime() > now && p.contactsUsed < p.count)
}

export function useContact(id: string): CandidateAccessPurchase | undefined {
  const all = getPurchases()
  const idx = all.findIndex((p) => p.id === id)
  if (idx === -1) return undefined
  all[idx] = { ...all[idx], contactsUsed: Math.min(all[idx].count, all[idx].contactsUsed + 1) }
  writeAll(all)
  return all[idx]
}
