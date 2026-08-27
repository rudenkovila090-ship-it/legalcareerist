import { Link } from 'react-router-dom'
import type { ContentType, RelatedItem } from '../lib/related'
import { trackEvent } from '../lib/leads'

const typeLabel: Record<ContentType, string> = {
  vacancy: 'Вакансия',
  article: 'База знаний',
  event: 'Мероприятие',
  material: 'Материал',
  club: 'Клуб сообщества',
}

const typeColor: Record<ContentType, string> = {
  vacancy: 'bg-blue-50 text-blue-700',
  article: 'bg-emerald-50 text-emerald-700',
  event: 'bg-amber-50 text-amber-700',
  material: 'bg-violet-50 text-violet-700',
  club: 'bg-rose-50 text-rose-700',
}

/**
 * <RelatedContent> — переиспользуемый блок «Связанное» (раздел 3.4 ТЗ).
 * Рендерится на любой детальной странице: вакансия, статья, мероприятие,
 * материал, клуб. Клик по элементу шлёт аналитическое событие
 * related_content_click (раздел 8) — так измеряется, работает ли связность.
 */
export default function RelatedContentBlock({ items, title = 'Связанное' }: { items: RelatedItem[]; title?: string }) {
  if (items.length === 0) return null

  return (
    <section className="mt-14">
      <h2 className="mb-1 text-xl font-semibold">{title}</h2>
      <p className="mb-5 text-sm text-ink/60">
        Подобрано автоматически по совпадению специализации и отрасли.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            to={item.href}
            onClick={() =>
              trackEvent('related_content_click', { type: item.type, id: item.id, target: item.href })
            }
            className="group rounded-xl border border-ink/10 bg-white p-4 transition-shadow hover:shadow-md"
          >
            <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeColor[item.type]}`}>
              {typeLabel[item.type]}
            </span>
            <div className="font-medium leading-snug text-ink group-hover:text-ink">{item.title}</div>
            <div className="mt-1 text-xs text-ink/50">{item.meta}</div>
          </Link>
        ))}
      </div>
    </section>
  )
}
