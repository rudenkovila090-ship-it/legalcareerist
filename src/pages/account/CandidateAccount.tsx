import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { SpecTag, IndustryTag } from '../../components/Tag'
import AccountSidebarNav, { type AccountSection } from '../../components/account/AccountSidebarNav'
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
import { submitLead, getLeads } from '../../lib/leads'
import { getTestResults, saveSkillTestResult, saveSoftSkillTestResult } from '../../lib/testing'
import { skillQuestions, softSkillStatements } from '../../data/skillTests'
import { getNotifications, markNotificationRead, markAllNotificationsRead, unreadCount } from '../../lib/notifications'
import { getThreads, markThreadRead, sendMessage, unreadForRole } from '../../lib/chat'
import { getFavoriteIds, toggleFavorite } from '../../lib/favorites'
import { addReview, type ReviewContext } from '../../lib/reviews'
import { events } from '../../data/events'
import { vacancies as publicVacancies } from '../../data/vacancies'
import { allConsultationServices } from '../../data/consultationServices'
import { INDUSTRIES, type Industry } from '../../types'

const featuredConsultationIds = ['resume-write', 'career-scenario', 'interview-prep']

const applicationStatusLabel = {
  new: 'Новый',
  invited: 'Приглашение',
  interview: 'Собеседование',
  in_review: 'На рассмотрении',
  rejected: 'Отказ',
  offer: 'Оффер',
}
const applicationStatusClass: Record<string, string> = {
  new: 'bg-ink/[0.06] text-ink/70',
  invited: 'bg-sky-50 text-sky-700',
  interview: 'bg-violet-50 text-violet-700',
  in_review: 'bg-amber-50 text-amber-700',
  offer: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
}
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
function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
    </svg>
  )
}
function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16 8.5a2.7 2.7 0 1 1 0-5" />
      <path d="M18 14.5c2.3.4 3.5 2 3.5 5.5" />
    </svg>
  )
}
function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M6 4h12l1 4H5l1-4Z" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M9 12a3 3 0 0 0 6 0" />
    </svg>
  )
}
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    </svg>
  )
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4v-11Z" />
    </svg>
  )
}
function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 20.5c-4.5-3-8.5-6.2-8.5-10.5a4.8 4.8 0 0 1 8.5-3 4.8 4.8 0 0 1 8.5 3c0 4.3-4 7.5-8.5 10.5z" />
    </svg>
  )
}
function IconGuide() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 1.8-2.4 3.5" />
      <path d="M12 17h.01" />
    </svg>
  )
}

// Процесс работы кабинета соискателя — объясняется отдельным разделом
// левого меню (запрос заказчика: «должен быть объяснен процесс, как всё
// это делается»).
const howItWorksSteps = [
  { title: 'Регистрация', description: 'Создаете аккаунт, заполняете профиль и подтверждаете его через email. В этом демо — вход без пароля, кнопкой «Войти как соискатель» на /account.' },
  { title: 'Профиль и резюме', description: 'Указываете отрасль права, предпочитаемое место работы, город и ожидания по зарплате — собираете резюме в конструкторе или загружаете готовое.' },
  { title: 'Отклики и тестирование', description: 'Откликаетесь на вакансии, проходите проверку навыков по направлению и софт-скиллов — результат в баллах виден работодателю прямо в вашем отклике.' },
  { title: 'Общение с работодателем', description: 'Работодатель открывает ваши контакты, приглашает на собеседование и обсуждает детали во встроенном чате — переписка в разделе «Сообщения», не в сторонних каналах.' },
]

const sections: AccountSection[] = [
  { id: 'how', label: 'Как это работает', icon: <IconGuide /> },
  { id: 'profile', label: 'Профиль', icon: <IconProfile /> },
  { id: 'work', label: 'Поиск работы', icon: <IconBriefcase /> },
  { id: 'messages', label: 'Сообщения', icon: <IconChat /> },
  { id: 'community', label: 'Сообщество и мероприятия', icon: <IconUsers /> },
  { id: 'orders', label: 'Заказы', icon: <IconOrders /> },
  { id: 'notifications', label: 'Уведомления', icon: <IconBell /> },
  { id: 'settings', label: 'Настройки', icon: <IconSettings /> },
  { id: 'support', label: 'Поддержка и безопасность', icon: <IconShield /> },
]

