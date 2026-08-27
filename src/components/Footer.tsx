import { Link } from 'react-router-dom'

// Единый футер по всему сайту (раздел 5 карты сайта).
export default function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-ink text-white/80">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="mb-3 text-lg font-semibold text-white">Карьерный Юрист</div>
          <p className="text-sm leading-relaxed text-white/60">
            Кадровое агентство и сообщество для юридического рынка — под одним брендом.
          </p>
        </div>

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Кадры</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/kadry">Найти сотрудника</Link></li>
            <li><Link className="hover:text-white" to="/kadry/vacancies">Доска вакансий (демо-каркас)</Link></li>
            <li><Link className="hover:text-white" to="/kadry/salary">Зарплатный навигатор (демо-каркас)</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Сообщество</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/community">Вступить в сообщество</Link></li>
            <li><Link className="hover:text-white" to="/community/clubs/klub-korporativnogo-prava">Клубы (демо-каркас)</Link></li>
            <li><Link className="hover:text-white" to="/events">Мероприятия (демо-каркас)</Link></li>
            <li><Link className="hover:text-white" to="/account">Личный кабинет (демо-каркас)</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">Контакты</div>
          <ul className="space-y-2 text-sm text-white/60">
            <li><a className="hover:text-white" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a></li>
            <li><a className="hover:text-white" href="tel:+79214397031">8 (921) 439-70-31</a></li>
            <li><a className="hover:text-white" href="https://t.me/legalcareerst_support" target="_blank" rel="noreferrer">Telegram: @legalcareerst_support</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5">
        <div className="container-page flex flex-col items-center justify-between gap-3 text-xs text-white/40 sm:flex-row">
          <span>© {new Date().getFullYear()} ИП Руденков И.В. Карьерный Юрист.</span>
          <span className="flex gap-4">
            <Link className="hover:text-white/70" to="/legal/privacy">Политика обработки персональных данных</Link>
            <Link className="hover:text-white/70" to="/legal/consent">Согласия на обработку данных</Link>
          </span>
        </div>
      </div>
    </footer>
  )
}
