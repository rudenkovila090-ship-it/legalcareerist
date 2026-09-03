import PageHero from '../components/PageHero'
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
            <div key={n.title} className="glass rounded-xl p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{n.tag}</span>
                <span className="text-xs text-ink/40">{n.date}</span>
              </div>
              <div className="mt-3 font-semibold">{n.title}</div>
              <p className="mt-1.5 text-sm text-ink/60">{n.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
