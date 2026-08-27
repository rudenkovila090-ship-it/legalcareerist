export interface FAQItem {
  q: string
  a: string
}

// Раздел «Отвечаем на важные вопросы» — переиспользуемый аккордеон на <details>,
// без лишнего JS.
export default function FAQSection({
  items,
  title = 'Отвечаем на важные вопросы',
  dark,
}: {
  items: FAQItem[]
  title?: string
  /** Тёмный вариант — для страниц с фирменной синей заливкой на всю страницу. */
  dark?: boolean
}) {
  return (
    <section className="container-page py-14">
      <div className={`mb-6 text-sm font-medium uppercase tracking-wide ${dark ? 'text-gold-light' : 'text-gold'}`}>FAQ</div>
      <h2 className={`mb-6 text-2xl font-semibold ${dark ? 'text-white' : ''}`}>{title}</h2>
      <div
        className={
          dark
            ? 'divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl'
            : 'divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/10 bg-white/70 backdrop-blur-xl'
        }
      >
        {items.map((item) => (
          <details key={item.q} className={`group p-5 transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-ink/[0.03]'}`}>
            <summary className={`flex cursor-pointer list-none items-center justify-between font-medium ${dark ? 'text-white' : ''}`}>
              {item.q}
              <span className={`ml-4 shrink-0 transition-transform group-open:rotate-45 ${dark ? 'text-white/40' : 'text-ink/40'}`}>+</span>
            </summary>
            <p className={`mt-3 text-sm leading-relaxed ${dark ? 'text-white/60' : 'text-ink/60'}`}>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
