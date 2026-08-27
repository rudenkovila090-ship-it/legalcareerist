import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { consultationTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'

const benefits = [
  { title: 'Подбор работы без лишних хлопот', text: 'Берем переговоры с работодателем на себя и сопровождаем вас от заявки до выхода на позицию.' },
  { title: 'Только юридический рынок', text: 'Понимаем специфику профессии — говорим с вами на одном языке с первого дня.' },
  { title: 'Поддержка на каждом этапе', text: 'От первой заявки до выхода на позицию — или от разбора карьерной ситуации до плана действий.' },
]

const services = [
  {
    to: '/kadry/candidates/reserve',
    tag: 'Кадровый резерв',
    title: 'Кадровый резерв',
    text: 'Подайте заявку один раз — будем предлагать релевантные вакансии, пока не найдется подходящая.',
    cta: 'Подать заявку',
  },
  {
    to: '/kadry/candidates/consultation',
    tag: 'От 1 500 ₽',
    title: 'Карьерная консультация',
    text: 'Разбор карьерной ситуации, подготовка к собеседованию, аудит резюме и другие услуги — соберите свой набор под задачу.',
    cta: 'Выбрать консультацию',
  },
]

const faqItems = [
  { q: 'В чем разница между кадровым резервом и консультацией?', a: 'Кадровый резерв — подбор вакансий под ваш профиль. Консультация — работа с карьерным консультантом: резюме, собеседования, стратегия поиска, карьерные кризисы.' },
  { q: 'Можно воспользоваться и тем, и другим?', a: 'Да, это независимые услуги — можно подать заявку в резерв и отдельно записаться на консультацию.' },
  { q: 'Как быстрее получить доступ к вакансиям?', a: 'Резиденты Сообщества видят новые вакансии первыми — раньше кадрового резерва и открытого рынка.' },
]

const railItems = [
  { id: 'hero', label: 'Соискателям' },
  { id: 'services', label: 'Услуги' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'faq', label: 'FAQ' },
]

export default function Candidates() {
  return (
    <div>
      <SectionRail items={railItems} />

      <div id="hero">
        <PageHero
          eyebrow="Кадровое юридическое агентство"
          title="Ищете работу или карьерный ориентир? Мы рядом на каждом шаге"
          description="Подбор вакансий и карьерные консультации — для студентов-юристов, помощников и начинающих специалистов юридического рынка."
        />
      </div>

      {/* Преимущества */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Преимущества</div>
          <h2 className="mb-6 text-2xl font-semibold">Почему соискатели обращаются к нам</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="glass rounded-xl p-5">
                <div className="font-semibold">{b.title}</div>
                <p className="mt-2 text-sm text-ink/60">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Услуги */}
      <section id="services" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Услуги</div>
        <h2 className="mb-6 text-2xl font-semibold">Выберите, что нужно именно вам</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {services.map((s) => (
            <Link key={s.to} to={s.to} className="glass flex h-full flex-col rounded-2xl p-6">
              <span className="inline-block w-fit rounded-full bg-gold-light/25 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
                {s.tag}
              </span>
              <h3 className="mt-4 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink/60">{s.text}</p>
              <span className="mt-5 inline-block w-fit rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white sm:mt-auto">{s.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Отзывы */}
      <div id="reviews">
        <Testimonials items={consultationTestimonials} compact />
      </div>

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={faqItems} title="Частые вопросы" />
      </div>

      {/* Доп. призыв к действию */}
      <section className="container-page pb-16">
        <div className="rounded-2xl bg-ink px-6 py-10 text-center text-white sm:px-10">
          <div className="text-xl font-semibold">Не знаете, с чего начать?</div>
          <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
            Напишите в Telegram — подскажем, какая услуга подойдет именно вам.
          </p>
          <a
            href="https://t.me/legalcareerst_support"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block rounded-full bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
          >
            Написать в Telegram
          </a>
        </div>
      </section>
    </div>
  )
}
