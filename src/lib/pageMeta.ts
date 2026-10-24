import { useEffect } from 'react'

// Теги страницы для поисковиков и соцсетей: адрес-оригинал (canonical), og:url, описание и запрет индексации.
// Сайт — SPA с одним index.html, поэтому по умолчанию на всех страницах стоят теги главной; здесь они подменяются
// на каждой странице в браузере (Google и Яндекс исполняют JS и видят подмену). Краулеры соцсетей JS не исполняют
// и видят теги из index.html — это известное ограничение без пререндера (см. комментарий в index.html).

export const SITE_URL = 'https://legalcareerist.ru'

/** Адрес, который страница считает «настоящим»: без параметров и слеша на конце; одинаковые страницы сводятся к одному адресу. */
export function canonicalPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  // «Кадры» открываются и по /kadry, и по /kadry/employers — это одна и та же страница.
  if (path === '/kadry/employers') return '/kadry'
  return path
}

/** Страницы, которые поисковику не нужны: кабинеты, страницы «спасибо за оплату». */
const NOINDEX_PATHS: RegExp[] = [/^\/(cabinet|account)(\/|$)/, /^\/materials\/(thanks|cabinet)$/, /^\/community\/success$/]
export const isNoindexPath = (pathname: string) => NOINDEX_PATHS.some((re) => re.test(pathname))

/**
 * Описания страниц, у которых нет своего заголовочного блока с описанием (у остальных описание берётся из PageHero,
 * у вакансий, мероприятий, статей и новостей — из их данных). Нет страницы в списке — остаётся описание из index.html.
 */
const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/events': 'Афиша мероприятий для юридического рынка: конференции, форумы и встречи для студентов и юристов. Билеты и партнёрство.',
  '/events/knowledge': 'Отчёты и гайды по мероприятиям «Карьерного юриста»: материалы для студентов и юристов.',
  '/blog': 'Блог «Карьерного юриста»: новости проекта, подкаст, выступления и материалы о кадрах, сообществе и мероприятиях.',
  '/contacts': 'Связаться с «Карьерным юристом»: почта, Telegram-поддержка и форма обращения.',
  '/kadry/contacts': 'Контакты раздела «Кадры»: напишите нам о подборе сотрудников или поиске работы — почта, Telegram и форма обращения.',
  '/community/contacts': 'Контакты сообщества «Карьерного юриста»: вопросы о вступлении и подписке — почта, Telegram и форма обращения.',
  '/events/contacts': 'Контакты раздела «Мероприятия»: вопросы по билетам и участию — почта, Telegram и форма обращения.',
  '/marketplace/contacts': 'Контакты маркетплейса: вопросы по покупке материалов — почта, Telegram и форма обращения.',
  '/legal/privacy': 'Политика в области обработки персональных данных «Карьерного юриста»: редакция от 17.10.2026, документ целиком.',
  '/legal/consent': 'Согласие на обработку персональных данных на сайте «Карьерного юриста»: редакция от 17.10.2026, документ целиком.',
  '/legal/consent-publication': 'Согласие на распространение персональных данных для публикации отзыва на сайте «Карьерного юриста».',
}

const DESCRIPTION_SELECTORS = ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']
let defaultDescription: string | null = null

/** Описание из index.html — к нему возвращаемся при уходе со страницы. */
function siteDescription(): string {
  if (defaultDescription === null) defaultDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
  return defaultDescription
}

function setDescription(text: string) {
  for (const selector of DESCRIPTION_SELECTORS) document.querySelector(selector)?.setAttribute('content', text)
}

/** Описание страницы для поисковиков и карточек соцсетей; при уходе со страницы возвращается описание сайта. */
export function useMetaDescription(description?: string) {
  useEffect(() => {
    if (!description) return
    siteDescription()
    setDescription(description.replace(/\s+/g, ' ').trim())
    return () => setDescription(siteDescription())
  }, [description])
}

/** Не показывать страницу в поиске (например, «вакансия не найдена»). */
export function useNoindex(active = true) {
  useEffect(() => {
    if (!active) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [active])
}

/** Подключается один раз в Layout: адрес-оригинал, og:url, запрет индексации служебных страниц и описания из списка выше. */
export function useRouteMeta(pathname: string) {
  useEffect(() => {
    siteDescription()
    const noindex = isNoindexPath(pathname)
    const url = `${SITE_URL}${canonicalPath(pathname) === '/' ? '/' : canonicalPath(pathname)}`
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const created = !link
    if (!noindex) {
      if (!link) {
        link = document.createElement('link')
        link.rel = 'canonical'
        document.head.appendChild(link)
      }
      link.href = url
      document.querySelector('meta[property="og:url"]')?.setAttribute('content', url)
    }
    let robots: HTMLMetaElement | null = null
    if (noindex) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      robots.content = 'noindex'
      document.head.appendChild(robots)
    }
    const description = PAGE_DESCRIPTIONS[canonicalPath(pathname)]
    if (description) setDescription(description)
    return () => {
      robots?.remove()
      if (created) link?.remove()
      if (description) setDescription(siteDescription())
    }
  }, [pathname])
}
