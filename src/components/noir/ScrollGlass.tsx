import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { prefersReducedMotion } from '../../lib/motion'
import '../../pages/events/noir.css'

/**
 * Бокал виски со льдом скользит вдоль правого края вместе с прокруткой (как бегунок), чуть запаздывая за ней.
 * Жидкость плещется от резкой прокрутки: поверхность наклоняется пружиной и затухает, лёд покачивается.
 * Рисуется в body через портал (position: fixed), позиции пишутся напрямую в DOM — без перерисовки React.
 */
export default function ScrollGlass() {
  const wrap = useRef<HTMLDivElement>(null)
  const liquid = useRef<SVGGElement>(null)
  const ice = useRef<SVGGElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el || prefersReducedMotion()) return
    let pos = 0
    let lastY = scrollY
    let speed = 0
    let angle = 0
    let angleSpeed = 0
    let raf = 0

    const frame = () => {
      raf = 0
      const y = scrollY
      speed += (y - lastY - speed) * 0.25
      lastY = y
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
      const h = el.offsetHeight
      const top = 24
      const target = top + (y / max) * Math.max(0, innerHeight - top - h - 16)
      pos += (target - pos) * 0.14
      // Жидкость отстаёт от стакана: наклон против направления прокрутки, дальше пружина с затуханием.
      angleSpeed += (Math.max(-20, Math.min(20, -speed * 0.9)) - angle) * 0.12
      angleSpeed *= 0.86
      angle = Math.max(-26, Math.min(26, angle + angleSpeed))
      const sway = Math.sin(y / 260) * 3
      el.style.transform = `translate3d(${sway.toFixed(1)}px, ${pos.toFixed(1)}px, 0) rotate(${(speed * 0.35).toFixed(2)}deg)`
      liquid.current?.setAttribute('transform', `rotate(${angle.toFixed(2)} 50 66)`)
      ice.current?.setAttribute('transform', `translate(${(angle * 0.9).toFixed(1)} ${(Math.abs(angle) * -0.25).toFixed(1)})`)
      if (Math.abs(target - pos) > 0.2 || Math.abs(speed) > 0.05 || Math.abs(angleSpeed) > 0.02 || Math.abs(angle) > 0.05) raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    frame()
    addEventListener('scroll', wake, { passive: true })
    addEventListener('resize', wake)
    return () => {
      removeEventListener('scroll', wake)
      removeEventListener('resize', wake)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return createPortal(
    <div ref={wrap} className="noir-glass" aria-hidden="true">
      <svg viewBox="0 0 100 150" className="block h-auto w-full overflow-visible">
        <defs>
          <clipPath id="noir-glass-inner">
            <path d="M15 34 H85 L79 133 Q79 138 74 138 H26 Q21 138 21 133 Z" />
          </clipPath>
          <linearGradient id="noir-whisky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e8a24a" />
            <stop offset="0.55" stopColor="#b9631d" />
            <stop offset="1" stopColor="#6b2a0b" />
          </linearGradient>
          <linearGradient id="noir-glass-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* лёд и виски внутри стакана */}
        <g clipPath="url(#noir-glass-inner)">
          <g ref={liquid} transform="rotate(0 50 66)">
            <rect x="-40" y="66" width="180" height="120" fill="url(#noir-whisky)" />
            <ellipse cx="50" cy="66" rx="40" ry="4.5" fill="#f3b865" fillOpacity="0.75" />
          </g>
          <g ref={ice}>
            <g className="noir-ice noir-ice-a">
              <rect x="26" y="58" width="24" height="24" rx="4" transform="rotate(-12 38 70)" fill="#dcecff" fillOpacity="0.32" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
              <path d="M30 63 L40 61" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />
            </g>
            <g className="noir-ice noir-ice-b">
              <rect x="50" y="68" width="22" height="22" rx="4" transform="rotate(14 61 79)" fill="#dcecff" fillOpacity="0.28" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" />
              <path d="M55 73 L64 74" stroke="#fff" strokeOpacity="0.65" strokeWidth="1.4" strokeLinecap="round" />
            </g>
            <g className="noir-ice noir-ice-c">
              <rect x="36" y="86" width="20" height="20" rx="4" transform="rotate(-6 46 96)" fill="#dcecff" fillOpacity="0.24" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
            </g>
          </g>
        </g>

        {/* стекло: толстое дно, блики, кромка */}
        <path d="M15 34 H85 L79 133 Q79 138 74 138 H26 Q21 138 21 133 Z" fill="#eadfc8" fillOpacity="0.06" stroke="#eadfc8" strokeOpacity="0.6" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M21 118 H79" stroke="#eadfc8" strokeOpacity="0.28" strokeWidth="1" />
        <path d="M22 40 L26 128" stroke="url(#noir-glass-shine)" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="50" cy="34" rx="35" ry="4.5" fill="none" stroke="#eadfc8" strokeOpacity="0.7" strokeWidth="1.4" />
      </svg>
    </div>,
    document.body,
  )
}
