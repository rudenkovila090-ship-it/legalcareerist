import { Link } from 'react-router-dom'
import { SHOW_FIND_EMPLOYEE } from '../../lib/featureFlags'

// Единый подвал раздела «Кадры» — та же структура и для работодателей
// (KadryHome, /kadry/employers), и для соискателей (Candidates,
// /kadry/candidates), построен по тому же принципу, что и EventsFooter/
// CommunityFooter (см. комментарий там): один компонент рендерится на обеих
// страницах, а не заводится двумя похожими копиями.

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M21.5 3.5 2.7 11.2c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.9.9.9.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.7-.8L23.9 4.9c.3-1.3-.5-1.9-1.4-1.4z" />
    </svg>
  )
}
function IconVk() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M13.2 17.3c-5.4 0-8.6-3.7-8.7-9.9h2.8c.1 4.5 2.1 6.4 3.6 6.8v-6.8h2.6v3.9c1.5-.2 3.1-2 3.6-3.9h2.6c-.4 2.3-2.1 4.1-3.3 4.9 1.2.6 3.1 2.2 3.9 4.9h-2.9c-.6-1.8-2-3.2-3.9-3.4v3.4z" />
    </svg>
  )
}
function IconYoutube() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M22 12s0-3-.4-4.4a2.9 2.9 0 0 0-2-2C17.9 5 12 5 12 5s-5.9 0-7.6.6a2.9 2.9 0 0 0-2 2C2 9 2 12 2 12s0 3 .4 4.4a2.9 2.9 0 0 0 2 2C6.1 19 12 19 12 19s5.9 0 7.6-.6a2.9 2.9 0 0 0 2-2C22 15 22 12 22 12z" opacity=".18" />
      <path d="M10 15.2V8.8L15.8 12z" />
    </svg>
  )
}
function IconTiktok() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M16.5 2h-3v13.6a2.6 2.6 0 1 1-2-2.5v-3a5.6 5.6 0 1 0 5 5.6V9c1 .7 2.2 1.1 3.5 1.1V7a3.5 3.5 0 0 1-3.5-3.5z" />
    </svg>
  )
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M13.6 10.6 20.4 3h-2l-5.8 6.6L7.9 3H2.5l6.9 10.1L2.5 21h2l6.2-7 5 7h5.4l-7.2-10.4h-.3zm-2.2 2.5-.7-1L5 4.7h2.3l4.6 6.6.7 1 6 8.6h-2.3l-4.9-7z" />
    </svg>
  )
}
function IconZakon() {
  return <span className="text-[11px] font-bold leading-none">Zn</span>
}
function IconDzen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12,2 Q12,12 22,12 Q12,12 12,22 Q12,12 2,12 Q12,12 12,2 Z" />
    </svg>
  )
}
function IconPodcast() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
    </svg>
  )
}

export default function KadryFooter() {
  return (
    <footer className="border-t border-white/10 bg-ink text-white/40">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-7">
        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Кадры</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/about">О нас</Link></li>
            <li><Link className="hover:text-white" to="/blog?category=Кадры">Блог</Link></li>
            <li><Link className="hover:text-white" to="/news">Новости</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Работодателям</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/kadry/employers#pricing">Система оплаты</Link></li>
            {SHOW_FIND_EMPLOYEE && (
              <li><Link className="hover:text-white" to="/kadry/employers?tab=candidates">Найти сотрудника</Link></li>
            )}
            <li><Link className="hover:text-white" to="/blog?category=Кадры">База знаний</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Соискателям</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/kadry/vacancies">Вакансии</Link></li>
            <li><Link className="hover:text-white" to="/kadry/candidates/consultation">Карьерная консультация</Link></li>
            <li><Link className="hover:text-white" to="/kadry/candidates/reserve">Кадровый резерв</Link></li>
            <li><Link className="hover:text-white" to="/blog?category=Кадры">База знаний</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Помощь</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/kadry/contacts">Поддержка</Link></li>
            <li><Link className="hover:text-white" to="/blog?category=Кадры">База знаний</Link></li>
          </ul>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-3 whitespace-nowrap text-sm font-bold uppercase tracking-wide text-white">Юридический блок</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/legal/privacy">Политика обработки персональных данных</Link></li>
            <li><Link className="hover:text-white" to="/legal/consent">Согласие на обработку персональных данных</Link></li>
            <li><Link className="hover:text-white" to="/legal/marketing-consent">Согласие на получение рекламных и информационных материалов</Link></li>
          </ul>
        </div>
      </div>

      {/* Соцсети — отдельной полноширинной строкой, не колонкой сетки выше:
          8 иконок в один ряд не помещались бы в узкую колонку и переносились
          на вторую строку (тот же прием, что и в EventsFooter/CommunityFooter). */}
      <div className="border-t border-white/10 py-8">
        <div className="container-page">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Социальные сети</div>
          <div className="flex flex-wrap gap-2.5">
            <a href="https://t.me/legalcareerist" target="_blank" rel="noreferrer" aria-label="Telegram" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconTelegram />
            </a>
            <a href="https://vk.com/legalcareerist" target="_blank" rel="noreferrer" aria-label="ВКонтакте" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconVk />
            </a>
            <a href="https://dzen.ru/id/69087002dedfba7e86b46418" target="_blank" rel="noreferrer" aria-label="Дзен" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconDzen />
            </a>
            <a href="https://legalcareerist.mave.digital/" target="_blank" rel="noreferrer" aria-label="Подкаст" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconPodcast />
            </a>
            <a href="https://www.youtube.com/channel/UC3lHAByHe4-To0sJEghrTdw" target="_blank" rel="noreferrer" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconYoutube />
            </a>
            <a href="https://tiktok.com/@legalcareerist" target="_blank" rel="noreferrer" aria-label="TikTok" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconTiktok />
            </a>
            <a href="https://x.com/legalcareerist" target="_blank" rel="noreferrer" aria-label="X (Twitter)" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconX />
            </a>
            <a href="https://zakon.ru/karernyj_yurist" target="_blank" rel="noreferrer" aria-label="Закон.ру" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconZakon />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-5">
        <div className="container-page text-center text-xs text-white/40">
          <span>© {new Date().getFullYear()} ИП Руденков И.В. Карьерный Юрист. ИНН 262607024144 ОГРНИП 325784700110048</span>
        </div>
      </div>
    </footer>
  )
}
