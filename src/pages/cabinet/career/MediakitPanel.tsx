import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { saveMediakit, type CareerState, type Mediakit } from '../../../lib/careerCabinet'
import { Surface } from '../kit'
import { btnAccent, btnPrimary, field, label } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// «Медиакит»: одна страница о человеке для партнёров, организаторов и журналистов. Собирается из того, что человек заполнил в
// кабинете: заголовок и текст о себе, темы выступлений, достижения и профессиональный капитал, контакты (какие показывать — выбирает он).
// Скачать можно как PDF: открывается окно печати браузера с чистым листом (в нём выбирается «Сохранить как PDF»).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

interface Sheet {
  name: string
  headline: string
  about: string
  topics: string[]
  achievements: { title: string; meta: string; description: string }[]
  capital: { title: string; items: { label: string; value: string }[] }[]
  contacts: string[]
}

function buildSheet(state: CareerState, kit: Mediakit): Sheet {
  const c = state.contact
  const achievements = kit.includeAchievements === false ? [] : [...state.achievements].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 10).map((a) => ({ title: a.title, meta: [state.categories[a.category], a.year].filter(Boolean).join(' · '), description: a.description }))
  const capital = kit.includeCapital === false ? [] : state.capital.schema.sections.map((s) => ({ title: s.title, items: s.fields.filter((f) => state.capital.values[f.id]?.trim()).map((f) => ({ label: f.label, value: state.capital.values[f.id] })) })).filter((s) => s.items.length)
  return {
    name: c.name,
    headline: kit.headline ?? '',
    about: kit.about ?? '',
    topics: lines(kit.topics ?? ''),
    achievements,
    capital,
    contacts: [kit.showEmail && c.email ? c.email : '', kit.showTelegram && c.telegram ? `@${c.telegram}` : '', kit.showPhone && c.phone ? c.phone : ''].filter(Boolean),
  }
}

