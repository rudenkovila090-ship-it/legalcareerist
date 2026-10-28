import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { vacancies } from '../../../data/vacancies'
import { pluralRu } from '../../../lib/plural'
import { APPLICATION_STEPS, fetchApplications, peekApplications, withdrawApplication, type ApplicationStatus, type CabinetApplication } from '../../../lib/vacanciesCabinet'
import { icon } from '../sections'
import { longDate, relativeTime } from '../shared'
import { BlockHead, EmptyNote, StepTrack, Surface, TabSkeleton } from '../kit'
import { btnGhost, btnPrimary, focusRing } from '../kitStyles'

const knownSlugs = new Set(vacancies.map((v) => v.slug))
const ACTIVE: ApplicationStatus[] = ['sent', 'forwarded', 'interview']

const stepIndex = (a: CabinetApplication) => {
  const reached = a.history.map((h) => APPLICATION_STEPS.findIndex((s) => s.id === h.status)).filter((i) => i >= 0)
  return reached.length ? Math.max(...reached) : 0
}

function stoppedOf(a: CabinetApplication): { label: string; tone: 'bad' | 'muted' } | null {
  if (a.status === 'rejected') return { label: `Отказ · ${longDate(a.statusAt)}`, tone: 'bad' }
  if (a.status === 'withdrawn') return { label: `Вы отозвали отклик · ${longDate(a.statusAt)}`, tone: 'muted' }
  return null
}

/** Вкладка «Мои отклики»: сначала отклики в работе с путём «отправлен → передан → собеседование → оффер», ниже тише — завершённые. */
export default function ApplicationsTab() {
  const [apps, setApps] = useState<CabinetApplication[] | null>(() => peekApplications()?.applications ?? null)
  const [failed, setFailed] = useState(false)
  const [asking, setAsking] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await fetchApplications()
    if (r.ok) setApps(r.data.applications)
    else setFailed(true)
  }, [])
  useEffect(() => {
    let live = true
    fetchApplications().then((r) => {
      if (!live) return
      if (r.ok) setApps(r.data.applications)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  async function withdraw(number: number) {
    setBusy(true)
    setError('')
    const r = await withdrawApplication(number, reason)
    setBusy(false)
    if (!r.ok) {
      setError(r.error === 'closed' ? 'Этот отклик уже закрыт.' : 'Не получилось отозвать. Попробуйте ещё раз.')
      return
    }
    setAsking(null)
    setReason('')
    await load()
  }

  if (failed) return <Surface><p className="text-sm text-ink/60">Не получилось загрузить отклики. Обновите страницу через минуту.</p></Surface>
  if (!apps) return <TabSkeleton rows={2} />
  if (!apps.length) {
    return (
      <EmptyNote
        icon={icon.list}
        title="Откликов пока нет"
        action={<Link to="/cabinet/vacancies" className={btnPrimary}>Смотреть вакансии</Link>}
      >
        Откликнитесь на вакансию, и она появится здесь с путём отклика: передан работодателю, собеседование, оффер. Отклики находим по почте аккаунта и привязанному Telegram.
      </EmptyNote>
    )
  }

  const work = apps.filter((a) => ACTIVE.includes(a.status))
  const done = apps.filter((a) => !ACTIVE.includes(a.status))

  const card = (a: CabinetApplication, quiet: boolean) => {
    const stopped = stoppedOf(a)
    const reached = stepIndex(a)
    const canWithdraw = ACTIVE.includes(a.status)
    return (
      <li key={a.number}>
        <Surface as="article" className={quiet ? 'bg-white/70' : ''}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h3 className="text-balance text-base font-semibold leading-snug">
                {knownSlugs.has(a.vacancySlug) ? <Link to={`/vacancies/${a.vacancySlug}`} className={`rounded hover:underline ${focusRing}`}>{a.vacancyTitle}</Link> : a.vacancyTitle}
              </h3>
              <p className="mt-0.5 text-xs text-ink/55">Отклик №{a.number} · отправлен {longDate(a.createdAt)}</p>
            </div>
            <span className="text-xs text-ink/45">обновлён {relativeTime(a.statusAt)}</span>
          </div>
          <div className="mt-3 overflow-x-auto pb-1">
            <div className="min-w-[20rem]">
              <StepTrack steps={APPLICATION_STEPS} reached={a.status === 'offer' ? APPLICATION_STEPS.length - 1 : reached} stopped={stopped} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {a.vacancySlug && (
              <Link to={`/cabinet/chat?v=${a.vacancySlug}`} className={btnPrimary}>
                <span className="[&>svg]:h-4 [&>svg]:w-4">{icon.chat}</span>
                Чат по вакансии
              </Link>
            )}
            {knownSlugs.has(a.vacancySlug) && <Link to={`/vacancies/${a.vacancySlug}`} className={btnGhost}>Открыть вакансию</Link>}
            {canWithdraw && asking !== a.number && <button type="button" onClick={() => { setAsking(a.number); setError('') }} className={`ml-auto rounded px-2 py-1 text-sm font-medium text-ink/50 hover:text-red-700 ${focusRing}`}>Отозвать отклик</button>}
          </div>
          {asking === a.number && (
            <div className="mt-4 rounded-2xl bg-ink/[0.04] p-4">
              <label className="block text-sm font-medium" htmlFor={`why-${a.number}`}>Отозвать отклик? Причину можно не указывать</label>
              <textarea id={`why-${a.number}`} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={2} placeholder="Например: нашёл другую работу" className="mt-2 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-base placeholder:text-ink/40 focus:border-ink/40 focus:outline-none sm:text-sm" />
              {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void withdraw(a.number)} className="inline-flex items-center rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Отзываем…' : 'Да, отозвать'}</button>
                <button type="button" onClick={() => setAsking(null)} className={btnGhost}>Не отзывать</button>
              </div>
            </div>
          )}
        </Surface>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <section aria-label="Отклики в работе">
        <BlockHead title="В работе" note={work.length ? `${work.length} ${pluralRu(work.length, ['отклик', 'отклика', 'откликов'])}` : 'Сейчас активных откликов нет'} />
        {work.length > 0 ? <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-2">{work.map((a) => card(a, false))}</ul> : <p className="rounded-2xl bg-white/60 px-4 py-3 text-sm text-ink/60">Все отклики завершены. <Link to="/cabinet/vacancies" className="font-medium text-gold hover:text-ink">Посмотреть свежие вакансии →</Link></p>}
      </section>
      {done.length > 0 && (
        <section aria-label="Завершённые отклики">
          <details className="group">
            <summary className={`flex cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-ink/60 hover:text-ink ${focusRing}`}>
              Завершённые · {done.length}
              <span className="text-ink/35 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            </summary>
            <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-2">{done.map((a) => card(a, true))}</ul>
          </details>
        </section>
      )}
    </div>
  )
}
