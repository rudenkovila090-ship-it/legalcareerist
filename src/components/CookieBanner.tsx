import { useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { getCookieChoice, isCookieDialogOpen, setCookieChoice, subscribeCookies } from '../lib/metrika'

/**
 * Окно про cookie: пока посетитель не выбрал, Метрика не загружается. Выбор запоминается в браузере; изменить его можно
 * ссылкой «Настройки cookie» в подвале. Единственные необязательные cookie сайта — Яндекс Метрики (статистика посещений).
 */
export default function CookieBanner() {
  const choice = useSyncExternalStore(subscribeCookies, getCookieChoice, () => 'declined' as const)
  const reopened = useSyncExternalStore(subscribeCookies, isCookieDialogOpen, () => false)
  if (choice !== null && !reopened) return null
  return (
    <div role="dialog" aria-label="Файлы cookie" className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-ink/10 bg-white p-4 text-ink shadow-xl sm:flex-row sm:items-center sm:p-5">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink/80">
          Мы используем cookie Яндекс Метрики, чтобы понимать, какие страницы сайта нужны посетителям. Без вашего согласия они не устанавливаются.{' '}
          <Link to="/legal/privacy" className="underline hover:text-ink">Политика обработки персональных данных</Link>
          {choice !== null && <span className="text-ink/50"> · сейчас выбрано: {choice === 'accepted' ? 'принято' : 'отклонено'}</span>}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => setCookieChoice('accepted')} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
            Принять
          </button>
          <button type="button" onClick={() => setCookieChoice('declined')} className="rounded-full border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink">
            Отклонить
          </button>
        </div>
      </div>
    </div>
  )
}
