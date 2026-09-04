import { Link, useParams } from 'react-router-dom'
import { articles } from '../data/articles'
import RelatedContentBlock from '../components/RelatedContentBlock'
import ArticleBody from '../components/ArticleBody'
import TariffJoinBlock from '../components/TariffJoinBlock'
import { getRelatedContent } from '../lib/related'
import { useArticleViews } from '../lib/useArticleViews'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const kindLabel = { article: 'Статья', faq: 'FAQ', glossary: 'Глоссарий', checklist: 'Чек-лист' }

export default function ArticleDetail() {
  const { slug } = useParams()
  const article = articles.find((a) => a.slug === slug)
  useDocumentTitle(article?.title ?? 'Материал не найден')
  const views = useArticleViews(article?.slug ?? '')

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
        <div className="mt-2 text-sm text-ink/50">
          {new Date(article.date).toLocaleDateString('ru-RU')} · {views ?? '…'} просмотров
        </div>

        <div className="mt-8">
          <ArticleBody body={article.body} />
        </div>

        {article.cta === 'community-tariff' && (
          <div className="mt-10">
            <TariffJoinBlock />
          </div>
        )}

        <RelatedContentBlock items={related} />
      </div>
    </div>
  )
}
