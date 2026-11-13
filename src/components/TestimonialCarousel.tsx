import { useEffect, useId, useRef, useState } from 'react'
import type { Testimonial } from './Testimonials'

export default function TestimonialCarousel({ items, dark }: { items: Testimonial[]; dark?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [canPrevious, setCanPrevious] = useState(false)
  const [canNext, setCanNext] = useState(false)
  const [selected, setSelected] = useState<Testimonial | null>(null)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const update = () => {
      setCanPrevious(track.scrollLeft > 2)
      setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 2)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(track)
    track.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      track.removeEventListener('scroll', update)
    }
  }, [items.length])

  useEffect(() => {
    if (!selected) return
    const dialog = dialogRef.current
    if (!dialog) return
    const overflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
    }
  }, [selected])

  function move(direction: number) {
    const track = trackRef.current
    const card = track?.firstElementChild
    if (!track || !card) return
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0
    track.scrollBy({
      left: direction * (card.getBoundingClientRect().width + gap),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  return (
    <section className={dark ? 'border-y border-white/10 bg-ink py-14' : 'border-y border-ink/10 bg-white py-14'}>
      <div className="container-page">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className={`mb-2 text-sm font-medium uppercase tracking-wide ${dark ? 'text-gold-light' : 'text-gold'}`}>Отзывы</div>
            <h2 id={`${id}-title`} className={`text-2xl font-semibold ${dark ? 'text-white' : ''}`}>Что говорят о нас</h2>
          </div>
          <div className="flex shrink-0 gap-2">
            {[
              { direction: -1, label: 'Предыдущие отзывы', enabled: canPrevious, path: 'M15 18 9 12l6-6' },
              { direction: 1, label: 'Следующие отзывы', enabled: canNext, path: 'm9 18 6-6-6-6' },
            ].map((control) => (
              <button
                key={control.direction}
                type="button"
                aria-label={control.label}
                aria-controls={`${id}-track`}
                disabled={!control.enabled}
                onClick={() => move(control.direction)}
                className={`flex h-10 w-10 items-center justify-center rounded-full border disabled:cursor-default disabled:opacity-30 ${dark ? 'border-white/20 text-white hover:bg-white/10' : 'border-ink/15 text-ink hover:bg-ink/[0.04]'}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d={control.path} /></svg>
              </button>
            ))}
          </div>
        </div>

        <div
          ref={trackRef}
          id={`${id}-track`}
          role="region"
          aria-roledescription="карусель"
          aria-labelledby={`${id}-title`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
              event.preventDefault()
              move(event.key === 'ArrowLeft' ? -1 : 1)
            }
          }}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 outline-offset-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((testimonial, index) => (
            <figure key={`${testimonial.author}-${index}`} aria-label={`Отзыв: ${testimonial.author}`} className="flex h-80 min-w-0 shrink-0 basis-[85%] snap-start flex-col rounded-2xl bg-[#dbe4f5] p-5 sm:basis-[calc((100%_-_1rem)/2)] md:basis-[calc((100%_-_2rem)/3)]">
              <figcaption className="rounded-xl bg-white/70 px-4 py-3">
                <div className="text-sm font-semibold text-ink">{testimonial.author}</div>
                {(testimonial.role || testimonial.date) && <div className="mt-1 text-xs leading-relaxed text-ink/50">{[testimonial.role, testimonial.date].filter(Boolean).join(' · ')}</div>}
              </figcaption>
              <blockquote className="mt-4 line-clamp-5 text-sm leading-relaxed text-ink/80">{testimonial.text.replace(/\s+/g, ' ')}</blockquote>
              <button type="button" aria-haspopup="dialog" aria-label={`Читать отзыв ${testimonial.author} полностью`} onClick={() => setSelected(testimonial)} className="mt-auto self-start pt-4 text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                Читать полностью
              </button>
            </figure>
          ))}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-dialog-title`}
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          const rect = event.currentTarget.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close()
        }}
        className="fixed m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-ink shadow-xl backdrop:bg-ink/60 sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id={`${id}-dialog-title`} className="text-xl font-semibold">{selected?.author}</h3>
            <p className="mt-1 text-sm text-ink/50">{[selected?.role, selected?.date].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" autoFocus onClick={() => dialogRef.current?.close()} aria-label="Закрыть отзыв" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 text-xl hover:bg-ink/[0.04]">×</button>
        </div>
        <blockquote className="whitespace-pre-line text-sm leading-relaxed text-ink/80 sm:text-base">{selected?.text}</blockquote>
      </dialog>
    </section>
  )
}
