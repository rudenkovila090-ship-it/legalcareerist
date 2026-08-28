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

// Заголовки отдельных строк-групп при разбивке «Связанного» по типам.
const groupLabel: Record<ContentType, string> = {
  event: 'Мероприятия',
  material: 'Материалы',
  vacancy: 'Вакансии',
  article: 'База знаний',
  club: 'Клубы сообщества',
}
const groupOrder: ContentType[] = ['event', 'material', 'vacancy', 'article', 'club']

// Монохромная шкала — тип различается текстом лейбла, а не радугой цветов
// (в палитре сайта только белый и фирменный синий).
const typeColor: Record<ContentType, string> = {
  vacancy: 'bg-ink text-white',
  article: 'bg-ink/70 text-white',
  event: 'bg-ink/45 text-white',
  material: 'bg-ink/[0.12] text-ink',
  club: 'border border-ink/20 text-ink/70',
}

/**
 * <RelatedContent> — переиспользуемый блок «Связанное» (раздел 3.4 ТЗ).
 * Рендерится на любой детальной странице: вакансия, статья, мероприятие,
 * материал, клуб. Клик по элементу шлет аналитическое событие
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
      <div className="space-y-6">
        {groupOrder.map((type) => {
          const group = items.filter((item) => item.type === type)
          if (group.length === 0) return null
          return (
            <div key={type}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/50">{groupLabel[type]}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={item.href}
                    onClick={() =>
                      trackEvent('related_content_click', { type: item.type, id: item.id, target: item.href })
                    }
                    className="glass group rounded-xl p-4"
                  >
                    <span className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeColor[item.type]}`}>
                      {typeLabel[item.type]}
                    </span>
                    <div className="font-medium leading-snug text-ink group-hover:text-ink">{item.title}</div>
                    <div className="mt-1 text-xs text-ink/50">{item.meta}</div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
