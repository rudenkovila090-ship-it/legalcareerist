export interface Testimonial {
  text: string
  author: string
  role: string
}

function DotGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => (
          <circle key={`${row}-${col}`} cx={4 + col * 8} cy={4 + row * 8} r={1.4} fill="currentColor" />
        )),
      )}
    </svg>
  )
}

function TestimonialCard({ t, compact }: { t: Testimonial; compact?: boolean }) {
  return (
    <figure className={`relative h-full overflow-hidden rounded-2xl bg-[#dbe4f5] ${compact ? 'p-4' : 'p-6'}`}>
      <DotGrid className={`absolute -left-2 -top-2 text-ink/15 ${compact ? 'h-10 w-10' : 'h-14 w-14'}`} />
      <DotGrid className={`absolute -bottom-2 -right-2 text-ink/15 ${compact ? 'h-10 w-10' : 'h-14 w-14'}`} />
      <div className="relative flex justify-end">
        <div className="rounded-full bg-white/70 px-4 py-2 text-right">
          <div className="text-sm font-semibold text-ink">{t.author}</div>
          <div className="text-xs text-ink/50">{t.role}</div>
        </div>
      </div>
      <blockquote
        className={`relative whitespace-pre-line leading-relaxed text-ink/80 ${
          compact ? 'mt-3 line-clamp-6 text-xs' : 'mt-5 text-sm'
        }`}
      >
        {t.text}
      </blockquote>
    </figure>
  )
}

// Раздел «Отзывы». Если реальных цитат еще нет — честная заглушка вместо
// придуманных отзывов. Как только появятся тексты от клиентов и резидентов,
// передайте их массивом `items`. `compact` — уменьшенная версия карточек
// (используется на подстраницах, где отзывы не главный фокус).
export default function Testimonials({
  items,
  compact,
  dark,
}: {
  items?: Testimonial[]
  compact?: boolean
  /** Темный вариант — для страниц с фирменной синей заливкой на всю страницу. */
  dark?: boolean
}) {
  return (
    <section className={dark ? 'border-y border-white/10 bg-ink py-14' : 'border-y border-ink/10 bg-white py-14'}>
      <div className="container-page">
        <div className={`mb-2 text-sm font-medium uppercase tracking-wide ${dark ? 'text-gold-light' : 'text-gold'}`}>Отзывы</div>
        <h2 className={`mb-6 text-2xl font-semibold ${dark ? 'text-white' : ''}`}>Что говорят о нас</h2>

        {items && items.length > 0 ? (
          compact ? (
            <div className="overflow-hidden">
              <div className="animate-marquee flex w-max gap-4">
                {[...items, ...items].map((t, i) => (
                  <div key={t.author + t.role + i} className="h-56 w-72 shrink-0 sm:w-80">
                    <TestimonialCard t={t} compact />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((t) => (
                <TestimonialCard key={t.author + t.role} t={t} compact={compact} />
              ))}
            </div>
          )
        ) : (
          <div
            className={
              dark
                ? 'rounded-xl border border-dashed border-white/20 bg-white/5 p-6 text-sm text-white/50'
                : 'rounded-xl border border-dashed border-ink/20 bg-ink/[0.03] p-6 text-sm text-ink/50'
            }
          >
            Раздел готов к наполнению — как только появятся отзывы клиентов и резидентов, разместим их здесь.
          </div>
        )}
      </div>
    </section>
  )
}
