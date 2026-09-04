import PageHero from '../components/PageHero'
import { useDocumentTitle } from '../lib/useDocumentTitle'

// Общая страница-заглушка для пунктов навигации, чье наполнение еще не согласовано.
export default function Placeholder({ eyebrow, title }: { eyebrow: string; title: string }) {
  useDocumentTitle(title)
  return (
    <div>
      <PageHero eyebrow={eyebrow} title={title} />
      <div className="container-page py-12">
        <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/30">
          Раздел «{title}» — наполнение уточняется
        </div>
      </div>
    </div>
  )
}
