import PageHero from '../components/PageHero'

export default function About() {
  return (
    <div>
      <PageHero eyebrow="Карьерный Юрист" title="О нас" description="Кадровое агентство и сообщество для юридического рынка — под одним брендом." />
      <div className="container-page py-12">
        <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/30">
          Раздел «О нас» — наполнение уточняется
        </div>
      </div>
    </div>
  )
}
