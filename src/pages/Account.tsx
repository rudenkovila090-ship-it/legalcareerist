import PageHero from '../components/PageHero'
import { SpecTag } from '../components/Tag'
import {
  demoApplications,
  demoEventRegistrations,
  demoMaterialPurchases,
  demoMemberships,
  demoUser,
} from '../lib/account'

const applicationStatusLabel = { new: 'Новый', in_review: 'На рассмотрении', rejected: 'Отказ', offer: 'Оффер' }
const roleLabel = { candidate: 'Кандидат', employer: 'Работодатель', community_member: 'Участник сообщества', admin: 'Админ' }
const registrationStatusLabel = { registered: 'Зарегистрирован', paid: 'Оплачено', attended: 'Посетил' }

// /account — единый личный кабинет вне зависимости от роли (раздел 5, критерий приемки раздел 10):
// один и тот же пользователь видит отклики, покупки материалов и членство в клубе в одном месте.
export default function Account() {
  return (
    <div>
      <PageHero eyebrow="Личный кабинет" title={demoUser.name} description="Демонстрационные данные — показывают связность разделов внутри единого аккаунта." prototype />

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_2fr]">
        <aside className="space-y-4">
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Роли аккаунта</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {demoUser.roles.map((r) => (
                <span key={r} className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-white">
                  {roleLabel[r]}
                </span>
              ))}
            </div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Контакты</div>
            <div className="mt-2 text-sm">{demoUser.email}</div>
            <div className="text-sm">{demoUser.phone}</div>
            <div className="text-sm">{demoUser.telegramId}</div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Специализация</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {demoUser.specialization.map((s) => <SpecTag key={s} id={s} />)}
            </div>
          </div>
        </aside>

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Отклики на вакансии</h2>
            <div className="glass divide-y divide-ink/10 rounded-xl">
              {demoApplications.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{a.vacancyTitle}</div>
                    <div className="text-xs text-ink/50">Отправлен {new Date(a.date).toLocaleDateString('ru-RU')}</div>
                  </div>
                  <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium">{applicationStatusLabel[a.status]}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Регистрации на мероприятия</h2>
            <div className="glass divide-y divide-ink/10 rounded-xl">
              {demoEventRegistrations.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4">
                  <div className="font-medium">{r.eventTitle}</div>
                  <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium">{registrationStatusLabel[r.status]}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Покупки материалов</h2>
            <div className="glass divide-y divide-ink/10 rounded-xl">
              {demoMaterialPurchases.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div className="font-medium">{p.materialTitle}</div>
                  <a href={p.accessUrl} className="text-sm font-medium text-ink underline">Открыть доступ</a>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Членство в клубах сообщества</h2>
            <div className="glass divide-y divide-ink/10 rounded-xl">
              {demoMemberships.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">{m.clubName}</div>
                    <div className="text-xs text-ink/50">С {new Date(m.joinedAt).toLocaleDateString('ru-RU')}</div>
                  </div>
                  <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium">{m.tier === 'paid' ? 'Платный тариф' : 'Бесплатный тариф'}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
