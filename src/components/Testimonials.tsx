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

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="relative overflow-hidden rounded-2xl bg-[#dbe4f5] p-6">
      <DotGrid className="absolute -left-2 -top-2 h-14 w-14 text-ink/15" />
      <DotGrid className="absolute -bottom-2 -right-2 h-14 w-14 text-ink/15" />
      <div className="relative flex justify-end">
        <div className="rounded-full bg-white/70 px-4 py-2 text-right">
          <div className="text-sm font-semibold text-ink">{t.author}</div>
          <div className="text-xs text-ink/50">{t.role}</div>
        </div>
      </div>
      <blockquote className="relative mt-5 whitespace-pre-line text-sm leading-relaxed text-ink/80">
        {t.text}
      </blockquote>
    </figure>
  )
}

// Раздел «Отзывы». Если реальных цитат ещё нет — честная заглушка вместо
// придуманных отзывов. Как только появятся тексты от клиентов и резидентов,
// передайте их массивом `items`.
export default function Testimonials({ items }: { items?: Testimonial[] }) {
  return (
    <section className="border-y border-ink/10 bg-white py-14">
      <div className="container-page">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Отзывы</div>
        <h2 className="mb-6 text-2xl font-semibold">Что говорят о нас</h2>

        {items && items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((t) => (
              <TestimonialCard key={t.author + t.role} t={t} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-ink/20 bg-paper p-6 text-sm text-ink/50">
            Раздел готов к наполнению — как только появятся отзывы клиентов и резидентов, разместим их здесь.
          </div>
        )}
      </div>
    </section>
  )
}
