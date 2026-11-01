import { partnershipPackages } from '../data/partnershipPackages'

const money = new Intl.NumberFormat('ru-RU')

// Карточки партнёрских пакетов мероприятий (данные — src/data/partnershipPackages.ts). Кнопка «Выбрать» подставляет формат в заявку.
export default function PartnershipPackages({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {partnershipPackages.map((p) => {
        const active = selected === p.id
        return (
          <article key={p.id} className={`glass flex flex-col rounded-xl p-6 ${active ? 'ring-2 ring-ink/40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold leading-snug">{p.title}</h3>
              <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-sm font-semibold text-white">{money.format(p.price)} ₽</span>
            </div>
            <p className="mt-2 text-sm text-ink/60">{p.summary}</p>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/40">Что входит</div>
            <ul className="mt-2 space-y-1.5 text-sm text-ink/80">
              {p.includes.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 shrink-0 text-gold">✓</span>
                  <span>{line.charAt(0).toUpperCase() + line.slice(1)}</span>
                </li>
              ))}
            </ul>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={active}
              className={`mt-5 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-ink text-white' : 'border border-ink/15 text-ink/70 hover:text-ink'}`}
            >
              {active ? 'Выбрано — заполните заявку ниже' : 'Выбрать этот формат'}
            </button>
          </article>
        )
      })}
    </div>
  )
}
