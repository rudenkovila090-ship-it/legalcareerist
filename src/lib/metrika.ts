// Яндекс Метрика (счётчик 113667773). Загружается только после согласия посетителя на cookie (баннер: src/components/CookieBanner.tsx),
// отправку просмотров при переходах по сайту делает src/components/MetrikaTracker.tsx.
// Отличия от кода из кабинета Метрики: вебвизор выключен (он записывает действия на экране, в том числе на страницах с формами),
// в Метрику уходят только адреса без служебных параметров (token, paid и т. п.; остаются utm-метки и yclid), закрытый раздел
// /cabinet не учитывается, а пиксель <noscript> не ставится (он считал бы посетителей без согласия).
export const METRIKA_ID = 113667773

export type CookieChoice = 'accepted' | 'declined'
const KEY = 'ky_cookie_consent'

// ---- Выбор посетителя: хранится в браузере (localStorage); если хранилище недоступно — до закрытия страницы в памяти ----
let memoryChoice: CookieChoice | null = null
let dialogOpen = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

export function getCookieChoice(): CookieChoice | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'accepted' || v === 'declined') return v
  } catch {
    // хранилище недоступно (приватный режим) — берём то, что запомнили в памяти
  }
  return memoryChoice
}

export function setCookieChoice(choice: CookieChoice) {
  memoryChoice = choice
  dialogOpen = false
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // запомнили в памяти
  }
  notify()
}

/** Открыть окно с выбором ещё раз (ссылка «Настройки cookie» в подвале). */
export function openCookieSettings() {
  dialogOpen = true
  notify()
}

export const isCookieDialogOpen = () => dialogOpen

export function subscribeCookies(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ---- Счётчик ----
type Ym = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number }
type MetrikaWindow = Window & { ym?: Ym; dataLayer?: unknown[] } & Record<string, unknown>
const w = () => window as unknown as MetrikaWindow

const KEEP_PARAMS = /^(utm_[a-z]+|yclid|ysclid)$/i

/** Адрес для Метрики: без служебных параметров (в них бывают токены покупок), с utm-метками для учёта источников. */
export function safeUrl(href: string): string {
  try {
    const u = new URL(href, window.location.origin)
    const keep = [...u.searchParams].filter(([k]) => KEEP_PARAMS.test(k))
    const query = keep.length ? `?${new URLSearchParams(keep).toString()}` : ''
    return `${u.origin}${u.pathname}${query}`
  } catch {
    return window.location.origin
  }
}

/** Разделы, которые в Метрику не отправляем. */
export const isExcludedPath = (pathname: string) => pathname === '/cabinet' || pathname.startsWith('/cabinet/')

let started = false
export const metrikaStarted = () => started

/**
 * Загружает счётчик (один раз за страницу). hit: учесть текущую страницу сразу; false — для закрытых разделов,
 * тогда первый просмотр отправит трекер при переходе на обычную страницу.
 */
export function startMetrika(hit: boolean) {
  if (started) return
  started = true
  const win = w()
  win[`disableYaCounter${METRIKA_ID}`] = false
  win.dataLayer = win.dataLayer || []
  // Заглушка очереди из кода Метрики: вызовы до загрузки tag.js запоминаются и выполняются после неё.
  win.ym =
    win.ym ||
    function () {
      const ym = win.ym as Ym
      // eslint-disable-next-line prefer-rest-params
      ;(ym.a = ym.a || []).push(arguments)
    }
  win.ym.l = Date.now()
  const src = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`
  if (![...document.scripts].some((s) => s.src === src)) {
    const script = document.createElement('script')
    script.async = true
    script.src = src
    document.head.appendChild(script)
  }
  win.ym(METRIKA_ID, 'init', {
    ssr: true,
    webvisor: false,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: referrerForMetrika(),
    url: safeUrl(window.location.href),
    accurateTrackBounce: true,
    trackLinks: true,
    defer: !hit,
  })
}

function referrerForMetrika() {
  if (!document.referrer) return ''
  return new URL(document.referrer).origin === window.location.origin ? safeUrl(document.referrer) : document.referrer
}

/** Просмотр страницы при переходе внутри сайта. */
export function trackHit(url: string, referer: string) {
  w().ym?.(METRIKA_ID, 'hit', url, { title: document.title, referer })
}

/** Достижение цели «JavaScript-событие» (идентификатор цели в Метрике = name). Без согласия на cookie ничего не отправляется. */
export function reachGoal(name: string) {
  if (started) w().ym?.(METRIKA_ID, 'reachGoal', name)
}

/** Удаляет cookie Метрики (_ym_*, _ymex и т. п.) этого сайта — при отказе после согласия. */
export function clearMetrikaCookies() {
  const host = window.location.hostname
  const domains = [host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim()
    if (!/^_ym|^ymex$|^yabs-sid$|^yandexuid$/i.test(name)) continue
    for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}
