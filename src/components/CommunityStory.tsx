import { useEffect, useId, useRef, useState } from 'react'
import storyArt from '../assets/community/mission-layers.webp'

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
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  useEffect(() => {
    const media = window.matchMedia(motionQuery)
    const sync = () => setInteractive(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!interactive) return
    const track = trackRef.current, stage = stageRef.current
    if (!track || !stage) return
    let frame = 0
    const update = () => {
      frame = 0
      const top = Number.parseFloat(getComputedStyle(stage).top) || 0
      const distance = Math.max(1, track.offsetHeight - stage.offsetHeight)
      const progress = clamp((top - track.getBoundingClientRect().top) / distance)
      track.style.setProperty('--layer-second', String(1 - clamp((progress - .16) / .22)))
      track.style.setProperty('--layer-third', String(1 - clamp((progress - .5) / .22)))
      track.style.setProperty('--story-progress', String(progress))
      const next = progress < .38 ? 0 : progress < .72 ? 1 : 2
      if (next !== activeRef.current) {
        activeRef.current = next
        setActive(next)
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
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
          <div ref={stageRef} className="community-story-stage">
            <div className="community-story-copy">
              {interactive && <div className="community-story-tabs" role="tablist" aria-label="Миссия, ценности и цель сообщества">
                {items.map((item, index) => (
                  <button key={item.label} ref={el => { tabRefs.current[index] = el }} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={active === index} aria-controls={`${id}-panel-${index}`} tabIndex={active === index ? 0 : -1} onClick={() => select(index)} onKeyDown={event => {
                    const next = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1
                    if (next < 0) return
                    event.preventDefault()
                    tabRefs.current[next]?.focus()
                    select(next)
                  }}>{item.label}</button>
                ))}
              </div>}
              <div className="community-story-panels">
                {items.map((item, index) => (
                  <article key={item.label} id={`${id}-panel-${index}`} className={`community-story-panel community-story-panel-${index} ${active === index ? 'is-active' : ''}`} role={interactive ? 'tabpanel' : undefined} aria-labelledby={interactive ? `${id}-tab-${index}` : undefined} aria-hidden={interactive && active !== index ? true : undefined} inert={interactive && active !== index ? true : undefined}>
                    <div className="community-story-text">
                      <h2>{item.label}</h2>
                      <p>{item.text}</p>
                      {item.label === 'Ценности' && <ul aria-label="Ценности сообщества — в разработке" className="community-story-values">
                        {Array.from({ length: 4 }, (_, valueIndex) => <li key={valueIndex}>В разработке</li>)}
                      </ul>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <figure className="community-story-art" aria-hidden="true">
              <img src={storyArt} alt="" width="1122" height="1402" loading="lazy" decoding="async" />
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}
