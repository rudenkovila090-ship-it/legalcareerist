import { useEffect, useRef } from 'react'

export interface LightboxPhoto {
  src: string
  alt: string
  caption?: string
}

const ctrl = 'flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-xl text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'

/** Просмотр фотографии на весь экран: стрелки и Esc на клавиатуре, кнопки «назад», «вперёд» и «закрыть», клик по фону закрывает. */
export default function Lightbox({ photos, index, onClose, onIndex }: { photos: LightboxPhoto[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const photo = photos[index]
  const prev = (index - 1 + photos.length) % photos.length
  const next = (index + 1) % photos.length

  // прокрутку страницы под окном выключаем, а фокус после закрытия возвращаем на снимок, с которого открывали
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onIndex(prev)
      else if (e.key === 'ArrowRight') onIndex(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, onClose, onIndex])

  if (!photo) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Фотография ${index + 1} из ${photos.length}`}
      className="fixed inset-0 z-50 flex flex-col bg-ink/[0.97] p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex items-center justify-between text-sm text-white/70" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <span className="tabular-nums">{index + 1} / {photos.length}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Закрыть" className={ctrl}>✕</button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        {photos.length > 1 && (
          <button type="button" onClick={() => onIndex(prev)} aria-label="Предыдущее фото" className={`${ctrl} absolute left-0 z-10 sm:left-2`}>‹</button>
        )}
        <img src={photo.src} alt={photo.alt} className="max-h-full max-w-full rounded-lg object-contain" />
        {photos.length > 1 && (
          <button type="button" onClick={() => onIndex(next)} aria-label="Следующее фото" className={`${ctrl} absolute right-0 z-10 sm:right-2`}>›</button>
        )}
      </div>
      {photo.caption && <p className="mt-3 text-center text-sm text-white/80">{photo.caption}</p>}
    </div>
  )
}
