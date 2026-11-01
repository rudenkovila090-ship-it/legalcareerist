import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ConsentCheck from '../../../components/ConsentCheck'
import { consentOf } from '../../../lib/consent'
import { cancelRecommendationRequest, fetchRecommendations, peekRecommendations, requestRecommendation, type RecommendationRequest } from '../../../lib/careerCabinet'
import { icon } from '../sections'
import { longDate, relativeTime } from '../shared'
import { BlockHead, Chip, StepTrack, Surface, TabSkeleton } from '../kit'
import { btnAccent, btnGhost, btnPrimary, field, focusRing, label } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// Рекомендация — услуга: резидент просит «Карьерного юриста» написать рекомендацию, чтобы приложить её к отклику на вакансию или
// к резюме. Запрос приходит админу в бота, готовый текст админ присылает ответом и он появляется здесь (с уведомлением).

const STEPS = [
  { id: 'new', label: 'Получен' },
  { id: 'work', label: 'В работе' },
  { id: 'ready', label: 'Готово' },
]

const errorText = (code: string) =>
  ({
    consent_required: 'Отметьте обе галочки внизу формы: без согласия мы не можем обработать запрос.',
    target_required: 'Укажите, на какую вакансию или должность нужна рекомендация.',
    too_many_active: 'Уже есть три запроса в работе. Дождитесь результата или отмените лишний.',
    too_many: 'Слишком много запросов. Напишите в поддержку.',
    too_many_attempts: 'Слишком много попыток. Попробуйте через час.',
  })[code] ?? 'Не получилось отправить. Попробуйте ещё раз.'

