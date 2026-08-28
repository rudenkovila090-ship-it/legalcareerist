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
    </div>
  )
}
