import type { ReactNode } from 'react'
import type { CharacterIcon } from '../../data/eventStories'

// Иконки ролей вечера (штрихом, в цвет текста) — для карточки дела спикера.
const iconPaths: Record<CharacterIcon, ReactNode> = {
  hat: <path d="M2.5 17.5h19M6 17.5c0-6 2-11 6-11s6 5 6 11M6.4 13.6h11.2" />,
  glass: <path d="M4.5 5h15L12 13.5 4.5 5ZM12 13.5V20M8 20h8" />,
  magnifier: (
    <>
      <circle cx="10.5" cy="10.5" r="5.8" />
      <path d="m15 15 5.5 5.5" />
    </>
  ),
  pearl: (
    <>
      <path d="M12 2.5v4.5" />
      <circle cx="12" cy="13.5" r="5.2" />
      <path d="M9.6 12.3a2.8 2.8 0 0 1 2-1.7" />
    </>
  ),
  scales: <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.6 6a3 3 0 0 0 5.2 0L5 8ZM19 8l-2.6 6a3 3 0 0 0 5.2 0L19 8Z" />,
  key: (
    <>
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M11 12h10M17 12v3M20 12v2.5" />
    </>
  ),
}

export function CharacterGlyph({ icon }: { icon: CharacterIcon }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      {iconPaths[icon]}
    </svg>
  )
}
