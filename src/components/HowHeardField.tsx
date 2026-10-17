// «Откуда вы о нас узнали?» — необязательный вопрос в каждой форме сайта.
// Отвечают своими словами (без списка вариантов), чтобы видеть источник, который
// не ловят UTM-метки: рекомендация друга, подкаст, выступление, поиск и т. п.
// Ответ уходит вместе с заявкой (см. howHeard в lib/leads.ts) и попадает в
// уведомление админу и в карточку заявки.
interface HowHeardFieldProps {
  value: string
  onChange: (value: string) => void
  /** Классы поля — чтобы совпадать с соседними инпутами формы (светлая/тёмная форма). */
  className?: string
}

export const HOW_HEARD_LABEL = 'Откуда вы о нас узнали?'

export default function HowHeardField({
  value,
  onChange,
  className = 'rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40',
}: HowHeardFieldProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`${HOW_HEARD_LABEL} (необязательно)`}
      aria-label={HOW_HEARD_LABEL}
      maxLength={200}
      className={`w-full ${className}`}
    />
  )
}
