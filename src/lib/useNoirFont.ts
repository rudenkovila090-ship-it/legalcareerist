import { useEffect } from 'react'

// Шрифты тёмной «нуарной» темы мероприятия (все с кириллицей) — подгружаются только на странице, которой они нужны,
// а не на весь сайт: Playfair Display — заголовки; IBM Plex Mono — «машинопись» в делах спикеров;
// Marck Script — рукописная подпись под фото в деле.
const NOIR_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@400;600&family=Marck+Script&display=swap'

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
