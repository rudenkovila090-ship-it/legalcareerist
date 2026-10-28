import type { CabinetPage } from '../sections'
import { icon } from '../sections'
import { isMember } from '../shared'
import type { BodyContext } from '../sectionBodies'
import { PillTabs, Surface, TabSkeleton, Workspace, type TabDef } from '../kit'
import { btnPrimary } from '../kitStyles'
import InterviewTab from './InterviewTab'
import OverviewTab from './OverviewTab'
import PlanTab from './PlanTab'
import PodcastTab from './PodcastTab'
import PortfolioTab, { type PortfolioSub } from './PortfolioTab'
import RecommendationTab from './RecommendationTab'
import TemplatesTab from './TemplatesTab'
import { useCareer } from './useCareer'

// «Построение карьеры» в кабинете: рабочая область с вкладками. Первой идёт «Обзор»: что делать дальше и куда пойти, остальные вкладки
// в порядке важности: план и подготовка к интервью, затем шаблоны, рекомендация, портфолио, подкаст. Адрес вкладки — /cabinet/<раздел>
// (career, route, interview-prep, templates, recommendations, portfolio, achievements, capital, mediakit, podcast): ссылки можно сохранять.

type CareerTab = 'overview' | 'plan' | 'interview' | 'templates' | 'recommendation' | 'portfolio' | 'podcast'

const HREF: Record<CareerTab, string> = {
  overview: '/cabinet/career',
  plan: '/cabinet/route',
  interview: '/cabinet/interview-prep',
  templates: '/cabinet/templates',
  recommendation: '/cabinet/recommendations',
  portfolio: '/cabinet/portfolio',
  podcast: '/cabinet/podcast',
}

const ANCHOR_TAB: Record<string, { tab: CareerTab; sub?: PortfolioSub }> = {
  route: { tab: 'plan' },
  'interview-prep': { tab: 'interview' },
  templates: { tab: 'templates' },
  recommendations: { tab: 'recommendation' },
  portfolio: { tab: 'portfolio' },
  achievements: { tab: 'portfolio', sub: 'achievements' },
  capital: { tab: 'portfolio', sub: 'capital' },
  mediakit: { tab: 'portfolio', sub: 'mediakit' },
  podcast: { tab: 'podcast' },
}

export default function CareerWorkspace({ page, ctx }: { page: CabinetPage; ctx: BodyContext }) {
  const { user } = ctx
  const member = isMember(user)
  const career = useCareer()
  const hit = ANCHOR_TAB[page.anchor ?? ''] ?? { tab: 'overview' as CareerTab }
  const tab = hit.tab
  const hrefOf = (id: string) => HREF[id as CareerTab] ?? HREF.overview

  const st = career.state
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Обзор', icon: icon.home },
    { id: 'plan', label: 'Карьерный план', icon: icon.route },
    { id: 'interview', label: 'Подготовка к интервью', icon: icon.mic },
    { id: 'templates', label: 'Шаблоны', icon: icon.book },
    { id: 'recommendation', label: 'Рекомендация', icon: icon.star, count: st?.recommendations.ready, attention: true },
    { id: 'portfolio', label: 'Портфолио', icon: icon.folder },
    { id: 'podcast', label: 'Подкаст', icon: icon.headphones },
  ]

  if (!member) {
    const ended = user.resident.status === 'ended'
    return (
      <Workspace>
        <Surface>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold"><span className="text-ink/50">{icon.lock}</span>Для резидентов сообщества</h2>
              <p className="mt-1 max-w-xl text-[13px] text-ink/60">Карьерный план, подготовка к интервью, шаблоны, рекомендация, портфолио и подкаст доступны резидентам с действующей подпиской. {ended ? 'Ваша подписка закончилась: продлите её, чтобы вернуть доступ.' : 'Вступите в сообщество, и всё откроется.'}</p>
            </div>
            <a href="/community#join" className={btnPrimary}>{ended ? 'Продлить подписку' : 'Вступить в сообщество'}</a>
          </div>
        </Surface>
      </Workspace>
    )
  }

  return (
    <Workspace>
      <PillTabs tabs={tabs} active={tab} hrefOf={hrefOf} label="Разделы вкладки «Построение карьеры»" />
      <div className="mt-2 min-h-[22rem]">
        {career.failed && !st ? (
          <Surface><p className="text-[13px] text-ink/60">Не получилось загрузить раздел. Обновите страницу через минуту.</p></Surface>
        ) : !st ? (
          <TabSkeleton rows={3} />
        ) : (
          <>
            {tab === 'overview' && <OverviewTab state={st} />}
            {tab === 'plan' && <PlanTab career={{ state: st, patch: career.patch }} />}
            {tab === 'interview' && <InterviewTab career={{ state: st, patch: career.patch }} />}
            {tab === 'templates' && <TemplatesTab />}
            {tab === 'recommendation' && <RecommendationTab career={{ state: st, patch: career.patch }} />}
            {tab === 'portfolio' && <PortfolioTab career={{ state: st, patch: career.patch }} sub={hit.sub ?? 'overview'} />}
            {tab === 'podcast' && <PodcastTab career={{ state: st, patch: career.patch }} />}
          </>
        )}
      </div>
    </Workspace>
  )
}
