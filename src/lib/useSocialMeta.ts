import { useEffect } from 'react'

const SITE_NAME = 'Карьерный Юрист'
const SITE_URL = 'https://legalcareerist.ru'

/**
 * Обновляет og:title/og:description/og:url и twitter:title/twitter:description
 * для конкретной страницы (вакансия, мероприятие, статья...) — как и
 * useDocumentTitle, но для тегов соцсетей вместо <title>.
 *
 * ВАЖНО: это правит DOM уже загруженной SPA. Краулеры Telegram/VK/Facebook
 * не выполняют JS — они видят только статичные теги из index.html (см. там
 * комментарий), поэтому эта функция НЕ чинит превью при шаринге ссылки на
 * конкретную вакансию/мероприятие в мессенджере — там до открытия SPA
 * просто не доходит. Она помогает там, где DOM реально смотрят: сохранение
 * вкладки в закладки/историю с og-заголовком через расширения браузера,
 * встроенные webview-браузеры соцсетей (открывают JS), карточка предпросмотра
 * при копировании ссылки в некоторых мессенджерах на iOS/Android, которые
 * дозагружают og-теги по клику. Настоящие превью «в лоб» для краулеров —
 * это server-side rendering или pre-render для ботов, отдельная задача.
 */
export function useSocialMeta(opts: { title?: string; description?: string; path?: string }) {
  useEffect(() => {
    const title = opts.title ? `${opts.title} — ${SITE_NAME}` : SITE_NAME
    const description = opts.description ?? undefined
    const url = opts.path ? `${SITE_URL}${opts.path}` : undefined

    const entries: [string, string][] = [
      ['meta[property="og:title"]', title],
      ['meta[name="twitter:title"]', title],
    ]
    if (description) {
      entries.push(['meta[property="og:description"]', description], ['meta[name="twitter:description"]', description])
    }
    if (url) {
      entries.push(['meta[property="og:url"]', url])
    }

    const previous: { el: Element; value: string }[] = []
    for (const [selector, value] of entries) {
      const el = document.querySelector(selector)
      if (!el) continue
      previous.push({ el, value: el.getAttribute('content') ?? '' })
      el.setAttribute('content', value)
    }

    return () => {
      for (const { el, value } of previous) el.setAttribute('content', value)
    }
  }, [opts.title, opts.description, opts.path])
}
