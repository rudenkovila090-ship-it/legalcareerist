import PageHero from '../components/PageHero'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function Documents({
  eyebrow = 'Мероприятия',
  description = 'Договоры, правила участия и другие документы мероприятий.',
}: { eyebrow?: string; description?: string } = {}) {
  useDocumentTitle('Документы')
  return (
    <div>
      <PageHero eyebrow={eyebrow} title="Документы" description={description} />
      <div className="container-page py-12">
        <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/30">
          Временно недоступно. В разработке.
        </div>
      </div>
    </div>
  )
}
