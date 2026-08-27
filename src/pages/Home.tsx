import { Link } from 'react-router-dom'
import { events } from '../data/events'
import { articles } from '../data/articles'
import { testimonials } from '../data/testimonials'
import { EventCard, ArticleCard } from '../components/cards'
import LeadForm from '../components/LeadForm'

const pillars = [
  {
    to: '/kadry',
    title: 'Кадры',
    text: 'Подбор юристов и адвокатов: адвокатура, консалтинг, инхаус, госслужба.',
  },
  {
    to: '/community',
    title: 'Сообщество',
    text: 'Клубы по специализациям для студентов-юристов и начинающих специалистов.',
  },
  {
    to: '/events',
    title: 'Мероприятия',
    text: 'Вебинары, бизнес-завтраки, интенсивы и записи для карьерного роста.',
  },
]

export default function Home() {
  const feed = [...events, ...articles]
    .sort((a, b) => {
      const da = 'dateTime' in a ? a.dateTime : a.date
      const db = 'dateTime' in b ? b.dateTime : b.date
      return new Date(db).getTime() - new Date(da).getTime()
    })
    .slice(0, 6)

  return (
    <div>
      <section className="border-b border-ink/10 bg-white">
        <div className="container-page grid gap-10 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="mb-3 text-sm font-medium uppercase tracking-wide text-gold">Карьерный Юрист</div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Карьера в праве — от первой стажировки до партнёрства
            </h1>
            <p className="mt-4 max-w-xl text-ink/60">
              Кадровое агентство, сообщество и мероприятия юридического рынка — под одним брендом,
              с единой специализацией на адвокатуре, консалтинге, инхаусе и госслужбе.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {pillars.map((p) => (
                <Link
                  key={p.to}
                  to={p.to}
                  className="rounded-xl border border-ink/10 bg-paper p-4 transition-shadow hover:shadow-md"
                >
                  <div className="font-semibold">{p.title}</div>
                  <div className="mt-1 text-sm text-ink/60">{p.text}</div>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-ink p-8 text-white">
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">О проекте</div>
            <p className="mt-3 text-white/80">
              Мы объединяем поиск работы, профессиональное сообщество и обучающие события в одну
              экосистему: одна вакансия, одна статья или один вебинар ведут вас дальше — к похожим
              возможностям, релевантному клубу или следующему шагу в карьере.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-2xl font-semibold text-gold-light">4</div>
                <div className="text-white/60">специализации рынка</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-gold-light">3</div>
                <div className="text-white/60">направления в одном аккаунте</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Лента актуального</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feed.map((item) =>
            'dateTime' in item ? <EventCard key={item.id} e={item} /> : <ArticleCard key={item.id} a={item} />,
          )}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-14">
        <div className="container-page">
          <h2 className="mb-6 text-2xl font-semibold">Отзывы</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure key={t.id} className="rounded-xl border border-ink/10 p-5">
                <blockquote className="text-sm text-ink/80">«{t.text}»</blockquote>
                <figcaption className="mt-3 text-sm font-medium text-ink/60">{t.companyOrRole}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <div className="mx-auto max-w-xl">
          <LeadForm
            sourceBlock="home"
            formType="general_lead"
            title="Оставьте заявку — подскажем, с чего начать"
            description="Соискатель, работодатель или просто интересуетесь рынком — направим в нужный раздел."
            interestOptions={['Ищу работу', 'Ищу сотрудника', 'Хочу в сообщество', 'Мероприятия']}
          />
        </div>
      </section>
    </div>
  )
}
