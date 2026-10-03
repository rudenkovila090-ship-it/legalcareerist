import PageHero from '../../components/PageHero'
import { MaterialCard } from '../../components/cards'
import { materials } from '../../data/materials'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export default function Materials() {
  useDocumentTitle('Полезные материалы')
  return (
    <div>
      <PageHero eyebrow="Мероприятия" title="Полезные материалы" description="Гайды, чек-листы и записи прошедших мероприятий." prototype />
      <div className="container-page py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((m) => <MaterialCard key={m.id} m={m} />)}
        </div>
      </div>
    </div>
  )
}
