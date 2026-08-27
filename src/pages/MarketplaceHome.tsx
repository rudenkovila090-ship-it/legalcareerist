import { Link } from 'react-router-dom'
import PageHero from '../components/PageHero'

// /marketplace — юридический маркетплейс: демо-каркас, добавлен по запросу
// как четвертое направление рядом с Кадрами/Сообществом/Мероприятиями.
// Наполнение (какие услуги/специалисты будут представлены) еще не
// согласовано с бизнесом.
export default function MarketplaceHome() {
  return (
    <div>
      <PageHero
        eyebrow="Карьерный Юрист"
        title="Marketplace"
        description="Маркетплейс юридических услуг и специалистов — раздел в разработке."
        prototype
      />
      <div className="container-page py-16 text-center">
        <p className="mx-auto max-w-lg text-ink/60">
          Скоро здесь появится каталог юридических услуг и специалистов. А пока — загляните в{' '}
          <Link className="underline" to="/kadry/employers">Кадры</Link> или{' '}
          <Link className="underline" to="/community">Сообщество</Link>.
        </p>
      </div>
    </div>
  )
}
