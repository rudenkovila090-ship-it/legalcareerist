import { useMemo, useState } from 'react'
import PageHero from '../../components/PageHero'
import { EventCard } from '../../components/cards'
import { events } from '../../data/events'
import { SPECIALIZATIONS, type Specialization } from '../../types'

export default function EventsHome() {
  const [spec, setSpec] = useState<Specialization | 'all'>('all')
  const [onlyOpen, setOnlyOpen] = useState(true)

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (spec !== 'all' && !e.specialization.includes(spec)) return false
        if (onlyOpen && e.status !== 'open') return false
        return true
      }),
    [spec, onlyOpen],
  )

  return (
    <div>
      <PageHero eyebrow="Мероприятия" title="Вебинары, бизнес-завтраки, интенсивы" description="Онлайн и офлайн события для карьерного роста в праве." prototype />
      <div className="container-page py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-white p-4">
          <select value={spec} onChange={(e) => setSpec(e.target.value as Specialization | 'all')} className="rounded-lg border border-ink/15 px-3 py-2 text-sm">
            <option value="all">Все специализации</option>
            {SPECIALIZATIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink/60">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Только идёт набор
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => <EventCard key={e.id} e={e} />)}
          {filtered.length === 0 && <p className="text-ink/50">Мероприятий по фильтру не найдено.</p>}
        </div>
      </div>
    </div>
  )
}
