import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Header from './Header'
import Footer from './Footer'

// Liquid Glass: один делегированный слушатель на весь документ вместо
// слушателя на каждой карточке — обновляет позицию блика (--mx/--my)
// на ближайшем предке с классом .glass/.glass-dark под курсором.
function useGlassCursor() {
  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      const target = e.target as HTMLElement | null
      const el = target?.closest<HTMLElement>('.glass, .glass-dark')
      if (!el) return
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
      el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
    }
    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => document.removeEventListener('pointermove', handlePointerMove)
  }, [])
}

export default function Layout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useGlassCursor()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
