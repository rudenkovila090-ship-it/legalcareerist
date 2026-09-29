// UTM-метки из ссылок в соцсетях: человек приходит на сайт по ссылке вида
// /vacancies/slug?utm_source=vk&utm_medium=post&utm_campaign=..., а откликается
// позже (возможно, с другой страницы). Поэтому метки запоминаются при первом
// заходе и уходят вместе с откликом/заявкой и с просмотром вакансии — так
// в боте видно, из какой соцсети пришёл отклик.
const KEY = 'ky_utm'
const TTL_MS = 30 * 24 * 3600 * 1000
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export type Utm = Partial<Record<(typeof FIELDS)[number], string>>

/** Сохраняет метки из адреса страницы (если они там есть). Вызывать один раз при старте приложения. */
export function captureUtm(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    const found: Utm = {}
    for (const f of FIELDS) {
      const v = params.get(f)
      if (v) found[f] = v.slice(0, 100)
    }
    if (Object.keys(found).length) localStorage.setItem(KEY, JSON.stringify({ ...found, at: Date.now() }))
  } catch {
    // localStorage недоступен — метки просто не сохранятся
  }
}

/** Актуальные метки (не старше 30 дней) или undefined, если человек пришёл без них. */
export function getUtm(): Utm | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return undefined
    const { at, ...utm } = JSON.parse(raw) as Utm & { at: number }
    if (!at || Date.now() - at > TTL_MS || !Object.keys(utm).length) return undefined
    return utm
  } catch {
    return undefined
  }
}
