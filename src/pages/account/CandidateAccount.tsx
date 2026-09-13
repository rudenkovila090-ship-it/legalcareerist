import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { SpecTag, IndustryTag } from '../../components/Tag'
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
import { getTestResults, saveSkillTestResult, saveSoftSkillTestResult } from '../../lib/testing'
import { skillQuestions, softSkillStatements } from '../../data/skillTests'
import { INDUSTRIES, type Industry } from '../../types'

const applicationStatusLabel = { new: 'Новый', in_review: 'На рассмотрении', rejected: 'Отказ', offer: 'Оффер' }
const roleLabel = { candidate: 'Кандидат', employer: 'Работодатель', community_member: 'Участник сообщества', admin: 'Админ' }
const registrationStatusLabel = { registered: 'Зарегистрирован', paid: 'Оплачено', attended: 'Посетил' }

const resumeCreditPacks = [
  { id: 'pack10', count: 10, price: 490 },
  { id: 'pack30', count: 30, price: 990 },
] as const

// «Роли аккаунта» — витрина как в игре: у пользователя уже есть какие-то
// роли (candidate, community_member — открыты, идут первыми в заливке
// bg-ink), а роль работодателя показана как «закрытая» — доступна через
// отдельный демо-вход (см. AccountGate.tsx), не через этот аккаунт.
const displayRoles = ['candidate', 'community_member', 'employer'] as const

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

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

  // Раздел «Контакты» — демо-редактирование прямо в карточке (по клику на
  // карандашик), без реального сохранения на сервер.
  const [contacts, setContacts] = useState({ email: demoUser.email, phone: demoUser.phone ?? '', telegramId: demoUser.telegramId ?? '' })
  const [editingField, setEditingField] = useState<keyof typeof contacts | null>(null)
  const [draftValue, setDraftValue] = useState('')

  // Блоки главной колонки сгруппированы по смыслу, а не свалены вниз одним
  // списком: «Поиск работы» (резюме + отклики) отдельно от «Мероприятия и
  // сообщество» (регистрации, покупки, членство).
  const [mainTab, setMainTab] = useState<'jobs' | 'events'>('jobs')

  // Тестирование: проверка навыков по направлению + софт-скиллы (короткий
  // тест с вопросами и баллом — см. data/skillTests.ts, lib/testing.ts).
  const [testResults, setTestResults] = useState(() => getTestResults())
  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [skillDirection, setSkillDirection] = useState<Industry>(demoUser.industry[0] ?? 'corporate')
  const [skillAnswers, setSkillAnswers] = useState<Record<string, number>>({})
  const [softModalOpen, setSoftModalOpen] = useState(false)
  const [softAnswers, setSoftAnswers] = useState<Record<string, number>>({})

  if (role !== 'candidate') return <Navigate to="/account" replace />

  const freeAvailable = isFreeAvailable(creditsState)
  const nextFreeAt = freeAvailableAt(creditsState)
  const canGenerateResume = canGenerate(RESUME_CREDITS_KEY)
  // Резидент — участник с активным платным членством в сообществе (не
  // просто зарегистрирован на бесплатном тарифе).
  const isResident = demoMemberships.some((m) => m.active && m.tier === 'paid')

  function refreshCredits() {
    setCreditsState(getCreditsState(RESUME_CREDITS_KEY))
  }

  function startEdit(field: keyof typeof contacts) {
    setEditingField(field)
    setDraftValue(contacts[field])
  }

  function saveEdit() {
    if (!editingField) return
    setContacts((prev) => ({ ...prev, [editingField]: draftValue.trim() || prev[editingField] }))
    setEditingField(null)
  }

  function submitSkillTest() {
    const correct = skillQuestions.filter((q) => skillAnswers[q.id] === q.correctIndex).length
    saveSkillTestResult(skillDirection, correct, skillQuestions.length)
    setTestResults(getTestResults())
    setSkillModalOpen(false)
    setSkillAnswers({})
  }

  function submitSoftSkillTest() {
    const values = softSkillStatements.map((s) => softAnswers[s.id]).filter((v): v is number => typeof v === 'number')
    if (values.length === 0) return
    const average = values.reduce((sum, v) => sum + v, 0) / values.length
    saveSoftSkillTestResult(average)
    setTestResults(getTestResults())
    setSoftModalOpen(false)
    setSoftAnswers({})
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
              {displayRoles.map((r) => {
                const earned = (demoUser.roles as string[]).includes(r)
                return (
                  <span
                    key={r}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                      earned ? 'bg-ink text-white' : 'border border-dashed border-ink/25 text-ink/35'
                    }`}
                  >
                    {!earned && <IconLock />}
                    {roleLabel[r]}
                  </span>
                )
              })}
            </div>
            {!isResident && (
              <Link
                to="/community"
                className="mt-3 block rounded-full bg-gold-light px-4 py-2 text-center text-xs font-semibold text-ink hover:opacity-90"
              >
                Стать резидентом сообщества
              </Link>
            )}
          </div>

          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Контакты</div>
            <div className="mt-2 space-y-1.5">
              {(
                [
                  ['email', contacts.email],
                  ['phone', contacts.phone],
                  ['telegramId', contacts.telegramId],
                ] as const
              ).map(([field, value]) => (
                <div key={field} className="flex items-center gap-2">
                  {editingField === field ? (
                    <>
                      <input
                        autoFocus
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm focus:border-ink/40 focus:outline-none"
                      />
                      <button type="button" onClick={saveEdit} className="shrink-0 text-xs font-semibold text-ink/60 hover:text-ink">✓</button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(field)}
                        aria-label="Редактировать"
                        className="shrink-0 text-ink/25 hover:text-ink/60"
                      >
                        <IconPencil />
                      </button>
                      <span className="text-sm">{value}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Специализация</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {demoUser.industry.map((i) => <IndustryTag key={i} id={i} />)}
            </div>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="text-sm text-ink/50">Предпочитаемое место работы</div>
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

        <div className="space-y-6">
          {/* Блоки главной колонки сгруппированы по смыслу: «Поиск работы»
              (резюме + отклики) отдельно от «Мероприятия и сообщество»
              (регистрации, покупки, членство) — чтобы можно было отслеживать
              каждое направление по отдельности, а не листать один общий список. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMainTab('jobs')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mainTab === 'jobs' ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
              }`}
            >
              Поиск работы
            </button>
            <button
              type="button"
              onClick={() => setMainTab('events')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mainTab === 'events' ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
              }`}
            >
              Мероприятия и сообщество
            </button>
          </div>

          {mainTab === 'jobs' ? (
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

          {/* Тестирование — короткая проверка навыков по направлению и
              софт-скиллов, результат виден и здесь, и работодателю в
              карточке отклика (см. lib/applications.ts). */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Тестирование</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="glass flex flex-col rounded-xl p-5">
                <div className="text-sm font-semibold text-ink">Проверка навыков по направлению</div>
                <p className="mt-1 text-sm text-ink/60">{skillQuestions.length} вопросов — результат в процентах, виден работодателю в отклике.</p>
                <div className="flex-1" />
                {testResults.skillTest ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600">{testResults.skillTest.score}%</span>
                      <span className="text-ink/50"> — {testResults.skillTest.correct}/{testResults.skillTest.total}, {INDUSTRIES.find((i) => i.id === testResults.skillTest?.direction)?.label}</span>
                    </div>
                    <button type="button" onClick={() => setSkillModalOpen(true)} className="shrink-0 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                      Пройти заново
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setSkillModalOpen(true)} className="mt-3 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                    Пройти тест
                  </button>
                )}
              </div>

              <div className="glass flex flex-col rounded-xl p-5">
                <div className="text-sm font-semibold text-ink">Проверка софт-скиллов</div>
                <p className="mt-1 text-sm text-ink/60">{softSkillStatements.length} утверждений по шкале — коммуникация, стрессоустойчивость и другое.</p>
                <div className="flex-1" />
                {testResults.softSkillTest ? (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-semibold text-emerald-600">{testResults.softSkillTest.score}%</span>
                    </div>
                    <button type="button" onClick={() => setSoftModalOpen(true)} className="shrink-0 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                      Пройти заново
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setSoftModalOpen(true)} className="mt-3 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                    Пройти тест
                  </button>
                )}
              </div>
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
          </div>
          ) : (
          <div className="space-y-8">
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
          )}
        </div>
      </div>

      {/* Проверка навыков по направлению */}
      {skillModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSkillModalOpen(false) }}
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Проверка навыков</h3>
              <button type="button" onClick={() => setSkillModalOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>

            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Направление</div>
              <select
                value={skillDirection}
                onChange={(e) => setSkillDirection(e.target.value as Industry)}
                className="w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm focus:border-ink/40 focus:outline-none"
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-5">
              {skillQuestions.map((q, i) => (
                <div key={q.id}>
                  <div className="mb-2 text-sm font-medium">{i + 1}. {q.question}</div>
                  <div className="space-y-1.5">
                    {q.options.map((opt, optIdx) => (
                      <label key={opt} className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm hover:border-ink/25">
                        <input
                          type="radio"
                          name={q.id}
                          checked={skillAnswers[q.id] === optIdx}
                          onChange={() => setSkillAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={submitSkillTest}
              disabled={Object.keys(skillAnswers).length < skillQuestions.length}
              className="mt-6 w-full rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-40"
            >
              Показать результат
            </button>
          </div>
        </div>
      )}

      {/* Проверка софт-скиллов */}
      {softModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setSoftModalOpen(false) }}
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Проверка софт-скиллов</h3>
              <button type="button" onClick={() => setSoftModalOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>
            <p className="mb-4 text-sm text-ink/60">Оцените, насколько утверждение похоже на вас: 1 — совсем не похоже, 5 — точно про меня.</p>

            <div className="space-y-5">
              {softSkillStatements.map((s) => (
                <div key={s.id}>
                  <div className="mb-2 text-sm font-medium">{s.label}: {s.statement}</div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label
                        key={n}
                        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border text-sm font-medium ${
                          softAnswers[s.id] === n ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/60 hover:border-ink/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name={s.id}
                          className="sr-only"
                          checked={softAnswers[s.id] === n}
                          onChange={() => setSoftAnswers((prev) => ({ ...prev, [s.id]: n }))}
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={submitSoftSkillTest}
              disabled={Object.keys(softAnswers).length < softSkillStatements.length}
              className="mt-6 w-full rounded-full bg-ink py-3 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-40"
            >
              Показать результат
            </button>
          </div>
        </div>
      )}

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
