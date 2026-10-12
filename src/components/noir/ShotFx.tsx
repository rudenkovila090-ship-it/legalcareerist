import { useEffect, useRef, useState, type CSSProperties } from 'react'
import '../../pages/events/noir.css'

// Трещины от пули: радиальные линии и два «паутинных» кольца, координаты в квадрате 120×120 вокруг точки попадания.
const RAYS = [
  'M0 0 L9 -6 L17 -8 L30 -20 L38 -22',
  'M0 0 L10 3 L20 2 L31 9 L47 8',
  'M0 0 L8 7 L14 17 L24 22 L33 36',
  'M0 0 L4 11 L3 22 L12 33 L14 46',
  'M0 0 L-6 9 L-14 12 L-22 24 L-27 36',
  'M0 0 L-10 2 L-20 -1 L-33 3 L-48 -4',
  'M0 0 L-5 -9 L-9 -19 L-18 -29 L-20 -44',
  'M0 0 L2 -10 L-1 -24 L5 -38 L4 -52',
]
const RINGS = ['M17 -8 L20 2 L14 17 L3 22 L-14 12 L-20 -1 L-9 -19 L-1 -24 Z', 'M30 -20 L31 9 L24 22 L12 33 L-22 24 L-33 3 L-18 -29 L5 -38 Z']

// Клубы дыма: смещение по горизонтали, длительность, задержка и размер.
const PUFFS = [
  { dx: -14, dur: 4.6, delay: 0.35, size: 34 },
  { dx: 10, dur: 5.2, delay: 0.55, size: 42 },
  { dx: -4, dur: 4.2, delay: 0.8, size: 28 },
  { dx: 18, dur: 5.8, delay: 1.1, size: 36 },
  { dx: -20, dur: 6.4, delay: 1.5, size: 30 },
]

interface ShotFxProps {
  /** Положение точки попадания внутри ближайшего позиционированного родителя («88%», «120px»). */
  x: string
  y: string
  /** Масштаб: 1 — выстрел в шапке, меньше — мелкие. */
  size?: number
  /** Вспышка в точке попадания. */
  flash?: boolean
}

/** Выстрел: вспышка, пробоина с растущими трещинами и немного дыма. Всё на CSS, запускается при появлении в DOM. */
export function ShotFx({ x, y, size = 1, flash = true }: ShotFxProps) {
  return (
    <div className="shot" style={{ left: x, top: y, '--s': size } as CSSProperties} aria-hidden="true">
      {flash && <div className="shot-burst" />}
      <svg className="shot-svg" viewBox="-60 -60 120 120" width={150 * size} height={150 * size}>
        <g className="shot-cracks" fill="none" stroke="#eadfc8" strokeLinecap="round" strokeLinejoin="round">
          {RAYS.map((d, i) => (
            <path key={d} d={d} pathLength={1} strokeWidth={0.75} style={{ '--i': i } as CSSProperties} className="shot-ray" />
          ))}
          {RINGS.map((d, i) => (
            <path key={d} d={d} pathLength={1} strokeWidth={0.45} style={{ '--i': i } as CSSProperties} className="shot-ring" />
          ))}
        </g>
        <g className="shot-hole">
          <circle r={5.6} fill="none" stroke="#eadfc8" strokeOpacity={0.55} strokeWidth={1.2} />
          <circle r={3.6} fill="#050203" />
          <path d="M-7 -2 L-4 -4 L-5 0 Z M6 4 L3 6 L4 2 Z M2 -7 L5 -4 L1 -4 Z" fill="#eadfc8" fillOpacity={0.45} />
        </g>
      </svg>
      <div className="shot-smoke">
        {PUFFS.map((p, i) => (
          <i key={i} style={{ '--dx': `${p.dx * size}px`, '--dur': `${p.dur}s`, '--delay': `${p.delay}s`, width: p.size * size, height: p.size * size } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}

/** Выстрел, который срабатывает, когда место (родитель с position: relative) доходит до экрана. */
export function ShotOnView({ x, y, size, delay = 700 }: { x: string; y: string; size?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [fired, setFired] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    let timer = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          timer = window.setTimeout(() => setFired(true), delay)
          io.disconnect()
        }
      },
      { threshold: 0.9 },
    )
    io.observe(node.parentElement ?? node)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
    }
  }, [delay])

  return (
    <>
      <span ref={ref} className="hidden" />
      {fired && <ShotFx x={x} y={y} size={size} flash={false} />}
    </>
  )
}
