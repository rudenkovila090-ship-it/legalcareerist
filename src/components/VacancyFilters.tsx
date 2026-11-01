import { useEffect, useRef, useState } from 'react'
import { COMPANY_INDUSTRY_TREE, EDUCATION_LEVELS, type EducationLevel } from '../types'

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onOutside])
  return ref
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function FilterDropdownButton({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink/15 px-3 py-2 text-left text-sm"
    >
      <span className={count > 0 ? 'text-ink' : 'text-ink/50'}>{label}{count > 0 ? ` (${count})` : ''}</span>
      <Chevron open={open} />
    </button>
  )
}

// Отрасль компании — список скрыт за раскрывающейся кнопкой (не занимает
// места, пока фильтр не нужен). Категория и ее подкатегории — единый блок:
// отметили общий профиль (категорию) — считаем выбранными сразу все его
// подкатегории, а не только сам общий пункт.
export function IndustryFilter({ value, onChange }: { value: Set<string>; onChange: (next: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))

  function toggleCategory(category: string, items: string[]) {
    const allSelected = value.has(category) && items.every((i) => value.has(i))
    const next = new Set(value)
    if (allSelected) {
      next.delete(category)
      items.forEach((i) => next.delete(i))
    } else {
      next.add(category)
      items.forEach((i) => next.add(i))
    }
    onChange(next)
  }

  function toggleItem(category: string, items: string[], item: string) {
    const next = new Set(value)
    if (next.has(item)) next.delete(item)
    else next.add(item)
    if (items.every((i) => next.has(i))) next.add(category)
    else next.delete(category)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <FilterDropdownButton label="Отрасль компании" count={value.size} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-full min-w-[280px] overflow-y-auto rounded-lg border border-ink/15 bg-white p-3 shadow-xl">
          <div className="space-y-2">
            {COMPANY_INDUSTRY_TREE.map((group) => (
              <div key={group.category}>
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={value.has(group.category)}
                    onChange={() => toggleCategory(group.category, group.items)}
                  />
                  {group.category}
                </label>
                <div className="ml-5 mt-1 space-y-1">
                  {group.items.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-sm text-ink/60">
                      <input
                        type="checkbox"
                        checked={value.has(item)}
                        onChange={() => toggleItem(group.category, group.items, item)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Образование — тот же раскрывающийся паттерн, без иерархии категорий.
export function EducationFilter({ value, onChange }: { value: Set<EducationLevel>; onChange: (next: Set<EducationLevel>) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))

  function toggle(id: EducationLevel) {
    const next = new Set(value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <FilterDropdownButton label="Образование" count={value.size} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full min-w-[240px] rounded-lg border border-ink/15 bg-white p-3 shadow-xl">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {EDUCATION_LEVELS.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm text-ink/70">
                <input type="checkbox" checked={value.has(e.id)} onChange={() => toggle(e.id)} />
                {e.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
