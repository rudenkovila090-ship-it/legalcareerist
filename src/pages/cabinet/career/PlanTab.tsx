import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { pluralRu } from '../../../lib/plural'
import { addOwnStep, deletePlan, removeOwnStep, savePlan, setStepDone, type CareerPlan, type PlanInput } from '../../../lib/careerCabinet'
import { icon } from '../sections'
import { Chip, Progress, Surface } from '../kit'
import { btnAccent, btnGhost, btnPrimary, field, focusRing, label } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// Карьерный план: форма из четырёх вопросов собирает шаги из справочника (server/content/career/routes.json). Шаги идут по порядку;
// следующий невыполненный подсвечен жёлтым узлом, выполненные — тёмные с галочкой. Свои шаги можно добавлять; при смене цели
// отметки «сделано» и свои шаги сохраняются.

const errorText = (code: string) =>
  ({
    bad_path: 'Цель не может быть ниже текущей позиции.',
    bad_request: 'Заполните все четыре вопроса.',
    too_many: 'В плане уже много шагов. Удалите ненужные свои.',
    too_many_attempts: 'Слишком много действий за час. Попробуйте позже.',
  })[code] ?? 'Не получилось сохранить. Попробуйте ещё раз.'

function PlanForm({ career, plan, onSaved, onCancel }: { career: CareerHandle; plan: CareerPlan | null; onSaved: (p: CareerPlan) => void; onCancel?: () => void }) {
  const { stages, areas, terms } = career.state.meta
  const [form, setForm] = useState<PlanInput>({ from: plan?.from ?? '', to: plan?.to ?? '', area: plan?.area ?? '', term: plan?.term ?? '', goal: plan?.goal ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof PlanInput, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const fromIndex = stages.findIndex((s) => s.id === form.from)
  const targets = fromIndex >= 0 ? stages.slice(fromIndex) : stages
  const ready = form.from && form.to && form.area && form.term

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) {
      setError(errorText('bad_request'))
      return
    }
    setBusy(true)
    setError('')
    const r = await savePlan(form)
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    onSaved(r.data.plan)
  }

  const select = (id: string, text: string, value: string, options: { id: string; label: string }[], onChange: (v: string) => void) => (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        <option value="">Выберите…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {select('plan-from', '1. Где вы сейчас', form.from, stages, (v) => {
          set('from', v)
          if (form.to && stages.findIndex((s) => s.id === form.to) < stages.findIndex((s) => s.id === v)) set('to', '')
        })}
        {select('plan-to', '2. Куда хотите прийти', form.to, targets, (v) => set('to', v))}
        {select('plan-area', '3. В какой практике', form.area, areas, (v) => set('area', v))}
        {select('plan-term', '4. За какое время', form.term, terms, (v) => set('term', v))}
      </div>
      <div>
        <label htmlFor="plan-goal" className={label}>Цель своими словами <span className="font-normal text-ink/40">по желанию</span></label>
        <textarea id="plan-goal" value={form.goal} onChange={(e) => set('goal', e.target.value.slice(0, 300))} rows={2} placeholder="Например: стать юристом по налоговым спорам в консалтинге" className={field} />
      </div>
      {plan && <p className="text-xs text-ink/55">Выполненные шаги и ваши собственные шаги сохранятся.</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Составляем…' : plan ? 'Пересобрать план' : 'Составить план'}</button>
        {onCancel && <button type="button" onClick={onCancel} className={btnGhost}>Отмена</button>}
      </div>
    </form>
  )
}

export default function PlanTab({ career }: { career: CareerHandle }) {
  const { state, patch } = career
  const plan = state.plan
  const [editing, setEditing] = useState(false)
  const [group, setGroup] = useState('all')
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const label_ = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id

  const apply = (p: CareerPlan) => patch({ plan: p })

  if (!plan || editing) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <Surface>
          <h2 className="text-base font-semibold">{plan ? 'Изменить цель' : 'Составьте карьерный план'}</h2>
          <p className="mb-3 mt-0.5 text-xs text-ink/55">Ответьте на четыре вопроса, и мы подберём шаги: от резюме и поиска работы до навыков и нетворкинга.</p>
          <PlanForm career={career} plan={plan} onSaved={(p) => { apply(p); setEditing(false) }} onCancel={plan ? () => setEditing(false) : undefined} />
        </Surface>
        <aside className="rounded-2xl bg-ink p-4 text-white" aria-label="Как это работает">
          <h2 className="text-sm font-bold">Как это работает</h2>
          <ol className="mt-3 space-y-3 text-xs text-white/75">
            {['Вы выбираете, где вы сейчас и куда хотите прийти.', 'Мы собираем шаги и ставим их по порядку.', 'Вы отмечаете выполненное, а ближайший шаг всегда подсвечен.'].map((t, i) => (
              <li key={t} className="flex gap-2.5">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${i === 0 ? 'bg-amber-300 text-ink' : 'bg-white/15 text-white'}`}>{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    )
  }

  const done = plan.steps.filter((s) => s.done).length
  const total = plan.steps.length
  const next = plan.steps.find((s) => !s.done)
  const groups = state.meta.groups.filter((g) => plan.steps.some((s) => s.group === g.id))
  const shown = group === 'all' ? plan.steps : plan.steps.filter((s) => s.group === group)

  async function toggle(id: string, value: boolean) {
    setBusy(id)
    setError('')
    const r = await setStepDone(id, value)
    setBusy('')
    if (r.ok) apply(r.data.plan)
    else setError(errorText(r.error))
  }

  async function addOwn(e: FormEvent) {
    e.preventDefault()
    if (!own.trim()) return
    setBusy('own')
    setError('')
    const r = await addOwnStep(own)
    setBusy('')
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    setOwn('')
    apply(r.data.plan)
  }

  async function removeOwn(id: string) {
    setBusy(id)
    const r = await removeOwnStep(id)
    setBusy('')
    if (r.ok) apply(r.data.plan)
  }

  async function dropPlan() {
    setBusy('plan')
    const r = await deletePlan()
    setBusy('')
    if (r.ok) {
      patch({ plan: null })
      setConfirmDelete(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Уровень 1: куда идём и сколько пройдено */}
      <section className="relative overflow-hidden rounded-2xl bg-ink p-4 text-white sm:p-5" aria-label="Цель плана">
        <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.06]" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.route}</span>Мой план
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug sm:text-xl">{label_(state.meta.stages, plan.from)} <span className="text-amber-300" aria-hidden="true">→</span> {label_(state.meta.stages, plan.to)}</h2>
            <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5">{label_(state.meta.areas, plan.area)}</span>
              <span className="rounded-full bg-white/15 px-2.5 py-0.5">срок: {label_(state.meta.terms, plan.term).toLowerCase()}</span>
            </p>
            {plan.goal && <p className="mt-2 max-w-xl text-xs text-white/70">«{plan.goal}»</p>}
          </div>
          <div className="w-full min-w-[12rem] sm:w-56">
            <div className="text-4xl font-semibold leading-none tabular-nums">{done}<span className="text-xl text-white/45"> / {total}</span></div>
            <div className="mb-2 mt-1 text-xs text-white/65">{pluralRu(done, ['шаг выполнен', 'шага выполнено', 'шагов выполнено'])}</div>
            <Progress value={done} max={total} tone="amber" label="Выполнено шагов плана" />
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className={btnAccent}>Изменить цель</button>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`rounded-full px-3 py-1.5 text-[13px] font-medium text-white/60 hover:text-white ${focusRing}`}>Удалить план</button>
          ) : (
            <span className="flex items-center gap-2 text-xs text-white/80">
              Удалить план вместе с отметками?
              <button type="button" onClick={() => void dropPlan()} disabled={busy === 'plan'} className="rounded-full bg-red-500 px-3 py-1 font-bold text-white hover:bg-red-600 disabled:opacity-60">Да</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full bg-white/15 px-3 py-1 font-bold text-white hover:bg-white/25">Нет</button>
            </span>
          )}
        </div>
      </section>

      {/* Уровень 2: шаги */}
      <Surface>
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Фильтр шагов по группам">
          {[{ id: 'all', label: `Все · ${total}` }, ...groups.map((g) => ({ id: g.id, label: `${g.label} · ${plan.steps.filter((s) => s.group === g.id).length}` }))].map((g) => (
            <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${group === g.id ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/65 hover:bg-ink/10 hover:text-ink'} ${focusRing}`}>{g.label}</button>
          ))}
        </div>
        {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
        <ol className="space-y-2">
          {shown.map((s, i) => {
            const isNext = next?.id === s.id
            const n = plan.steps.indexOf(s) + 1
            const last = i === shown.length - 1
            return (
              <li key={s.id} className={`relative pl-9 ${last ? '' : 'before:absolute before:bottom-[-0.5rem] before:left-[0.8125rem] before:top-7 before:w-0.5 before:bg-ink/12'}`} aria-current={isNext ? 'step' : undefined}>
                <span
                  className={`absolute left-0 top-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    s.done ? 'bg-ink text-white' : isNext ? 'bg-amber-300 text-ink ring-4 ring-amber-300/35' : 'border-2 border-ink/20 bg-white text-ink/40'
                  }`}
                >
                  {s.done ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg> : s.custom ? '+' : n}
                </span>
                <div className={`flex items-start gap-3 rounded-xl p-3 ${isNext ? 'bg-amber-50 ring-2 ring-amber-300' : s.done ? 'bg-ink/[0.03]' : 'bg-ink/[0.03]'}`}>
                  <div className="min-w-0 flex-1">
                    {isNext && <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">Следующий шаг</div>}
                    <div className={`text-[13px] font-semibold leading-snug ${s.done ? 'text-ink/45 line-through decoration-ink/25' : 'text-ink'}`}>{s.title}</div>
                    {s.text && !s.done && <p className="mt-0.5 text-xs text-ink/60">{s.text}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Chip tone={s.done ? 'soft' : 'dark'}>{state.meta.groups.find((g) => g.id === s.group)?.label ?? 'Мои шаги'}</Chip>
                      {s.link && !s.done && <Link to={s.link.to} className={`rounded-full border border-ink/15 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-ink/75 hover:border-ink/30 hover:text-ink ${focusRing}`}>{s.link.label} →</Link>}
                      {s.custom && <button type="button" onClick={() => void removeOwn(s.id)} disabled={busy === s.id} className={`rounded px-1 text-[11px] font-medium text-ink/40 hover:text-red-700 ${focusRing}`}>удалить</button>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggle(s.id, !s.done)}
                    disabled={busy === s.id}
                    aria-pressed={s.done}
                    aria-label={s.done ? `Снять отметку: ${s.title}` : `Отметить выполненным: ${s.title}`}
                    className={`mt-0.5 flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors disabled:opacity-60 ${s.done ? 'bg-ink text-white hover:bg-ink/85' : isNext ? 'bg-amber-300 text-ink hover:bg-amber-200' : 'border border-ink/20 bg-white text-ink/70 hover:border-ink/40 hover:text-ink'} ${focusRing}`}
                  >
                    {s.done ? 'Сделано' : 'Готово'}
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
        <form onSubmit={addOwn} className="mt-3 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
          <label htmlFor="own-step" className="sr-only">Свой шаг</label>
          <input id="own-step" value={own} onChange={(e) => setOwn(e.target.value.slice(0, 140))} placeholder="Добавить свой шаг, например: записаться на курс по налогам" className={`${field} min-w-0 flex-1 basis-60`} />
          <button type="submit" disabled={busy === 'own' || !own.trim()} className={btnPrimary}>Добавить</button>
        </form>
      </Surface>
    </div>
  )
}
