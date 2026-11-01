import { useState, type KeyboardEvent } from 'react'
import ChipToggle from '../../components/ChipToggle'
import type { Profile } from '../../lib/cabinet'
import { ProfileForm, Switch } from './ui'
import { inputClass, labelClass } from './shared'
import { useProfile } from './useProfile'

function Loading({ failed }: { failed: boolean }) {
  return <p className="text-sm text-ink/50">{failed ? 'Не удалось загрузить профиль. Обновите страницу.' : 'Загружаем…'}</p>
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

// ---- Конфиденциальность ----
export function PrivacySection({ onSaved }: { onSaved?: () => void }) {
  const { profile, failed, update } = useProfile()
  if (!profile) return <Loading failed={failed} />
  return (
    <PrivacyForm
      profile={profile}
      onSaved={(p) => {
        update(p)
        onSaved?.()
      }}
    />
  )
}

function PrivacyForm({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [hidden, setHidden] = useState(profile.privacy.hidden)
  const [hideFrom, setHideFrom] = useState(profile.privacy.hideFrom)
  const [draft, setDraft] = useState('')

  function add() {
    const name = draft.trim()
    if (name && !hideFrom.includes(name) && hideFrom.length < 30) setHideFrom([...hideFrom, name])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <ProfileForm profile={profile} parts={() => ({ privacy: { hidden, hideFrom: draft.trim() ? [...hideFrom, draft.trim()] : hideFrom } })} onSaved={onSaved}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Скрытый поиск</h2>
          <p className="mt-1 max-w-xl text-sm text-ink/60">
            Резюме не видно работодателям в базе кандидатов. Его получает только компания, на вакансию которой вы откликнулись сами.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`text-sm font-medium ${hidden ? 'text-emerald-700' : 'text-ink/50'}`}>{hidden ? 'Включён' : 'Выключен'}</span>
          <Switch checked={hidden} onChange={setHidden} label="Скрытый поиск" />
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold">Скрыть от конкретных компаний</h3>
        <p className="mt-1 text-sm text-ink/60">Например, от текущего работодателя: эти компании не увидят ваше резюме, даже если скрытый поиск выключен.</p>
        <div className="mt-3 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} maxLength={80} placeholder="Название компании" className={inputClass} />
          <button type="button" onClick={add} disabled={!draft.trim()} className="shrink-0 rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-ink/5 disabled:opacity-50">Добавить</button>
        </div>
        {hideFrom.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {hideFrom.map((c) => (
              <li key={c} className="flex items-center gap-2 rounded-full bg-ink/[0.06] py-1 pl-3 pr-1.5 text-sm">
                {c}
                <button type="button" onClick={() => setHideFrom(hideFrom.filter((x) => x !== c))} aria-label={`Убрать ${c}`} className="flex h-5 w-5 items-center justify-center rounded-full text-ink/50 hover:bg-ink/10 hover:text-ink">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="rounded-lg bg-ink/[0.04] p-3 text-xs text-ink/60">
        Сейчас работодатели не видят резюме из кабинета вообще: у них нет доступа. Мы заранее фиксируем ваши правила, чтобы они сработали с первого дня, когда доступ появится.
      </p>
    </ProfileForm>
  )
}

// ---- Практики и опыт ----
export function PracticesSection() {
  const { profile, options, failed, update } = useProfile()
  if (!profile || !options) return <Loading failed={failed} />
  return <PracticesForm profile={profile} practices={options.practices} levels={options.levels} onSaved={update} />
}

function PracticesForm({ profile, practices, levels, onSaved }: { profile: Profile; practices: Record<string, string>; levels: Record<string, string>; onSaved: (p: Profile) => void }) {
  const [main, setMain] = useState(profile.practices.main)
  const [related, setRelated] = useState(profile.practices.related)
  const [x, setX] = useState({
    level: profile.experience.level,
    years: profile.experience.years == null ? '' : String(profile.experience.years),
    litigation: profile.experience.litigation,
    deals: profile.experience.deals,
    projects: profile.experience.projects,
    languages: profile.experience.languages.join('\n'),
    foreignClients: profile.experience.foreignClients,
  })
  const codes = Object.keys(practices)
  const set = (patch: Partial<typeof x>) => setX((v) => ({ ...v, ...patch }))

  return (
    <ProfileForm
      profile={profile}
      onSaved={onSaved}
      parts={() => {
        const years = x.years.trim() === '' ? null : Number(x.years)
        if (years != null && (!Number.isFinite(years) || years < 0 || years > 60)) throw { message: 'Стаж — число от 0 до 60.' }
        return {
          practices: { main, related: related.filter((c) => c !== main) },
          experience: { level: x.level, years, litigation: x.litigation, deals: x.deals, projects: x.projects, languages: x.languages.split('\n').map((l) => l.trim()).filter(Boolean), foreignClients: x.foreignClients },
        }
      }}
    >
      <div>
        <h2 className="text-lg font-semibold">Практики</h2>
        <label className={`${labelClass} mt-3`}>Основная практика</label>
        <ChipToggle options={codes.map((id) => ({ id, label: practices[id] }))} selected={main ? [main] : []} onToggle={(id) => setMain(id === main ? '' : id)} />
        <label className={`${labelClass} mt-5`}>Смежные практики</label>
        <ChipToggle options={codes.filter((c) => c !== main).map((id) => ({ id, label: practices[id] }))} selected={related.filter((c) => c !== main)} onToggle={(id) => setRelated(toggle(related, id))} />
      </div>

      <div>
        <h2 className="text-lg font-semibold">Уровень и опыт</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="lvl">Уровень</label>
            <select id="lvl" value={x.level} onChange={(e) => set({ level: e.target.value })} className={inputClass}>
              <option value="">Не указан</option>
              {Object.entries(levels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="yrs">Стаж в юриспруденции, лет</label>
            <input id="yrs" value={x.years} onChange={(e) => set({ years: e.target.value })} inputMode="numeric" placeholder="Например, 5" className={inputClass} />
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-ink/[0.04] p-3 text-xs text-ink/60">Описывайте опыт без названий клиентов и сведений, которые защищены адвокатской или коммерческой тайной: достаточно типа дел, отрасли и масштаба.</p>
        {([
          ['litigation', 'Судебная практика', 'Например: споры по поставке и подряду, 40+ дел в арбитражных судах, апелляция и кассация'],
          ['deals', 'Сделки', 'Например: сопровождение M&A в промышленности, сделки до 2 млрд ₽'],
          ['projects', 'Проекты', 'Например: внедрение системы комплаенса, реструктуризация договорной базы'],
        ] as const).map(([key, label, placeholder]) => (
          <div key={key} className="mt-4">
            <label className={labelClass} htmlFor={key}>{label}</label>
            <textarea id={key} value={x[key]} onChange={(e) => set({ [key]: e.target.value })} rows={3} maxLength={600} placeholder={placeholder} className={inputClass} />
          </div>
        ))}
        <div className="mt-4">
          <label className={labelClass} htmlFor="langs">Языки</label>
          <textarea id="langs" value={x.languages} onChange={(e) => set({ languages: e.target.value })} rows={3} placeholder={'По одному в строке, например:\nАнглийский — C1\nНемецкий — B1'} className={inputClass} />
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
          <input type="checkbox" checked={x.foreignClients} onChange={(e) => set({ foreignClients: e.target.checked })} className="h-4 w-4 accent-gold" />
          Есть опыт работы с иностранными клиентами
        </label>
      </div>
    </ProfileForm>
  )
}

// ---- Ожидания по роли ----
const FORMATS = [{ id: 'office', label: 'Офис' }, { id: 'hybrid', label: 'Гибрид' }, { id: 'remote', label: 'Удалённо' }]
const RELOCATION = [{ id: 'no', label: 'Нет' }, { id: 'maybe', label: 'Возможно' }, { id: 'yes', label: 'Да, готов(а)' }]
const OVERTIME = [{ id: 'no', label: 'Нет' }, { id: 'sometimes', label: 'Иногда' }, { id: 'yes', label: 'Да, готов(а)' }]

export function ExpectationsSection() {
  const { profile, failed, update } = useProfile()
  if (!profile) return <Loading failed={failed} />
  return <ExpectationsForm profile={profile} onSaved={update} />
}

function Radios({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return <ChipToggle options={options} selected={value ? [value] : []} onToggle={(id) => onChange(id === value ? '' : id)} />
}

function ExpectationsForm({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const e = profile.expectations
  const [workFormat, setWorkFormat] = useState(e.workFormat)
  const [city, setCity] = useState(e.city)
  const [relocation, setRelocation] = useState(e.relocation)
  const [overtime, setOvertime] = useState(e.overtime)
  const [from, setFrom] = useState(e.salaryFrom == null ? '' : String(e.salaryFrom))
  const [to, setTo] = useState(e.salaryTo == null ? '' : String(e.salaryTo))

  return (
    <ProfileForm
      profile={profile}
      onSaved={onSaved}
      parts={() => {
        const f = from.trim() === '' ? null : Number(from.replace(/\s/g, ''))
        const t = to.trim() === '' ? null : Number(to.replace(/\s/g, ''))
        if ((f != null && !Number.isFinite(f)) || (t != null && !Number.isFinite(t))) throw { message: 'Зарплата — число, например 250000.' }
        if (f != null && t != null && f > t) throw { message: 'Зарплата «от» не может быть больше «до».' }
        return { expectations: { workFormat, city, relocation, overtime, salaryFrom: f, salaryTo: t } }
      }}
    >
      <div>
        <label className={labelClass}>Формат работы</label>
        <ChipToggle options={FORMATS} selected={workFormat} onToggle={(id) => setWorkFormat(toggle(workFormat, id))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="city">Город</label>
          <input id="city" value={city} onChange={(ev) => setCity(ev.target.value)} maxLength={80} placeholder="Например, Санкт-Петербург" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Релокация</label>
          <Radios options={RELOCATION} value={relocation} onChange={setRelocation} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Зарплатная вилка, ₽ в месяц</label>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <input value={from} onChange={(ev) => setFrom(ev.target.value)} inputMode="numeric" placeholder="от" aria-label="Зарплата от" className={inputClass} />
          <input value={to} onChange={(ev) => setTo(ev.target.value)} inputMode="numeric" placeholder="до" aria-label="Зарплата до" className={inputClass} />
        </div>
        <p className="mt-2 text-xs text-ink/50">Вилка нужна для подбора вакансий. Работодателю она не показывается, пока вы сами не решите её раскрыть.</p>
      </div>
      <div>
        <label className={labelClass}>Готовность к переработкам</label>
        <Radios options={OVERTIME} value={overtime} onChange={setOvertime} />
      </div>
    </ProfileForm>
  )
}
