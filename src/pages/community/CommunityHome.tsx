import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { ClubCard } from '../../components/cards'
import { clubs } from '../../data/clubs'
import LeadForm from '../../components/LeadForm'

export default function CommunityHome() {
  return (
    <div>
      <PageHero
        eyebrow="Сообщество"
        title="Комьюнити для студентов-юристов"
        description="Тематические клубы по специализациям, обмен опытом и нетворкинг с практикующими юристами."
      />

      <section className="container-page py-12">
        <h2 className="mb-6 text-2xl font-semibold">Клубы</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {clubs.map((c) => (
            <ClubCard key={c.id} c={c} />
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-ink/10 p-5">
            <div className="font-semibold">Бесплатный тариф</div>
            <p className="mt-1 text-sm text-ink/60">Доступ к общему чату, анонсам мероприятий и Базе знаний сообщества.</p>
          </div>
          <div className="rounded-xl border border-ink/10 p-5">
            <div className="font-semibold">Платный тариф</div>
            <p className="mt-1 text-sm text-ink/60">Доступ ко всем клубам, скидки на мероприятия, менторские сессии.</p>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <div className="mx-auto max-w-xl">
          <LeadForm
            sourceBlock="community"
            formType="community_join"
            title="Вступить в сообщество"
            interestOptions={['Адвокатура', 'Консалтинг', 'Инхаус', 'Госслужба']}
          />
        </div>
        <p className="mt-4 text-center text-sm text-ink/50">
          Материалы для студентов — в разделе <Link className="underline" to="/community/knowledge">База знаний сообщества</Link>.
        </p>
      </section>
    </div>
  )
}
