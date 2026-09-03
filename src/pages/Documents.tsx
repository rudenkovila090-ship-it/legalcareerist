import PageHero from '../components/PageHero'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export default function Documents() {
  useDocumentTitle('Документы')
  return (
    <div>
      <PageHero eyebrow="Мероприятия" title="Документы" description="Договоры, правила участия и другие документы мероприятий." />
      <div className="container-page py-12">
        <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/30">
          Раздел «Документы» — наполнение уточняется
        </div>
      </div>
    </div>
  )
}
