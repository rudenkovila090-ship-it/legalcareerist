import { Link, useParams } from 'react-router-dom'
import { articles } from '../data/articles'
import { TagRow } from '../components/Tag'
import RelatedContentBlock from '../components/RelatedContentBlock'
import { getRelatedContent } from '../lib/related'

const kindLabel = { article: 'Статья', faq: 'FAQ', glossary: 'Глоссарий', checklist: 'Чек-лист' }

export default function ArticleDetail() {
  const { slug } = useParams()
  const article = articles.find((a) => a.slug === slug)

  if (!article) {
    return (
      <div className="container-page py-16">
        <p>Материал не найден. <Link className="underline" to="/">На главную</Link></p>
      </div>
    )
  }

  const related = getRelatedContent(article, 'article', article.id)

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-3xl">
        <span className="text-sm font-medium uppercase tracking-wide text-gold">{kindLabel[article.kind]}</span>
        <h1 className="mt-2 text-3xl font-semibold">{article.title}</h1>
        <div className="mt-2 text-sm text-ink/50">{article.author} · {new Date(article.date).toLocaleDateString('ru-RU')}</div>
        {(article.specialization.length > 0 || article.industry.length > 0) && (
          <div className="mt-4">
            <TagRow specialization={article.specialization} industry={article.industry} />
          </div>
        )}
        <p className="mt-6 leading-relaxed text-ink/80 whitespace-pre-line">{article.body}</p>

        <RelatedContentBlock items={related} />
      </div>
    </div>
  )
}
