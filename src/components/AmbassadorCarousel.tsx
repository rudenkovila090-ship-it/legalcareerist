import { useId, useLayoutEffect, useRef, useState } from 'react'

export interface Ambassador {
  id: number
  lastName: string
  firstName: string
  university?: string
  universityNote?: string
  photo?: string
  role?: string
}

export default function AmbassadorCarousel({ items }: { items: Ambassador[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const metrics = useRef<{ step: number; cycle: number } | null>(null)
  const logicalIndex = useRef(0)
  const [currentIndex, setCurrentIndex] = useState(0)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track || !items.length) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const normalize = () => {
      const value = metrics.current
      if (!value) return
      const first = track.querySelector<HTMLElement>('article')
      const middle = track.querySelector<HTMLElement>('[data-loop-copy="1"] article')
      // Resize can dispatch scrollend before ResizeObserver has recalculated the cycle.
      if (!first || !middle || Math.abs(middle.getBoundingClientRect().left - first.getBoundingClientRect().left - value.cycle) > 0.5) return
      const position = ((track.scrollLeft % value.cycle) + value.cycle) % value.cycle
      if (track.scrollLeft < value.cycle - 0.5 || track.scrollLeft >= value.cycle * 2 - 0.5) {
        // The surrounding copies are identical: recenter after scrolling settles.
        track.scrollTo({ left: value.cycle + position, behavior: 'instant' })
      }
      logicalIndex.current = Math.round(position / value.step) % items.length
      setCurrentIndex(logicalIndex.current)
    }
    const measure = () => {
      const first = track.querySelector<HTMLElement>('article')
      const middle = track.querySelector<HTMLElement>('[data-loop-copy="1"] article')
      if (!first || !middle) return
      const index = logicalIndex.current % items.length
      const cycle = middle.getBoundingClientRect().left - first.getBoundingClientRect().left
      if (cycle <= 0) return
      metrics.current = { step: cycle / items.length, cycle }
      track.scrollTo({ left: cycle + index * cycle / items.length, behavior: 'instant' })
    }
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(normalize, 150)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    track.addEventListener('scroll', onScroll, { passive: true })
    track.addEventListener('scrollend', normalize)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      track.removeEventListener('scroll', onScroll)
      track.removeEventListener('scrollend', normalize)
    }
  }, [items.length])

  function move(direction: number) {
    const track = trackRef.current
    const value = metrics.current
    if (!track || !value) return
    track.scrollBy({
      left: direction * value.step,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h2 id={`${id}-title`} className="text-2xl font-semibold sm:text-3xl">Амбассадоры</h2>
        <div className="flex shrink-0 gap-2">
          {[
            { direction: -1, label: 'Предыдущие амбассадоры', enabled: items.length > 1, path: 'M15 18 9 12l6-6' },
            { direction: 1, label: 'Следующие амбассадоры', enabled: items.length > 1, path: 'm9 18 6-6-6-6' },
          ].map((control) => (
            <button key={control.direction} type="button" aria-label={control.label} aria-controls={`${id}-track`} disabled={!control.enabled} onClick={() => move(control.direction)} className="community-carousel-arrow flex h-10 w-10 items-center justify-center rounded-full border border-ink/15 text-ink hover:bg-ink/[0.04] disabled:cursor-default disabled:opacity-30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d={control.path} /></svg>
            </button>
          ))}
        </div>
      </div>
      <div ref={trackRef} id={`${id}-track`} role="region" aria-roledescription="карусель" aria-labelledby={`${id}-title`} tabIndex={0} onKeyDown={(event) => {
        if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }} className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto overscroll-x-contain pb-2 outline-offset-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[0, 1, 2].map((copy) => (
          <div key={copy} data-loop-copy={copy} aria-hidden={copy !== 1 ? true : undefined} inert={copy !== 1 ? true : undefined} className="contents">
        {items.map((ambassador) => (
          <article key={ambassador.id} aria-label={`Карточка амбассадора ${ambassador.id}: ${ambassador.lastName} ${ambassador.firstName}`} data-ambassador-id={ambassador.id} className="community-ambassador-card min-w-0 shrink-0 basis-full snap-start overflow-hidden rounded-2xl border border-ink/10 bg-white min-[390px]:basis-[85%] sm:basis-[calc((100%_-_1rem)/2)] md:basis-[calc((100%_-_2rem)/3)] lg:basis-[calc((100%_-_4rem)/5)]">
            <div className="aspect-[3/4] overflow-hidden bg-gradient-to-b from-accent/10 to-accent/[0.02]">
              {ambassador.photo ? (
                <img src={ambassador.photo} alt={`${ambassador.lastName} ${ambassador.firstName}`} className="h-full w-full object-contain object-bottom" loading="lazy" />
              ) : (
                <div role="img" aria-label="Место для фотографии амбассадора" className="flex h-full flex-col items-center justify-center gap-3 text-ink/30">
                  <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-14 w-14" aria-hidden="true"><circle cx="32" cy="22" r="10" /><path d="M13 56c0-12 8-20 19-20s19 8 19 20" /></svg>
                  <span className="text-xs">Фото</span>
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="text-base font-semibold leading-snug sm:text-lg"><span className="block">{ambassador.lastName}</span><span className="block">{ambassador.firstName}</span></h3>
              {ambassador.university && <p className="mt-3 text-xs leading-5 text-ink/60">{ambassador.university}{ambassador.universityNote && <span className="block whitespace-nowrap">{ambassador.universityNote}</span>}</p>}
              {ambassador.role && <p className="mt-2 text-xs leading-5 text-ink/70">{ambassador.role}</p>}
            </div>
          </article>
        ))}
          </div>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">Амбассадор {currentIndex + 1} из {items.length}. Лента циклическая.</p>
    </>
  )
}
