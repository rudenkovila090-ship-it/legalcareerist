import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { vacancies } from '../../../data/vacancies'
import { pluralRu } from '../../../lib/plural'
import { fetchApplications, type CabinetApplication } from '../../../lib/vacanciesCabinet'
import { WORK_FORMATS, type Vacancy, type WorkFormat } from '../../../types'
import type { BodyContext } from '../sectionBodies'
import { icon } from '../sections'
import { isMember } from '../shared'
import { BlockHead, EmptyNote, Surface } from '../kit'
import { accent, btnGhost, btnPrimary, focusRing } from '../kitStyles'

const money = (n: number) => n.toLocaleString('ru-RU')
function salaryText(v: Vacancy): string {
  if (v.salaryFrom && v.salaryTo) return `${money(v.salaryFrom)}–${money(v.salaryTo)} ₽`
  if (v.salaryFrom) return `от ${money(v.salaryFrom)} ₽`
  if (v.salaryTo) return `до ${money(v.salaryTo)} ₽`
  return ''
}
const dayText = (iso: string) => {
  const ts = Date.parse(iso)
  return Number.isNaN(ts) ? '' : new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

type FormatFilter = 'all' | WorkFormat

/** Вкладка «Вакансии»: сначала то, что требует внимания, затем список с поиском и фильтром, внизу тихая подсказка про кадровый резерв. */
export default function VacancyListTab({ ctx }: { ctx: BodyContext }) {
  const { user, dash } = ctx
  const member = isMember(user)
  const [apps, setApps] = useState<CabinetApplication[]>([])
  const [query, setQuery] = useState('')
  const [format, setFormat] = useState<FormatFilter>('all')

  useEffect(() => {
    let live = true
    fetchApplications().then((r) => {
      if (live && r.ok) setApps(r.data.applications)
    })
    return () => {
      live = false
    }
  }, [])

  const open = useMemo(() => vacancies.filter((v) => v.status === 'open').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)), [])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return open.filter((v) => (format === 'all' || v.format === format) && (!q || `${v.title} ${v.company} ${v.city}`.toLowerCase().includes(q)))
  }, [open, query, format])
  const appBySlug = useMemo(() => new Map(apps.filter((a) => a.status !== 'withdrawn').map((a) => [a.vacancySlug, a])), [apps])
  const v = dash?.vacancies
  const attention = (v?.unreadChats ?? 0) + (v?.unreadNotifications ?? 0) > 0

  if (!member) {
    return (
      <Surface>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="text-ink/50">{icon.lock}</span>Вакансии для резидентов</h2>
            <p className="mt-1 max-w-xl text-sm text-ink/60">Свежие вакансии сообщества открыты резидентам с действующей подпиской. Остальные вкладки (отклики, чат, уведомления, кадровый резерв, профиль и CV) доступны всем.</p>
          </div>
          <a href="/community#join" className={btnPrimary}>{user.resident.status === 'ended' ? 'Продлить подписку' : 'Вступить в сообщество'}</a>
        </div>
      </Surface>
    )
  }

  return (
    <div className="space-y-5">
      {/* Уровень 1: что требует внимания */}
      {attention && (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-amber-100/80 p-3 pl-4 sm:p-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${accent} [&>svg]:h-5 [&>svg]:w-5`}>{icon.bell}</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Есть новое</div>
            <div className="text-sm text-ink/70">
              {[
                v && v.unreadChats > 0 ? `${v.unreadChats} ${pluralRu(v.unreadChats, ['ответ рекрутера', 'ответа рекрутера', 'ответов рекрутера'])}` : null,
                v && v.unreadNotifications > 0 ? `${v.unreadNotifications} ${pluralRu(v.unreadNotifications, ['уведомление', 'уведомления', 'уведомлений'])}` : null,
              ].filter(Boolean).join(' и ')}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {v && v.unreadChats > 0 && <Link to="/cabinet/chat" className={btnPrimary}>Открыть чат</Link>}
            {v && v.unreadNotifications > 0 && <Link to="/cabinet/notifications" className={btnGhost}>Уведомления</Link>}
          </div>
        </div>
      )}

      {/* Уровень 2: список */}
      <section aria-label="Список вакансий">
        <BlockHead
          title="Свежие вакансии"
          note={`${shown.length} ${pluralRu(shown.length, ['вакансия', 'вакансии', 'вакансий'])}${shown.length !== open.length ? ` из ${open.length}` : ''}`}
          aside={<Link to="/kadry/vacancies" className={`rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>Вся доска на сайте →</Link>}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Поиск по вакансиям</span>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40 [&>svg]:h-4 [&>svg]:w-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Название, компания или город"
              className="w-full rounded-full border border-transparent bg-white py-2.5 pl-10 pr-4 text-base shadow-[0_1px_2px_rgba(40,57,83,0.06)] placeholder:text-ink/40 focus:border-ink/25 focus:outline-none sm:text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Формат работы">
            {([{ id: 'all', label: 'Все' }, ...WORK_FORMATS] as { id: FormatFilter; label: string }[]).map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={format === f.id}
                onClick={() => setFormat(f.id)}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${format === f.id ? 'bg-ink text-white' : 'bg-white text-ink/65 hover:text-ink'} ${focusRing}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyNote icon={icon.case} title={open.length ? 'Ничего не нашли' : 'Открытых вакансий сейчас нет'} action={open.length ? <button type="button" onClick={() => { setQuery(''); setFormat('all') }} className={btnGhost}>Сбросить поиск</button> : undefined}>
            {open.length ? 'Попробуйте другой запрос или сбросьте фильтр.' : 'Новые появятся здесь и на доске вакансий. Чтобы не пропустить, вступите в кадровый резерв и включите уведомления в Telegram.'}
          </EmptyNote>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((vac) => {
              const mine = appBySlug.get(vac.slug)
              const formatLabel = WORK_FORMATS.find((f) => f.id === vac.format)?.label
              const salary = salaryText(vac)
              return (
                <li key={vac.id}>
                  <Surface as="article" className="flex h-full flex-col gap-3 transition-shadow hover:shadow-[0_1px_2px_rgba(40,57,83,0.08),0_14px_30px_-16px_rgba(40,57,83,0.4)]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {vac.urgent && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${accent}`}>Срочно</span>}
                      {mine && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Вы откликнулись · {mine.statusLabel}</span>}
                      <span className="ml-auto text-xs text-ink/40">{dayText(vac.publishedAt)}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-balance text-lg font-semibold leading-snug">{vac.title}</h3>
                      <p className="mt-0.5 truncate text-sm text-ink/60">{vac.anonymous ? 'Компания не раскрывается' : vac.company}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs text-ink/65">
                      {[vac.city, formatLabel, salary].filter(Boolean).map((t) => <span key={t} className="rounded-full bg-ink/[0.05] px-2.5 py-1">{t}</span>)}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <Link to={`/vacancies/${vac.slug}`} className={btnPrimary}>Открыть вакансию</Link>
                      <Link to={`/cabinet/chat?v=${vac.slug}`} className={btnGhost}>
                        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon.chat}</span>
                        Спросить рекрутера
                      </Link>
                    </div>
                  </Surface>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Уровень 3: тихая подсказка */}
      <Link to="/cabinet/reserve" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm text-ink/65 transition-colors hover:bg-white/70 ${focusRing}`}>
        <span className="text-ink/45 [&>svg]:h-5 [&>svg]:w-5">{icon.box}</span>
        <span className="min-w-0 flex-1">{v?.reserve ? 'Вы в кадровом резерве: подходящие вакансии мы предложим раньше открытой публикации.' : 'Не нашли подходящую вакансию? Вступите в кадровый резерв, и мы предложим подходящие раньше открытой публикации.'}</span>
        <span className="font-semibold text-gold">{v?.reserve ? 'Управлять →' : 'Вступить →'}</span>
      </Link>
    </div>
  )
}
