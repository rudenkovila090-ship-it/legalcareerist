import { useState, type FormEvent } from 'react'
import { addAchievement, deleteAchievement, updateAchievement, type Achievement, type AchievementInput } from '../../../lib/careerCabinet'
import { icon } from '../sections'
import { BlockHead, Chip, EmptyNote, Surface } from '../kit'
import { btnGhost, btnPrimary, field, focusRing, label } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// «Мои достижения»: награды, публикации, выступления, проекты, образование, участие в мероприятиях. Описывайте без раскрытия клиентов.
// Записи пойдут в медиакит.

const errorText = (code: string) => ({ title_required: 'Напишите название достижения.', too_many: 'Достижений уже много. Удалите лишние.', too_many_attempts: 'Слишком много действий за час. Попробуйте позже.' })[code] ?? 'Не получилось сохранить. Попробуйте ещё раз.'
const empty: AchievementInput = { title: '', category: 'project', year: '', description: '', link: '' }
const toInput = (a: Achievement): AchievementInput => ({ title: a.title, category: a.category, year: a.year ? String(a.year) : '', description: a.description, link: a.link })

export default function AchievementsPanel({ career }: { career: CareerHandle }) {
  const { state, patch } = career
  const [form, setForm] = useState<AchievementInput>(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof AchievementInput, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const list = [...state.achievements].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.createdAt - a.createdAt)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (editing) {
      const r = await updateAchievement(editing, form)
      setBusy(false)
      if (!r.ok) return setError(errorText(r.error))
      patch({ achievements: state.achievements.map((a) => (a.id === editing ? r.data.item : a)) })
    } else {
      const r = await addAchievement(form)
      setBusy(false)
      if (!r.ok) return setError(errorText(r.error))
      patch({ achievements: [r.data.item, ...state.achievements] })
    }
    setForm(empty)
    setEditing(null)
  }

  async function remove(id: string) {
    const r = await deleteAchievement(id)
    if (r.ok) {
      patch({ achievements: state.achievements.filter((a) => a.id !== id) })
      if (editing === id) {
        setEditing(null)
        setForm(empty)
      }
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Surface>
        <BlockHead title={editing ? 'Изменить достижение' : 'Добавить достижение'} note="Без названий клиентов и конфиденциальных деталей" />
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="ach-title" className={label}>Что вы сделали</label>
            <input id="ach-title" value={form.title} onChange={(e) => set('title', e.target.value.slice(0, 140))} required placeholder="Например: победа в студенческом суде" className={field} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ach-cat" className={label}>Категория</label>
              <select id="ach-cat" value={form.category} onChange={(e) => set('category', e.target.value)} className={field}>
                {Object.entries(state.categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ach-year" className={label}>Год <span className="font-normal text-ink/40">по желанию</span></label>
              <input id="ach-year" inputMode="numeric" value={form.year} onChange={(e) => set('year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={String(new Date().getFullYear())} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="ach-desc" className={label}>Подробности <span className="font-normal text-ink/40">по желанию</span></label>
            <textarea id="ach-desc" value={form.description} onChange={(e) => set('description', e.target.value.slice(0, 600))} rows={3} placeholder="Ваша роль и результат: действие — результат" className={field} />
          </div>
          <div>
            <label htmlFor="ach-link" className={label}>Ссылка <span className="font-normal text-ink/40">по желанию</span></label>
            <input id="ach-link" type="url" value={form.link} onChange={(e) => set('link', e.target.value.slice(0, 300))} placeholder="https://" className={field} />
          </div>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !form.title.trim()} className={btnPrimary}>{busy ? 'Сохраняем…' : editing ? 'Сохранить' : 'Добавить'}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(empty) }} className={btnGhost}>Отмена</button>}
          </div>
        </form>
      </Surface>

      <div>
        {list.length === 0 ? (
          <EmptyNote icon={icon.trophy} title="Достижений пока нет">Добавьте первое: награду, публикацию, проект или участие в мероприятии. Всё это попадёт в медиакит.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className={`rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(40,57,83,0.06)] ${editing === a.id ? 'ring-2 ring-amber-300' : ''}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip>{state.categories[a.category] ?? 'Другое'}</Chip>
                  {a.year && <Chip tone="soft">{a.year}</Chip>}
                </div>
                <h3 className="mt-1.5 text-[13px] font-bold leading-snug">{a.title}</h3>
                {a.description && <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink/65">{a.description}</p>}
                {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className={`mt-1 block truncate rounded text-xs font-medium text-gold hover:text-ink ${focusRing}`}>{a.link}</a>}
                <div className="mt-2 flex gap-3 text-xs font-semibold">
                  <button type="button" onClick={() => { setEditing(a.id); setForm(toInput(a)) }} className={`rounded text-ink/60 hover:text-ink ${focusRing}`}>Изменить</button>
                  <button type="button" onClick={() => void remove(a.id)} className={`rounded text-ink/40 hover:text-red-700 ${focusRing}`}>Удалить</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
