import PageHero from '../components/PageHero'
import { NewsCard } from '../components/cards'
import { news } from '../data/news'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function News() {
  useDocumentTitle('Новости')
  return (
    <div>
      <PageHero eyebrow="Карьерный Юрист" title="Новости" description="Что изменилось у бота, на сайте, в подкасте и на встречах с резидентами." />
      <div className="container-page py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {news.map((n) => (
            <NewsCard key={n.slug} n={n} />
          ))}
        </div>
      </div>
    </div>
  )
}
