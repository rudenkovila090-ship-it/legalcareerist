import PageHero from '../../components/PageHero'
import { MaterialCard } from '../../components/cards'
import { materials } from '../../data/materials'
import { paidFirst } from '../../lib/materialOrder'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export default function Materials() {
  useDocumentTitle('Полезные материалы')
  return (
    <div>
      <PageHero eyebrow="Мероприятия" title="Полезные материалы" description="Гайды, чек-листы и записи прошедших мероприятий." />
      <div className="container-page py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paidFirst(materials).map((m) => <MaterialCard key={m.id} m={m} />)}
        </div>
      </div>
    </div>
  )
}
