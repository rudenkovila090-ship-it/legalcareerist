import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { SpecTag } from '../../components/Tag'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import {
  demoApplications,
  demoEventRegistrations,
  demoMaterialPurchases,
  demoMemberships,
  demoUser,
} from '../../lib/account'
import { getActiveRole, clearActiveRole } from '../../lib/accountRole'
import { getResumes, saveUploadedResume, deleteResume } from '../../lib/resumes'
import {
  getCreditsState, isFreeAvailable, freeAvailableAt, canGenerate, addCredits, formatCountdown, RESUME_CREDITS_KEY,
} from '../../lib/generationCredits'
import { submitLead } from '../../lib/leads'

const applicationStatusLabel = { new: 'Новый', in_review: 'На рассмотрении', rejected: 'Отказ', offer: 'Оффер' }
const roleLabel = { candidate: 'Кандидат', employer: 'Работодатель', community_member: 'Участник сообщества', admin: 'Админ' }
const registrationStatusLabel = { registered: 'Зарегистрирован', paid: 'Оплачено', attended: 'Посетил' }

const resumeCreditPacks = [
  { id: 'pack10', count: 10, price: 490 },
  { id: 'pack50', count: 50, price: 990 },
] as const

// /account/candidate — кабинет соискателя (см. AccountGate.tsx: вход без
// пароля, по кнопке "Войти как соискатель"). Отклики/регистрации/покупки/
// членство — прежнее содержимое единого /account; "Резюме" — новый раздел:
// конструктор резюме (лимит генераций, см. generationCredits.ts) и загрузка
// готового файла.
export default function CandidateAccount() {
  useDocumentTitle('Личный кабинет — Соискатель')
  const role = getActiveRole()
  const navigate = useNavigate()

  const [resumes, setResumes] = useState(getResumes())
  const [creditsState, setCreditsState] = useState(getCreditsState(RESUME_CREDITS_KEY))
  const [buyingPack, setBuyingPack] = useState<(typeof resumeCreditPacks)[number] | null>(null)
  const [buyerPhone, setBuyerPhone] = useState('')
  const [purchasedNotice, setPurchasedNotice] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (role !== 'candidate') return <Navigate to="/account" replace />

  const freeAvailable = isFreeAvailable(creditsState)
  const nextFreeAt = freeAvailableAt(creditsState)
  const canGenerateResume = canGenerate(RESUME_CREDITS_KEY)

  function refreshCredits() {
    setCreditsState(getCreditsState(RESUME_CREDITS_KEY))
  }

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    saveUploadedResume(file.name)
    setResumes(getResumes())
    e.target.value = ''
  }

  function handleDeleteResume(id: string) {
    deleteResume(id)
    setResumes(getResumes())
  }

  function handleBuySubmit(e: FormEvent) {
    e.preventDefault()
    if (!buyingPack || !buyerPhone.trim()) return
    // Демо-покупка: без реальной оплаты (Prodamus не подключен для этого
    // продукта) — заявка фиксируется как лид, генерации начисляются сразу.
    submitLead({
      sourceBlock: 'kadry',
      formType: 'resume_credits_purchase',
      name: demoUser.name,
      contact: buyerPhone,
      interest: [`${buyingPack.count} генераций резюме за ${buyingPack.price} ₽`],
    })
    addCredits(RESUME_CREDITS_KEY, buyingPack.count)
    refreshCredits()
    setPurchasedNotice(`Начислено ${buyingPack.count} генераций резюме.`)
    setBuyingPack(null)
    setBuyerPhone('')
  }

  return (
    <div>
      <PageHero eyebrow="Личный кабинет" title={demoUser.name} description="Демонстрационные данные — показывают связность разделов внутри кабинета соискателя." prototype />

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
          <button
            type="button"
            onClick={() => { clearActiveRole(); navigate('/account') }}
            className="block w-full rounded-full border border-ink/15 px-5 py-2.5 text-center text-sm font-semibold text-ink/60 hover:text-ink"
          >
            Выйти / сменить роль
          </button>
        </aside>

        <div className="space-y-8">
          {/* Резюме — конструктор (лимит генераций) + загрузка готового файла */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Резюме</h2>
            <div className="glass rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Конструктор резюме</div>
                  <p className="mt-1 text-sm text-ink/60">
                    Готовый шаблон с фирменным оформлением «Карьерного юриста» — заполните форму, резюме соберется автоматически.
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
                {canGenerateResume ? (
                  <Link
                    to="/account/candidate/resume/new"
                    className="shrink-0 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
                  >
                    Создать резюме
                  </Link>
                ) : (
                  <span className="shrink-0 rounded-full bg-ink/10 px-6 py-2.5 text-sm font-semibold text-ink/40">
                    Создать резюме
                  </span>
                )}
              </div>

              <div className="mt-4 border-t border-ink/10 pt-4">
                <div className="text-sm font-semibold text-ink">Пакеты генераций</div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {resumeCreditPacks.map((p) => (
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

              <div className="mt-4 border-t border-ink/10 pt-4">
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
                >
                  Загрузить готовое резюме
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
              </div>

              {resumes.length > 0 && (
                <div className="mt-4 divide-y divide-ink/10 border-t border-ink/10">
                  {resumes.map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-sm font-medium">
                          {r.source === 'constructor' ? (r.data?.desiredPosition || 'Резюме без названия') : r.fileName}
                        </div>
                        <div className="text-xs text-ink/50">
                          {r.source === 'constructor' ? 'Конструктор' : 'Загруженный файл'} · {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-sm">
                        {r.source === 'constructor' && (
                          <>
                            <Link to={`/account/candidate/resume/${r.id}`} className="font-medium text-ink underline">Открыть</Link>
                            <Link to={`/account/candidate/resume/${r.id}/edit`} className="font-medium text-ink/60 hover:text-ink">Изменить</Link>
                          </>
                        )}
                        <button type="button" onClick={() => handleDeleteResume(r.id)} className="text-ink/40 hover:text-red-600">Удалить</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

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

      {/* Покупка пакета генераций — модалка с формой (демо-оплата) */}
      {buyingPack && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setBuyingPack(null) }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{buyingPack.count} генераций резюме — {buyingPack.price} ₽</h3>
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

      {purchasedNotice && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-xl">
            {purchasedNotice}
            <button type="button" onClick={() => setPurchasedNotice(null)} className="text-white/60 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}
