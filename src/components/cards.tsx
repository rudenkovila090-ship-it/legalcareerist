import { Link } from 'react-router-dom'
import type { Article, EventItem, MaterialItem, NewsItem, Vacancy } from '../types'
import { useArticleViewCount } from '../lib/useArticleViews'
import { useNewsViewCount } from '../lib/useNewsViews'
import { materialKindLabel } from '../lib/materialLabels'
import { pluralRu } from '../lib/plural'
import { startEventMusicOnClick } from '../lib/eventMusic'
import { eventDateRange } from '../lib/eventTime'
import { eventFormatText, eventPriceText } from '../lib/eventFormat'
import VacancyCardContent, { vacancyCardClass } from './VacancyCardContent'
import MaterialCover from './MaterialCover'

const money = new Intl.NumberFormat('ru-RU')

export function VacancyCard({ v }: { v: Vacancy }) {
  return <Link to={`/vacancies/${v.slug}`} className={vacancyCardClass}><VacancyCardContent vacancy={v} /></Link>
}

// onSelect — для встраивания внутрь вкладки другой страницы (см. KnowledgeList
// с compact): открывает материал инлайн вместо перехода на отдельный роут,
// чтобы не терять контекст вкладки (та же проблема, что была с вакансиями).
export function ArticleCard({ a, onSelect }: { a: Article; onSelect?: (slug: string) => void }) {
  const views = useArticleViewCount(a.slug)
  const content = (
    <>
      {a.image && <img src={a.image} alt="" loading="lazy" className="mb-4 aspect-[16/9] w-full rounded-lg object-cover" />}
      <span className="text-xs font-medium uppercase tracking-wide text-gold">{kindLabel(a.kind)}</span>
      <h3 className="mt-1 font-semibold leading-snug">{a.title}</h3>
      <div className="mt-auto pt-3 text-xs text-ink/40">{views ?? 0} {pluralRu(views ?? 0, ['просмотр', 'просмотра', 'просмотров'])}</div>
    </>
  )
  if (onSelect) {
    return (
      <button type="button" onClick={() => onSelect(a.slug)} className="glass flex h-full min-h-40 w-full flex-col items-start rounded-xl p-5 text-left">
        {content}
      </button>
    )
  }
  return (
    <Link to={`/knowledge/${a.slug}`} className="glass flex h-full min-h-40 flex-col items-start rounded-xl p-5">
      {content}
    </Link>
  )
}

function kindLabel(kind: Article['kind']) {
  return { article: 'Статья', faq: 'FAQ', glossary: 'Глоссарий', checklist: 'Чек-лист' }[kind]
}

// Компактная ячейка — заголовок, дата, просмотры, без превью текста. Клик
// открывает детальную страницу /news/:slug с полным текстом и приложенными
// изображениями (см. NewsDetail.tsx).
export function NewsCard({ n }: { n: NewsItem }) {
  const views = useNewsViewCount(n.slug)
  return (
    <Link to={`/news/${n.slug}`} className="glass flex h-full min-h-40 flex-col overflow-hidden rounded-xl p-5">
      {(n.image || n.images?.[0]) && <img src={n.image || n.images?.[0]} alt="" loading="lazy" className="mb-4 aspect-[16/9] w-full rounded-lg object-cover" />}
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{n.tag}</span>
        <span className="text-xs text-ink/40">{n.date}</span>
      </div>
      <h3 className="mt-3 font-semibold leading-snug">{n.title}</h3>
      <div className="mt-auto pt-3 text-xs text-ink/40">{views ?? 0} {pluralRu(views ?? 0, ['просмотр', 'просмотра', 'просмотров'])}</div>
    </Link>
  )
}

const eventTypeLabel: Record<EventItem['type'], string> = {
  conference: 'Ключевое мероприятие',
  webinar: 'Вебинар',
  breakfast: 'Бизнес-завтрак',
  intensive: 'Интенсив',
  tour: 'Экскурсия',
  internship: 'Стажировка',
  championship: 'Кейс-чемпионат',
  meeting: 'Бизнес-встреча',
  course: 'Курс',
}

export function EventCard({ e }: { e: EventItem }) {
  return (
    <Link to={`/events/${e.slug}`} onClick={(ev) => startEventMusicOnClick(e.slug, ev)} className="glass flex h-full flex-col rounded-xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gold">{eventTypeLabel[e.type]}</span>
        <span className="text-xs text-ink/50">{e.status === 'completed' ? 'Завершено' : 'Идет набор'}</span>
      </div>
      <h3 className="mt-1 font-semibold leading-snug">{e.title}</h3>
      <div className="mt-2 text-sm text-ink/60">
        {eventDateRange(e)} · {eventFormatText(e)}
      </div>
      <div className="mt-auto pt-3 text-sm font-medium">{eventPriceText(e)}</div>
    </Link>
  )
}

export function MaterialCard({ m }: { m: MaterialItem }) {
  return (
    <Link to={`/materials/${m.slug}`} className="glass flex h-full flex-col overflow-hidden rounded-xl">
      <MaterialCover material={m} className="rounded-b-none" />
      <div className="flex flex-1 flex-col items-start p-5">
      <span className="text-xs font-medium uppercase tracking-wide text-gold">
        {materialKindLabel[m.kind]}
      </span>
      <h3 className="mt-1 font-semibold leading-snug">{m.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm text-ink/60">{m.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-sm font-medium">
        <span>{m.price === 0 ? 'Бесплатно' : `${money.format(m.price)} ₽`}</span>
        {m.inDevelopment && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">В разработке</span>}
      </div>
      </div>
    </Link>
  )
}
