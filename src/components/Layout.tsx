import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Header from './Header'
import Footer from './Footer'
import ErrorBoundary from './ErrorBoundary'

// Liquid Glass: один делегированный слушатель на весь документ вместо
// слушателя на каждой карточке — обновляет позицию блика (--mx/--my)
// на ближайшем предке с классом .glass/.glass-dark под курсором.
function useGlassCursor() {
  useEffect(() => {
    let raf = 0
    function handlePointerMove(e: PointerEvent) {
      // Откладываем до следующего кадра — иначе на страницах со sticky-панелями
      // (bg + backdrop-blur) частые синхронные обновления --mx/--my во время
      // скролла/движения мыши вызывали видимое мерцание перерисовки.
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const target = e.target as HTMLElement | null
        const el = target?.closest<HTMLElement>('.glass, .glass-dark')
        if (!el) return
        const rect = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
        el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
      })
    }
    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      cancelAnimationFrame(raf)
    }
  }, [])
}

export default function Layout() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // Переход с якорем (например, из подвала «Сообщества» на /community#join
    // с другой страницы) — ждем, пока смонтируется ленивый чанк страницы и
    // нужный элемент появится в DOM, и только тогда скроллим к нему.
    // Без якоря — как раньше, сразу наверх страницы.
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    const id = hash.slice(1)
    let attempts = 0
    let raf = 0
    function tryScroll() {
      const el = document.getElementById(id)
      if (el) {
        const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16
        window.scrollTo({ top, behavior: 'smooth' })
        return
      }
      attempts += 1
      if (attempts < 40) raf = requestAnimationFrame(tryScroll)
    }
    raf = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(raf)
  }, [pathname, hash])

  useGlassCursor()

  // Раздел «Мероприятия» — свой единый подвал (EventsFooter: EventsHome +
  // детальная страница мероприятия), с навигацией по разделу и своим
  // юридическим блоком, вместо общего футера. Отдельные статичные
  // подстраницы раздела (эти пути) на общий подвал сайта не претендуют —
  // сами являются частью подвала как ссылки, и остаются на общем футере.
  const eventsStaticSubpages = [
    '/events/knowledge', '/events/materials', '/events/contacts', '/events/documents',
    '/events/ticket-refund', '/events/research', '/events/ticketing',
    '/events/opportunities', '/events/advertising',
  ]
  // То же для «Сообщества»: свой единый подвал (CommunityFooter: CommunityHome
  // + детальная страница клуба), статичные подстраницы раздела остаются на
  // общем футере сайта.
  const communityStaticSubpages = [
    '/community/success', '/community/contacts', '/community/documents',
  ]
  // «Кадры» — тот же прием: свой единый подвал (KadryFooter) только на
  // основных страницах работодателя/соискателя, статичные подстраницы
  // раздела остаются на общем футере сайта.
  const kadryPagesWithOwnFooter = ['/kadry', '/kadry/employers', '/kadry/candidates']
  const hideGlobalFooter =
    pathname === '/events' ||
    (pathname.startsWith('/events/') && !eventsStaticSubpages.includes(pathname)) ||
    pathname === '/community' ||
    (pathname.startsWith('/community/') && !communityStaticSubpages.includes(pathname)) ||
    kadryPagesWithOwnFooter.includes(pathname) ||
    pathname === '/marketplace'

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      {!hideGlobalFooter && <Footer />}
    </div>
  )
}
