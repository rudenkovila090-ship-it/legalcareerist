import { useEffect, type RefObject } from 'react'
import { prefersReducedMotion } from './motion'

/**
 * Параллакс при прокрутке для «нуарной» страницы: элементы с data-parallax="0.1" внутри корня
 * плывут с другой скоростью, чем страница (множитель × расстояние от центра экрана, не больше data-pmax px).
 * Один слушатель на все элементы, transform пишется напрямую — без перерисовки React.
 */
export function useNoirScroll(root: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = root.current
    if (!enabled || !el || prefersReducedMotion()) return
    let raf = 0
    const update = () => {
      raf = 0
      const half = innerHeight / 2
      for (const node of el.querySelectorAll<HTMLElement>('[data-parallax]')) {
        const factor = Number(node.dataset.parallax)
        const max = Number(node.dataset.pmax ?? 48)
        const applied = Number(node.dataset.py ?? 0)
        const r = node.getBoundingClientRect()
        // Центр без учёта уже применённого сдвига, иначе сдвиг влиял бы сам на себя.
        const center = r.top + r.height / 2 - applied
        if (Math.abs(center - half) > innerHeight * 1.6) continue
        const next = Math.max(-max, Math.min(max, (center - half) * factor))
        node.dataset.py = String(next)
        node.style.transform = `translate3d(0, ${next.toFixed(1)}px, 0)`
      }
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', schedule, { passive: true })
    addEventListener('resize', schedule)
    return () => {
      removeEventListener('scroll', schedule)
      removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [root, enabled])
}
