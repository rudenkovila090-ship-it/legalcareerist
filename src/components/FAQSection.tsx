import type { ReactNode } from 'react'

export interface FAQItem {
  q: string
  a: ReactNode
}

// Раздел «Отвечаем на важные вопросы» — переиспользуемый аккордеон на <details>,
// без лишнего JS.
export default function FAQSection({
  items,
  title = 'Отвечаем на важные вопросы',
  dark,
  columns = 1,
  inlineTitle = false,
  compact = false,
}: {
  items: FAQItem[]
  title?: string
  /** Темный вариант — для страниц с фирменной синей заливкой на всю страницу. */
  dark?: boolean
  columns?: 1 | 2
  inlineTitle?: boolean
  compact?: boolean
}) {
  const panel = dark
    ? 'overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl'
    : 'overflow-hidden rounded-xl border border-ink/10 bg-white/70 backdrop-blur-xl'
  const groups = columns === 2 ? [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))] : [items]
  return (
    <section className="container-page py-14">
      {inlineTitle ? (
        <h2 className={`mb-6 flex items-center gap-4 font-semibold ${dark ? 'text-white' : 'text-ink'}`}>
          <span className="text-sm tracking-wide text-accent">FAQ</span>
          <span aria-hidden="true" className="h-6 border-l border-accent/60" />
          <span className="text-xl">{title}</span>
        </h2>
      ) : (
        <>
          <div className={`mb-6 text-sm font-medium uppercase tracking-wide ${dark ? 'text-gold-light' : 'text-gold'}`}>FAQ</div>
          <h2 className={`mb-6 text-2xl font-semibold ${dark ? 'text-white' : ''}`}>{title}</h2>
        </>
      )}
      <div className={columns === 2 ? 'grid items-start gap-3 md:grid-cols-2 md:gap-5' : ''}>
        {groups.map((group, index) => (
          <div key={index} className={columns === 2 ? 'space-y-3' : `${panel} divide-y ${dark ? 'divide-white/10' : 'divide-ink/10'}`}>
        {group.map((item) => (
          <details key={item.q} className={`group p-5 transition-colors ${columns === 2 ? panel : ''} ${dark ? 'hover:bg-white/5' : 'hover:bg-ink/[0.03]'}`}>
            <summary className={`flex cursor-pointer list-none items-center justify-between font-medium ${compact ? 'text-[12.8px]' : ''} ${dark ? 'text-white' : ''}`}>
              {item.q}
              <span className={`ml-4 shrink-0 transition-transform group-open:rotate-45 ${dark ? 'text-white/40' : 'text-ink/40'}`}>+</span>
            </summary>
            <p className={`mt-3 text-sm leading-relaxed ${dark ? 'text-white/60' : 'text-ink/60'}`}>{item.a}</p>
          </details>
        ))}
          </div>
        ))}
      </div>
    </section>
  )
}
