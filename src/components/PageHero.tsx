export default function PageHero({
  eyebrow,
  title,
  description,
  prototype,
}: {
  eyebrow?: string
  title: string
  description?: string
  /** Показать пометку, что раздел — демо-каркас со старым ТЗ, не отражает актуальную модель бизнеса. */
  prototype?: boolean
}) {
  return (
    <div className="border-b border-ink/10 bg-white">
      <div className="container-page py-12">
        {eyebrow && <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-ink/60">{description}</p>}
        {prototype && (
          <div className="mt-4 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Каркас раздела с демо-данными по прежнему ТЗ — контент и логика ещё не сверены с
            актуальной моделью бизнеса «Карьерного юриста».
          </div>
        )}
      </div>
    </div>
  )
}
