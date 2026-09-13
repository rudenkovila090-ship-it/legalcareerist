import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { SpecTag, IndustryTag } from '../../components/Tag'
import AccountSidebarNav, { type AccountSection } from '../../components/account/AccountSidebarNav'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole, clearActiveRole } from '../../lib/accountRole'
import { demoEmployer, demoEmployerCompany } from '../../lib/account'
import {
  getVacancies, approveVacancy, rejectVacancy, closeVacancy, sendStageMailing, deleteVacancy, setVacancyResponsible, createVacancy,
} from '../../lib/vacancies'
import {
  getResponsesForVacancy, getResponses, setResponseStatus, setResponseStatusBulk, revealContact, contactPrice,
} from '../../lib/applications'
import {
  getCreditsState, isFreeAvailable, freeAvailableAt, canGenerate, addCredits, formatCountdown, VACANCY_CREDITS_KEY,
} from '../../lib/generationCredits'
import { submitLead, getLeads } from '../../lib/leads'
import { getReviews, computeEmployerRating, addReviewReply } from '../../lib/reviews'
import { getCompanyProfile, saveCompanyProfile } from '../../lib/companyProfile'
import { getRankings, addRanking, deleteRanking, rankingBonus } from '../../lib/rankings'
import { getNotifications, markNotificationRead, markAllNotificationsRead, unreadCount } from '../../lib/notifications'
import { getThreads, ensureThread, sendMessage, markThreadRead, unreadForRole } from '../../lib/chat'
import { getTeamMembers, addTeamMember, removeTeamMember, OWNER_ID } from '../../lib/team'
import { INDUSTRIES, COMPANY_INDUSTRY_TREE } from '../../types'
import type { ApplicationStatus, VacancyModerationStatus, VacancyVisibilityStage, CandidateLevel, Industry } from '../../types'

const responseStatusLabel: Record<ApplicationStatus, string> = {
  new: 'Новый',
  in_review: 'На рассмотрении',
  rejected: 'Отказ',
  offer: 'Оффер',
}
const responseStatusOrder: ApplicationStatus[] = ['new', 'in_review', 'offer', 'rejected']
const levelLabel = { junior: 'Junior', middle: 'Middle', senior: 'Senior' }

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

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5" />
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
function IconGuide() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 1.8-2.4 3.5" />
      <path d="M12 17h.01" />
    </svg>
  )
}

// Процесс работы кабинета работодателя — объясняется отдельным разделом
// левого меню (запрос заказчика: «должен быть объяснен процесс, как всё
// это делается»).
const howItWorksSteps = [
  { title: 'Регистрация', description: 'Создаете аккаунт, заполняете профиль компании и подтверждаете его через email. В этом демо — вход без пароля, кнопкой «Войти как работодатель» на /account.' },
  { title: 'Публикация вакансии', description: 'Конструктор собирает вакансию по шаблону, она уходит на модерацию и раскрывается по каскаду: сначала резидентам сообщества, затем кадровому резерву, и только потом — открытому сайту.' },
  { title: 'Отклики и контакты', description: 'Смотрите отклики прямо под вакансией — направление, тестирование навыков и софт-скиллов кандидата, при необходимости открываете контакты.' },
  { title: 'Собеседование и общение', description: 'Приглашаете кандидата на собеседование и обсуждаете детали во встроенном чате — переписка в разделе «Сообщения», не в сторонних каналах.' },
]

const sections: AccountSection[] = [
  { id: 'how', label: 'Как это работает', icon: <IconGuide /> },
  { id: 'profile', label: 'Профиль', icon: <IconProfile /> },
  { id: 'work', label: 'Вакансии', icon: <IconBriefcase /> },
  { id: 'messages', label: 'Сообщения', icon: <IconChat /> },
  { id: 'community', label: 'Сообщество и мероприятия', icon: <IconUsers /> },
  { id: 'orders', label: 'Заказы', icon: <IconOrders /> },
  { id: 'notifications', label: 'Уведомления', icon: <IconBell /> },
  { id: 'settings', label: 'Настройки', icon: <IconSettings /> },
  { id: 'support', label: 'Поддержка и безопасность', icon: <IconShield /> },
]

