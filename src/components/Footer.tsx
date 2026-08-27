import { Link } from 'react-router-dom'

// Единый футер по всему сайту (раздел 5 карты сайта).
export default function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-ink text-white/80">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="mb-3 text-lg font-semibold text-white">Карьерный Юрист</div>
          <p className="text-sm leading-relaxed text-white/60">
            Кадры, сообщество и мероприятия для юридического рынка — под одним брендом.
          </p>
        </div>

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Кадры</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/kadry/vacancies">Вакансии</Link></li>
            <li><Link className="hover:text-white" to="/kadry/candidates">Соискателям</Link></li>
            <li><Link className="hover:text-white" to="/kadry/employers">Работодателям</Link></li>
            <li><Link className="hover:text-white" to="/kadry/salary">Зарплатный навигатор</Link></li>
            <li><Link className="hover:text-white" to="/kadry/knowledge">База знаний</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Сообщество и мероприятия</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/community">Клубы сообщества</Link></li>
            <li><Link className="hover:text-white" to="/events">Все мероприятия</Link></li>
            <li><Link className="hover:text-white" to="/events/materials">Полезные материалы</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Контакты</div>
          <ul className="space-y-2 text-sm text-white/60">
            <li>hello@career-lawyer.example</li>
            <li>+7 495 000-00-00</li>
            <li>Telegram: @career_lawyer_bot</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Карьерный Юрист. Демонстрационный макет.
      </div>
    </footer>
  )
}
