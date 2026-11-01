import { useEffect } from 'react'

const SITE_NAME = 'Карьерный Юрист'

/**
 * Заголовок вкладки браузера для конкретной страницы. Сайт — SPA с одним
 * статичным <title> в index.html, поэтому без этого хука все открытые
 * вкладки выглядят одинаково («Карьерный Юрист») и их не различить —
 * особенно заметно на детальных страницах вроде вакансии.
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} — ${SITE_NAME}` : SITE_NAME
    return () => {
      document.title = previous
    }
  }, [title])
}
