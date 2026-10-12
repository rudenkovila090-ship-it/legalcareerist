import { useEffect } from 'react'

// Заголовочный шрифт тёмной «нуарной» темы мероприятия (Playfair Display, есть кириллица) —
// подгружается только на странице, которой он нужен, а не на весь сайт.
const NOIR_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,500&display=swap'

export function useNoirFont(enabled: boolean) {
  useEffect(() => {
    if (!enabled || document.getElementById('noir-font')) return
    const link = document.createElement('link')
    link.id = 'noir-font'
    link.rel = 'stylesheet'
    link.href = NOIR_FONT_HREF
    document.head.appendChild(link)
  }, [enabled])
}
