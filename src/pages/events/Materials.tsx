import PageHero from '../../components/PageHero'
import { MaterialCard } from '../../components/cards'
import { materials } from '../../data/materials'

export default function Materials() {
  return (
    <div>
      <PageHero eyebrow="Мероприятия" title="Полезные материалы" description="Гайды, чек-листы и записи прошедших мероприятий." />
      <div className="container-page py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((m) => <MaterialCard key={m.id} m={m} />)}
        </div>
      </div>
    </div>
  )
}
