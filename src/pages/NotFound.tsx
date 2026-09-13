import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { useDocumentTitle } from '../lib/useDocumentTitle'

// Catch-all (path="*") — раньше несуществующий/битый адрес рендерил пустую
// страницу внутри <Layout>: и для человека тупик без объяснений, и для
// поисковика soft-404 (200 на несуществующий URL). Реальный HTTP-статус
// SPA без сервера рендеринга не отдаст, но страница хотя бы объясняет, что
// произошло, и ведет дальше — это тот минимум, который можно сделать на
// чистом клиенте.
export default function NotFound() {
  useDocumentTitle('Страница не найдена')
  return (
    <div>
      <PageHero eyebrow="404" title="Страница не найдена" description="Такой страницы нет — возможно, ссылка устарела или в адресе опечатка." />
      <div className="container-page py-12">
        <div className="glass flex flex-wrap items-center justify-center gap-3 rounded-2xl p-10 text-center">
          <Link to="/" className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
            На главную
          </Link>
          <Link to="/kadry/vacancies" className="rounded-full border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
            Все вакансии
          </Link>
          <Link to="/events" className="rounded-full border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
            Мероприятия
          </Link>
        </div>
      </div>
    </div>
  )
}
