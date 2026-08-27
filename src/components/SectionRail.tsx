import { useEffect, useRef, useState } from 'react'

export interface SectionRailItem {
  id: string
  label: string
}

/**
 * «Прозрачное зеркало» — зафиксированная у левого края стеклянная панель
 * с оглавлением страницы. Подсвечивает текущий раздел по скроллу
 * (IntersectionObserver) и позволяет прыгнуть к любому разделу кликом.
 * Скрыта на узких экранах — на мобильном не хватает места сбоку.
 */
export default function SectionRail({ items, dark }: { items: SectionRailItem[]; dark?: boolean }) {
  const [active, setActive] = useState(items[0]?.id)
  const ref = useRef<HTMLElement[]>([])

  useEffect(() => {
    ref.current = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          const top = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b))
          setActive(top.target.id)
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    )
    ref.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  return (
    <nav
      aria-label="Оглавление раздела"
      className={`fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 xl:block ${dark ? 'glass-dark' : 'glass'} rounded-2xl p-3`}
    >
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active === item.id
                  ? dark
                    ? 'bg-white/15 text-white'
                    : 'bg-ink text-white'
                  : dark
                    ? 'text-white/50 hover:text-white'
                    : 'text-ink/50 hover:text-ink'
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
