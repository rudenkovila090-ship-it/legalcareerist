import type { MouseEvent } from 'react'
import { noirEventSlugs } from '../data/noirEvents'
import { CaseSoundtrack } from './caseSoundtrack'

// Один саундтрек на всю страницу: его включает клик по карточке мероприятия в афише или кнопка «Музыка вечера» внутри мероприятия.
let instance: CaseSoundtrack | null = null

export function eventMusic() {
  instance ??= new CaseSoundtrack({ baseUrl: `${import.meta.env.BASE_URL}audio/case/`, volume: 0.7 })
  return instance
}

// Музыку запускает клик в афише, а играть она должна на странице мероприятия. Если страница так и не открылась
// (запрос завис, переход отменён), звук не должен остаться играть на афише: через это время без «хозяина» он гаснет.
const ORPHAN_MS = 20000
let orphanTimer = 0
let pendingClose = 0

/** Клик по ссылке на мероприятие в афише: первым делом, синхронно, чтобы браузер разрешил звук. Музыку получают только вечера с нуарным оформлением. */
export function startEventMusicOnClick(slug: string, e: MouseEvent) {
  if (!noirEventSlugs.includes(slug)) return
  // Открытие в новой вкладке или окне — это не наш клик: страница откроется в другом документе.
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const snd = eventMusic()
  void snd.open()
  window.clearTimeout(orphanTimer)
  orphanTimer = window.setTimeout(() => snd.close(), ORPHAN_MS)
}

/** Страница мероприятия открылась: музыка теперь «её». Возвращает функцию, которой страница отдаёт музыку при закрытии. */
export function claimEventMusic() {
  window.clearTimeout(orphanTimer)
  // Защита от двойного монтирования в dev (StrictMode): закрытие откладываем и снимаем, если страница тут же смонтировалась снова.
  window.clearTimeout(pendingClose)
  const snd = eventMusic()
  const unbind = snd.bindScroll()
  return () => {
    unbind()
    pendingClose = window.setTimeout(() => snd.close(), 150)
  }
}
