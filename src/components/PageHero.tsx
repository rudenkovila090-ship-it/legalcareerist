export default function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string
  title: string
  description?: string
}) {
  return (
    <div className="border-b border-ink/10 bg-white">
      <div className="container-page py-12">
        {eyebrow && <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-ink/60">{description}</p>}
      </div>
    </div>
  )
}
