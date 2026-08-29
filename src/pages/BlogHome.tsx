import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

// /blog — демо-каркас, добавлен по запросу рядом с Кадрами/Сообществом/
// Мероприятиями/Маркетплейсом. Наполнение еще не согласовано с бизнесом.
export default function BlogHome() {
  return (
    <div>
      <PageHero
        eyebrow="Карьерный Юрист"
        title="Блог"
        description="Статьи о карьере в праве, подборе персонала и юридическом рынке — раздел в разработке."
        prototype
      />
      <div className="container-page py-16 text-center">
        <p className="mx-auto max-w-lg text-ink/60">
          Скоро здесь появятся статьи и разборы. А пока — загляните в{' '}
          <Link className="underline" to="/kadry/employers">Кадры</Link> или{' '}
          <Link className="underline" to="/community">Сообщество</Link>.
        </p>
      </div>

      {/* Подкаст — отдельный раздел блога, наполнение уточняется. */}
      <section className="border-t border-ink/10 bg-white py-16">
        <div className="container-page text-center">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Блог</div>
          <h2 className="mb-2 text-2xl font-semibold">Подкаст</h2>
          <p className="mx-auto mb-6 max-w-lg text-sm text-ink/60">
            Разговоры о найме, карьере и юридическом рынке — раздел в разработке, выпуски скоро появятся здесь.
          </p>
          <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-ink/15 p-10 text-sm text-ink/30">
            Раздел «Подкаст» — наполнение уточняется
          </div>
        </div>
      </section>
    </div>
  )
}
