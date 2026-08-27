import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { vacancies } from '../../data/vacancies'
import { VacancyCard } from '../../components/cards'
import LeadForm from '../../components/LeadForm'

const guarantees = [
  { title: 'Эффективность', text: 'Подбор ведёт консультант с профильной специализацией — не универсальный рекрутер.' },
  { title: 'Скорость', text: 'Первая подборка кандидатов — в течение 5 рабочих дней после брифа.' },
  { title: 'Замена', text: 'Бесплатная замена кандидата, если он не прошёл испытательный срок в течение 3 месяцев.' },
]

export default function KadryHome() {
  return (
    <div>
      <PageHero
        eyebrow="Кадры"
        title="Рекрутинг на юридическом рынке"
        description="Адвокатура, консалтинг, инхаус, государственная служба — подбор с пониманием специфики каждой специализации."
      />

      <section className="container-page grid gap-4 py-12 sm:grid-cols-2">
        <Link to="/kadry/candidates" className="rounded-xl border border-ink/10 bg-white p-6 hover:shadow-md">
          <div className="font-semibold">Соискателям</div>
          <p className="mt-1 text-sm text-ink/60">Резюме, в том числе анонимное, отклики и личный кабинет.</p>
        </Link>
        <Link to="/kadry/employers" className="rounded-xl border border-ink/10 bg-white p-6 hover:shadow-md">
          <div className="font-semibold">Работодателям</div>
          <p className="mt-1 text-sm text-ink/60">Прозрачные тарифы, гарантии, пошаговый процесс подбора.</p>
        </Link>
      </section>

      <section className="container-page py-8">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Актуальные вакансии</h2>
          <Link to="/kadry/vacancies" className="text-sm font-medium text-ink/60 hover:text-ink">
            Все вакансии →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vacancies.slice(0, 3).map((v) => (
            <VacancyCard key={v.id} v={v} />
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-6 text-2xl font-semibold">Наши гарантии</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {guarantees.map((g) => (
              <div key={g.title} className="rounded-xl border border-ink/10 p-5">
                <div className="font-semibold">{g.title}</div>
                <p className="mt-1 text-sm text-ink/60">{g.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page grid gap-6 py-12 md:grid-cols-2">
        <LeadForm
          sourceBlock="kadry"
          formType="candidate_consultation"
          title="Получить бесплатную карьерную консультацию"
          description="Разберём резюме и подходящие направления."
        />
        <LeadForm
          sourceBlock="kadry"
          formType="employer_request"
          title="Найти сотрудника"
          description="Оставьте заявку — консультант свяжется для брифа."
          contactLabel="Телефон / email компании"
        />
      </section>
    </div>
  )
}
