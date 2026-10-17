import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
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

// Значки намеренно угловатые и «поломанные» (трещины, перечёркивания, меловой контур) — никаких круглых добрых форм.
const ICONS: Record<IconName, ReactNode> = {
  // пластинка с трещиной
  jazz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 3 L10.4 8.4 L13.6 11 L11 15.6 L12.6 21" />
    </>
  ),
  // меловой контур тела
  murder: (
    <g strokeDasharray="4 2.4">
      <circle cx="12" cy="4.2" r="2.2" />
      <path d="M9.6 7.2 L4.4 9.6 L5.6 11.8 L9.6 10.6 L9 16.6 L6.8 21.4 L9.2 22 L12 16.8 L14.8 22 L17.2 21.4 L15 16.6 L14.4 10.6 L18.4 11.8 L19.6 9.6 L14.4 7.2 Z" />
    </g>
  ),
  // мешок с разрезом
  robbery: (
    <>
      <path d="M8.5 3.5 L15.5 3.5 L14 7 L18.5 13.5 L16.5 20 L7.5 20 L5.5 13.5 L10 7 Z" />
      <path d="M9.6 7 L14.4 7" />
      <path d="M4.5 19.5 L19.5 5" />
    </>
  ),
  // щит с трещиной
  police: (
    <>
      <path d="M12 3 L19.5 6 L19 12.5 L12 21 L5 12.5 L4.5 6 Z" />
      <path d="M12 3 L13.4 8.2 L10.8 11.4 L13 15.5 L12 21" />
    </>
  ),
  // решётка с выломанным прутом
  prison: (
    <>
      <path d="M5 4 H19 V20 H5 Z" />
      <path d="M9 4 V20 M15 4 V20" />
      <path d="M12 4 L10.5 12 L13.5 20" />
    </>
  ),
  // заколоченный дом
  asylum: (
    <>
      <path d="M4 20 V9.5 L12 4 L20 9.5 V20 Z" />
      <path d="M4.5 13 L19.5 17.5 M4.5 17.5 L19.5 13" />
    </>
  ),
  // шляпа
  clans: (
    <>
      <path d="M2.5 17.5 L21.5 17.5" />
      <path d="M6.2 17.5 L7.5 9 L10.5 7 L12 8.5 L13.5 7 L16.5 9 L17.8 17.5" />
      <path d="M6.8 13.5 H17.2" />
    </>
  ),
  // ящик, перечёркнутый крест-накрест
  warehouse: (
    <>
      <path d="M4 6 H20 V19 H4 Z" />
      <path d="M4 6 L20 19 M20 6 L4 19" />
    </>
  ),
  // якорь
  port: (
    <>
      <circle cx="12" cy="5.2" r="1.7" />
      <path d="M12 6.9 V19.5 M8 9.5 H16" />
      <path d="M4.5 13.5 L7 17.5 L12 19.5 L17 17.5 L19.5 13.5" />
    </>
  ),
  // пиковый туз
  casino: <path d="M12 3 L19 12.5 L16.5 16.3 L13.2 14.8 L14.2 20.5 H9.8 L10.8 14.8 L7.5 16.3 L5 12.5 Z" />,
  // банк с трещиной в колонне
  bank: (
    <>
      <path d="M3 9 L12 4 L21 9 Z" />
      <path d="M5.5 10.5 V18 M10 10.5 V18 M19 10.5 V18 M14.5 10.5 L13.8 14 L15.2 18" />
      <path d="M3 20 H21" />
    </>
  ),
  // надгробие
  cemetery: (
    <>
      <path d="M7 20 V10.5 L9 6.5 L15 6.5 L17 10.5 V20 Z" />
      <path d="M12 9 V15 M9.5 11.5 H14.5" />
      <path d="M3.5 20 H20.5" />
    </>
  ),
  // прицел с пробоиной
  shootout: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22" />
      <path d="M10 12 L12 10 L14 12 L12 14 Z" className="cm-fill" />
    </>
  ),
  // глаз, зачёркнутый чёрной полосой
  witness: (
    <>
      <path d="M2 12 C5 6.5 8.5 5 12 5 S19 6.5 22 12 C19 17.5 15.5 19 12 19 S5 17.5 2 12 Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9.5 V14.5" />
      <path d="M3.5 20.5 L20.5 3.5" />
    </>
  ),
  // запертая дверь с замочной скважиной
  club: (
    <>
      <path d="M6 20 V5.5 H18 V20 Z" />
      <circle cx="12" cy="10.8" r="1.6" />
      <path d="M12 12.4 V16.4" />
    </>
  ),
}

