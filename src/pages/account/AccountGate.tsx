import { useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole, setActiveRole, type ActiveRole } from '../../lib/accountRole'
import { demoUser, demoEmployer, demoEmployerCompany } from '../../lib/account'

function IconCandidate() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
    </svg>
  )
}
function IconEmployer() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
      <path d="M4 13.5h16" />
    </svg>
  )
}
function IconModerator() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M12 3.5 5 6.5v5c0 4.5 2.9 7.6 7 8.5 4.1-.9 7-4 7-8.5v-5L12 3.5Z" />
      <path d="M9.3 12l1.9 1.9 3.5-3.9" />
    </svg>
  )
}

// /account — точка входа в личный кабинет: без пароля (по решению
// заказчика для прототипа), кнопка "Войти как…" запоминает роль в
// localStorage (accountRole.ts) и ведет в кабинет соискателя или
// работодателя — это два разных, не связанных между собой кабинета.
//
// Раньше при уже выбранной роли эта страница сразу редиректила в кабинет
// (Navigate replace) — из-за этого кнопка «Назад» из кабинета одной роли
// не могла привести к выбору другой: /account вообще не оставался в
// истории браузера. Теперь страница-гейт всегда показывает обе роли —
// переключиться можно в любой момент, а «Назад» всегда возвращает сюда.
export default function AccountGate() {
  useDocumentTitle('Личный кабинет')
  const navigate = useNavigate()
  const role = getActiveRole()

  function enter(next: ActiveRole) {
    setActiveRole(next)
    if (next === 'candidate') navigate('/account/candidate')
    else if (next === 'employer') navigate('/account/employer')
    else navigate('/account/moderator')
  }

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет"
        title="Войти в личный кабинет"
        description={
          role
            ? 'Демо-доступ без пароля — вы уже заходили в один из кабинетов, можно продолжить или переключиться на другой.'
            : 'Демо-доступ без пароля — выберите роль, чтобы посмотреть кабинет соискателя или работодателя.'
        }
        prototype
      />

      <div className="container-page grid gap-5 py-12 sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" onClick={() => enter('employer')} className="glass relative block rounded-2xl p-6 text-left">
          {role === 'employer' && (
            <span className="absolute right-5 top-5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Текущий кабинет</span>
          )}
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white">
            <IconEmployer />
          </div>
          <h2 className="mt-1 text-xl font-semibold">Войти как работодатель</h2>
          <p className="mt-2 text-sm text-ink/60">
            Демо-аккаунт «{demoEmployer.name}», {demoEmployerCompany.position} в {demoEmployerCompany.name} — конструктор вакансий и модерация (в разработке).
          </p>
          <span className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
            {role === 'employer' ? 'Продолжить →' : 'Войти →'}
          </span>
        </button>

        <button type="button" onClick={() => enter('candidate')} className="glass relative block rounded-2xl p-6 text-left">
          {role === 'candidate' && (
            <span className="absolute right-5 top-5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Текущий кабинет</span>
          )}
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white">
            <IconCandidate />
          </div>
          <h2 className="mt-1 text-xl font-semibold">Войти как соискатель</h2>
          <p className="mt-2 text-sm text-ink/60">
            Демо-аккаунт «{demoUser.name}» — отклики на вакансии, конструктор резюме, регистрации на мероприятия.
          </p>
          <span className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
            {role === 'candidate' ? 'Продолжить →' : 'Войти →'}
          </span>
        </button>

        <button type="button" onClick={() => enter('moderator')} className="glass relative block rounded-2xl p-6 text-left">
          {role === 'moderator' && (
            <span className="absolute right-5 top-5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Текущий кабинет</span>
          )}
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white">
            <IconModerator />
          </div>
          <h2 className="mt-1 text-xl font-semibold">Войти как модератор</h2>
          <p className="mt-2 text-sm text-ink/60">
            Демо-роль администратора площадки — модерация мероприятий от организаторов (одобрить/отклонить).
          </p>
          <span className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">
            {role === 'moderator' ? 'Продолжить →' : 'Войти →'}
          </span>
        </button>
      </div>
    </div>
  )
}
