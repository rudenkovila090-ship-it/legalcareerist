import { useState, type FormEvent } from 'react'
import { saveCapital } from '../../../lib/careerCabinet'
import { Progress, Surface } from '../kit'
import { btnPrimary, field, label } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// «Мой профессиональный капитал»: анкета из разделов и полей (server/content/career/capital.json). Состав анкеты меняется файлом
// на сервере, здесь ничего не нужно править: показывается то, что пришло с сервера.

export default function CapitalPanel({ career }: { career: CareerHandle }) {
  const { state, patch } = career
  const { schema, values: saved } = state.capital
  const [values, setValues] = useState<Record<string, string>>(saved)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<'' | 'saved' | 'error'>('')
  const total = schema.sections.reduce((n, s) => n + s.fields.length, 0)
  const filled = Object.values(values).filter((v) => v.trim()).length
  const dirty = JSON.stringify(Object.entries(values).filter(([, v]) => v.trim()).sort()) !== JSON.stringify(Object.entries(saved).sort())

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const r = await saveCapital(values)
    setBusy(false)
    if (!r.ok) return setMessage('error')
    patch({ capital: r.data.capital })
    setValues(r.data.capital.values)
    setMessage('saved')
  }

  if (!schema.sections.length) return <Surface><p className="text-[13px] text-ink/60">Анкета профессионального капитала скоро появится.</p></Surface>

  return (
    <form onSubmit={submit} className="space-y-2">
      <section className="rounded-2xl bg-amber-300 p-4 text-ink">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 max-w-xl">
            <h2 className="text-lg font-semibold leading-snug">Мой профессиональный капитал</h2>
            {schema.intro && <p className="mt-1 text-[13px] text-ink/75">{schema.intro}</p>}
          </div>
          <div className="w-full sm:w-52">
            <div className="text-3xl font-semibold leading-none tabular-nums">{filled}<span className="text-lg text-ink/45"> / {total}</span></div>
            <div className="mb-1.5 mt-1 text-xs text-ink/70">полей заполнено</div>
            <Progress value={filled} max={total} label="Заполнено полей" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-2">
        {schema.sections.map((s, i) => (
          <Surface key={s.id} as="section">
            <h3 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>{s.title}</h3>
            {s.hint && <p className="mt-0.5 text-xs text-ink/55">{s.hint}</p>}
            <div className="mt-3 space-y-3">
              {s.fields.map((f) => (
                <div key={f.id}>
                  <label htmlFor={`cap-${f.id}`} className={label}>{f.label}</label>
                  {f.type === 'text' ? (
                    <input id={`cap-${f.id}`} value={values[f.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value.slice(0, 1500) }))} className={field} />
                  ) : (
                    <textarea id={`cap-${f.id}`} value={values[f.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value.slice(0, 1500) }))} rows={3} className={field} />
                  )}
                  {f.hint && <p className="mt-1 text-[11px] text-ink/45">{f.hint}</p>}
                </div>
              ))}
            </div>
          </Surface>
        ))}
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-2.5 shadow-[0_1px_2px_rgba(40,57,83,0.08),0_8px_20px_-10px_rgba(40,57,83,0.35)] backdrop-blur">
        <button type="submit" disabled={busy || !dirty} className={btnPrimary}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        {message === 'saved' && !dirty && <span className="text-xs font-semibold text-emerald-700">Сохранено</span>}
        {message === 'error' && <span role="alert" className="text-xs text-red-600">Не получилось сохранить. Попробуйте ещё раз.</span>}
        {dirty && !busy && <span className="text-xs text-ink/55">Есть несохранённые изменения</span>}
      </div>
    </form>
  )
}
