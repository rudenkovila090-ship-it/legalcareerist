import ProfessionalProfile from '../ProfessionalProfile'
import { vacancies } from '../../../data/vacancies'
import type { BodyContext } from '../sectionBodies'
import { sectionBody } from '../sectionBodies'
import type { CabinetPage } from '../sections'
import { icon } from '../sections'
import { PillTabs, Stat, StatStrip, Workspace, type TabDef } from '../kit'
import ApplicationsTab from './ApplicationsTab'
import ChatTab from './ChatTab'
import NotificationsTab from './NotificationsTab'
import ReserveTab from './ReserveTab'
import VacancyListTab from './VacancyListTab'

// «Вакансии» в кабинете: рабочая область с вкладками. Сверху сводка (что требует внимания и сколько всего), под ней вкладки в том
// порядке, в каком человек обычно идёт: смотрит вакансии → откликается → ведёт переписку → получает уведомления → вступает в резерв.
// Адрес вкладки — /cabinet/<вкладка> (vacancies, applications, chat, notifications, reserve, cv): ссылки можно сохранять и присылать.

const VACANCY_TABS = ['vacancies', 'applications', 'chat', 'notifications', 'reserve', 'cv', 'job-profile'] as const
type VacancyTab = (typeof VACANCY_TABS)[number]

const hrefOf = (id: string) => (id === 'vacancies' ? '/cabinet/vacancies' : `/cabinet/${id}`)

export default function VacanciesWorkspace({ page, ctx }: { page: CabinetPage; ctx: BodyContext }) {
  const { dash } = ctx
  const tab: VacancyTab = (VACANCY_TABS as readonly string[]).includes(page.anchor ?? '') ? (page.anchor as VacancyTab) : 'vacancies'
  const v = dash?.vacancies
  const openCount = vacancies.filter((x) => x.status === 'open').length
  const num = (n: number | undefined) => (n === undefined ? '—' : n)

  const tabs: TabDef[] = [
    { id: 'vacancies', label: 'Вакансии', icon: icon.case },
    { id: 'applications', label: 'Мои отклики', icon: icon.list, count: v?.active },
    { id: 'chat', label: 'Чат с рекрутером', icon: icon.chat, count: v?.unreadChats, attention: true },
    { id: 'notifications', label: 'Уведомления', icon: icon.bell, count: v?.unreadNotifications, attention: true },
    { id: 'reserve', label: 'Кадровый резерв', icon: icon.box },
    { id: 'job-profile', label: 'Профессиональный профиль', icon: icon.user },
    { id: 'cv', label: 'Профиль и CV', icon: icon.doc },
  ]

  return (
    <Workspace><div className="mb-3 rounded-2xl bg-ink px-4 py-4 text-white"><h2 className="text-base font-semibold">Ваш следующий карьерный шаг</h2><p className="mt-1 text-xs text-white/70">Вакансии, отклики и общение с рекрутером — в одном месте.</p></div>
      <StatStrip>
        <Stat label="Открытых вакансий" value={openCount} hint="на сайте и в кабинете" to="/cabinet/vacancies" />
        <Stat label="Откликов в работе" value={num(v?.active)} hint={v ? `всего ${v.applications}` : undefined} to="/cabinet/applications" />
        <Stat label="Новых ответов рекрутера" value={num(v?.unreadChats)} hint={v && v.unreadChats > 0 ? 'ждут в чате' : 'пока нет'} to="/cabinet/chat" attention={Boolean(v && v.unreadChats > 0)} />
        <Stat label="Новых уведомлений" value={num(v?.unreadNotifications)} hint={v && v.unreadNotifications > 0 ? 'непрочитанные' : 'все прочитано'} to="/cabinet/notifications" attention={Boolean(v && v.unreadNotifications > 0)} />
      </StatStrip>

      <div className="mt-2">
        <PillTabs contrast tabs={tabs} active={tab} hrefOf={hrefOf} label="Разделы вкладки «Вакансии»" />
      </div>

      <div className="mt-2 min-h-[22rem]">
        {tab === 'job-profile' && <ProfessionalProfile ctx={ctx} />}
        {tab === 'vacancies' && <VacancyListTab ctx={ctx} />}
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'chat' && <ChatTab onRead={ctx.onRead} />}
        {tab === 'notifications' && <NotificationsTab onRead={ctx.onRead} />}
        {tab === 'reserve' && <ReserveTab onChanged={ctx.onRead} />}
        {tab === 'cv' && <div className="space-y-4">{sectionBody('cv', ctx)}</div>}
      </div>
    </Workspace>
  )
}
