import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { claimEventMusic, eventMusic } from '../../lib/eventMusic'
import '../../pages/events/noir.css'

type SoundState = 'off' | 'on' | 'muted'

const read = (): SoundState => {
  const snd = eventMusic()
  return !snd.isOpen ? 'off' : snd.muted ? 'muted' : 'on'
}

/**
 * Кнопка «Музыка вечера» в углу страницы. Музыка сама не включается при загрузке — только по клику:
 * по карточке в афише (см. startEventMusicOnClick) или по этой кнопке. Пока страница открыта, музыка «раскрывает дело»
 * по мере прокрутки; кнопка выключает и включает звук, выбор запоминается в браузере.
 */
export default function SoundToggle() {
  const [state, setState] = useState<SoundState>(read)

  useEffect(() => claimEventMusic(), [])

  const onClick = () => {
    const snd = eventMusic()
    if (!snd.isOpen) {
      // Первый запуск (или после закрытия): включаем со звуком, даже если раньше звук был выключен.
      snd.setMuted(false)
      void snd.open()
    } else {
      snd.toggleMuted()
    }
    setState(read())
  }

  // Рисуем в body, как и барабан: прямым потомкам .theme-noir общий стиль задаёт position: relative (index.css), он перебил бы fixed.
  return createPortal(
    <button type="button" className="noir-snd" data-state={state} aria-label="Музыка вечера" aria-pressed={state === 'on'} title={state === 'on' ? 'Выключить звук' : 'Включить музыку'} onClick={onClick}>
      <span className="noir-snd-eq" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>Музыка вечера</span>
    </button>,
    document.body,
  )
}
