export interface Testimonial {
  text: string
  author: string
  role: string
}

// Раздел «Отзывы». Пока реальных отзывов нет — секция честно показывает
// заглушку вместо придуманных цитат. Как только появятся тексты от клиентов
// и резидентов, передайте их массивом `items`.
export default function Testimonials({ items }: { items?: Testimonial[] }) {
  return (
    <section className="border-y border-ink/10 bg-white py-14">
      <div className="container-page">
        <div className="mb-6 text-sm font-medium uppercase tracking-wide text-gold">Отзывы</div>
        <h2 className="mb-6 text-2xl font-semibold">Что говорят о нас</h2>

        {items && items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {items.map((t) => (
              <figure key={t.author} className="rounded-xl border border-ink/10 p-5">
                <blockquote className="text-sm text-ink/80">«{t.text}»</blockquote>
                <figcaption className="mt-3 text-sm font-medium text-ink/60">
                  {t.author} · {t.role}
                </figcaption>
              </figure>
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
