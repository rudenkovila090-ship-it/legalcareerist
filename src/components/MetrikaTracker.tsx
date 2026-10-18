import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { clearMetrikaCookies, getCookieChoice, isExcludedPath, metrikaStarted, reachGoal, safeUrl, startMetrika, subscribeCookies, trackHit } from '../lib/metrika'

/**
 * Подключает Яндекс Метрику после согласия на cookie и отправляет просмотры при переходах по сайту (сайт — одностраничное
 * приложение: без этого Метрика видела бы только первую страницу визита). Ничего не рисует.
 */
export default function MetrikaTracker() {
  const choice = useSyncExternalStore(subscribeCookies, getCookieChoice, () => null)
  const { pathname, search } = useLocation()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (choice !== 'accepted') {
      // Отказ уже после согласия: убираем cookie и перезагружаем страницу — счётчик, уже запущенный на ней, иначе не остановить.
      if (choice === 'declined' && metrikaStarted()) {
        clearMetrikaCookies()
        window.location.reload()
      }
      last.current = null
      return
    }
    const current = safeUrl(window.location.href)
    if (last.current === null) {
      // Первый просмотр после согласия учтёт сам счётчик при запуске (кроме закрытых разделов).
      startMetrika(!isExcludedPath(pathname))
      last.current = current
      return
    }
    if (current === last.current) return
    const referer = last.current
    last.current = current
    if (isExcludedPath(pathname)) return
    // Заголовок страницы выставляется после её загрузки — даём ему обновиться, чтобы в Метрике не остался заголовок прежней страницы.
    const timer = window.setTimeout(() => trackHit(current, referer), 400)
    return () => window.clearTimeout(timer)
  }, [choice, pathname, search])

  // Клики по ключевым кнопкам (у них id вида btn-…, см. docs/metrika.md): в Метрику уходит событие с тем же именем.
  // В Метрике на каждую такую кнопку заводится цель типа «JavaScript-событие» с идентификатором = id кнопки.
  useEffect(() => {
    if (choice !== 'accepted') return
    const onClick = (e: MouseEvent) => {
      const button = e.target instanceof Element ? e.target.closest('[id^="btn-"]') : null
      if (button) reachGoal(button.id)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [choice])

  return null
}
