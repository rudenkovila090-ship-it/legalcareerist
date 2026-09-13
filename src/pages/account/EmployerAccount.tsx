import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole, clearActiveRole } from '../../lib/accountRole'
import { demoEmployer, demoEmployerCompany } from '../../lib/account'
import {
  getVacancies, approveVacancy, rejectVacancy, closeVacancy, sendStageMailing, deleteVacancy,
} from '../../lib/vacancies'
import {
  getCreditsState, isFreeAvailable, freeAvailableAt, canGenerate, addCredits, formatCountdown, VACANCY_CREDITS_KEY,
} from '../../lib/generationCredits'
import { submitLead } from '../../lib/leads'
import type { VacancyModerationStatus, VacancyVisibilityStage } from '../../types'

const money = new Intl.NumberFormat('ru-RU')

const vacancyCreditPacks = [
  { id: 'pack10', count: 10, price: 490 },
  { id: 'pack30', count: 30, price: 990 },
] as const

const moderationStatusLabel: Record<VacancyModerationStatus, string> = {
  pending_moderation: 'На модерации',
  published: 'Опубликована',
  rejected: 'Отклонена',
  closed: 'Закрыта',
}
const moderationStatusClass: Record<VacancyModerationStatus, string> = {
  pending_moderation: 'bg-amber-50 text-amber-700',
  published: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  closed: 'bg-ink/[0.06] text-ink/50',
}
const stageLabel: Record<VacancyVisibilityStage, string> = {
  residents: 'Резиденты сообщества',
  talent_pool: 'Кадровый резерв',
  public: 'Открытый сайт',
}
const stageMailingButtonLabel: Record<VacancyVisibilityStage, string> = {
  residents: 'Разослать резидентам сообщества',
  talent_pool: 'Разослать по кадровому резерву',
  public: '',
}