// /account/employer — кабинет работодателя, отдельный от /account/candidate
// (см. AccountGate.tsx). Левое меню — общая структура личного кабинета
// (см. AccountSidebarNav.tsx). Модерация — демо-кнопки "Одобрить"/"Отклонить"
// вместо реального бэкенда/второй роли модератора (её пока нет — см. план
// "личный кабинет разработчика" на будущее).
export default function EmployerAccount() {
  useDocumentTitle('Личный кабинет — Работодатель')
  const role = getActiveRole()
  const navigate = useNavigate()

  const [section, setSection] = useState('profile')

  const [vacancies, setVacancies] = useState(() => getVacancies())
  const [creditsState, setCreditsState] = useState(getCreditsState(VACANCY_CREDITS_KEY))
  const [buyingPack, setBuyingPack] = useState<(typeof vacancyCreditPacks)[number] | null>(null)
  const [buyerPhone, setBuyerPhone] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  // Отклики на вакансию — разворачиваются под конкретной вакансией, а не
  // общим списком, чтобы было видно, кто откликнулся именно на нее.
  const [expandedVacancyId, setExpandedVacancyId] = useState<string | null>(null)
  const [responseVersion, setResponseVersion] = useState(0)
  // Фильтр по откликам (направление/уровень/наличие теста/поиск по имени) +
  // выбор для массовых действий — общие на разворачиваемый список отклика,
  // сбрасываются при сворачивании/смене вакансии.
  const [responseFilters, setResponseFilters] = useState({ industry: '' as '' | Industry, level: '' as '' | CandidateLevel, testedOnly: false, search: '' })
  const [selectedResponseIds, setSelectedResponseIds] = useState<Set<string>>(new Set())

  // Рейтинг работодателя: отзывы соискателей + места в рейтингах, которые
  // работодатель загружает сам (справочник реальных рейтингов пришлет
  // заказчик отдельно, пока — свободный ввод названия/категории/места).
  const [reviews, setReviews] = useState(() => getReviews())
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [rankings, setRankings] = useState(() => getRankings())
  const [rankingForm, setRankingForm] = useState(() => ({ name: '', category: '', place: '', year: new Date().getFullYear() }))

  // Уведомления
  const [notifications, setNotifications] = useState(() => getNotifications('employer'))

  // Профиль → редактирование компании/контактов прямо в карточке (по клику
  // на карандашик), как и в кабинете соискателя — без реального сохранения
  // на сервер.
  const [profileFields, setProfileFields] = useState({
    companyName: demoEmployerCompany.name,
    companyPosition: demoEmployerCompany.position,
    email: demoEmployer.email,
    phone: demoEmployer.phone ?? '',
    telegramId: demoEmployer.telegramId ?? '',
  })
  const [editingField, setEditingField] = useState<keyof typeof profileFields | null>(null)
  const [draftValue, setDraftValue] = useState('')

  // Публичная карточка работодателя — описание/отрасль, которые в боевой
  // версии видит кандидат на странице вакансии (см. lib/companyProfile.ts).
  const [companyProfile, setCompanyProfile] = useState(() => getCompanyProfile())
  const [editingCompanyProfile, setEditingCompanyProfile] = useState(false)
  const [companyProfileDraft, setCompanyProfileDraft] = useState(companyProfile)

  // Команда компании — несколько сотрудников на один аккаунт, вакансии
  // можно закреплять за конкретным человеком (см. lib/team.ts).
  const [team, setTeam] = useState(() => getTeamMembers())
  const [teamForm, setTeamForm] = useState({ name: '', position: '', email: '' })

  // Встроенный чат с соискателями — общий localStorage с кабинетом
  // соискателя (см. lib/chat.ts), тред открывается из отклика на вакансию.
  const [threads, setThreads] = useState(() => getThreads())
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [chatDraft, setChatDraft] = useState('')

  // Настройки — чисто демо, не влияют на реальный интерфейс сайта.
  const [emailNotifications, setEmailNotifications] = useState(demoEmployer.newsletterOptIn)
  const [compactView, setCompactView] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Поддержка и безопасность — демо-форма смены пароля и переключатель 2FA.
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '' })
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [twoFactor, setTwoFactor] = useState(false)

  if (role !== 'employer') return <Navigate to="/account" replace />

  function refresh() {
    setVacancies(getVacancies())
  }
  function refreshCredits() {
    setCreditsState(getCreditsState(VACANCY_CREDITS_KEY))
  }
  function refreshResponses() {
    setResponseVersion((v) => v + 1)
  }

  function handleResponseStatus(id: string, status: ApplicationStatus) {
    setResponseStatus(id, status)
    refreshResponses()
  }

  function toggleExpandVacancy(vacancyId: string) {
    setExpandedVacancyId((prev) => (prev === vacancyId ? null : vacancyId))
    setResponseFilters({ industry: '', level: '', testedOnly: false, search: '' })
    setSelectedResponseIds(new Set())
  }

  function toggleSelectResponse(id: string) {
    setSelectedResponseIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleBulkStatus(status: ApplicationStatus) {
    if (selectedResponseIds.size === 0) return
    setResponseStatusBulk([...selectedResponseIds], status)
    setSelectedResponseIds(new Set())
    refreshResponses()
    setNotice(`Статус «${responseStatusLabel[status]}» применён к ${selectedResponseIds.size} откликам.`)
  }

  function handleDuplicateVacancy(data: (typeof vacancies)[number]['data']) {
    createVacancy({ ...data, title: `${data.title} (копия)` })
    refresh()
    setNotice('Вакансия скопирована — новая копия ждет модерации.')
  }

  function handleRevealContact(id: string, name: string, price: number) {
    revealContact(id)
    submitLead({
      sourceBlock: 'kadry',
      formType: 'candidate_contact_purchase',
      name: demoEmployer.name,
      contact: demoEmployer.phone ?? demoEmployer.email,
      interest: [`Контакты кандидата «${name}» — ${price} ₽`],
    })
    refreshResponses()
    setNotice(`Контакты кандидата «${name}» открыты.`)
  }

  const chatUnread = threads.reduce((sum, t) => sum + unreadForRole(t, 'employer'), 0)
  const openThread = threads.find((t) => t.id === openThreadId)

  function handleOpenChat(responseId: string, candidateName: string, vacancyTitle: string) {
    ensureThread(responseId, { candidateName, vacancyTitle, employerName: demoEmployerCompany.name })
    markThreadRead(responseId, 'employer')
    setThreads(getThreads())
    setOpenThreadId(responseId)
  }

  function handleSendChat(e: FormEvent) {
    e.preventDefault()
    if (!openThreadId || !chatDraft.trim()) return
    sendMessage(openThreadId, 'employer', chatDraft.trim())
    setThreads(getThreads())
    setChatDraft('')
  }

  const rating = computeEmployerRating(reviews, rankingBonus(rankings))

  // Автоподсчет по зарплатам, которые сам работодатель указал в
  // опубликованных вакансиях — не ручной ввод, а агрегация вилок.
  const publishedWithSalary = vacancies.filter((v) => v.moderationStatus === 'published' && (v.data.salaryFrom > 0 || v.data.salaryTo > 0))
  const salaryStats = publishedWithSalary.length > 0
    ? {
        avgFrom: Math.round(publishedWithSalary.reduce((s, v) => s + (v.data.salaryFrom || v.data.salaryTo), 0) / publishedWithSalary.length),
        avgTo: Math.round(publishedWithSalary.reduce((s, v) => s + (v.data.salaryTo || v.data.salaryFrom), 0) / publishedWithSalary.length),
        count: publishedWithSalary.length,
      }
    : null

  const orders = getLeads()
    .filter((l) => ['vacancy_credits_purchase', 'candidate_contact_purchase'].includes(l.formType) && l.name === demoEmployer.name)
    .map((l) => ({ id: l.id, title: l.interest[0] ?? l.formType, date: l.date, status: 'Оплачено' }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Воронка по откликам — реальный подсчет по вакансиям и откликам
  // работодателя, не выдуманные проценты: сколько откликов на каждом
  // статусе и сколько дней прошло от публикации вакансии до первого отклика.
  const allResponses = getResponses().filter((r) => vacancies.some((v) => v.id === r.vacancyId))
  const funnel = {
    total: allResponses.length,
    new: allResponses.filter((r) => r.status === 'new').length,
    inReview: allResponses.filter((r) => r.status === 'in_review').length,
    offer: allResponses.filter((r) => r.status === 'offer').length,
    rejected: allResponses.filter((r) => r.status === 'rejected').length,
  }
  const daysToFirstResponse = vacancies
    .filter((v) => v.publishedAt)
    .map((v) => {
      const responses = allResponses.filter((r) => r.vacancyId === v.id)
      if (responses.length === 0) return null
      const first = responses.reduce((a, b) => (a.appliedAt < b.appliedAt ? a : b))
      return (new Date(first.appliedAt).getTime() - new Date(v.publishedAt!).getTime()) / 86400000
    })
    .filter((d): d is number => d !== null && d >= 0)
  const avgDaysToFirstResponse = daysToFirstResponse.length > 0
    ? Math.round((daysToFirstResponse.reduce((s, d) => s + d, 0) / daysToFirstResponse.length) * 10) / 10
    : null

  function startEditProfile(field: keyof typeof profileFields) {
    setEditingField(field)
    setDraftValue(profileFields[field])
  }
  function saveEditProfile() {
    if (!editingField) return
    setProfileFields((prev) => ({ ...prev, [editingField]: draftValue.trim() || prev[editingField] }))
    setEditingField(null)
  }

  function startEditCompanyProfile() {
    setCompanyProfileDraft(companyProfile)
    setEditingCompanyProfile(true)
  }
  function saveCompanyProfileEdit() {
    saveCompanyProfile(companyProfileDraft)
    setCompanyProfile(companyProfileDraft)
    setEditingCompanyProfile(false)
  }

  function handleReviewReplySubmit(id: string) {
    if (!replyDraft.trim()) return
    const updated = addReviewReply(id, replyDraft.trim())
    if (updated) setReviews((prev) => prev.map((r) => (r.id === id ? updated : r)))
    setReplyingReviewId(null)
    setReplyDraft('')
  }

  function handleAddTeamMember(e: FormEvent) {
    e.preventDefault()
    if (!teamForm.name.trim() || !teamForm.position.trim()) return
    const created = addTeamMember({ name: teamForm.name.trim(), position: teamForm.position.trim(), email: teamForm.email.trim() })
    setTeam((prev) => [...prev, created])
    setTeamForm({ name: '', position: '', email: '' })
  }
  function handleRemoveTeamMember(id: string) {
    removeTeamMember(id)
    setTeam((prev) => prev.filter((m) => m.id !== id))
  }
  function handleSetResponsible(vacancyId: string, responsibleId: string) {
    setVacancyResponsible(vacancyId, responsibleId)
    refresh()
  }

  function handleAddRanking(e: FormEvent) {
    e.preventDefault()
    if (!rankingForm.name.trim() || !rankingForm.place.trim()) return
    const created = addRanking({
      name: rankingForm.name.trim(),
      category: rankingForm.category.trim() || '—',
      place: rankingForm.place.trim(),
      year: rankingForm.year,
    })
    setRankings((prev) => [created, ...prev])
    setRankingForm({ name: '', category: '', place: '', year: new Date().getFullYear() })
  }

  function handleDeleteRanking(id: string) {
    deleteRanking(id)
    setRankings((prev) => prev.filter((r) => r.id !== id))
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

  function handleMarkRead(id: string) {
    setNotifications(markNotificationRead('employer', id))
  }
  function handleMarkAllRead() {
    setNotifications(markAllNotificationsRead('employer'))
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

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет"
        title={demoEmployer.name}
        description="Кабинет работодателя — демо-аккаунт, отдельный от кабинета соискателя."
        prototype
      />

      <div className="container-page grid gap-8 py-10 lg:grid-cols-[220px_1fr]">
        <AccountSidebarNav sections={sections} active={section} onSelect={setSection} badges={{ notifications: unreadCount(notifications), messages: chatUnread }} />

        <div className="space-y-8">
          {section === 'how' && (
            <section>
              <h2 className="mb-1 text-lg font-semibold">Как это работает</h2>
              <p className="mb-4 text-sm text-ink/60">4 шага от регистрации до общения с кандидатом.</p>
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
            <div className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="glass rounded-xl p-5">
                  <div className="text-sm text-ink/50">Компания</div>
                  <div className="mt-2 space-y-1.5">
                    {(['companyName', 'companyPosition'] as const).map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        {editingField === field ? (
                          <>
                            <input
                              autoFocus
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEditProfile()}
                              className="w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm focus:border-ink/40 focus:outline-none"
                            />
                            <button type="button" onClick={saveEditProfile} className="shrink-0 text-xs font-semibold text-ink/60 hover:text-ink">✓</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEditProfile(field)} aria-label="Редактировать" className="shrink-0 text-ink/25 hover:text-ink/60">
                              <IconPencil />
                            </button>
                            <span className={`text-sm ${field === 'companyName' ? 'font-medium' : 'text-ink/60'}`}>{profileFields[field]}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="glass rounded-xl p-5">
                  <div className="text-sm text-ink/50">Контакты</div>
                  <div className="mt-2 space-y-1.5">
                    {(['email', 'phone', 'telegramId'] as const).map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        {editingField === field ? (
                          <>
                            <input
                              autoFocus
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEditProfile()}
                              className="w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm focus:border-ink/40 focus:outline-none"
                            />
                            <button type="button" onClick={saveEditProfile} className="shrink-0 text-xs font-semibold text-ink/60 hover:text-ink">✓</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEditProfile(field)} aria-label="Редактировать" className="shrink-0 text-ink/25 hover:text-ink/60">
                              <IconPencil />
                            </button>
                            <span className="text-sm">{profileFields[field]}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Рейтинг: средняя оценка по отзывам (до 80 очков) + бонус за
                    подтвержденные места в рейтингах (до 20 очков) — черновая
                    демо-формула, см. lib/reviews.ts. */}
                <div className="glass rounded-xl p-5">
                  <div className="text-sm text-ink/50">Рейтинг работодателя</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-ink">{rating.score}</span>
                    <span className="text-sm text-ink/40">/ 100</span>
                  </div>
                  <div className="mt-1 text-xs text-ink/50">
                    {rating.averageRating > 0 ? `★ ${rating.averageRating} · ${rating.reviewsCount} отзывов` : 'Пока нет отзывов'}
                    {rankings.length > 0 && ` · ${rankings.length} мест(а) в рейтингах`}
                  </div>
                </div>

                {salaryStats && (
                  <div className="glass rounded-xl p-5">
                    <div className="text-sm text-ink/50">Зарплаты по вашим вакансиям</div>
                    <div className="mt-2 text-sm font-medium text-ink">
                      {money.format(salaryStats.avgFrom)}–{money.format(salaryStats.avgTo)} ₽
                    </div>
                    <div className="mt-1 text-xs text-ink/50">Среднее по {salaryStats.count} опубликованным вакансиям, считается автоматически</div>
                  </div>
                )}
              </div>

              <section>
                <h2 className="mb-3 text-lg font-semibold">Публичная карточка работодателя</h2>
                <div className="glass rounded-xl p-5">
                  <p className="mb-3 text-sm text-ink/60">Это увидит кандидат на странице вакансии, в блоке «О работодателе».</p>
                  {editingCompanyProfile ? (
                    <div className="grid gap-3">
                      <textarea
                        value={companyProfileDraft.description}
                        onChange={(e) => setCompanyProfileDraft((f) => ({ ...f, description: e.target.value }))}
                        rows={3}
                        placeholder="Кратко о компании"
                        className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      />
                      <select
                        value={companyProfileDraft.industryCategory}
                        onChange={(e) => setCompanyProfileDraft((f) => ({ ...f, industryCategory: e.target.value }))}
                        className="w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm focus:border-ink/40 focus:outline-none sm:w-64"
                      >
                        {COMPANY_INDUSTRY_TREE.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveCompanyProfileEdit} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                          Сохранить
                        </button>
                        <button type="button" onClick={() => setEditingCompanyProfile(false)} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/60 hover:text-ink">
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">
                          {profileFields.companyName.replace(/[«»]/g, '').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-ink">{profileFields.companyName}</div>
                          <div className="text-xs text-ink/50">{companyProfile.industryCategory}</div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-ink/60">{companyProfile.description}</p>
                      <button type="button" onClick={startEditCompanyProfile} className="mt-3 rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                        Редактировать
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold">Команда компании</h2>
                <div className="glass rounded-xl p-5">
                  <p className="text-sm text-ink/60">Несколько сотрудников на один аккаунт — каждую вакансию можно закрепить за конкретным человеком (см. вкладку «Вакансии»).</p>
                  <div className="mt-4 divide-y divide-ink/10 border-t border-ink/10">
                    {team.map((m) => (
                      <div key={m.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="text-sm font-medium">{m.name} {m.role === 'owner' && <span className="ml-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold text-ink/50">Владелец</span>}</div>
                          <div className="text-xs text-ink/50">{m.position}{m.email && ` · ${m.email}`}</div>
                        </div>
                        {m.role !== 'owner' && (
                          <button type="button" onClick={() => handleRemoveTeamMember(m.id)} className="text-ink/40 hover:text-red-600">Удалить</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleAddTeamMember} className="mt-4 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-3">
                    <input
                      value={teamForm.name}
                      onChange={(e) => setTeamForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Имя сотрудника"
                      required
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <input
                      value={teamForm.position}
                      onChange={(e) => setTeamForm((f) => ({ ...f, position: e.target.value }))}
                      placeholder="Должность"
                      required
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={teamForm.email}
                        onChange={(e) => setTeamForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="Email"
                        className="w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      />
                      <button type="submit" className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                        Добавить
                      </button>
                    </div>
                  </form>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold">Отзывы соискателей</h2>
                <div className="glass divide-y divide-ink/10 rounded-xl">
                  {reviews.length === 0 && <p className="p-5 text-sm text-ink/50">Пока нет отзывов.</p>}
                  {reviews.map((r) => (
                    <div key={r.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{r.authorName}</span>
                        <span className="text-sm text-gold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                      </div>
                      <p className="mt-1 text-sm text-ink/60">{r.text}</p>
                      <div className="mt-1 text-xs text-ink/40">{new Date(r.date).toLocaleDateString('ru-RU')}</div>

                      {r.reply ? (
                        <div className="mt-3 rounded-lg bg-ink/[0.04] p-3">
                          <div className="text-xs font-semibold text-ink/50">Ответ работодателя · {new Date(r.reply.date).toLocaleDateString('ru-RU')}</div>
                          <p className="mt-1 text-sm text-ink/70">{r.reply.text}</p>
                        </div>
                      ) : replyingReviewId === r.id ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            autoFocus
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleReviewReplySubmit(r.id)}
                            placeholder="Публичный ответ на отзыв…"
                            className="flex-1 rounded-lg border border-ink/15 px-3 py-1.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                          />
                          <button type="button" onClick={() => handleReviewReplySubmit(r.id)} className="shrink-0 rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-ink/90">
                            Ответить
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setReplyingReviewId(r.id); setReplyDraft('') }}
                          className="mt-2 text-xs font-semibold text-ink/50 hover:text-ink"
                        >
                          Ответить на отзыв
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-lg font-semibold">Места в рейтингах</h2>
                <div className="glass rounded-xl p-5">
                  <p className="text-sm text-ink/60">
                    Загрузите места вашей компании во внешних юридических рейтингах — они дают бонус к рейтингу работодателя на платформе.
                  </p>
                  <form onSubmit={handleAddRanking} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input
                      value={rankingForm.name}
                      onChange={(e) => setRankingForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Название рейтинга"
                      required
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none sm:col-span-2"
                    />
                    <input
                      value={rankingForm.category}
                      onChange={(e) => setRankingForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="Номинация/категория"
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <input
                      value={rankingForm.place}
                      onChange={(e) => setRankingForm((f) => ({ ...f, place: e.target.value }))}
                      placeholder="Место, например «5 место»"
                      required
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <input
                      type="number"
                      value={rankingForm.year}
                      onChange={(e) => setRankingForm((f) => ({ ...f, year: Number(e.target.value) || f.year }))}
                      placeholder="Год"
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 sm:justify-self-start">
                      Добавить
                    </button>
                  </form>

                  {rankings.length > 0 && (
                    <div className="mt-4 divide-y divide-ink/10 border-t border-ink/10">
                      {rankings.map((r) => (
                        <div key={r.id} className="flex items-center justify-between py-3">
                          <div>
                            <div className="text-sm font-medium">{r.name} — {r.place}</div>
                            <div className="text-xs text-ink/50">{r.category} · {r.year}</div>
                          </div>
                          <button type="button" onClick={() => handleDeleteRanking(r.id)} className="text-ink/40 hover:text-red-600">Удалить</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {section === 'work' && (
            <div className="space-y-6">
              {funnel.total > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">Воронка по откликам</h2>
                  <div className="glass rounded-xl p-5">
                    <div className="grid gap-3 sm:grid-cols-4">
                      {([
                        ['Новые', funnel.new, 'bg-ink/15'],
                        ['На рассмотрении', funnel.inReview, 'bg-amber-200'],
                        ['Оффер', funnel.offer, 'bg-emerald-300'],
                        ['Отказ', funnel.rejected, 'bg-red-200'],
                      ] as const).map(([label, count, barClass]) => (
                        <div key={label}>
                          <div className="text-xs text-ink/50">{label}</div>
                          <div className="mt-1 text-xl font-semibold text-ink">{count}</div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
                            <div className={`h-full ${barClass}`} style={{ width: `${funnel.total > 0 ? (count / funnel.total) * 100 : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-ink/10 pt-4 text-sm text-ink/60">
                      Всего откликов: <span className="font-semibold text-ink">{funnel.total}</span>
                      {avgDaysToFirstResponse !== null && (
                        <> · Среднее время до первого отклика: <span className="font-semibold text-ink">{avgDaysToFirstResponse} дн.</span></>
                      )}
                    </div>
                  </div>
                </section>
              )}

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
                            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink/50">
                              Ответственный:
                              <select
                                value={v.responsibleId ?? OWNER_ID}
                                onChange={(e) => handleSetResponsible(v.id, e.target.value)}
                                className="rounded-full border border-ink/15 bg-white px-2 py-1 text-xs font-medium text-ink/70"
                              >
                                {team.map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                            </div>
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
                            <button type="button" onClick={() => handleDuplicateVacancy(v.data)} className="text-sm font-medium text-ink/60 hover:text-ink">
                              Создать похожую
                            </button>
                            <button type="button" onClick={() => handleDelete(v.id)} className="text-ink/40 hover:text-red-600">Удалить</button>
                          </div>
                        </div>

                        {v.moderationStatus === 'published' && (() => {
                          const allResponsesForVacancy = getResponsesForVacancy(v.id)
                          const expanded = expandedVacancyId === v.id
                          const responses = allResponsesForVacancy.filter((r) => {
                            if (responseFilters.industry && !r.industry.includes(responseFilters.industry)) return false
                            if (responseFilters.level && r.level !== responseFilters.level) return false
                            if (responseFilters.testedOnly && r.skillScore === undefined && r.softSkillScore === undefined) return false
                            if (responseFilters.search && !r.name.toLowerCase().includes(responseFilters.search.toLowerCase())) return false
                            return true
                          })
                          const vacancyFunnel = responseStatusOrder.map((s) => ({
                            status: s,
                            count: allResponsesForVacancy.filter((r) => r.status === s).length,
                          }))
                          return (
                            <div className="mt-3">
                              <button
                                type="button"
                                onClick={() => toggleExpandVacancy(v.id)}
                                className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
                              >
                                Отклики ({allResponsesForVacancy.length}) {expanded ? '▲' : '▼'}
                              </button>

                              {expanded && (
                                <div key={responseVersion} className="mt-3">
                                  {allResponsesForVacancy.length > 0 && (
                                    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-ink/10 px-3 py-2 text-xs text-ink/50">
                                      {vacancyFunnel.map(({ status, count }) => (
                                        <span key={status}>{responseStatusLabel[status]}: <span className="font-semibold text-ink">{count}</span></span>
                                      ))}
                                    </div>
                                  )}

                                  {allResponsesForVacancy.length > 0 && (
                                    <div className="mb-3 flex flex-wrap items-center gap-2">
                                      <input
                                        value={responseFilters.search}
                                        onChange={(e) => setResponseFilters((f) => ({ ...f, search: e.target.value }))}
                                        placeholder="Поиск по имени"
                                        className="rounded-full border border-ink/15 px-3 py-1.5 text-xs placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                                      />
                                      <select
                                        value={responseFilters.industry}
                                        onChange={(e) => setResponseFilters((f) => ({ ...f, industry: e.target.value as '' | Industry }))}
                                        className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs text-ink/70"
                                      >
                                        <option value="">Любое направление</option>
                                        {INDUSTRIES.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
                                      </select>
                                      <select
                                        value={responseFilters.level}
                                        onChange={(e) => setResponseFilters((f) => ({ ...f, level: e.target.value as '' | CandidateLevel }))}
                                        className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs text-ink/70"
                                      >
                                        <option value="">Любой уровень</option>
                                        {Object.entries(levelLabel).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                                      </select>
                                      <label className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs text-ink/70">
                                        <input type="checkbox" checked={responseFilters.testedOnly} onChange={(e) => setResponseFilters((f) => ({ ...f, testedOnly: e.target.checked }))} />
                                        С результатами теста
                                      </label>
                                    </div>
                                  )}

                                  {selectedResponseIds.size > 0 && (
                                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs text-white">
                                      Выбрано: {selectedResponseIds.size}
                                      {responseStatusOrder.map((s) => (
                                        <button key={s} type="button" onClick={() => handleBulkStatus(s)} className="rounded-full bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25">
                                          → {responseStatusLabel[s]}
                                        </button>
                                      ))}
                                      <button type="button" onClick={() => setSelectedResponseIds(new Set())} className="ml-auto text-white/70 hover:text-white">Снять выбор</button>
                                    </div>
                                  )}

                                  <div className="divide-y divide-ink/10 rounded-lg border border-ink/10">
                                  {responses.length === 0 && (
                                    <p className="p-4 text-sm text-ink/50">{allResponsesForVacancy.length === 0 ? 'Пока никто не откликнулся на эту вакансию.' : 'Ничего не найдено по фильтру.'}</p>
                                  )}
                                  {responses.map((r) => {
                                    const price = contactPrice(r.experienceYears)
                                    return (
                                      <div key={r.id} className="p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                          <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={selectedResponseIds.has(r.id)}
                                                onChange={() => toggleSelectResponse(r.id)}
                                                aria-label={`Выбрать отклик ${r.name}`}
                                              />
                                              <span className="font-medium">{r.name}</span>
                                              <span className="text-xs text-ink/40">{r.city} · {levelLabel[r.level]}</span>
                                            </div>
                                            <p className="mt-1 text-sm text-ink/60">{r.coverLetter}</p>
                                            <div className="mt-1.5 flex flex-wrap gap-1">
                                              {r.specialization.map((s) => <SpecTag key={s} id={s} />)}
                                              {r.industry.map((i) => <IndustryTag key={i} id={i} />)}
                                            </div>
                                            {(r.skillScore !== undefined || r.softSkillScore !== undefined) && (
                                              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                                                {r.skillScore !== undefined && (
                                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Навыки: {r.skillScore}%</span>
                                                )}
                                                {r.softSkillScore !== undefined && (
                                                  <span className="rounded-full bg-gold-light/20 px-2 py-0.5 font-medium text-gold">Софт-скиллы: {r.softSkillScore}%</span>
                                                )}
                                              </div>
                                            )}
                                            <div className="mt-2 text-xs text-ink/50">
                                              Откликнулся {new Date(r.appliedAt).toLocaleDateString('ru-RU')}
                                            </div>
                                            {r.contactRevealed ? (
                                              <div className="mt-1 text-sm">
                                                <span className="font-medium text-emerald-600">{r.phone}</span> · {r.email}
                                              </div>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => handleRevealContact(r.id, r.name, price)}
                                                className="mt-2 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/40 hover:text-ink"
                                              >
                                                Открыть контакты — {price} ₽
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => handleOpenChat(r.id, r.name, v.data.title || 'Вакансия без названия')}
                                              className="mt-2 ml-2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/90"
                                            >
                                              Написать
                                            </button>
                                          </div>
                                          <select
                                            value={r.status}
                                            onChange={(e) => handleResponseStatus(r.id, e.target.value as ApplicationStatus)}
                                            className="shrink-0 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70"
                                          >
                                            {responseStatusOrder.map((s) => (
                                              <option key={s} value={s}>{responseStatusLabel[s]}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    )
                                  })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            </div>
          )}

          {section === 'messages' && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Сообщения</h2>
              <div className="glass divide-y divide-ink/10 rounded-xl">
                {threads.length === 0 && <p className="p-5 text-sm text-ink/50">Нет переписок — начните из отклика на вакансию кнопкой «Написать».</p>}
                {threads.map((t) => {
                  const last = t.messages[t.messages.length - 1]
                  const unread = unreadForRole(t, 'employer')
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleOpenChat(t.id, t.candidateName, t.vacancyTitle)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-ink/[0.02]"
                    >
                      <div>
                        <div className="flex items-center gap-2 font-medium">
                          {t.candidateName}
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
            <section>
              <h2 className="mb-3 text-lg font-semibold">Сообщество и мероприятия</h2>
              <div className="glass rounded-xl p-5">
                <p className="text-sm text-ink/60">
                  Ваши вакансии сначала предлагаются резидентам платного Сообщества, затем — кадровому резерву, и только
                  потом публикуются в открытом доступе (см. базу знаний работодателя).
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-ink/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-ink/40">Резиденты сообщества</div>
                    <div className="mt-1 text-lg font-semibold text-ink">140</div>
                  </div>
                  <div className="rounded-lg border border-ink/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-ink/40">Кадровый резерв</div>
                    <div className="mt-1 text-lg font-semibold text-ink">3 200+</div>
                  </div>
                </div>
                <Link to="/community" className="mt-4 inline-block rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/40 hover:text-ink">
                  О сообществе
                </Link>
              </div>
            </section>
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
            <section>
              <h2 className="mb-3 text-lg font-semibold">Настройки</h2>
              <div className="glass rounded-xl p-5">
                <p className="text-sm text-ink/60">Демо-настройки интерфейса — не влияют на реальный вид сайта, показывают механику раздела.</p>
                <form onSubmit={handleSaveSettings} className="mt-4 space-y-4">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm">Email-уведомления об откликах и модерации</span>
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
          )}

          {section === 'support' && (
            <div className="space-y-6">
              <section>
                <h2 className="mb-3 text-lg font-semibold">Безопасность</h2>
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

                  <label className="mt-5 flex items-center justify-between gap-3 border-t border-ink/10 pt-5">
                    <span className="text-sm">Дополнительная защита устройства (2FA)</span>
                    <input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} className="h-4 w-4" />
                  </label>
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

      {/* Чат с соискателем — общий localStorage с кабинетом соискателя (см. lib/chat.ts) */}
      {openThread && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpenThreadId(null) }}
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white text-ink sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 p-5">
              <div>
                <h3 className="text-lg font-semibold">{openThread.candidateName}</h3>
                <p className="text-xs text-ink/50">{openThread.vacancyTitle}</p>
              </div>
              <button type="button" onClick={() => setOpenThreadId(null)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {openThread.messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderRole === 'employer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.senderRole === 'employer' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink'}`}>
                    {m.text}
                    <div className={`mt-1 text-[11px] ${m.senderRole === 'employer' ? 'text-white/50' : 'text-ink/40'}`}>
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
