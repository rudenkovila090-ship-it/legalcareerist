import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { prefersReducedMotion } from '../../lib/motion'
import '../../pages/events/noir.css'

// Шесть камор барабана по кругу; в двух — патроны.
const CHAMBERS = [0, 1, 2, 3, 4, 5].map((k) => {
  const a = (k * 60 - 90) * (Math.PI / 180)
  return { x: Math.cos(a) * 27, y: Math.sin(a) * 27, deg: k * 60, loaded: k === 0 || k === 3 }
})

/**
 * Барабан револьвера у правого края страницы: крутится, когда страницу прокручивают (с инерцией —
 * разгоняется от прокрутки и чуть доворачивает после остановки). Рисуется в body через портал.
 */
export default function ScrollCylinder() {
  const wheel = useRef<SVGGElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    let angle = 0
    let speed = 0
    let raf = 0
    const frame = () => {
      raf = 0
      const target = scrollY * 0.45
      speed += (target - angle) * 0.045
      speed *= 0.84
      angle += speed
      wheel.current?.setAttribute('transform', `rotate(${angle.toFixed(2)})`)
      if (Math.abs(target - angle) > 0.05 || Math.abs(speed) > 0.02) raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    angle = scrollY * 0.45
    frame()
    addEventListener('scroll', wake, { passive: true })
    return () => {
      removeEventListener('scroll', wake)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return createPortal(
    <div className="noir-cyl" aria-hidden="true">
      <svg viewBox="-50 -50 100 100" className="block h-auto w-full overflow-visible">
        <defs>
          <radialGradient id="cyl-steel" cx="0.38" cy="0.32" r="0.85">
            <stop offset="0" stopColor="#6b6b73" />
            <stop offset="0.55" stopColor="#35353b" />
            <stop offset="1" stopColor="#17171b" />
          </radialGradient>
          <radialGradient id="cyl-brass" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#f3d38a" />
            <stop offset="0.6" stopColor="#c08a2e" />
            <stop offset="1" stopColor="#6f4812" />
          </radialGradient>
        </defs>
        <g ref={wheel}>
          <circle r={47} fill="url(#cyl-steel)" stroke="#eadfc8" strokeOpacity={0.55} strokeWidth={1.4} />
          {/* продольные канавки по ободу между камерами */}
          {CHAMBERS.map((c) => (
            <rect key={`f${c.deg}`} x={-3.4} y={-47.5} width={6.8} height={13} rx={3.4} fill="#0a0a0c" opacity={0.9} transform={`rotate(${c.deg + 30})`} />
          ))}
          <circle r={37} fill="none" stroke="#eadfc8" strokeOpacity={0.12} strokeWidth={0.8} />
          {CHAMBERS.map((c) => (
            <g key={c.deg} transform={`translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`}>
              <circle r={11.4} fill="#050506" stroke="#9a9aa3" strokeOpacity={0.7} strokeWidth={1.4} />
              {c.loaded ? (
                <>
                  <circle r={8.6} fill="url(#cyl-brass)" stroke="#5c3b0d" strokeWidth={0.8} />
                  <circle r={3.3} fill="#a9751f" stroke="#4b3009" strokeWidth={0.8} />
                  <circle r={1.1} cx={-0.8} cy={-0.8} fill="#f6dea0" opacity={0.8} />
                </>
              ) : (
                <circle r={8} fill="none" stroke="#3a3a42" strokeWidth={1} />
              )}
            </g>
          ))}
          {/* ступица и звёздочка экстрактора */}
          <circle r={9.4} fill="#1d1d22" stroke="#eadfc8" strokeOpacity={0.35} strokeWidth={1} />
          <path d="M0 -8 L2.4 -2.6 L8 -2.4 L3.6 1.2 L5 7 L0 3.8 L-5 7 L-3.6 1.2 L-8 -2.4 L-2.4 -2.6 Z" fill="#3b3b43" stroke="#eadfc8" strokeOpacity={0.3} strokeWidth={0.6} />
          <circle r={2.4} fill="#08080a" />
        </g>
        {/* неподвижный блик поверх вращающегося барабана */}
        <ellipse cx={-14} cy={-22} rx={20} ry={9} transform="rotate(-35 -14 -22)" fill="#fff" opacity={0.06} />
      </svg>
    </div>,
    document.body,
  )
}
