import { useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import { ArticleCard } from '../components/cards'
import RelatedContentBlock from '../components/RelatedContentBlock'
import ArticleBody from '../components/ArticleBody'
import TariffJoinBlock from '../components/TariffJoinBlock'
import { getRelatedContent } from '../lib/related'
import { useArticleViews } from '../lib/useArticleViews'
import { articles } from '../data/articles'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { Audience, ArticleKind } from '../types'

const kindLabelFull: Record<ArticleKind, string> = {
  article: 'Статья',
  faq: 'FAQ',
  glossary: 'Глоссарий',
  checklist: 'Чек-лист',
}

const kindLabel: Partial<Record<ArticleKind, string>> = {
  article: 'Статьи',
  glossary: 'Глоссарий',
  checklist: 'Чек-листы',
}

// База знаний сегментирована по аудиториям (раздел 3.3), но использует единую
// сущность Article и единый компонент — переиспользуется в /kadry, /community, /events.
export default function KnowledgeList({
  audience,
  eyebrow,
  title,
  description,
  compact = false,
}: {
  audience: Audience
  eyebrow: string
  title: string
  description?: string
  /** Без собственного PageHero — для встраивания внутрь вкладки другой страницы. */
  compact?: boolean
}) {
  useDocumentTitle(eyebrow)
  const [kind, setKind] = useState<ArticleKind | 'all'>('all')
  // При встраивании внутрь вкладки (compact) открываем материал инлайн, а не
  // по реальному роуту — иначе переход на /knowledge/:slug уносит со страницы
  // и теряет контекст вкладки (та же проблема, что была с вакансиями).
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const selected = compact ? articles.find((a) => a.slug === selectedSlug) ?? null : null
  const related = selected ? getRelatedContent(selected, 'article', selected.id) : []
  const views = useArticleViews(selected?.slug ?? '')

  const filtered = useMemo(
    () => articles.filter((a) => a.audience.includes(audience) && a.kind !== 'faq' && (kind === 'all' || a.kind === kind)),
    [audience, kind],
  )

  if (selected) {
    return (
      <div>
        <button type="button" onClick={() => setSelectedSlug(null)} className="text-sm text-ink/50 hover:text-ink">
          ← Все материалы
        </button>
        <div className="mx-auto mt-4 max-w-3xl">
          <span className="text-sm font-medium uppercase tracking-wide text-gold">{kindLabelFull[selected.kind]}</span>
          <h1 className="mt-2 text-3xl font-semibold">{selected.title}</h1>
          <div className="mt-2 text-sm text-ink/50">
            {new Date(selected.date).toLocaleDateString('ru-RU')} · {views ?? '…'} просмотров
          </div>

          <div className="mt-8">
            <ArticleBody body={selected.body} />
          </div>

          {selected.cta === 'community-tariff' && (
            <div className="mt-10">
              <TariffJoinBlock />
            </div>
          )}

          <RelatedContentBlock items={related} />
        </div>
      </div>
    )
  }

  return (
    <div>
      {!compact && <PageHero eyebrow={eyebrow} title={title} description={description} prototype />}
      <div className={compact ? '' : 'container-page py-10'}>
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            onClick={() => setKind('all')}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${kind === 'all' ? 'bg-ink text-white' : 'bg-white text-ink/60 border border-ink/10'}`}
          >
            Все материалы
          </button>
          {(Object.keys(kindLabel) as ArticleKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${kind === k ? 'bg-ink text-white' : 'bg-white text-ink/60 border border-ink/10'}`}
            >
              {kindLabel[k]}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <ArticleCard key={a.id} a={a} onSelect={compact ? setSelectedSlug : undefined} />
          ))}
          {filtered.length === 0 && <p className="text-ink/50">Материалов пока нет.</p>}
        </div>
      </div>
    </div>
  )
}
