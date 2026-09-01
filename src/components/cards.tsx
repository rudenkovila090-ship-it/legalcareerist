import { Link } from 'react-router-dom'
import type { Article, CommunityClub, EventItem, MaterialItem, Vacancy } from '../types'
import { TagRow } from './Tag'
import { articleViews } from '../lib/articleViews'
import { materialKindLabel } from '../lib/materialLabels'

const money = new Intl.NumberFormat('ru-RU')

export function VacancyCard({ v }: { v: Vacancy }) {
  return (
    <Link to={`/vacancies/${v.slug}`} className="glass block rounded-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug">{v.title}</h3>
        {v.urgent && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">Срочно</span>}
      </div>
      <div className="mt-1 text-sm text-ink/60">{v.anonymous ? 'Компания скрыта' : v.company} · {v.city}</div>
      <div className="mt-2 text-sm font-medium text-ink">
        {v.salaryFrom ? `от ${money.format(v.salaryFrom)} ₽` : 'По договоренности'}
        {v.salaryTo ? ` до ${money.format(v.salaryTo)} ₽` : ''}
      </div>
      <div className="mt-3">
        <TagRow specialization={v.specialization} industry={v.industry} />
      </div>
    </Link>
  )
}

// onSelect — для встраивания внутрь вкладки другой страницы (см. KnowledgeList
// с compact): открывает материал инлайн вместо перехода на отдельный роут,
// чтобы не терять контекст вкладки (та же проблема, что была с вакансиями).
export function ArticleCard({ a, onSelect }: { a: Article; onSelect?: (slug: string) => void }) {
  const content = (
    <>
      <span className="text-xs font-medium uppercase tracking-wide text-gold">{kindLabel(a.kind)}</span>
      <h3 className="mt-1 font-semibold leading-snug">{a.title}</h3>
      <p className="mt-2 text-sm text-ink/60">{a.excerpt}</p>
      <div className="mt-2 text-xs text-ink/40">{articleViews(a.id)} просмотров</div>
    </>
  )
  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(a.slug)} className="glass block w-full rounded-xl p-5 text-left">
        {content}
      </button>
    )
  }
  return (
    <Link to={`/knowledge/${a.slug}`} className="glass block rounded-xl p-5">
      {content}
    </Link>
  )
}

function kindLabel(kind: Article['kind']) {
  return { article: 'Статья', faq: 'FAQ', glossary: 'Глоссарий', checklist: 'Чек-лист' }[kind]
}

const eventTypeLabel: Record<EventItem['type'], string> = {
  conference: 'Ключевое мероприятие',
  webinar: 'Вебинар',
  breakfast: 'Бизнес-завтрак',
  intensive: 'Интенсив',
  tour: 'Экскурсия',
}

export function EventCard({ e }: { e: EventItem }) {
  const date = new Date(e.dateTime)
  return (
    <Link to={`/events/${e.slug}`} className="glass block rounded-xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gold">{eventTypeLabel[e.type]}</span>
        <span className="text-xs text-ink/50">{e.status === 'completed' ? 'Завершено' : 'Идет набор'}</span>
      </div>
      <h3 className="mt-1 font-semibold leading-snug">{e.title}</h3>
      <div className="mt-2 text-sm text-ink/60">
        {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · {e.format === 'online' ? 'Онлайн' : e.city}
      </div>
      <div className="mt-2 text-sm font-medium">{e.price === 0 ? 'Бесплатно' : `${money.format(e.price)} ₽`}</div>
    </Link>
  )
}

export function MaterialCard({ m }: { m: MaterialItem }) {
  return (
    <Link to={`/materials/${m.slug}`} className="glass block rounded-xl p-5">
      <span className="text-xs font-medium uppercase tracking-wide text-gold">
        {materialKindLabel[m.kind]}
      </span>
      <h3 className="mt-1 font-semibold leading-snug">{m.title}</h3>
      <p className="mt-2 text-sm text-ink/60">{m.description}</p>
      <div className="mt-2 text-sm font-medium">{m.price === 0 ? 'Бесплатно' : `${money.format(m.price)} ₽`}</div>
    </Link>
  )
}

export function ClubCard({ c }: { c: CommunityClub }) {
  return (
    <Link to={`/community/clubs/${c.slug}`} className="glass block rounded-xl p-5">
      <h3 className="font-semibold leading-snug">{c.name}</h3>
      <p className="mt-2 text-sm text-ink/60">{c.description}</p>
      <div className="mt-3">
        <TagRow specialization={c.specialization} industry={c.industry} />
      </div>
    </Link>
  )
}