/** Лист для печати: отдельный документ в скрытой рамке, чтобы стили кабинета не мешали. */
function printHtml(s: Sheet): string {
  const par = (t: string) => esc(t).replace(/\n/g, '<br>')
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Медиакит — ${esc(s.name)}</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#283953;font:13px/1.55 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}
h1{font-size:28px;line-height:1.15;margin:0}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#45608a;margin:22px 0 8px;border-bottom:2px solid #fcd34d;padding-bottom:4px}
.head{padding-bottom:14px;border-bottom:4px solid #283953}.sub{font-size:16px;margin-top:6px;color:#45608a;font-weight:600}
li{margin:0 0 7px}.m{color:#6b7a90;font-size:11px}.k{font-weight:700}p{margin:0 0 6px}ul{padding-left:18px;margin:0}
</style></head><body><div class="head"><h1>${esc(s.name)}</h1>${s.headline ? `<div class="sub">${esc(s.headline)}</div>` : ''}${s.contacts.length ? `<div class="m" style="margin-top:8px">${s.contacts.map(esc).join(' · ')}</div>` : ''}</div>
${s.about ? `<h2>О себе</h2><p>${par(s.about)}</p>` : ''}
${s.topics.length ? `<h2>Темы выступлений</h2><ul>${s.topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
${s.achievements.length ? `<h2>Достижения</h2><ul>${s.achievements.map((a) => `<li><span class="k">${esc(a.title)}</span>${a.meta ? ` <span class="m">${esc(a.meta)}</span>` : ''}${a.description ? `<br>${par(a.description)}` : ''}</li>`).join('')}</ul>` : ''}
${s.capital.map((g) => `<h2>${esc(g.title)}</h2>${g.items.map((i) => `<p><span class="k">${esc(i.label)}.</span> ${par(i.value)}</p>`).join('')}`).join('')}
</body></html>`
}

function printSheet(s: Sheet) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const win = frame.contentWindow
  if (!win) return frame.remove()
  win.document.open()
  win.document.write(printHtml(s))
  win.document.close()
  const remove = () => window.setTimeout(() => frame.remove(), 500)
  win.onafterprint = remove
  window.setTimeout(() => {
    win.focus()
    win.print()
    window.setTimeout(() => frame.remove(), 120000)
  }, 250)
}

function Toggle({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-ink/30 accent-[#283953]" />
      {children}
    </label>
  )
}

export default function MediakitPanel({ career }: { career: CareerHandle }) {
  const { state, patch } = career
  const [kit, setKit] = useState<Mediakit>({ includeAchievements: true, includeCapital: true, ...state.mediakit })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<'' | 'saved' | 'error'>('')
  const sheet = useMemo(() => buildSheet(state, kit), [state, kit])
  const set = <K extends keyof Mediakit>(k: K, v: Mediakit[K]) => {
    setKit((m) => ({ ...m, [k]: v }))
    setMessage('')
  }
  const empty = !sheet.headline && !sheet.about && !sheet.topics.length && !sheet.achievements.length && !sheet.capital.length

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const r = await saveMediakit(kit)
    setBusy(false)
    if (!r.ok) return setMessage('error')
    patch({ mediakit: r.data.mediakit })
    setMessage('saved')
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Surface>
        <h2 className="text-base font-semibold">Медиакит</h2>
        <p className="mb-3 mt-0.5 text-xs text-ink/55">Страница о вас для партнёров и организаторов. Справа — как она будет выглядеть.</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="mk-head" className={label}>Кто вы в одной строке</label>
            <input id="mk-head" value={kit.headline ?? ''} onChange={(e) => set('headline', e.target.value.slice(0, 120))} placeholder="Например: юрист по налоговым спорам, 5 лет опыта" className={field} />
          </div>
          <div>
            <label htmlFor="mk-about" className={label}>О себе</label>
            <textarea id="mk-about" value={kit.about ?? ''} onChange={(e) => set('about', e.target.value.slice(0, 1200))} rows={4} placeholder="Чем занимаетесь, чем полезны, чего добились" className={field} />
          </div>
          <div>
            <label htmlFor="mk-topics" className={label}>Темы выступлений <span className="font-normal text-ink/40">каждая с новой строки</span></label>
            <textarea id="mk-topics" value={kit.topics ?? ''} onChange={(e) => set('topics', e.target.value.slice(0, 600))} rows={3} className={field} />
          </div>
          <fieldset className="space-y-2 rounded-xl bg-ink/[0.04] p-3">
            <legend className="px-1 text-xs font-semibold text-ink/70">Что показывать</legend>
            <Toggle id="mk-ach" checked={kit.includeAchievements !== false} onChange={(v) => set('includeAchievements', v)}>Мои достижения ({state.achievements.length})</Toggle>
            <Toggle id="mk-cap" checked={kit.includeCapital !== false} onChange={(v) => set('includeCapital', v)}>Профессиональный капитал ({Object.keys(state.capital.values).length} полей)</Toggle>
          </fieldset>
          <fieldset className="space-y-2 rounded-xl bg-ink/[0.04] p-3">
            <legend className="px-1 text-xs font-semibold text-ink/70">Какие контакты указать</legend>
            <Toggle id="mk-mail" checked={kit.showEmail === true} onChange={(v) => set('showEmail', v)}>Почта{state.contact.email ? `: ${state.contact.email}` : ' (не указана в кабинете)'}</Toggle>
            <Toggle id="mk-tg" checked={kit.showTelegram === true} onChange={(v) => set('showTelegram', v)}>Telegram{state.contact.telegram ? `: @${state.contact.telegram}` : ' (не привязан)'}</Toggle>
            <Toggle id="mk-phone" checked={kit.showPhone === true} onChange={(v) => set('showPhone', v)}>Телефон{state.contact.phone ? `: ${state.contact.phone}` : ' (не указан в кабинете)'}</Toggle>
            <p className="text-[11px] text-ink/45">Контакты попадают только в тот PDF, который вы сами сохраните и отправите.</p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
            {message === 'saved' && <span className="text-xs font-semibold text-emerald-700">Сохранено</span>}
            {message === 'error' && <span role="alert" className="text-xs text-red-600">Не получилось сохранить. Попробуйте ещё раз.</span>}
          </div>
        </form>
      </Surface>

      <div className="space-y-2">
        <article className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(40,57,83,0.08),0_14px_30px_-18px_rgba(40,57,83,0.45)]" aria-label="Предпросмотр медиакита">
          <header className="border-b-4 border-ink pb-3">
            <h3 className="text-2xl font-semibold leading-tight">{sheet.name || 'Ваше имя'}</h3>
            {sheet.headline && <p className="mt-1 text-sm font-semibold text-gold">{sheet.headline}</p>}
            {sheet.contacts.length > 0 && <p className="mt-2 text-xs text-ink/55">{sheet.contacts.join(' · ')}</p>}
          </header>
          {empty && <p className="py-6 text-center text-[13px] text-ink/45">Заполните форму слева: страница соберётся здесь.</p>}
          {sheet.about && <section className="mt-4"><h4 className="mb-1.5 border-b-2 border-amber-300 pb-1 text-[11px] font-bold uppercase tracking-wider text-gold">О себе</h4><p className="whitespace-pre-wrap text-[13px] leading-relaxed">{sheet.about}</p></section>}
          {sheet.topics.length > 0 && <section className="mt-4"><h4 className="mb-1.5 border-b-2 border-amber-300 pb-1 text-[11px] font-bold uppercase tracking-wider text-gold">Темы выступлений</h4><ul className="list-disc space-y-1 pl-5 text-[13px]">{sheet.topics.map((t) => <li key={t}>{t}</li>)}</ul></section>}
          {sheet.achievements.length > 0 && (
            <section className="mt-4"><h4 className="mb-1.5 border-b-2 border-amber-300 pb-1 text-[11px] font-bold uppercase tracking-wider text-gold">Достижения</h4>
              <ul className="space-y-2 text-[13px]">{sheet.achievements.map((a) => <li key={a.title + a.meta}><span className="font-bold">{a.title}</span>{a.meta && <span className="ml-1.5 text-[11px] text-ink/50">{a.meta}</span>}{a.description && <p className="whitespace-pre-wrap text-xs text-ink/65">{a.description}</p>}</li>)}</ul>
            </section>
          )}
          {sheet.capital.map((g) => (
            <section key={g.title} className="mt-4"><h4 className="mb-1.5 border-b-2 border-amber-300 pb-1 text-[11px] font-bold uppercase tracking-wider text-gold">{g.title}</h4>
              {g.items.map((i) => <p key={i.label} className="mb-1 whitespace-pre-wrap text-[13px]"><span className="font-bold">{i.label}.</span> {i.value}</p>)}
            </section>
          ))}
        </article>
        <button type="button" onClick={() => printSheet(sheet)} disabled={empty} className={btnAccent}>Скачать PDF</button>
        <span className="ml-2 text-xs text-ink/50">В окне печати выберите «Сохранить как PDF».</span>
      </div>
    </div>
  )
}