/** Кольцо, обведённое от руки жирным карандашом: неровное, не замкнутое, штрихом в два прохода. */
function ring(r: number, spin: number): string {
  const n = 11
  const pts: [number, number][] = []
  const start = spin * Math.PI * 2
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * Math.PI * 2 * 1.04
    const rr = r * (0.9 + rnd() * 0.2)
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  return d
}

/** Неровное пятно (засохшая лужа) под красными метками. */
function stain(r: number): string {
  const n = 9
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r * (0.55 + rnd() * 0.6)
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.8])
  }
  let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const nx = pts[(i + 1) % n]
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${((pts[i][0] + nx[0]) / 2).toFixed(1)} ${((pts[i][1] + nx[1]) / 2).toFixed(1)}`
  }
  return d + ' Z'
}

// Формы считаем один раз при загрузке — они не меняются между рендерами.
const SHAPES = Object.fromEntries(
  MARKS.map((m) => [m.id, { ringA: ring(m.id === 'jazz' ? 24 : 19, rnd()), ringB: ring(m.id === 'jazz' ? 25.5 : 20.5, rnd()), stain: m.tone === 'red' ? stain(30) : '' }]),
) as Record<string, { ringA: string; ringB: string; stain: string }>

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
          <defs>
            {/* Дрожь контура: кольца — сильнее (грубый карандаш), значки — слабее, чтобы оставались читаемыми. */}
            <filter id="cm-rough" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence type="fractalNoise" baseFrequency="0.085" numOctaves="2" seed="11" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="cm-rough-fine" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence type="fractalNoise" baseFrequency="0.14" numOctaves="2" seed="5" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
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
          {MARKS.map((m, i) => {
            const sh = SHAPES[m.id]
            const labelW = m.label.length * 7.3 + 18
            return (
              <g key={m.id} data-at={m.at} className={`cm-m cm-${m.tone}`} transform={`translate(${m.x} ${m.y})`} style={{ '--cd': `${7 + ((i * 13) % 6)}s`, '--cdl': `-${(i * 29) % 11}s` } as CSSProperties}>
                <g>
                  {sh.stain && <path d={sh.stain} className="cm-stain" />}
                  {m.id === 'jazz' && <circle r={34} className="cm-glow" />}
                  <g className="cm-sign">
                    <g filter="url(#cm-rough)">
                      <circle r={m.id === 'jazz' ? 22 : 17} className="cm-disc" />
                      <path d={sh.ringA} className="cm-loop" />
                      <path d={sh.ringB} className="cm-loop cm-loop-2" />
                    </g>
                    <g filter="url(#cm-rough-fine)">
                      <g transform="translate(-13.2 -13.2) scale(1.1)" fill="none" strokeWidth={1.8} strokeLinecap="butt" strokeLinejoin="miter" className="cm-icon">
                        {ICONS[m.icon]}
                      </g>
                    </g>
                  </g>
                  <g transform={`translate(0 ${m.id === 'jazz' ? 40 : 34})`}>
                    <rect x={-labelW / 2} y={-9.5} width={labelW} height={16} className="cm-redact" />
                    <text y={2.5} textAnchor="middle" className="cm-label">
                      {m.label.toUpperCase()}
                    </text>
                  </g>
                </g>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="cm-vignette" />
    </div>
  )
}