// /account/candidate — кабинет соискателя (см. AccountGate.tsx: вход без
// пароля, по кнопке "Войти как соискатель"). Левое меню — общая структура
// личного кабинета (см. AccountSidebarNav.tsx): Профиль, Поиск работы,
// Сообщество и мероприятия, Заказы, Уведомления, Настройки, Поддержка и
// безопасность.
export default function CandidateAccount() {
  useDocumentTitle('Личный кабинет — Соискатель')
  const role = getActiveRole()
  const navigate = useNavigate()

  const [section, setSection] = useState('profile')
  // Раздел «Поиск работы» разбит на подвкладки: отклики и приглашения,
  // рекомендованные вакансии, избранное, резюме.
  const [workTab, setWorkTab] = useState<'responses' | 'recommended' | 'favorites' | 'resume'>('responses')
  const [favoriteIds, setFavoriteIds] = useState(() => getFavoriteIds())

  // Отзыв о работодателе/собеседовании — из карточки отклика.
  const [reviewingAppId, setReviewingAppId] = useState<string | null>(null)
  const [reviewForm, setReviewForm] = useState<{ rating: number; text: string; context: ReviewContext }>({ rating: 5, text: '', context: 'company' })
  const [reviewSentIds, setReviewSentIds] = useState<Set<string>>(new Set())

  // Настройки → удаление аккаунта (демо) — подтверждающая модалка.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [resumes, setResumes] = useState(getResumes())
  const [creditsState, setCreditsState] = useState(getCreditsState(RESUME_CREDITS_KEY))
  const [buyingPack, setBuyingPack] = useState<(typeof resumeCreditPacks)[number] | null>(null)
  const [buyerPhone, setBuyerPhone] = useState('')
  const [purchasedNotice, setPurchasedNotice] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Раздел «Профиль» → «Контакты» — демо-редактирование прямо в карточке
  // (по клику на карандашик), без реального сохранения на сервер.
  const [contacts, setContacts] = useState({ email: demoUser.email, phone: demoUser.phone ?? '', telegramId: demoUser.telegramId ?? '' })
  const [editingField, setEditingField] = useState<keyof typeof contacts | null>(null)
  const [draftValue, setDraftValue] = useState('')

  // Тестирование: проверка навыков по направлению + софт-скиллы (короткий
  // тест с вопросами и баллом — см. data/skillTests.ts, lib/testing.ts).
  const [testResults, setTestResults] = useState(() => getTestResults())
  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [skillDirection, setSkillDirection] = useState<Industry>(demoUser.industry[0] ?? 'corporate')
  const [skillAnswers, setSkillAnswers] = useState<Record<string, number>>({})
  const [softModalOpen, setSoftModalOpen] = useState(false)
  const [softAnswers, setSoftAnswers] = useState<Record<string, number>>({})

  // Уведомления
  const [notifications, setNotifications] = useState(() => getNotifications('candidate'))

  // Встроенный чат с работодателем — общий localStorage с кабинетом
  // работодателя (см. lib/chat.ts): тред создает работодатель из отклика,
  // здесь соискатель его видит и отвечает.
  const [threads, setThreads] = useState(() => getThreads())
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [chatDraft, setChatDraft] = useState('')

  // Настройки — чисто демо, не влияют на реальный интерфейс сайта.
  const [emailNotifications, setEmailNotifications] = useState(demoUser.newsletterOptIn)
  const [compactView, setCompactView] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Поддержка и безопасность — демо-форма смены пароля и переключатель 2FA.
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' })
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)

  if (role !== 'candidate') return <Navigate to="/account" replace />

  const freeAvailable = isFreeAvailable(creditsState)
  const nextFreeAt = freeAvailableAt(creditsState)
  const canGenerateResume = canGenerate(RESUME_CREDITS_KEY)
  // Резидент — участник с активным платным членством в сообществе (не
  // просто зарегистрирован на бесплатном тарифе).
  const isResident = demoMemberships.some((m) => m.active && m.tier === 'paid')

  const orders = [
    ...demoMaterialPurchases.map((p) => ({ id: p.id, title: p.materialTitle, date: p.date, status: p.paid ? 'Оплачено' : 'Ожидает оплаты' })),
    ...getLeads()
      .filter((l) => l.formType === 'resume_credits_purchase' && l.name === demoUser.name)
      .map((l) => ({ id: l.id, title: l.interest[0] ?? 'Пакет генераций резюме', date: l.date, status: 'Оплачено' })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  // Рекомендованные вакансии — из общего каталога сайта (data/vacancies.ts),
  // совпадают с отраслью права или специализацией соискателя.
  const recommendedVacancies = publicVacancies.filter(
    (v) => v.industry.some((i) => demoUser.industry.includes(i)) || v.specialization.some((s) => demoUser.specialization.includes(s)),
  )
  const favoriteVacancies = publicVacancies.filter((v) => favoriteIds.includes(v.id))

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

  function handleMarkRead(id: string) {
    setNotifications(markNotificationRead('candidate', id))
  }
  function handleMarkAllRead() {
    setNotifications(markAllNotificationsRead('candidate'))
  }

  const myThreads = threads.filter((t) => t.candidateName === demoUser.name)
  const chatUnread = myThreads.reduce((sum, t) => sum + unreadForRole(t, 'candidate'), 0)
  const openThread = myThreads.find((t) => t.id === openThreadId)

  function handleOpenChat(id: string) {
    markThreadRead(id, 'candidate')
    setThreads(getThreads())
    setOpenThreadId(id)
  }

  function handleSendChat(e: FormEvent) {
    e.preventDefault()
    if (!openThreadId || !chatDraft.trim()) return
    sendMessage(openThreadId, 'candidate', chatDraft.trim())
    setThreads(getThreads())
    setChatDraft('')
  }

  function handleSaveSettings(e: FormEvent) {
    e.preventDefault()
    setSettingsSaved(true)
  }

  function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (!passwordForm.current.trim() || !passwordForm.next.trim()) return
    setPasswordSaved(true)
    setPasswordForm({ current: '', next: '' })
  }

  function handleToggleFavorite(vacancyId: string) {
    setFavoriteIds(toggleFavorite(vacancyId))
  }

  function handleSubmitReview(e: FormEvent) {
    e.preventDefault()
    if (!reviewingAppId || !reviewForm.text.trim()) return
    addReview(demoUser.name, reviewForm.rating, reviewForm.text.trim(), reviewForm.context)
    setReviewSentIds((prev) => new Set(prev).add(reviewingAppId))
    setReviewingAppId(null)
    setReviewForm({ rating: 5, text: '', context: 'company' })
  }

  function handleDeleteAccount() {
    clearActiveRole()
    setConfirmingDelete(false)
    navigate('/account')
  }

  return (
    <div>
      <PageHero eyebrow="Личный кабинет" title={demoUser.name} description="Демонстрационные данные — показывают связность разделов внутри кабинета соискателя." prototype />

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
        <AccountSidebarNav sections={sections} active={section} onSelect={setSection} badges={{ notifications: unreadCount(notifications), messages: chatUnread }} />

        <div className="space-y-8">
          {section === 'how' && (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Как это работает</h2>
              <p className="mb-4 text-sm text-ink/60">4 шага от регистрации до общения с работодателем.</p>
              <ol className="grid gap-4 sm:grid-cols-2">
                {howItWorksSteps.map((step, i) => (
                  <li key={step.title} className="glass rounded-xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.08] text-sm font-semibold text-ink">
                        {i + 1}
                      </div>
                      <div className="font-semibold text-ink">{step.title}</div>
                    </div>
                    <p className="mt-2 text-sm text-ink/60">{step.description}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {section === 'profile' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="glass rounded-xl p-5 sm:col-span-2">
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
                    className="mt-3 inline-block rounded-full bg-gold-light px-4 py-2 text-center text-xs font-semibold text-ink hover:opacity-90"
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
                <div className="mt-4 text-sm text-ink/50">Предпочитаемое место работы</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {demoUser.specialization.map((s) => <SpecTag key={s} id={s} />)}
                </div>
              </div>
            </div>
          )}

          {section === 'work' && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['responses', 'Отклики и приглашения'],
                    ['recommended', 'Рекомендованные'],
                    ['favorites', `Избранное${favoriteVacancies.length ? ` (${favoriteVacancies.length})` : ''}`],
                    ['resume', 'Резюме'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setWorkTab(id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      workTab === id ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {workTab === 'responses' && (
                <section>
                  <div className="glass divide-y divide-ink/10 rounded-xl">
                    {demoApplications.map((a) => (
                      <div key={a.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{a.vacancyTitle}</div>
                            <div className="text-xs text-ink/50">Отправлен {new Date(a.date).toLocaleDateString('ru-RU')}</div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-medium ${applicationStatusClass[a.status]}`}>
                            {applicationStatusLabel[a.status]}
                          </span>
                        </div>

                        {(a.status === 'offer' || a.status === 'rejected' || a.status === 'interview') && (
                          reviewSentIds.has(a.id) ? (
                            <p className="mt-2 text-xs font-medium text-emerald-600">Спасибо, отзыв отправлен.</p>
                          ) : reviewingAppId === a.id ? (
                            <form onSubmit={handleSubmitReview} className="mt-3 grid gap-2 rounded-lg border border-ink/10 p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <button key={n} type="button" onClick={() => setReviewForm((f) => ({ ...f, rating: n }))} className="text-lg">
                                      {n <= reviewForm.rating ? '★' : '☆'}
                                    </button>
                                  ))}
                                </div>
                                <select
                                  value={reviewForm.context}
                                  onChange={(e) => setReviewForm((f) => ({ ...f, context: e.target.value as ReviewContext }))}
                                  className="rounded-full border border-ink/15 bg-white px-2 py-1 text-xs text-ink/70"
                                >
                                  <option value="company">О компании</option>
                                  <option value="interview">О собеседовании</option>
                                </select>
                              </div>
                              <textarea
                                value={reviewForm.text}
                                onChange={(e) => setReviewForm((f) => ({ ...f, text: e.target.value }))}
                                rows={2}
                                placeholder="Как прошло? Что понравилось или не понравилось?"
                                className="rounded-lg border border-ink/15 px-3 py-2 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                              />
                              <div className="flex gap-2">
                                <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-ink/90">Отправить отзыв</button>
                                <button type="button" onClick={() => setReviewingAppId(null)} className="rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink/60 hover:text-ink">Отмена</button>
                              </div>
                            </form>
                          ) : (
                            <button type="button" onClick={() => setReviewingAppId(a.id)} className="mt-2 text-xs font-semibold text-ink/50 hover:text-ink">
                              Оставить отзыв о работодателе
                            </button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(workTab === 'recommended' || workTab === 'favorites') && (
                <section>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(workTab === 'recommended' ? recommendedVacancies : favoriteVacancies).map((v) => (
                      <div key={v.id} className="glass flex flex-col rounded-xl p-5">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/vacancies/${v.slug}`} className="font-semibold text-ink hover:underline">{v.title}</Link>
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(v.id)}
                            aria-label="В избранное"
                            className={favoriteIds.includes(v.id) ? 'text-red-500' : 'text-ink/25 hover:text-ink/50'}
                          >
                            <IconHeart filled={favoriteIds.includes(v.id)} />
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-ink/50">{v.anonymous ? 'Анонимно' : v.company} · {v.city}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {v.specialization.map((s) => <SpecTag key={s} id={s} />)}
                          {v.industry.map((i) => <IndustryTag key={i} id={i} />)}
                        </div>
                        <div className="flex-1" />
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-sm font-medium text-ink">
                            {v.salaryFrom ? `от ${v.salaryFrom.toLocaleString('ru-RU')} ₽` : 'Зарплата не указана'}
                          </span>
                          <Link to={`/vacancies/${v.slug}`} className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-ink/90">Смотреть</Link>
                        </div>
                      </div>
                    ))}
                    {workTab === 'recommended' && recommendedVacancies.length === 0 && (
                      <p className="text-sm text-ink/50">Пока нет вакансий, подходящих по вашей отрасли и специализации.</p>
                    )}
                    {workTab === 'favorites' && favoriteVacancies.length === 0 && (
                      <p className="text-sm text-ink/50">Пока нет избранных вакансий — добавляйте сердечком на карточке вакансии.</p>
                    )}
                  </div>
                </section>
              )}

              {workTab === 'resume' && (
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
                            Количество резюме не ограничено.
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

                  {/* Заказать резюме — услуги карьерного консультанта (реальный прайс,
                      см. data/consultationServices.ts / /kadry/candidates/consultation). */}
                  <section>
                    <h2 className="mb-3 text-lg font-semibold">Заказать резюме</h2>
                    <div className="glass rounded-xl p-5">
                      <p className="text-sm text-ink/60">Не хотите собирать резюме сами — закажите у карьерного консультанта «Карьерного юриста».</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {featuredConsultationIds.map((id) => {
                          const s = allConsultationServices.find((x) => x.id === id)
                          if (!s) return null
                          return (
                            <div key={s.id} className="rounded-lg border border-ink/10 px-3 py-2.5">
                              <div className="text-sm font-medium text-ink">{s.title}</div>
                              <div className="text-xs text-ink/50">{s.price.toLocaleString('ru-RU')} ₽</div>
                            </div>
                          )
                        })}
                      </div>
                      <Link to="/kadry/candidates/consultation" className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                        Смотреть все услуги
                      </Link>
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
                </div>
              )}
            </div>
          )}

          {section === 'messages' && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Сообщения</h2>
              <div className="glass divide-y divide-ink/10 rounded-xl">
                {myThreads.length === 0 && <p className="p-5 text-sm text-ink/50">Пока нет переписок — они появляются, когда работодатель напишет вам по отклику.</p>}
                {myThreads.map((t) => {
                  const last = t.messages[t.messages.length - 1]
                  const unread = unreadForRole(t, 'candidate')
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleOpenChat(t.id)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-ink/[0.02]"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {t.employerName}
                          {!!unread && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">{unread}</span>}
                        </div>
                        <div className="text-xs text-ink/50">{t.vacancyTitle}</div>
                        {last && <p className="mt-1 text-sm text-ink/60">{last.text}</p>}
                      </div>
                      {last && <div className="shrink-0 text-xs text-ink/40">{new Date(last.sentAt).toLocaleDateString('ru-RU')}</div>}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {section === 'community' && (
            <div className="space-y-8">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Регистрации на мероприятия</h2>
                <div className="glass divide-y divide-ink/10 rounded-xl">
                  {demoEventRegistrations.map((r) => {
                    const event = events.find((e) => e.id === r.eventId)
                    const diffMs = event ? new Date(event.dateTime).getTime() - now : undefined
                    return (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                        <div>
                          <div className="font-medium">{r.eventTitle}</div>
                          {event && (
                            <div className="mt-0.5 text-xs text-ink/50">
                              {new Date(event.dateTime).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                              {diffMs !== undefined && diffMs > 0 && ` · через ${Math.ceil(diffMs / 86400000)} дн.`}
                              {diffMs !== undefined && diffMs <= 0 && ' · уже прошло'}
                            </div>
                          )}
                        </div>
                        <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium">{registrationStatusLabel[r.status]}</span>
                      </div>
                    )
                  })}
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

          {section === 'orders' && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Заказы</h2>
              <div className="glass divide-y divide-ink/10 rounded-xl">
                {orders.length === 0 && <p className="p-5 text-sm text-ink/50">Пока нет заказов.</p>}
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-medium">{o.title}</div>
                      <div className="text-xs text-ink/50">{new Date(o.date).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{o.status}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {section === 'notifications' && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Уведомления</h2>
                <button type="button" onClick={handleMarkAllRead} className="text-sm font-medium text-ink/60 hover:text-ink">Отметить все прочитанными</button>
              </div>
              <div className="glass divide-y divide-ink/10 rounded-xl">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="flex w-full items-start gap-3 p-4 text-left hover:bg-ink/[0.02]"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-gold'}`} />
                    <div>
                      <p className={`text-sm ${n.read ? 'text-ink/60' : 'font-medium text-ink'}`}>{n.text}</p>
                      <div className="mt-1 text-xs text-ink/40">{new Date(n.date).toLocaleDateString('ru-RU')}</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {section === 'settings' && (
            <div className="space-y-6">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Настройки</h2>
                <div className="glass rounded-xl p-5">
                  <p className="text-sm text-ink/60">Демо-настройки интерфейса — не влияют на реальный вид сайта, показывают механику раздела.</p>
                  <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm">Email-уведомления о вакансиях и мероприятиях</span>
                      <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} className="h-4 w-4" />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-sm">Компактный вид списков в кабинете</span>
                      <input type="checkbox" checked={compactView} onChange={(e) => setCompactView(e.target.checked)} className="h-4 w-4" />
                    </label>
                    <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                      Сохранить
                    </button>
                    {settingsSaved && <p className="text-sm text-emerald-600">Настройки сохранены.</p>}
                  </form>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold">Пароль и аккаунт</h2>
                <div className="glass rounded-xl p-5">
                  <form onSubmit={handleChangePassword} className="grid gap-3 sm:max-w-sm">
                    <div className="text-sm font-semibold text-ink">Сменить пароль</div>
                    <input
                      type="password"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                      placeholder="Текущий пароль"
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <input
                      type="password"
                      value={passwordForm.next}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
                      placeholder="Новый пароль"
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 sm:justify-self-start">
                      Сохранить пароль
                    </button>
                    {passwordSaved && <p className="text-sm text-emerald-600">Пароль обновлен (демо).</p>}
                  </form>

                  <div className="mt-5 border-t border-ink/10 pt-5">
                    <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm font-semibold text-red-600 hover:text-red-700">
                      Удалить аккаунт
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {section === 'support' && (
            <div className="space-y-6">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Безопасность</h2>
                <div className="glass rounded-xl p-5">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm">Дополнительная защита устройства (2FA)</span>
                    <input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} className="h-4 w-4" />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold">Поддержка</h2>
                <div className="glass rounded-xl p-5">
                  <p className="text-sm text-ink/60">Вопрос по кабинету или заявке — напишите нам, ответим в ближайшее время.</p>
                  <Link to="/kadry/contacts" className="mt-3 inline-block rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                    Написать в поддержку
                  </Link>
                </div>
              </section>

              <button
                type="button"
                onClick={() => { clearActiveRole(); navigate('/account') }}
                className="block w-full rounded-full border border-ink/15 px-5 py-2.5 text-center text-sm font-semibold text-ink/60 hover:text-ink sm:w-auto"
              >
                Выйти из личного кабинета
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Чат с работодателем — общий localStorage с кабинетом работодателя (см. lib/chat.ts) */}
      {openThread && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpenThreadId(null) }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white text-ink sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 p-5">
              <div>
                <h3 className="text-lg font-semibold">{openThread.employerName}</h3>
                <p className="text-xs text-ink/50">{openThread.vacancyTitle}</p>
              </div>
              <button type="button" onClick={() => setOpenThreadId(null)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {openThread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderRole === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.senderRole === 'candidate' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink'}`}>
                    {m.text}
                    <div className={`mt-1 text-[11px] ${m.senderRole === 'candidate' ? 'text-white/50' : 'text-ink/40'}`}>
                      {new Date(m.sentAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2 border-t border-ink/10 p-4">
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Написать сообщение…"
                className="flex-1 rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                Отправить
              </button>
            </form>
          </div>
        </div>
      )}

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

      {/* Удаление аккаунта — демо: очищает роль и возвращает на гейт входа */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmingDelete(false) }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl">
            <h3 className="text-lg font-semibold">Удалить аккаунт?</h3>
            <p className="mt-2 text-sm text-ink/60">Резюме, отклики и переписка будут недоступны. Это демо-действие — данные останутся в браузере, но роль будет сброшена.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={handleDeleteAccount} className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                Удалить
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/60 hover:text-ink">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