function Request({ r, onCancel }: { r: RecommendationRequest; onCancel: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const declined = r.status === 'declined'
  const reached = Math.max(0, STEPS.findIndex((s) => s.id === r.status))

  async function copy() {
    try {
      await navigator.clipboard.writeText(r.result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <li className={`rounded-xl p-3 ${r.status === 'ready' ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-ink/[0.03]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-snug">{r.target}{r.company ? ` · ${r.company}` : ''}</h3>
          <p className="mt-0.5 text-xs text-ink/55">Запрос №{r.number} · {longDate(r.createdAt)}{r.deadline ? ` · нужна ${r.deadline}` : ''}</p>
        </div>
        <Chip tone={r.status === 'ready' ? 'amber' : declined ? 'soft' : 'dark'}>{r.statusLabel}</Chip>
      </div>
      {!declined && (
        <div className="mt-2.5 overflow-x-auto pb-0.5">
          <div className="min-w-[16rem] max-w-md"><StepTrack steps={STEPS} reached={reached} /></div>
        </div>
      )}
      {declined && <p className="mt-2 text-xs text-ink/60">Рекомендацию подготовить не получилось. Уточнить причину можно в поддержке: «Аккаунт → Поддержка».</p>}
      {r.status === 'ready' && r.result && (
        <div className="mt-3 rounded-xl bg-white p-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-900">Рекомендация от «Карьерного юриста» · {relativeTime(r.readyAt ?? r.updatedAt)}</div>
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{r.result}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copy()} className={btnAccent}>{copied ? 'Скопировано' : 'Скопировать текст'}</button>
            <span className="text-xs text-ink/50">Приложите её к отклику или резюме.</span>
          </div>
        </div>
      )}
      {r.status === 'new' && (
        <button type="button" onClick={() => onCancel(r.id)} className={`mt-2 rounded px-1 text-xs font-medium text-ink/45 hover:text-red-700 ${focusRing}`}>Отменить запрос</button>
      )}
    </li>
  )
}

export default function RecommendationTab({ career }: { career: CareerHandle }) {
  const [items, setItems] = useState<RecommendationRequest[] | null>(() => peekRecommendations()?.items ?? null)
  const [failed, setFailed] = useState(false)
  const [target, setTarget] = useState('')
  const [company, setCompany] = useState('')
  const [link, setLink] = useState('')
  const [deadline, setDeadline] = useState('')
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let live = true
    fetchRecommendations().then((r) => {
      if (!live) return
      if (r.ok) setItems(r.data.items)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  const summarize = (list: RecommendationRequest[]) => career.patch({ recommendations: { active: list.filter((r) => r.status === 'new' || r.status === 'work').length, ready: list.filter((r) => r.status === 'ready').length } })

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const consent = consentOf(e)
    setBusy(true)
    setError('')
    setSent(false)
    const r = await requestRecommendation({ target, company, link, deadline, focus }, { policy: consent.policy, processing: consent.processing })
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    const list = [r.data.item, ...(items ?? [])]
    setItems(list)
    summarize(list)
    setTarget('')
    setCompany('')
    setLink('')
    setDeadline('')
    setFocus('')
    setSent(true)
  }

  async function cancel(id: string) {
    const r = await cancelRecommendationRequest(id)
    if (r.ok) {
      const list = (items ?? []).filter((x) => x.id !== id)
      setItems(list)
      summarize(list)
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-2">
        <section className="relative overflow-hidden rounded-2xl bg-ink p-4 text-white">
          <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/[0.06]" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.star}</span>Рекомендация
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug">Рекомендация от «Карьерного юриста»</h2>
            <p className="mt-1 text-[13px] text-white/70">Мы напишем рекомендацию, которую можно приложить к отклику на вакансию или к резюме. Расскажите, куда она нужна и что в вас стоит подчеркнуть.</p>
            <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-white/80">
              {['Вы оставляете запрос', 'Мы готовим текст', 'Он появляется здесь'].map((t, i) => (
                <li key={t} className="flex items-center gap-1.5"><span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? 'bg-amber-300 text-ink' : 'bg-white/20 text-white'}`}>{i + 1}</span>{t}</li>
              ))}
            </ol>
          </div>
        </section>
        <Surface>
          <BlockHead title="Запросить рекомендацию" />
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="rec-target" className={label}>На какую вакансию или должность</label>
              <input id="rec-target" value={target} onChange={(e) => setTarget(e.target.value.slice(0, 140))} required placeholder="Например: младший юрист в налоговой практике" className={field} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="rec-company" className={label}>Компания <span className="font-normal text-ink/40">по желанию</span></label>
                <input id="rec-company" value={company} onChange={(e) => setCompany(e.target.value.slice(0, 120))} className={field} />
              </div>
              <div>
                <label htmlFor="rec-deadline" className={label}>Когда нужна <span className="font-normal text-ink/40">по желанию</span></label>
                <input id="rec-deadline" value={deadline} onChange={(e) => setDeadline(e.target.value.slice(0, 60))} placeholder="До пятницы" className={field} />
              </div>
            </div>
            <div>
              <label htmlFor="rec-link" className={label}>Ссылка на вакансию <span className="font-normal text-ink/40">по желанию</span></label>
              <input id="rec-link" type="url" value={link} onChange={(e) => setLink(e.target.value.slice(0, 300))} placeholder="https://" className={field} />
            </div>
            <div>
              <label htmlFor="rec-focus" className={label}>Что подчеркнуть <span className="font-normal text-ink/40">по желанию</span></label>
              <textarea id="rec-focus" value={focus} onChange={(e) => setFocus(e.target.value.slice(0, 1200))} rows={3} placeholder="Ваш опыт, сильные стороны, проекты, о которых стоит упомянуть" className={field} />
            </div>
            <div className="rounded-xl bg-ink/[0.04] p-3">
              <p className="mb-2 text-xs text-ink/60">Чтобы обработать запрос, нужно согласие на использование ваших данных.</p>
              <ConsentCheck marketing={false} />
            </div>
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Отправляем…' : 'Отправить запрос'}</button>
              {sent && !busy && <span className="text-xs font-semibold text-emerald-700">Запрос отправлен, сообщим, когда будет готово</span>}
            </div>
          </form>
        </Surface>
      </div>

      <Surface>
        <BlockHead title="Мои запросы" note={items?.length ? undefined : 'Пока пусто'} />
        {failed && !items ? (
          <p className="text-[13px] text-ink/60">Не получилось загрузить запросы. Обновите страницу через минуту.</p>
        ) : !items ? (
          <TabSkeleton rows={1} />
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-ink/[0.03] px-3 py-6 text-center text-[13px] text-ink/55">Здесь появятся ваши запросы и готовые рекомендации.</p>
        ) : (
          <ul className="space-y-2">{items.map((r) => <Request key={r.id} r={r} onCancel={(id) => void cancel(id)} />)}</ul>
        )}
        <div className="mt-3"><Link to="/cabinet/vacancies" className={btnGhost}>К вакансиям</Link></div>
      </Surface>
    </div>
  )
}
