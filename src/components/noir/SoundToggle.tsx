import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { claimEventMusic, eventMusic } from '../../lib/eventMusic'
import '../../pages/events/noir.css'

// waiting — музыка включится, как только браузер даст звук (нужен первый клик или касание); on — играет; muted — звук выключен.
type SoundState = 'waiting' | 'on' | 'muted'

const subscribe = (cb: () => void) => eventMusic().subscribe(cb)
const read = (): SoundState => {
  const snd = eventMusic()
  return snd.muted ? 'muted' : snd.isRunning() ? 'on' : 'waiting'
}

/**
 * Кнопка «Музыка вечера» в углу страницы. Музыка включается сама при открытии страницы; если браузер не даёт звук
 * без действия посетителя, она стартует от первого клика или касания (пока ждёт — подсказка над кнопкой). По мере прокрутки
 * музыка «раскрывает дело»; кнопка выключает и включает звук, выбор запоминается в браузере.
 */
export default function SoundToggle() {
  const state = useSyncExternalStore(subscribe, read)

  useEffect(() => claimEventMusic(), [])

  const onClick = () => {
    const snd = eventMusic()
    if (snd.muted) {
      snd.setMuted(false)
      void snd.open()
    } else if (!snd.isRunning()) {
      void snd.open() // ждали разрешения браузера — этот клик и есть то самое действие
    } else {
      snd.setMuted(true)
    }
  }

  // Рисуем в body, как и барабан: прямым потомкам .theme-noir общий стиль задаёт position: relative (index.css), он перебил бы fixed.
  return createPortal(
    <>
      {state === 'waiting' && (
        <p className="noir-snd-hint" role="status">
          Нажмите в любом месте, чтобы включить музыку
        </p>
      )}
      <button type="button" className="noir-snd" data-state={state} aria-label="Музыка вечера" aria-pressed={state === 'on'} title={state === 'on' ? 'Выключить звук' : 'Включить музыку'} onClick={onClick}>
        <span className="noir-snd-eq" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>Музыка вечера</span>
      </button>
    </>,
    document.body,
  )
}
