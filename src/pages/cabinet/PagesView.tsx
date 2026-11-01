import { useEffect, type ReactNode } from 'react'
import type { CabinetUser } from '../../lib/cabinet'
import { icon, type CabinetPage, type CabinetSection } from './sections'
import { sectionBody, type BodyContext } from './sectionBodies'
import { Card, Chip, IconBubble } from './ui'
import { isMember } from './shared'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

/** Раздел, который ещё не сделан: коротко, что это и что в нём будет. */
function Preview({ section }: { section: CabinetSection }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="warn">В разработке</Chip>
      </div>
      <p className="mt-3 text-sm text-ink/70">{section.lead}</p>
      {section.todo.length > 0 && (
        <details className="group mt-3">
          <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>
            Что будет в разделе <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
          </summary>
          <ul className="mt-2.5 space-y-2">
            {section.todo.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-ink/80">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-ink/25" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Страницы, где разделы, которые ещё не сделаны, идут компактными карточками в сетке, чтобы лента не растягивалась. */
const COMPACT_GROUPS = new Set(['vacancies', 'career'])

/** Раздел, который ещё не сделан: компактная карточка в сетке. */
function CareerCard({ section }: { section: CabinetSection }) {
  return (
    <section id={`s-${section.id}`} className="glass flex min-w-0 scroll-mt-24 flex-col gap-2 rounded-2xl p-4">
      <h3 className="flex items-center gap-2.5 text-base font-semibold">
        <IconBubble tone="soft">{section.icon}</IconBubble>
        <span className="min-w-0">{section.title}</span>
      </h3>
      <p className="text-sm text-ink/60">{section.lead}</p>
      <div className="mt-auto flex flex-col gap-2 pt-1">
        <div><Chip tone="warn">В разработке</Chip></div>
        {section.todo.length > 0 && (
          <details className="group">
            <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-xs font-medium text-gold hover:text-ink ${focusRing}`}>
              Что будет в разделе <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            </summary>
            <ul className="mt-2 space-y-1.5">
              {section.todo.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-xs text-ink/80">
                  <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-ink/25" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}

/** Список недоделанного у готового раздела: свёрнут, чтобы не удлинять ленту. */
function TodoDetails({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <details className="group px-1">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-xs font-medium text-ink/50 hover:text-ink ${focusRing}`}>
        Что ещё не сделано <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm text-ink/70">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-ink/25" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Вместо разделов «только для резидентов»: что внутри и как получить доступ. */
function Locked({ titles, user }: { titles: string[]; user: CabinetUser }) {
  const ended = user.resident.status === 'ended'
  return (
    <section id="s-locked" className="scroll-mt-24">
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <IconBubble>{icon.lock}</IconBubble>
          <h2 className="text-lg font-semibold">Для резидентов сообщества</h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-ink/70">
          Эти разделы доступны резидентам сообщества. {ended ? 'Ваша подписка закончилась: продлите её, чтобы вернуть доступ.' : 'Вступите в сообщество, и они откроются.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {titles.map((t) => <span key={t} className="rounded-full bg-ink/[0.06] px-3 py-1.5 text-xs font-medium text-ink/70">{t}</span>)}
        </div>
        <a href="/community#join" className={`mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 ${focusRing}`}>{ended ? 'Продлить подписку' : 'Вступить в сообщество'}</a>
      </div>
    </section>
  )
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Страница кабинета. Отдельная страница — один раздел. Страница-лента (сообщество, поиск работы, для юристов, настройки) —
 * все разделы группы сразу, одной лентой, с кнопками быстрого перехода сверху. Разделы «только для резидентов» у остальных
 * заменены одним приглашением.
 */
export default function PageView({ page, ctx }: { page: CabinetPage; ctx: BodyContext }) {
  const { user } = ctx
  const member = isMember(user)

  // Пришли по ссылке на отдельный раздел ленты: прокручиваем к нему, когда лента отрисовалась.
  useEffect(() => {
    if (!page.anchor) return
    const t = window.setTimeout(() => scrollTo(`s-${page.anchor}`), 250)
    return () => window.clearTimeout(t)
  }, [page.anchor, page.menuId])

  if (!page.stacked) {
    const section = page.parts[0]
    const body = sectionBody(section.id, ctx)
    if (!body || (section.members && !member)) {
      return section.members && !member ? <Locked titles={[section.title]} user={user} /> : <Card><Preview section={section} /></Card>
    }
    return (
      <div className="space-y-6">
        {body}
        <TodoDetails items={section.todo} />
      </div>
    )
  }

  const visible = page.parts.filter((p) => !p.members || member)
  const lockedTitles = member ? [] : page.parts.filter((p) => p.members).map((p) => p.title)
  const firstMembersIndex = page.parts.findIndex((p) => p.members)
  const hideFirstHeading = page.parts[0]?.title === page.title

  const chips: { id: string; label: string }[] = visible.map((p) => ({ id: `s-${p.id}`, label: p.title }))
  if (lockedTitles.length) chips.push({ id: 's-locked', label: 'Для резидентов' })

  const parts: ReactNode[] = []
  let lockedShown = false
  let careerShown = false
  let careerBuffer: CabinetSection[] = []
  const flushCareer = () => {
    if (!careerBuffer.length) return
    parts.push(
      <div key={`career-${careerBuffer[0].id}`} className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {careerBuffer.map((c) => <CareerCard key={c.id} section={c} />)}
      </div>,
    )
    careerBuffer = []
  }
  page.parts.forEach((part, index) => {
    if (part.members && !member) {
      if (!lockedShown && index >= firstMembersIndex) {
        lockedShown = true
        parts.push(<Locked key="locked" titles={lockedTitles} user={user} />)
      }
      return
    }
    // не готовые разделы идут сеткой под общим заголовком
    if (COMPACT_GROUPS.has(part.group) && !part.ready) {
      if (!careerShown) {
        careerShown = true
        parts.push(
          <div key="soon-head" className="pt-1">
            <h2 className="text-lg font-semibold tracking-tight">Скоро в этой вкладке</h2>
            <p className="mt-0.5 text-sm text-ink/60">Эти разделы пока каркас: подключаем по очереди.</p>
          </div>,
        )
      }
      careerBuffer.push(part)
      return
    }
    flushCareer()
    const body = part.ready ? sectionBody(part.id, ctx) : null
    parts.push(
      <section key={part.id} id={`s-${part.id}`} className="scroll-mt-24 space-y-3">
        {!(index === 0 && hideFirstHeading) && (
          <div>
            <h2 className="flex items-center gap-2.5 text-lg font-semibold">
              <IconBubble tone="soft">{part.icon}</IconBubble>
              {part.title}
            </h2>
            {part.ready && <p className="mt-1.5 text-sm text-ink/60">{part.lead}</p>}
          </div>
        )}
        {body ?? <Preview section={part} />}
        {body && <TodoDetails items={part.todo} />}
      </section>,
    )
  })
  flushCareer()

  return (
    <div className="space-y-8">
      {chips.length > 2 && (
        <nav aria-label="Разделы страницы" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {chips.map((c) => (
            <button key={c.id} type="button" onClick={() => scrollTo(c.id)} className={`shrink-0 whitespace-nowrap rounded-full border border-ink/15 bg-white/60 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30 hover:text-ink ${focusRing}`}>
              {c.label}
            </button>
          ))}
        </nav>
      )}
      {parts}
    </div>
  )
}
