import type { ReactNode } from 'react'

// Значки закрытой базы знаний: тонкая линия, как во всём кабинете. Названия значков раздела задаёт автор в `icon:` страницы.
const ICONS: Record<string, ReactNode> = {
  flag: <path d="M6 20V4.5M6 5h11l-2 3.5 2 3.5H6" />,
  briefcase: <><rect x="4" y="7.5" width="16" height="12" rx="2" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M4 12.5h16" /></>,
  scales: <><path d="M12 4v16M7 20h10M5 8h14" /><path d="m5 8-2.5 6a3 3 0 0 0 5 0L5 8Zm14 0-2.5 6a3 3 0 0 0 5 0L19 8Z" /></>,
  cap: <><path d="m3 9 9-4.5L21 9l-9 4.5L3 9Z" /><path d="M7 11.5V16c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-4.5M21 9v5" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  book: <><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5v-14Z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 8h6" /></>,
  pen: <><path d="M5 19l1-4L16.5 4.5a2 2 0 0 1 3 3L9 18l-4 1Z" /><path d="m14.5 6.5 3 3" /></>,
  spark: <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5Z" />,
  trend: <><path d="M4 17l5-5 3.5 3.5L20 8" /><path d="M15 8h5v5" /></>,
  coins: <><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  leaf: <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" /><path d="M5 19c2-4 5-7 9-9" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 3.5v3.5M14 3.5v3.5M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5" /></>,
  users: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 6.2a3 3 0 0 1 0 5.6M17 14.2c2 .5 3.5 2.2 3.5 4.8" /></>,
  folder: <path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7Z" />,
  doc: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" /><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  star: <path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.7 5.4-.7L12 4Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  link: <><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  collapse: <path d="m7 8 5-4 5 4M7 16l5 4 5-4" />,
  bulb: <><path d="M9 17.5h6M10 20.5h4" /><path d="M12 3.5a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5v.5h5V15c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 12 3.5Z" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  warning: <><path d="M12 4 3 19.5h18L12 4Z" /><path d="M12 10v4.5M12 17h.01" /></>,
  quote: <><path d="M6 17c-1.5-1.2-2.5-3-2.5-5.5C3.5 8 5.5 5.5 9 5v2.2C7.4 7.6 6.8 8.8 6.8 10H10v7H6Z" /><path d="M15 17c-1.5-1.2-2.5-3-2.5-5.5 0-3.5 2-6 5.5-6.5v2.2c-1.6.4-2.2 1.6-2.2 2.8H19v7h-4Z" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4.5l3 1.5" /></>,
  resume: <><circle cx="12" cy="12" r="8.5" /><path d="m10.5 8.8 4.5 3.2-4.5 3.2V8.8Z" /></>,
}

export function KbIcon({ name, fallback = 'doc', className = 'h-[1.125rem] w-[1.125rem]', strokeWidth = 1.6 }: { name?: string; fallback?: string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`} aria-hidden="true">
      {ICONS[name && ICONS[name] ? name : fallback]}
    </svg>
  )
}
