// Лимиты платных генераций — общая логика для конструктора резюме
// (соискатель) и в будущем конструктора вакансий (работодатель): одна
// бесплатная генерация, обновляется раз в 72 часа, плюс докупаемые пакеты
// генераций (списываются раньше бесплатной — так бесплатная попытка
// остается "про запас" дольше). Состояние — в localStorage по ключу
// раздела (см. RESUME_CREDITS_KEY / VACANCY_CREDITS_KEY ниже), без бэкенда
// и без реальной оплаты — см. комментарий в CandidateAccount.tsx о том,
// что это демо-покупка, а не настоящий Prodamus.
export const RESUME_CREDITS_KEY = 'ky_resume_credits'
export const VACANCY_CREDITS_KEY = 'ky_vacancy_credits'

const FREE_INTERVAL_MS = 72 * 60 * 60 * 1000

interface CreditsState {
  purchasedCredits: number
  lastFreeGenerationAt: string | null
}

function read(key: string): CreditsState {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as CreditsState) : { purchasedCredits: 0, lastFreeGenerationAt: null }
  } catch {
    return { purchasedCredits: 0, lastFreeGenerationAt: null }
  }
}

function write(key: string, state: CreditsState) {
  localStorage.setItem(key, JSON.stringify(state))
}

export function getCreditsState(key: string): CreditsState {
  return read(key)
}

export function freeAvailableAt(state: CreditsState): Date | null {
  if (!state.lastFreeGenerationAt) return null
  return new Date(new Date(state.lastFreeGenerationAt).getTime() + FREE_INTERVAL_MS)
}

export function isFreeAvailable(state: CreditsState): boolean {
  const at = freeAvailableAt(state)
  return !at || Date.now() >= at.getTime()
}

export function canGenerate(key: string): boolean {
  const state = read(key)
  return state.purchasedCredits > 0 || isFreeAvailable(state)
}

/** Списывает одну генерацию — сначала покупные кредиты, потом бесплатную (раз в 72ч). Возвращает false, если генераций нет. */
export function consumeGeneration(key: string): boolean {
  const state = read(key)
  if (state.purchasedCredits > 0) {
    state.purchasedCredits -= 1
    write(key, state)
    return true
  }
  if (isFreeAvailable(state)) {
    state.lastFreeGenerationAt = new Date().toISOString()
    write(key, state)
    return true
  }
  return false
}

export function addCredits(key: string, n: number) {
  const state = read(key)
  state.purchasedCredits += n
  write(key, state)
}

/** «через 2 ч 14 мин» — для отображения таймера до следующей бесплатной генерации. */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} мин`
  return `${hours} ч ${minutes} мин`
}
