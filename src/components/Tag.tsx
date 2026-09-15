import { INDUSTRIES, SPECIALIZATIONS, type Industry, type Specialization } from '../types'

const specLabel = new Map(SPECIALIZATIONS.map((s) => [s.id, s.label]))
const industryLabel = new Map(INDUSTRIES.map((i) => [i.id, i.label]))

export function SpecTag({ id }: { id: Specialization }) {
  return (
    <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-gold-light">
      {specLabel.get(id)}
    </span>
  )
}

export function IndustryTag({ id }: { id: Industry }) {
  return (
    <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/70">
      {industryLabel.get(id)}
    </span>
  )
}

export function TagRow({ specialization, industry }: { specialization: Specialization[]; industry: Industry[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {specialization.map((s) => (
        <SpecTag key={s} id={s} />
      ))}
      {industry.map((i) => (
        <IndustryTag key={i} id={i} />
      ))}
    </div>
  )
}
