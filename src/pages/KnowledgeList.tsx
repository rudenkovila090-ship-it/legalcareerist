import { useMemo, useState } from 'react'
import PageHero from '../components/PageHero'
import { ArticleCard } from '../components/cards'
import { articles } from '../data/articles'
import type { Audience, ArticleKind } from '../types'

const kindLabel: Record<ArticleKind, string> = {
  article: 'Статьи',
  faq: 'FAQ',
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
}: {
  audience: Audience
  eyebrow: string
  title: string
  description?: string
}) {
  const [kind, setKind] = useState<ArticleKind | 'all'>('all')

  const filtered = useMemo(
    () => articles.filter((a) => a.audience.includes(audience) && (kind === 'all' || a.kind === kind)),
    [audience, kind],
  )

  return (
    <div>
      <PageHero eyebrow={eyebrow} title={title} description={description} />
      <div className="container-page py-10">
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
            <ArticleCard key={a.id} a={a} />
          ))}
          {filtered.length === 0 && <p className="text-ink/50">Материалов пока нет.</p>}
        </div>
      </div>
    </div>
  )
}
