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
  // Пока идет программный смус-скролл после клика по пункту меню,
  // IntersectionObserver может успеть отдать промежуточное, «пролетное»
  // состояние (сразу несколько секций частично видимы) и перебить
  // выделение на не тот пункт. Блокируем наблюдатель на время скролла и
  // снимаем блокировку только когда позиция страницы стабилизируется.
  const suppressUntilRef = useRef(0)

  useEffect(() => {
    ref.current = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressUntilRef.current) return
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
                const el = document.getElementById(item.id)
                if (!el) return
                // Выделяем нажатый пункт сразу (не ждем наблюдатель) и
                // глушим его на время анимации скролла, чтобы он не перебил
                // выбор промежуточным состоянием.
                setActive(item.id)
                suppressUntilRef.current = Date.now() + 900
                // Учитываем высоту закрепленной шапки (+подкадровой панели
                // аудитории) — иначе scrollIntoView прячет начало раздела под
                // ней, и кажется, что открылся более нижний блок страницы.
                const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0
                const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16
                window.scrollTo({ top, behavior: 'smooth' })
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
