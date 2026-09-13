import { Navigate, useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole, clearActiveRole } from '../../lib/accountRole'
import { demoEmployer, demoEmployerCompany } from '../../lib/account'

// /account/employer — кабинет работодателя, отдельный от /account/candidate
// (см. AccountGate.tsx). Пока каркас: конструктор вакансий, модерация,
// публикация + рассылка соискателям и техкарточки в базе знаний
// работодателя — следующий этап разработки (см. договоренность о
// поэтапной сдаче).
export default function EmployerAccount() {
  useDocumentTitle('Личный кабинет — Работодатель')
  const role = getActiveRole()
  const navigate = useNavigate()
  if (role !== 'employer') return <Navigate to="/account" replace />

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет"
        title={demoEmployer.name}
        description="Кабинет работодателя — демо-аккаунт, отдельный от кабинета соискателя."
        prototype
      />

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_2fr]">
        <aside className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Компания</div>
            <div className="mt-2 text-sm font-medium">{demoEmployerCompany.name}</div>
            <div className="text-sm text-ink/60">{demoEmployerCompany.position}</div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Контакты</div>
            <div className="mt-2 text-sm">{demoEmployer.email}</div>
            <div className="text-sm">{demoEmployer.phone}</div>
            <div className="text-sm">{demoEmployer.telegramId}</div>
          </div>
          <button
            type="button"
            onClick={() => { clearActiveRole(); navigate('/account') }}
            className="block w-full rounded-full border border-ink/15 px-5 py-2.5 text-center text-sm font-semibold text-ink/60 hover:text-ink"
          >
            Выйти / сменить роль
          </button>
        </aside>

        <div className="space-y-4">
          <div className="glass rounded-xl p-6">
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Скоро в этом кабинете</div>
            <h2 className="mb-4 text-lg font-semibold">Работа с вакансиями — следующий этап разработки</h2>
            <ul className="space-y-2 text-sm text-ink/70">
              <li>· Конструктор вакансии — заполняете форму, вакансия собирается по шаблону</li>
              <li>· Модерация и публикация — с рассылкой потенциальным соискателям</li>
              <li>· Редактирование опубликованных вакансий</li>
              <li>· Лимит генераций: 1 бесплатная раз в 72 часа, пакеты 490 ₽ / 10 и 990 ₽ / 30</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
