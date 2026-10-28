import { useEffect, useState } from 'react'
import { scrollToHeading, type KbHeading } from '../../lib/kbHeadings'

// «На странице»: содержание справа от статьи с подсветкой текущего раздела при прокрутке (как в Notion и документации).

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

export default function KbOutline({ headings }: { headings: KbHeading[] }) {
  const [active, setActive] = useState('')

  useEffect(() => {
    const ids = headings.map((h) => h.id)
    let frame = 0
    const update = () => {
      frame = 0
      let current = ids[0] ?? ''
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top - 130 <= 0) current = id
        else break
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    frame = window.requestAnimationFrame(update)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [headings])

  return (
    <nav aria-label="На странице" className="text-sm">
      <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink/40">На странице</div>
      <ul className="max-h-[calc(100vh-9rem)] overflow-y-auto border-l border-ink/10">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => { e.preventDefault(); scrollToHeading(h.id) }}
              aria-current={active === h.id ? 'location' : undefined}
              className={`-ml-px block border-l py-1.5 pr-2 leading-snug transition-colors ${h.level === 3 ? 'pl-6 text-[13px]' : 'pl-3'} ${
                active === h.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink/55 hover:border-ink/30 hover:text-ink'
              } ${focusRing}`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
