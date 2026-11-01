import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import '../../pages/events/noir.css'

export type RevealVariant = 'up' | 'left' | 'right' | 'zoom' | 'fade'

interface RevealProps {
  children: ReactNode
  variant?: RevealVariant
  /** Задержка появления, мс — для «лесенки» из нескольких блоков. */
  delay?: number
  className?: string
}

/** Блок плавно выезжает, когда доходит до экрана (один раз). Анимация — в noir.css, при «меньше движения» блок виден сразу. */
export default function Reveal({ children, variant = 'up', delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      node.setAttribute('data-in', '')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          node.setAttribute('data-in', '')
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} data-v={variant} className={`rv ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  )
}
