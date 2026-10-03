// Переключаемые пилюли для мультивыбора в конструкторах (резюме, вакансии) —
// тот же прием, что и interestOptions в LeadForm.tsx, вынесен в отдельный
// компонент, т.к. используется в нескольких конструкторах личного кабинета.
export default function ChipToggle<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { id: T; label: string }[]
  selected: T[]
  onToggle: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onToggle(o.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            selected.includes(o.id) ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/60 hover:border-ink/40'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
