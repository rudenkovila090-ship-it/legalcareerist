import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { legalDocs } from '../data/legalDocs'

// Юридические документы сообщества (адрес /community/documents). Страницы «Документы» у «Кадров» и «Мероприятий» пустыми
// не держим: их адреса переадресуют на общий раздел /legal.
export default function Documents({
  eyebrow = 'Сообщество',
  description = 'Юридические документы сообщества.',
}: { eyebrow?: string; description?: string } = {}) {
  useDocumentTitle(`Документы — ${eyebrow}`)
  return (
    <div>
      <PageHero eyebrow={eyebrow} title="Документы" description={description} />
      <div className="container-page py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {legalDocs.map((d) => (
            <Link key={d.to} to={d.to} className="glass block rounded-xl p-5">
              <div className="font-semibold leading-snug">{d.title}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
