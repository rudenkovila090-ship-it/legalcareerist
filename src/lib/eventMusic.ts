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

// Браузеры не дают включить звук без действия посетителя. Поэтому музыка пробует стартовать сама (получится, если посетитель
// уже взаимодействовал с сайтом или он в списке доверенных у браузера), а если нет — стартует от первого клика, касания или нажатия клавиши.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const

function armFirstGesture(snd: CaseSoundtrack) {
  let unsubscribe = () => {}
  const onGesture = (e: Event) => {
    // Клик по самой кнопке «Музыка вечера» разбирает кнопка, иначе он включил бы и тут же выключил звук.
    if (e.target instanceof Element && e.target.closest('.noir-snd')) return
    void snd.open()
  }
  const disarm = () => {
    for (const name of GESTURES) document.removeEventListener(name, onGesture, true)
    unsubscribe()
  }
  for (const name of GESTURES) document.addEventListener(name, onGesture, true)
  unsubscribe = snd.subscribe(() => {
    if (snd.isRunning()) disarm()
  })
  return disarm
}

/** Страница мероприятия открылась: музыка теперь «её», включается сама. Возвращает функцию, которой страница отдаёт музыку при закрытии. */
export function claimEventMusic() {
  window.clearTimeout(orphanTimer)
  // Защита от двойного монтирования в dev (StrictMode): закрытие откладываем и снимаем, если страница тут же смонтировалась снова.
  window.clearTimeout(pendingClose)
  const snd = eventMusic()
  const unbind = snd.bindScroll()
  let disarm = () => {}
  // Кто звук выключил, тому он остаётся выключенным: файлы (почти 5 МБ) для него не грузим, пока сам не включит кнопкой.
  if (!snd.muted) {
    void snd.open()
    if (!snd.isRunning()) disarm = armFirstGesture(snd)
  }
  return () => {
    disarm()
    unbind()
    pendingClose = window.setTimeout(() => snd.close(), 150)
  }
}
