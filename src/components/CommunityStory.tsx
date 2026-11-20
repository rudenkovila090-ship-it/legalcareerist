import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

interface StoryItem { label: string; text: string }
const motionQuery = '(min-width: 900px) and (min-height: 600px) and (prefers-reduced-motion: no-preference)'
const clamp = (n: number) => Math.min(1, Math.max(0, n))

/** A short scroll story; narrow screens and reduced motion get all the text in flow. */
export default function CommunityStory({ items }: { items: StoryItem[] }) {
  const [interactive, setInteractive] = useState(() => window.matchMedia(motionQuery).matches)
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    const media = window.matchMedia(motionQuery)
    const sync = () => setInteractive(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useLayoutEffect(() => {
    if (!interactive) return
    const track = trackRef.current, stage = stageRef.current
    if (!track || !stage) return
    let frame = 0
    let alive = true
    const update = () => {
      frame = 0
      const top = Number.parseFloat(getComputedStyle(stage).top) || 0
      const distance = Math.max(1, track.offsetHeight - stage.offsetHeight)
      const progress = clamp((top - track.getBoundingClientRect().top) / distance)
      track.style.setProperty('--layer-second', String(1 - clamp((progress - .16) / .22)))
      track.style.setProperty('--layer-third', String(1 - clamp((progress - .5) / .22)))
      const next = progress < .38 ? 0 : progress < .72 ? 1 : 2
      if (next !== activeRef.current) {
        activeRef.current = next
        setActive(next)
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const measure = () => {
      const heights = Array.from(track.querySelectorAll<HTMLElement>('.community-story-panel')).map(panel => {
        const style = getComputedStyle(panel)
        return (panel.querySelector<HTMLElement>('.community-story-text')?.scrollHeight ?? 0) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2
      })
      track.style.setProperty('--story-panel-height', `${Math.ceil(Math.max(0, ...heights))}px`)
      schedule()
    }
    measure()
    const observer = new ResizeObserver(measure)
    track.querySelectorAll('.community-story-text').forEach(text => observer.observe(text))
    document.fonts.ready.then(() => { if (alive) measure() })
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      alive = false
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', measure)
    }
  }, [interactive])

  function select(index: number) {
    const track = trackRef.current, stage = stageRef.current
    if (!interactive || !track || !stage) return
    const top = Number.parseFloat(getComputedStyle(stage).top) || 0
    const distance = Math.max(1, track.offsetHeight - stage.offsetHeight)
    // Land inside the readable plateau for the requested layer.
    const progress = [0, .44, .82][index]
    window.scrollTo({ top: window.scrollY + track.getBoundingClientRect().top - top + distance * progress, behavior: 'smooth' })
  }

  return (
    <section id="mvc" className={`community-story ${interactive ? 'is-interactive' : 'is-static'}`} data-active-layer={active}>
      <div className="container-page">
        <div ref={trackRef} className="community-story-track">
          <div ref={stageRef} className="community-story-stage" tabIndex={interactive ? 0 : undefined} role={interactive ? 'region' : undefined} aria-label={interactive ? 'Миссия, ценности и цель сообщества' : undefined} aria-describedby={interactive ? `${id}-help` : undefined} onKeyDown={event => {
            if (!interactive) return
            const next = event.key === 'ArrowRight' ? (active + 1) % items.length : event.key === 'ArrowLeft' ? (active + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1
            if (next < 0) return
            event.preventDefault()
            select(next)
          }}>
            {interactive && <p id={`${id}-help`} className="sr-only">Листайте страницу или используйте стрелки влево и вправо, чтобы прочитать три слоя.</p>}
            <div className="community-story-copy">
              <div className="community-story-panels">
                {items.map((item, index) => (
                  <article key={item.label} className={`community-story-panel community-story-panel-${index} ${active === index ? 'is-active' : ''}`} aria-labelledby={`${id}-heading-${index}`} aria-hidden={interactive && active !== index ? true : undefined} inert={interactive && active !== index ? true : undefined}>
                    <div className="community-story-text">
                      <h2 id={`${id}-heading-${index}`}>{item.label}</h2>
                      <p>{item.text}</p>
                      {item.label === 'Ценности' && <ul aria-label="Ценности сообщества — в разработке" className="community-story-values">
                        {Array.from({ length: 4 }, (_, valueIndex) => <li key={valueIndex}>В разработке</li>)}
                      </ul>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
