import { Link, useParams } from 'react-router-dom'
import { news } from '../data/news'
import ArticleBody from '../components/ArticleBody'
import { useNewsViews } from '../lib/useNewsViews'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function NewsDetail() {
  const { slug } = useParams()
  const item = news.find((n) => n.slug === slug)
  useDocumentTitle(item?.title ?? 'Новость не найдена')
  const views = useNewsViews(item?.slug ?? '')

  if (!item) {
    return (
      <div className="container-page py-16">
        <p>Новость не найдена. <Link className="underline" to="/news">Все новости</Link></p>
      </div>
    )
  }

  return (
    <div className="container-page py-12">
      <div className="mx-auto max-w-3xl">
        <Link to="/news" className="text-sm text-ink/50 hover:text-ink">← Все новости</Link>

        <div className="mt-4">
          <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{item.tag}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold">{item.title}</h1>
        <div className="mt-2 text-sm text-ink/50">
          {item.date} · {views ?? '…'} просмотров
        </div>

        <div className="mt-8">
          <ArticleBody body={item.text} />
        </div>

        {item.image && (
          <img src={item.image} alt={item.title} className="mt-8 w-full rounded-xl border border-ink/10" />
        )}
      </div>
    </div>
  )
}
