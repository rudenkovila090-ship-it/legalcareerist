import { useMemo, type CSSProperties } from 'react'
import '../../pages/events/noir.css'

// Детерминированный «случайный» ряд — чтобы частицы не прыгали при каждой перерисовке.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Пылинки в луче света: медленно поднимаются в шапке. */
export function NoirDust({ count = 22 }: { count?: number }) {
  const dots = useMemo(() => {
    const rnd = seeded(7)
    return Array.from({ length: count }, () => ({
      left: `${(rnd() * 100).toFixed(1)}%`,
      size: 1 + rnd() * 2.4,
      dur: 9 + rnd() * 12,
      delay: -rnd() * 20,
      drift: (rnd() - 0.5) * 60,
    }))
  }, [count])
  return (
    <div className="noir-dust" aria-hidden="true">
      {dots.map((d, i) => (
        <i key={i} style={{ left: d.left, width: d.size, height: d.size, '--t': `${d.dur}s`, '--dl': `${d.delay}s`, '--dr': `${d.drift}px` } as CSSProperties} />
      ))}
    </div>
  )
}

/** Бегущая строка между шапкой и текстом: девиз вечера. */
export function NoirMarquee({ items }: { items: string[] }) {
  const line = items.join('  ◆  ')
  return (
    <div className="noir-marquee" aria-hidden="true">
      <div className="noir-marquee-track">
        <span>{line}  ◆  </span>
        <span>{line}  ◆  </span>
      </div>
    </div>
  )
}

/** Плёночное зерно поверх страницы (едва заметное, мерцает). */
export function NoirGrain() {
  return <div className="noir-grain" aria-hidden="true" />
}
