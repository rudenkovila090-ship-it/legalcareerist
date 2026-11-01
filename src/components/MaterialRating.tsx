// Звёзды и строка рейтинга материала — общие для карточки в маркетплейсе и страницы материала.
export function Stars({ rating, size = 'h-4 w-4' }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Рейтинг ${rating.toFixed(1)} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`${size} ${i < Math.round(rating) ? 'fill-gold text-gold' : 'fill-ink/10 text-ink/10'}`}>
          <path d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L1.4 7.7l6.1-.6z" />
        </svg>
      ))}
    </span>
  )
}
