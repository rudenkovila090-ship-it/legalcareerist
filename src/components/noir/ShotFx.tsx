import { useEffect, useRef, useState, type CSSProperties } from 'react'
import '../../pages/events/noir.css'

type Pt = [number, number]

/** Трещина — заострённый клин вдоль ломаной: у пробоины широкий, на конце сходит на нет. */
function wedge(points: Pt[], w0: number): string {
  const left: string[] = []
  const right: string[] = []
  points.forEach(([x, y], i) => {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const dx = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const w = w0 * (1 - i / (points.length - 1))
    left.push(`${(x - (dy / len) * w).toFixed(2)} ${(y + (dx / len) * w).toFixed(2)}`)
    right.unshift(`${(x + (dy / len) * w).toFixed(2)} ${(y - (dx / len) * w).toFixed(2)}`)
  })
  return `M${left.join(' L')} L${right.join(' L')} Z`
}

// Главные трещины и короткие ответвления в квадрате 120×120 вокруг точки попадания.
const CRACKS: { d: string; main: boolean }[] = [
  [[[0, 0], [6, -3], [10, -3], [17, -10], [20, -10], [27, -20]], 1.3],
  [[[0, 0], [8, 2], [15, 1], [22, 6], [28, 5]], 1.1],
  [[[0, 0], [2, 7], [0, 14], [5, 21], [4, 31]], 1.2],
  [[[0, 0], [-5, 5], [-10, 5], [-15, 13], [-20, 14], [-27, 23]], 1.2],
  [[[0, 0], [-8, -1], [-14, -4], [-20, -3]], 1],
  [[[0, 0], [-3, -7], [-7, -11], [-6, -19]], 1],
].map(([pts, w]) => ({ d: wedge(pts as Pt[], w as number), main: true })).concat(
  [
    [[[15, 1], [19, -4], [25, -5]], 0.6],
    [[[-10, 5], [-12, 11], [-10, 18]], 0.55],
  ].map(([pts, w]) => ({ d: wedge(pts as Pt[], w as number), main: false })),
)

const HOLE = 'M-5.2 -1.2 L-3.4 -4.8 L-0.4 -3.4 L3.2 -5.4 L5.4 -1.1 L3.6 2.4 L4.4 5.2 L0.6 4 L-3.2 5.4 L-3.8 2 Z'
const CHIP = 'M-8.6 -1.8 L-5.4 -7.2 L-0.8 -5.6 L4.6 -8.4 L8.4 -2 L6 3.8 L7.6 8 L1 6.4 L-5 8.6 L-6 3.2 Z'

// Осколки: куда летят (px при size = 1).
const DEBRIS: [number, number][] = [[-22, -26], [26, -18], [30, 16], [-26, 20], [8, 32], [-12, -34]]
// Мягкие клубы дыма: смещение, длительность, задержка, размер.
const PUFFS = [
  { dx: -10, dur: 4.8, delay: 0.6, size: 26 },
  { dx: 12, dur: 5.6, delay: 1.0, size: 32 },
  { dx: -4, dur: 6.2, delay: 1.6, size: 24 },
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

/** Выстрел: вспышка, пробоина с острыми трещинами и копотью, осколки и тонкий дымок. Всё на CSS, запускается при появлении в DOM. */
export function ShotFx({ x, y, size = 1, flash = true }: ShotFxProps) {
  return (
    <div className="shot" style={{ left: x, top: y, '--s': size } as CSSProperties} aria-hidden="true">
      {flash && <div className="shot-burst" />}
      <svg className="shot-svg" viewBox="-60 -60 120 120" width={150 * size} height={150 * size}>
        <defs>
          <radialGradient id="shot-soot">
            <stop offset="0" stopColor="#000" stopOpacity="0.6" />
            <stop offset="0.55" stopColor="#000" stopOpacity="0.25" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="shot-soot" r={26} fill="url(#shot-soot)" />
        {CRACKS.map((c, i) => (
          <g key={i} className="shot-crack" style={{ '--i': i } as CSSProperties}>
            <path d={c.d} transform="translate(0.9 0.9)" fill="#000" fillOpacity={0.55} />
            <path d={c.d} fill="#eadfc8" fillOpacity={c.main ? 0.62 : 0.45} />
          </g>
        ))}
        <path d={CHIP} fill="#eadfc8" fillOpacity={0.34} />
        <path className="shot-hole" d={HOLE} fill="#050203" />
      </svg>
      <div className="shot-debris">
        {DEBRIS.map(([dx, dy], i) => (
          <i key={i} style={{ '--dx': `${dx * size}px`, '--dy': `${dy * size}px`, '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="shot-smoke">
        {[0, 1].map((i) => (
          <svg key={i} className="shot-wisp" viewBox="0 0 40 120" style={{ '--sx': `${(i ? 7 : -6) * size}px`, '--wd': `${0.35 + i * 0.5}s`, width: 26 * size, height: 78 * size } as CSSProperties}>
            <path d="M20 118 C 12 96, 30 84, 20 64 S 10 36, 24 18 S 22 4, 20 0" pathLength={1} fill="none" stroke="#eadfc8" strokeWidth={3.2} strokeLinecap="round" />
          </svg>
        ))}
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