// /account/employer — кабинет работодателя, отдельный от /account/candidate
// (см. AccountGate.tsx). Модерация — демо-кнопки "Одобрить"/"Отклонить"
// вместо реального бэкенда/второй роли модератора (её пока нет — см. план
// "личный кабинет разработчика" на будущее): работодатель здесь же видит,
// что произошло бы после проверки, без ожидания реального модератора.
export default function EmployerAccount() {
  useDocumentTitle('Личный кабинет — Работодатель')
  const role = getActiveRole()
  const navigate = useNavigate()

  const [vacancies, setVacancies] = useState(getVacancies())
  const [creditsState, setCreditsState] = useState(getCreditsState(VACANCY_CREDITS_KEY))
  const [buyingPack, setBuyingPack] = useState<(typeof vacancyCreditPacks)[number] | null>(null)
  const [buyerPhone, setBuyerPhone] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  if (role !== 'employer') return <Navigate to="/account" replace />

  function refresh() {
    setVacancies(getVacancies())
  }
  function refreshCredits() {
    setCreditsState(getCreditsState(VACANCY_CREDITS_KEY))
  }

  const freeAvailable = isFreeAvailable(creditsState)
  const nextFreeAt = freeAvailableAt(creditsState)
  const canGenerateVacancy = canGenerate(VACANCY_CREDITS_KEY)

  function handleApprove(id: string) {
    approveVacancy(id)
    refresh()
    setNotice('Вакансия прошла модерацию и опубликована — сначала видна резидентам сообщества.')
  }
  function handleRejectSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rejectingId || !rejectReason.trim()) return
    rejectVacancy(rejectingId, rejectReason)
    refresh()
    setRejectingId(null)
    setRejectReason('')
  }
  function handleMailing(id: string) {
    const updated = sendStageMailing(id)
    refresh()
    if (updated) {
      const sent = updated.mailings[updated.mailings.length - 1]
      setNotice(`Рассылка отправлена: ${sent.recipientsCount} получателей (${stageLabel[sent.stage]}).`)
    }
  }
  function handleClose(id: string) {
    closeVacancy(id)
    refresh()
  }
  function handleDelete(id: string) {
    deleteVacancy(id)
    refresh()
  }

  function handleBuySubmit(e: FormEvent) {
    e.preventDefault()
    if (!buyingPack || !buyerPhone.trim()) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'vacancy_credits_purchase',
      name: demoEmployer.name,
      contact: buyerPhone,
      interest: [`${buyingPack.count} генераций вакансий за ${buyingPack.price} ₽`],
    })
    addCredits(VACANCY_CREDITS_KEY, buyingPack.count)
    refreshCredits()
    setNotice(`Начислено ${buyingPack.count} генераций вакансий.`)
    setBuyingPack(null)
    setBuyerPhone('')
  }

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

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Вакансии</h2>
            <div className="glass rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Конструктор вакансии</div>
                  <p className="mt-1 text-sm text-ink/60">
                    Заполните форму — вакансия соберется по шаблону и уйдет на модерацию, как и через бота.
                  </p>
                  <div className="mt-2 text-xs text-ink/50">
                    {creditsState.purchasedCredits > 0 && (
                      <span>Куплено генераций: {creditsState.purchasedCredits}. </span>
                    )}
                    {freeAvailable ? (
                      <span className="font-medium text-emerald-600">Бесплатная генерация доступна сейчас.</span>
                    ) : (
                      nextFreeAt && <span>Бесплатная генерация — через {formatCountdown(nextFreeAt.getTime() - now)}.</span>
                    )}
                  </div>
                </div>
                {canGenerateVacancy ? (
                  <Link
                    to="/account/employer/vacancy/new"
                    className="shrink-0 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
                  >
                    Создать вакансию
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-full bg-ink/10 px-6 py-2.5 text-sm font-semibold text-ink/40">
                    Создать вакансию
                  </span>
                )}
              </div>

              <div className="mt-4 border-t border-ink/10 pt-4">
                <div className="text-sm font-semibold text-ink">Пакеты генераций</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {vacancyCreditPacks.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-ink/10 px-4 py-3">
                      <div className="text-sm">
                        <span className="font-semibold text-ink">{p.count} генераций</span>
                        <span className="text-ink/50"> — {p.price} ₽</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBuyingPack(p)}
                        className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
                      >
                        Купить
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {vacancies.length > 0 && (
                <div className="mt-4 divide-y divide-ink/10 border-t border-ink/10">
                  {vacancies.map((v) => (
                    <div key={v.id} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{v.data.title || 'Вакансия без названия'}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${moderationStatusClass[v.moderationStatus]}`}>
                              {moderationStatusLabel[v.moderationStatus]}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-ink/50">
                            {v.data.anonymous ? 'Анонимно' : v.data.company}
                            {v.data.city && ` · ${v.data.city}`}
                            {(v.data.salaryFrom > 0 || v.data.salaryTo > 0) &&
                              ` · ${v.data.salaryFrom ? money.format(v.data.salaryFrom) : '…'}–${v.data.salaryTo ? money.format(v.data.salaryTo) : '…'} ₽`}
                          </div>
                          {v.moderationStatus === 'published' && (
                            <div className="mt-1 text-xs text-ink/50">Этап показа: {stageLabel[v.visibilityStage]}</div>
                          )}
                          {v.moderationStatus === 'rejected' && v.rejectionReason && (
                            <div className="mt-1 text-xs text-red-600">Причина отказа: {v.rejectionReason}</div>
                          )}
                          {v.mailings.length > 0 && (
                            <div className="mt-1 text-xs text-ink/40">
                              Рассылок: {v.mailings.length} (последняя — {v.mailings[v.mailings.length - 1].recipientsCount} получателей)
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {v.moderationStatus === 'pending_moderation' && (
                            <>
                              <button type="button" onClick={() => handleApprove(v.id)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                Одобрить (демо)
                              </button>
                              <button type="button" onClick={() => setRejectingId(v.id)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                                Отклонить (демо)
                              </button>
                            </>
                          )}
                          {v.moderationStatus === 'published' && v.visibilityStage !== 'public' && (
                            <button type="button" onClick={() => handleMailing(v.id)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                              {stageMailingButtonLabel[v.visibilityStage]}
                            </button>
                          )}
                          {v.moderationStatus === 'published' && (
                            <button type="button" onClick={() => handleClose(v.id)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                              Закрыть
                            </button>
                          )}
                          {v.moderationStatus !== 'closed' && (
                            <Link to={`/account/employer/vacancy/${v.id}/edit`} className="text-sm font-medium text-ink/60 hover:text-ink">
                              Изменить
                            </Link>
                          )}
                          <button type="button" onClick={() => handleDelete(v.id)} className="text-ink/40 hover:text-red-600">Удалить</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">База знаний работодателя</h2>
            <div className="glass rounded-xl p-6">
              <p className="text-sm text-ink/70">
                Как создать вакансию, составить хорошее описание и что проверяет модератор — в разделе «Кадры → Работодателям → База знаний».
              </p>
              <Link to="/kadry/employers" className="mt-4 inline-block rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                Открыть базу знаний
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Покупка пакета генераций */}
      {buyingPack && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setBuyingPack(null) }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{buyingPack.count} генераций вакансий — {buyingPack.price} ₽</h3>
              <button type="button" onClick={() => setBuyingPack(null)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>
            <form onSubmit={handleBuySubmit} className="grid gap-3">
              <input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="Телефон для чека, например 89990000000"
                required
                className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-ink/90">
                Оплатить {buyingPack.price} ₽
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Отклонение вакансии — демо-модерация */}
      {rejectingId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectingId(null) }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Причина отказа</h3>
              <button type="button" onClick={() => setRejectingId(null)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>
            <form onSubmit={handleRejectSubmit} className="grid gap-3">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Например: не указана вилка зарплаты"
                rows={3}
                required
                className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-ink/90">
                Отклонить вакансию
              </button>
            </form>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-xl">
            {notice}
            <button type="button" onClick={() => setNotice(null)} className="text-white/60 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
