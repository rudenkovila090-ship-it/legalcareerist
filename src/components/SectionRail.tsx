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
      className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block"
    >
      <ul className={`space-y-2.5 rounded-full p-2 ${dark ? 'glass-dark' : 'glass'}`}>
        {items.map((item) => (
          <li key={item.id} className="group relative">
            <a
              href={`#${item.id}`}
              aria-label={item.label}
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
              className="flex items-center justify-center p-0.5"
            >
              <span
                className={`block rounded-full transition-all ${
                  active === item.id
                    ? dark
                      ? 'h-2.5 w-2.5 bg-white'
                      : 'h-2.5 w-2.5 bg-ink'
                    : dark
                      ? 'h-1.5 w-1.5 bg-white/40 group-hover:bg-white/70'
                      : 'h-1.5 w-1.5 bg-ink/30 group-hover:bg-ink/60'
                }`}
              />
            </a>
            {/* Подпись-подсказка — только при наведении/фокусе, не занимает места в макете */}
            <span
              className={`pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
                dark ? 'bg-ink text-white' : 'bg-ink text-white'
              }`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  )
}
