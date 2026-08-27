export interface FAQItem {
  q: string
  a: string
}

// Раздел «Отвечаем на важные вопросы» — переиспользуемый аккордеон на <details>,
// без лишнего JS.
export default function FAQSection({ items, title = 'Отвечаем на важные вопросы' }: { items: FAQItem[]; title?: string }) {
  return (
    <section className="container-page py-14">
      <div className="mb-6 text-sm font-medium uppercase tracking-wide text-gold">FAQ</div>
      <h2 className="mb-6 text-2xl font-semibold">{title}</h2>
      <div className="divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/10 bg-white/70 backdrop-blur-xl">
        {items.map((item) => (
          <details key={item.q} className="group p-5 transition-colors hover:bg-ink/[0.03]">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
              {item.q}
              <span className="ml-4 shrink-0 text-ink/40 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ink/60">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
