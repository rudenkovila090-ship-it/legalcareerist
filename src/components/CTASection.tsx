import { Link } from 'react-router-dom'

// Финальный призыв к действию — единый паттерн для главной и подстраниц направлений.
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
  return (
    <section className="border-t border-ink/10 bg-ink py-14 text-white">
      <div className="container-page flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          {description && <p className="mt-2 max-w-xl text-white/60">{description}</p>}
        </div>
        <Link
          to={ctaTo}
          className="shrink-0 rounded-lg bg-gold-light px-6 py-3 text-sm font-semibold text-ink hover:opacity-90"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  )
}
