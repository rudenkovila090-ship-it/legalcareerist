export default function PageHero({
  eyebrow,
  title,
  description,
  prototype,
  dark,
  wide,
}: {
  eyebrow?: string
  title: string
  description?: string
  /** Показать пометку, что раздел — демо-каркас со старым ТЗ, не отражает актуальную модель бизнеса. */
  prototype?: boolean
  /** Темный вариант шапки (bg-ink/white text) — для страниц с фирменной синей заливкой на всю страницу. */
  dark?: boolean
  /** Отключить ограничение ширины у описания — на всю ширину страницы, без некрасивых переносов. */
  wide?: boolean
}) {
  return (
    <div className={dark ? 'border-b border-white/10 bg-ink' : 'border-b border-ink/10 bg-white'}>
      <div className="container-page py-12">
        {eyebrow && (
          <div className={`mb-2 text-sm font-medium uppercase tracking-wide ${dark ? 'text-gold-light' : 'text-gold'}`}>{eyebrow}</div>
        )}
        <h1 className={`text-3xl font-semibold tracking-tight sm:text-4xl ${dark ? 'text-white' : ''}`}>{title}</h1>
        {description && <p className={`mt-3 ${wide ? '' : 'max-w-3xl'} ${dark ? 'text-white/60' : 'text-ink/60'}`}>{description}</p>}
        {prototype && (
          <div className="mt-4 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Каркас раздела с демо-данными по прежнему ТЗ — контент и логика еще не сверены с
            актуальной моделью бизнеса «Карьерного юриста».
          </div>
        )}
      </div>
    </div>
  )
}
