import { useState, type CSSProperties } from 'react'
import type { EventAudience } from '../../data/eventStories'
import '../../pages/events/noir.css'

// Раскладка фото на стене: [x, y, поворот] в % доски — отдельно для широкого и узкого экрана.
const WIDE: [number, number, number][] = [
  [5, 9, -4],
  [39, 5, 3],
  [73, 10, -3],
  [20, 54, 3],
  [57, 52, -3],
]
const NARROW: [number, number, number][] = [
  [8, 3, -4],
  [60, 6, 3],
  [34, 31, -2],
  [6, 60, 3],
  [60, 63, -3],
]
// Красные нитки между фото (индексы).
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 3],
  [1, 4],
  [2, 4],
  [3, 4],
]

// Булавка — у верхнего края фото. Размеры фото (в % доски) для расчёта точки привязки нитки.
const SIZE = { wide: { w: 20, aspect: 1.6 }, narrow: { w: 32, aspect: 1 / 1.45 } }

function pin(layout: [number, number, number][], i: number, kind: 'wide' | 'narrow'): [number, number] {
  const { w, aspect } = SIZE[kind]
  const [x, y] = layout[i]
  // Нитки рисуем в системе 100 × (100 / aspect): x — % ширины доски, y — % высоты, пересчитанный в те же единицы.
  return [x + w / 2, (y + 1.6) / aspect]
}

function Strings({ layout, kind, active }: { layout: [number, number, number][]; kind: 'wide' | 'narrow'; active: number | null }) {
  const h = 100 / SIZE[kind].aspect
  return (
    <svg className={`eb-lines eb-lines-${kind}`} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {LINKS.map(([a, b], n) => {
        const [x1, y1] = pin(layout, a, kind)
        const [x2, y2] = pin(layout, b, kind)
        const sag = Math.min(4, Math.hypot(x2 - x1, y2 - y1) * 0.08)
        const d = `M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}`
        const hot = active !== null && (active === a || active === b)
        return <path key={n} d={d} pathLength={1} className="eb-string" data-hot={hot ? '' : undefined} style={{ '--d': `${0.25 + n * 0.16}s` } as CSSProperties} />
      })}
    </svg>
  )
}

/**
 * Стена улик: фото-«портреты» в рамках, связанные красными нитками. При наведении (или нажатии на телефоне)
 * фото выходит вперёд, подсвечиваются его нитки и появляется бумажная подпись — для кого этот вечер.
 */
export default function EvidenceBoard({ people }: { people: EventAudience[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const active = hover ?? open

  return (
    <div className="eb">
      <Strings layout={WIDE} kind="wide" active={active} />
      <Strings layout={NARROW} kind="narrow" active={active} />

      {people.map((p, i) => (
        <button
          key={p.who}
          type="button"
          className="eb-card"
          data-active={active === i ? '' : undefined}
          aria-label={p.who}
          aria-pressed={open === i}
          style={{ '--x': WIDE[i][0], '--y': WIDE[i][1], '--r': WIDE[i][2], '--mx': NARROW[i][0], '--my': NARROW[i][1], '--mr': NARROW[i][2], '--n': i } as CSSProperties}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          onClick={() => setOpen((cur) => (cur === i ? null : i))}
        >
          <span className="eb-pin" aria-hidden="true" />
          <span className="eb-frame">
            <img src={p.photo} alt="" draggable={false} className="eb-photo" />
            <span className="eb-tag">{p.who}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
