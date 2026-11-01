// Яндекс Метрика (счётчик 113667773). Загружается только после согласия посетителя на cookie (баннер: src/components/CookieBanner.tsx),
// отправку просмотров при переходах по сайту делает src/components/MetrikaTracker.tsx.
// Отличия от кода из кабинета Метрики: вебвизор включён, но только после согласия посетителя, а то, что люди вводят в поля, и
// содержимое личного кабинета в запись не попадают (см. protectPrivacy); в Метрику уходят только адреса без служебных параметров
// (token, paid и т. п.; остаются utm-метки и yclid), закрытый раздел /cabinet в просмотры не отправляется, а пиксель <noscript>
// не ставится (он считал бы посетителей без согласия). Персональные данные в целях и параметрах не передаются никогда.
export const METRIKA_ID = 113667773
/** Вебвизор (запись действий посетителей). Выключить — false: на работу счётчика и целей это не влияет. */
const WEBVISOR = true

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
    // utm-значения в нижнем регистре (как в ky_utm), yclid/ysclid — как пришли: они чувствительны к регистру
    const keep = [...u.searchParams]
      .filter(([k]) => KEEP_PARAMS.test(k))
      .map(([k, v]): [string, string] => [k, /^utm_/i.test(k) ? v.trim().toLowerCase() : v])
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
  protectPrivacy()
  win.ym(METRIKA_ID, 'init', {
    ssr: true,
    webvisor: WEBVISOR,
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

export type GoalParams = Record<string, string | number | boolean>

/**
 * Достижение цели «JavaScript-событие» (идентификатор цели в Метрике = name; для оплат в params передаются order_price и currency).
 * Без согласия на cookie счётчик не запущен, и цель не отправляется (возвращает false). callback вызывается, когда Метрика приняла цель,
 * либо через 0,8 с, либо сразу, если цель не отправлена — им удобно откладывать переход на другую страницу, чтобы цель не потерялась.
 * В name и params нельзя передавать персональные данные (имена, телефоны, почту).
 */
export function goal(name: string, params?: GoalParams, callback?: () => void): boolean {
  const ym = w().ym
  if (!started || typeof ym !== 'function') {
    callback?.()
    return false
  }
  let called = false
  const done = () => {
    if (called) return
    called = true
    callback?.()
  }
  if (callback) window.setTimeout(done, 800)
  ym(METRIKA_ID, 'reachGoal', name, params, done)
  return true
}

/** Имя цели для клика по кнопке: id «btn-employer-submit» → «click_employer_submit». */
export const clickGoalName = (id: string) => `click_${id.replace(/^btn-/, '').replace(/-/g, '_')}`

/**
 * Защита личного при записи вебвизора: набираемый в полях текст не записывается (класс ym-disable-keys на всех полях и на корне),
 * а содержимое личного кабинета скрывается (ym-hide-content ставится на его контейнер, см. Cabinet.tsx).
 */
export function protectPrivacy() {
  const mark = (root: ParentNode) => {
    root.querySelectorAll?.('input, textarea, select').forEach((el) => el.classList.add('ym-disable-keys'))
  }
  document.documentElement.classList.add('ym-disable-keys')
  document.getElementById('root')?.classList.add('ym-disable-keys')
  mark(document)
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return
        if (n.matches('input, textarea, select')) n.classList.add('ym-disable-keys')
        mark(n)
      })
    }
  }).observe(document.body, { childList: true, subtree: true })
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
