import { useState } from 'react'
import { saveProfile, type NetworkingContact, type Profile } from '../../lib/cabinet'
import { useProfile } from './useProfile'
import { ProfileForm } from './ui'
import { fieldClass, labelClass, errorText } from './shared'

const empty = (): NetworkingContact => ({ id: crypto.randomUUID(), name: '', company: '', role: '', email: '', phone: '', telegram: '', metWhere: '', notes: '' })
export default function NetworkingSection() {
  const { profile, failed, update } = useProfile()
  if (!profile) return <p className="text-sm text-ink/60">{failed ? 'Не удалось загрузить записную книжку. Обновите страницу.' : 'Загружаем записную книжку…'}</p>
  return <AddressBook profile={profile} onSaved={update} />
}
function AddressBook({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const data = profile.networking ?? { intro: '', contacts: [], version: 0 }
  const [intro, setIntro] = useState(data.intro)
  const [draft, setDraft] = useState<NetworkingContact>(empty)
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const filtered = data.contacts.filter(c => [c.name,c.company,c.role,c.metWhere,c.notes,c.email,c.phone,c.telegram].some(v => v.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))))
  const fields: [keyof NetworkingContact, string, number][] = [['name','Имя и фамилия',120],['company','Компания',160],['role','Должность / специализация',120],['email','Почта',120],['phone','Телефон',40],['telegram','Telegram',80],['metWhere','Где и когда познакомились',160]]
  async function remove(id: string) {
    setBusy(true); setError('')
    const r = await saveProfile({ networking: { ...data, contacts: data.contacts.filter(c => c.id !== id) } })
    if (r.ok) { onSaved(r.data.profile); setConfirm(null); if (draft.id === id) setDraft(empty()) } else setError(errorText(r.error))
    setBusy(false)
  }
  return <div className="space-y-4">
    <ProfileForm profile={profile} parts={() => {
      const hasDraft = Object.entries(draft).some(([key, value]) => key !== 'id' && value.trim())
      if (hasDraft && !draft.name.trim()) throw Error('Укажите имя контакта.')
      return { networking: { ...data, intro, contacts: hasDraft ? [...data.contacts.filter(c => c.id !== draft.id), draft] : data.contacts } }
    }} onSaved={p => { onSaved(p); setDraft(empty()); setError('') }}>
      <div><h2 className="text-lg font-semibold">О себе и моя записная книжка</h2><p className="mt-1 text-sm text-ink/60">Короткое представление о себе и контакты людей, с которыми вы познакомились. Записи доступны только вашему аккаунту.</p></div>
      <label className={labelClass}>Мое представление<textarea value={intro} onChange={e => setIntro(e.target.value)} maxLength={1500} rows={3} placeholder="Чем занимаюсь, с какими вопросами ко мне можно обращаться" className={`${fieldClass} mt-2`} /></label>
      <div className="border-t border-ink/10 pt-4"><h3 className="mb-3 text-base font-semibold">{data.contacts.some(c => c.id === draft.id) ? 'Редактировать контакт' : 'Добавить контакт'}</h3><div className="grid gap-4 sm:grid-cols-2">{fields.map(([id,label,max]) => <label key={id} className={labelClass}>{label}<input value={draft[id]} onChange={e => setDraft({ ...draft, [id]: e.target.value })} maxLength={max} className={`${fieldClass} mt-1.5`} /></label>)}</div><label className={labelClass}>Заметки<textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} maxLength={2000} rows={3} className={`${fieldClass} mt-1.5`} /></label><button type="button" onClick={() => setDraft(empty())} className="text-xs text-ink/60 underline">Очистить форму контакта</button></div>
    </ProfileForm>
    <section className="rounded-2xl border border-ink/10 bg-white p-4" aria-label="Сохраненные контакты"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Контакты · {data.contacts.length}</h2><input aria-label="Поиск контакта" placeholder="Найти контакт" value={query} onChange={e => setQuery(e.target.value)} className="rounded-xl border border-ink/15 px-3 py-2 text-sm" /></div>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<ul className="mt-3 space-y-3">{filtered.map(c => <li key={c.id} className="rounded-xl bg-ink/[0.035] p-4"><h3 className="font-semibold">{c.name}</h3><p className="text-sm text-ink/60">{[c.company,c.role].filter(Boolean).join(' · ')}</p><p className="mt-2 break-words text-sm">{[c.email,c.phone,c.telegram].filter(Boolean).join(' · ')}</p>{c.metWhere && <p className="mt-1 text-xs text-ink/55">Знакомство: {c.metWhere}</p>}{c.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink/70">{c.notes}</p>}<div className="mt-3 flex flex-wrap gap-4 text-xs font-medium"><button type="button" onClick={() => {setDraft(c); window.scrollTo({ top: 0, behavior: 'smooth' })}}>Редактировать</button>{confirm === c.id ? <><button type="button" disabled={busy} onClick={() => void remove(c.id)} className="text-red-700">Подтвердить удаление</button><button type="button" onClick={() => setConfirm(null)}>Отмена</button></> : <button type="button" onClick={() => setConfirm(c.id)} className="text-ink/50">Удалить</button>}</div></li>)}</ul>{!filtered.length && <p className="py-6 text-center text-sm text-ink/50">{data.contacts.length ? 'По вашему запросу контакты не найдены.' : 'Здесь появятся ваши контакты после сохранения формы.'}</p>}</section>
  </div>
}
