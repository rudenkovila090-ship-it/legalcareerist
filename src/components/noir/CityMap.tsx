import { useEffect, useRef, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import '../../pages/events/noir.css'

// Карта города за текстом: по мере прокрутки «вырисовываются» улицы, появляются метки преступлений и мест,
// между ними протягиваются красные нити, а масштаб отъезжает — чем ниже, тем шире и запутаннее этот мир.

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
const rnd = seeded(20261128)

/** Квартал: сетка улиц, повёрнутая на угол. Горизонтальные и вертикальные улицы — двумя путями (рисуются одним росчерком). */
function patch(cx: number, cy: number, w: number, h: number, deg: number, step: number): [string, string] {
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const P = (x: number, y: number) => `${(cx + x * cos - y * sin).toFixed(1)} ${(cy + x * sin + y * cos).toFixed(1)}`
  let hd = ''
  let vd = ''
  for (let y = -h / 2; y <= h / 2; y += step * (0.8 + rnd() * 0.5)) {
    hd += `M${P(-w / 2 + rnd() * 24, y + (rnd() - 0.5) * 8)} L${P(w / 2 - rnd() * 24, y + (rnd() - 0.5) * 8)} `
  }
  for (let x = -w / 2; x <= w / 2; x += step * (0.8 + rnd() * 0.5)) {
    vd += `M${P(x + (rnd() - 0.5) * 8, -h / 2 + rnd() * 24)} L${P(x + (rnd() - 0.5) * 8, h / 2 - rnd() * 24)} `
  }
  return [hd.trim(), vd.trim()]
}

interface Street {
  d: string
  start: number
  len: number
  kind: 'block' | 'avenue' | 'ring' | 'river' | 'bank'
  shift?: number
}

const PATCHES: [number, number, number, number, number, number, number][] = [
  // cx, cy, w, h, угол, шаг, момент начала (доля прокрутки)
  [800, 520, 620, 380, -4, 74, 0.02],
  [1160, 260, 520, 300, 9, 78, 0.16],
  [400, 300, 520, 340, -14, 80, 0.26],
  [1330, 700, 480, 340, -20, 82, 0.38],
  [250, 760, 460, 320, 16, 84, 0.5],
  [860, 900, 520, 200, 3, 80, 0.6],
]

const STREETS: Street[] = [
  { d: 'M-60 210 C 260 110, 520 400, 820 330 S 1280 520, 1660 770', start: 0, len: 0.4, kind: 'river' },
  { d: 'M-60 210 C 260 110, 520 400, 820 330 S 1280 520, 1660 770', start: 0, len: 0.4, kind: 'bank', shift: -18 },
  { d: 'M-60 210 C 260 110, 520 400, 820 330 S 1280 520, 1660 770', start: 0, len: 0.4, kind: 'bank', shift: 18 },
  ...PATCHES.flatMap(([cx, cy, w, h, deg, step, start]) => {
    const [hd, vd] = patch(cx, cy, w, h, deg, step)
    return [
      { d: hd, start, len: 0.3, kind: 'block' as const },
      { d: vd, start: start + 0.03, len: 0.3, kind: 'block' as const },
    ]
  }),
  { d: 'M40 80 C 400 250, 600 420, 800 500 S 1250 760, 1560 940', start: 0.05, len: 0.5, kind: 'avenue' },
  { d: 'M1560 90 C 1200 240, 1000 400, 800 500 S 400 760, 40 930', start: 0.1, len: 0.5, kind: 'avenue' },
  { d: 'M0 520 C 300 480, 500 560, 800 510 S 1300 450, 1600 520', start: 0.08, len: 0.45, kind: 'avenue' },
  { d: 'M800 -20 C 760 250, 840 380, 800 500 S 760 800, 820 1020', start: 0.12, len: 0.45, kind: 'avenue' },
  { d: 'M540 500 A260 170 0 1 1 1060 500 A260 170 0 1 1 540 500', start: 0.1, len: 0.3, kind: 'ring' },
  { d: 'M330 500 A470 320 0 1 1 1270 500 A470 320 0 1 1 330 500', start: 0.3, len: 0.4, kind: 'ring' },
  { d: 'M130 500 A670 450 0 1 1 1470 500 A670 450 0 1 1 130 500', start: 0.55, len: 0.4, kind: 'ring' },
]

type IconName = 'jazz' | 'murder' | 'robbery' | 'police' | 'prison' | 'asylum' | 'clans' | 'warehouse' | 'port' | 'casino' | 'bank' | 'cemetery' | 'shootout' | 'witness' | 'club'

interface Mark {
  id: string
  label: string
  x: number
  y: number
  at: number
  icon: IconName
  tone: 'amber' | 'red' | 'cream'
}

const MARKS: Mark[] = [
  { id: 'jazz', label: 'Джаз-бар', x: 800, y: 500, at: 0.04, icon: 'jazz', tone: 'amber' },
  { id: 'murder', label: 'Убийство', x: 700, y: 420, at: 0.1, icon: 'murder', tone: 'red' },
  { id: 'police', label: 'Полицейский участок', x: 930, y: 570, at: 0.16, icon: 'police', tone: 'cream' },
  { id: 'robbery', label: 'Ограбление', x: 590, y: 610, at: 0.22, icon: 'robbery', tone: 'red' },
  { id: 'clans', label: 'Встреча кланов мафии', x: 1040, y: 400, at: 0.3, icon: 'clans', tone: 'red' },
  { id: 'warehouse', label: 'Склад контрабанды', x: 1210, y: 570, at: 0.38, icon: 'warehouse', tone: 'cream' },
  { id: 'club', label: 'Подпольный клуб', x: 520, y: 380, at: 0.44, icon: 'club', tone: 'amber' },
  { id: 'prison', label: 'Тюрьма', x: 1290, y: 290, at: 0.5, icon: 'prison', tone: 'cream' },
  { id: 'asylum', label: 'Психиатрическая больница', x: 330, y: 320, at: 0.56, icon: 'asylum', tone: 'cream' },
  { id: 'port', label: 'Порт', x: 1420, y: 770, at: 0.62, icon: 'port', tone: 'cream' },
  { id: 'casino', label: 'Казино', x: 430, y: 730, at: 0.68, icon: 'casino', tone: 'amber' },
  { id: 'cemetery', label: 'Кладбище', x: 190, y: 540, at: 0.74, icon: 'cemetery', tone: 'cream' },
  { id: 'shootout', label: 'Перестрелка', x: 1150, y: 830, at: 0.78, icon: 'shootout', tone: 'red' },
  { id: 'bank', label: 'Банк', x: 760, y: 810, at: 0.84, icon: 'bank', tone: 'cream' },
  { id: 'witness', label: 'Свидетель', x: 950, y: 180, at: 0.88, icon: 'witness', tone: 'amber' },
]
const mark = (id: string) => MARKS.find((m) => m.id === id)!

// Красные нити между местами — «всё завязано».
const THREADS: [string, string][] = [
  ['jazz', 'murder'],
  ['jazz', 'police'],
  ['murder', 'robbery'],
  ['police', 'clans'],
  ['clans', 'warehouse'],
  ['murder', 'club'],
  ['warehouse', 'prison'],
  ['club', 'asylum'],
  ['robbery', 'casino'],
  ['asylum', 'cemetery'],
  ['warehouse', 'port'],
  ['port', 'shootout'],
  ['casino', 'bank'],
  ['bank', 'shootout'],
  ['prison', 'witness'],
  ['witness', 'clans'],
  ['cemetery', 'casino'],
  ['police', 'bank'],
]

const ICONS: Record<IconName, ReactNode> = {
  jazz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </>
  ),
  murder: (
    <>
      <circle cx="12" cy="5" r="2.4" />
      <path d="M12 8v7M12 10l-5 3M12 10l5 3M12 15l-4 6M12 15l4 6" strokeDasharray="2 1.6" />
    </>
  ),
  robbery: (
    <>
      <path d="M9 4h6l-1.2 3c2.6 1.200 4.200 3.500 4.200 6.500 0 3.600-2.700 6-6 6s-6-2.400-6-6c0-3 1.600-5.300 4.200-6.500L9 4Z" />
      <path d="M13.500 12.200c-.4-.5-1-.7-1.500-.7-.9 0-1.500.5-1.500 1.100 0 1.600 3 .9 3 2.500 0 .6-.6 1.100-1.500 1.100-.6 0-1.200-.2-1.600-.7" />
    </>
  ),
  police: (
    <>
      <path d="M12 3l7 3v5.500c0 4.500-3 7.500-7 9.500-4-2-7-5-7-9.500V6l7-3Z" />
      <path d="M12 8.500l1.100 2.300 2.500.3-1.800 1.700.5 2.500-2.300-1.300-2.300 1.300.5-2.500-1.800-1.700 2.500-.3L12 8.500Z" />
    </>
  ),
  prison: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 4v16M12 4v16M15 4v16" />
    </>
  ),
  asylum: (
    <>
      <path d="M4 20V9l8-5 8 5v11Z" />
      <path d="M12 10v6M9 13h6" />
    </>
  ),
  clans: (
    <>
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="4.500" r="1.800" />
      <circle cx="12" cy="19.500" r="1.800" />
      <circle cx="4.500" cy="12" r="1.800" />
      <circle cx="19.500" cy="12" r="1.800" />
    </>
  ),
  warehouse: (
    <>
      <rect x="4" y="6" width="16" height="13" />
      <path d="M4 6l16 13M20 6L4 19" />
    </>
  ),
  port: (
    <>
      <circle cx="12" cy="5" r="1.800" />
      <path d="M12 6.800V19M8 10h8M5 14c0 3.500 3 5.500 7 5.500s7-2 7-5.500" />
    </>
  ),
  casino: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="8.500" cy="8.500" r="1" fill="currentColor" />
      <circle cx="15.500" cy="8.500" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="8.500" cy="15.500" r="1" fill="currentColor" />
      <circle cx="15.500" cy="15.500" r="1" fill="currentColor" />
    </>
  ),
  bank: <path d="M3 9l9-5 9 5H3ZM5 10.500v7.500M9.500 10.500v7.500M14.500 10.500v7.500M19 10.500v7.500M3 20h18" />,
  cemetery: (
    <>
      <path d="M7 20V10a5 5 0 0 1 10 0v10H7Z" />
      <path d="M12 8v6M9.500 11h5" />
    </>
  ),
  shootout: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  witness: (
    <>
      <path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7S5 17 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  club: <path d="M5 5h14l-7 8L5 5ZM12 13v6M8 19h8" />,
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

export default function CityMap() {
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    const st = stage.current
    if (!el || !st) return
    const reduced = prefersReducedMotion()
    const drawn = [...el.querySelectorAll<SVGPathElement>('[data-s]')]
    const marks = [...el.querySelectorAll<SVGGElement>('[data-at]')]
    let lastP = -1
    let raf = 0

    const update = () => {
      raf = 0
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
      const p = reduced ? 1 : clamp(scrollY / max)
      if (Math.abs(p - lastP) < 0.0005) return
      lastP = p
      for (const path of drawn) {
        const k = clamp((p - Number(path.dataset.s)) / Number(path.dataset.l))
        path.style.strokeDashoffset = String(1 - k)
      }
      for (const m of marks) m.classList.toggle('on', p >= Number(m.dataset.at))
      // Кадр отъезжает от центра и «едет» по карте — на узких экранах так проходим по всему городу.
      const svgW = Math.max(innerWidth, innerHeight * 1.6)
      const slack = Math.max(0, svgW - innerWidth)
      const scale = reduced ? 1 : 1.5 - 0.5 * (1 - (1 - p) * (1 - p))
      const pan = reduced ? 0 : (0.5 - p) * slack * 0.9
      st.style.transform = `translate(-50%, -50%) translate3d(${pan.toFixed(1)}px, 0, 0) scale(${scale.toFixed(3)})`
      // Карта — фон: приглушена, чтобы текст и форма поверх неё читались.
      el.style.opacity = String(reduced ? 0.5 : Math.min(1, p * 10) * 0.5)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    if (!reduced) {
      addEventListener('scroll', schedule, { passive: true })
      addEventListener('resize', schedule)
    }
    return () => {
      removeEventListener('scroll', schedule)
      removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={root} className="noir-citymap" aria-hidden="true">
      <div ref={stage} className="cm-stage">
        <svg viewBox="0 0 1600 1000" className="cm-svg">
          <g fill="none" strokeLinecap="round">
            {STREETS.map((s, i) => (
              <path key={i} d={s.d} pathLength={1} data-s={s.start} data-l={s.len} className={`cm-street cm-${s.kind}`} transform={s.shift ? `translate(0 ${s.shift})` : undefined} />
            ))}
            {THREADS.map(([a, b], i) => {
              const A = mark(a)
              const B = mark(b)
              const sag = Math.min(60, Math.hypot(B.x - A.x, B.y - A.y) * 0.12)
              const d = `M${A.x} ${A.y} Q${(A.x + B.x) / 2} ${(A.y + B.y) / 2 + sag} ${B.x} ${B.y}`
              return <path key={i} d={d} pathLength={1} data-s={Math.max(A.at, B.at) - 0.01} data-l={0.07} className="cm-thread" />
            })}
          </g>
          {MARKS.map((m) => (
            <g key={m.id} data-at={m.at} className={`cm-m cm-${m.tone}`} transform={`translate(${m.x} ${m.y})`}>
              <g className="cm-pop">
                {m.id === 'jazz' && <circle r={46} className="cm-glow" />}
                {m.tone === 'red' && <circle r={20} className="cm-ping" />}
                <circle r={m.id === 'jazz' ? 23 : 18} className="cm-disc" />
                <g transform={`translate(-12 -12)${m.id === 'jazz' ? ' scale(1)' : ''}`} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="cm-icon">
                  {ICONS[m.icon]}
                </g>
                <text y={m.id === 'jazz' ? 44 : 38} textAnchor="middle" className="cm-label">
                  {m.label.toUpperCase()}
                </text>
              </g>
            </g>
          ))}
        </svg>
      </div>
      <div className="cm-vignette" />
    </div>
  )
}
