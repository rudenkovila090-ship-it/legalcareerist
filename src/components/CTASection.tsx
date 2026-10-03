import { Link } from 'react-router-dom'

// Финальный призыв к действию — единый паттерн для главной и подстраниц направлений.
// ctaTo, начинающийся с "#", — это плавная прокрутка к блоку на текущей странице
// (через scrollIntoView, а не href="#…" — так якорь не конфликтует с роутером,
// в том числе с HashRouter, который сам использует URL-хэш для навигации между
// страницами); все остальное — переход между страницами через react-router <Link>.
export default function CTASection({
  title,
  description,
  ctaLabel,
  ctaTo,
}: {
  title: string
  description?: string
  ctaLabel: string
  ctaTo: string
}) {
  const isAnchor = ctaTo.startsWith('#')
  const buttonClass = 'shrink-0 rounded-lg bg-gold-light px-6 py-3 text-sm font-semibold text-ink hover:opacity-90'

  function scrollToAnchor() {
    document.getElementById(ctaTo.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="border-t border-ink/10 bg-ink py-14 text-white">
      <div className="container-page flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          {description && <p className="mt-2 max-w-xl text-white/60">{description}</p>}
        </div>
        {isAnchor ? (
          <button type="button" onClick={scrollToAnchor} className={buttonClass}>
            {ctaLabel}
          </button>
        ) : (
          <Link to={ctaTo} className={buttonClass}>
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  )
}
