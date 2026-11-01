import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ConsentCheck from '../../components/ConsentCheck'
import { consentOf } from '../../lib/consent'
import {
  deleteDocument,
  deleteDocumentVersion,
  downloadVersion,
  fetchDocuments,
  fetchProfile,
  updateDocument,
  uploadDocument,
  type CabinetDoc,
  type DocType,
  type DocumentsState,
  type Profile,
} from '../../lib/cabinet'
import { pluralRu } from '../../lib/plural'
import { Card } from './ui'
import { errorText, fileSize, inputClass, labelClass, longDate } from './shared'

const secondary = 'rounded-full border border-ink/15 px-4 py-2 text-xs font-semibold text-ink/70 hover:text-ink disabled:opacity-60'

/** Что подсказать в полях загрузки в зависимости от типа документа. */
const HINTS: Record<DocType, { title: string; target: string; note: string }> = {
  cv: { title: 'Например: Резюме — корпоративное право', target: 'Для какой вакансии или компании (по желанию)', note: 'Для чего эта версия (по желанию)' },
  other: { title: 'Например: Диплом, сертификат', target: 'Для какой вакансии или компании (по желанию)', note: 'Заметка для себя (по желанию)' },
  cover: { title: 'Например: Письмо в Сбер', target: 'Вакансия или компания', note: 'Заметка для себя (по желанию)' },
  test: { title: 'Например: Тестовое задание — Рамблер', target: 'Вакансия или компания', note: 'Что было в задании, срок сдачи (по желанию)' },
}

function useDocuments() {
  const [state, setState] = useState<DocumentsState | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    fetchDocuments().then((r) => {
      if (!active) return
      if (r.ok) setState(r.data)
      else setFailed(true)
    })
    return () => {
      active = false
    }
  }, [])
  return { state, failed, setState }
}

// ---- Профиль и CV: заполненность профиля + резюме и прочие документы ----
export function CvSection() {
  return (
    <div className="space-y-6">
      <CompletenessCard />
      <DocumentsManager types={['cv', 'other']} defaultType="cv" />
    </div>
  )
}

// ---- Сопроводительные и тестовые ----
export function DocumentsSection() {
  return <DocumentsManager types={['cover', 'test']} defaultType="cover" />
}

function CompletenessCard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  useEffect(() => {
    let active = true
    fetchProfile().then((r) => {
      if (active && r.ok) setProfile(r.data.profile)
    })
    return () => {
      active = false
    }
  }, [])
  if (!profile) return null
  const { practices, experience, expectations, privacy } = profile
  const rows = [
    { label: 'Практики', done: Boolean(practices.main), to: 'practices', hint: practices.main ? 'указаны' : 'не указаны' },
    { label: 'Уровень и опыт', done: Boolean(experience.level), to: 'practices', hint: experience.level ? 'указаны' : 'не указаны' },
    { label: 'Ожидания по роли', done: Boolean(expectations.city || expectations.workFormat.length || expectations.salaryFrom), to: 'expectations', hint: expectations.city || expectations.workFormat.length || expectations.salaryFrom ? 'указаны' : 'не указаны' },
  ]
  const filled = rows.filter((r) => r.done).length
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Профиль юриста</h2>
        <span className="text-sm text-ink/60">заполнено {filled} из {rows.length}</span>
      </div>
      <p className="mt-1 text-sm text-ink/60">Резюме работает вместе с профилем: практики, уровень и ожидания помогают подбирать вам вакансии.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <li key={r.label} className="min-w-0">
            <Link to={`/cabinet/${r.to}`} className="flex h-full items-center gap-3 rounded-xl border border-ink/10 px-4 py-3 text-sm hover:border-ink/25">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${r.done ? 'bg-emerald-50 text-emerald-600' : 'border border-ink/25 text-transparent'}`} aria-hidden="true">✓</span>
              <span className="min-w-0">
                <span className="block font-medium">{r.label}</span>
                <span className="block text-xs text-ink/50">{r.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink/60">
        {privacy.hidden ? 'Скрытый поиск включён: резюме не видно в базе кандидатов.' : 'Скрытый поиск выключен.'}{' '}
        <Link to="/cabinet/privacy" className="underline hover:text-ink">Изменить</Link>
      </p>
    </Card>
  )
}

// ---- Менеджер документов ----
interface ManagerProps {
  /** Какие типы документов показывает и принимает раздел. */
  types: DocType[]
  defaultType: DocType
}

function DocumentsManager({ types, defaultType }: ManagerProps) {
  const { state, failed, setState } = useDocuments()
  if (failed) return <p className="text-sm text-ink/50">Не удалось загрузить документы. Обновите страницу.</p>
  if (!state) return <p className="text-sm text-ink/50">Загружаем…</p>

  const docs = state.documents
    .filter((d) => types.includes(d.type))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || b.updatedAt - a.updatedAt)
  const count = state.documents.length

  return (
    <div className="space-y-6">
      <UploadForm state={state} types={types} defaultType={defaultType} onState={setState} />
      {docs.length === 0 ? (
        <Card>
          <p className="text-lg font-semibold">Документов пока нет</p>
          <p className="mt-1 text-sm text-ink/60">Загрузите первый файл выше. Каждый документ хранит свои версии: новую можно добавить, не теряя прежнюю.</p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {docs.map((d) => (
            <li key={d.id} className="min-w-0">
              <DocCard doc={d} state={state} onState={setState} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink/50">
        Занято {fileSize(state.usedBytes)} из {fileSize(state.limits.totalBytes)} · {count} {pluralRu(count, ['документ', 'документа', 'документов'])} из {state.limits.docs}. Файлы видите только вы; удалить их можно в любой момент, они стираются с сервера сразу.
      </p>
    </div>
  )
}

function UploadForm({ state, types, defaultType, onState }: { state: DocumentsState; types: DocType[]; defaultType: DocType; onState: (s: DocumentsState) => void }) {
  const [type, setType] = useState<DocType>(defaultType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const needConsent = state.consentAt === null
  const hint = HINTS[type]

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const consent = consentOf(e)
    const data = new FormData(form)
    const file = data.get('file')
    setError('')
    setDone('')
    if (!(file instanceof File) || !file.size) return setError('Выберите файл.')
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!state.extensions.includes(ext)) return setError(errorText('bad_type'))
    if (file.size > state.limits.fileBytes) return setError(errorText('file_too_large'))
    setBusy(true)
    const r = await uploadDocument({ file, type, title: String(data.get('title') ?? ''), target: String(data.get('target') ?? ''), note: String(data.get('note') ?? ''), consent: needConsent ? consent : undefined })
    setBusy(false)
    if (!r.ok) return setError(errorText(r.error))
    form.reset()
    onState(r.data)
    setDone(`«${r.data.doc.title}» загружен.`)
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-4 rounded-2xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Загрузить документ</h2>
        <p className="mt-1 text-sm text-ink/60">
          PDF, Word, ODT, RTF, Excel, PowerPoint или txt, до {fileSize(state.limits.fileBytes)}. Файл хранится на нашем сервере и виден только вам.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {types.length > 1 && (
          <div className="min-w-0">
            <label htmlFor="doc-type" className={labelClass}>Тип документа</label>
            <select id="doc-type" value={type} onChange={(e) => setType(e.target.value as DocType)} className={inputClass}>
              {types.map((t) => (
                <option key={t} value={t}>{state.types[t]}</option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0">
          <label htmlFor="doc-title" className={labelClass}>Название</label>
          <input id="doc-title" name="title" maxLength={120} placeholder={hint.title} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor="doc-target" className={labelClass}>Для кого</label>
          <input id="doc-target" name="target" maxLength={120} placeholder={hint.target} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor="doc-note" className={labelClass}>Заметка</label>
          <input id="doc-note" name="note" maxLength={300} placeholder={hint.note} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="doc-file" className={labelClass}>Файл</label>
        <input
          id="doc-file"
          name="file"
          type="file"
          accept={state.extensions.map((x) => `.${x}`).join(',')}
          required
          className="block w-full min-w-0 text-sm text-ink/70 file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-ink/90"
        />
      </div>
      {needConsent && (
        <div className="rounded-lg border border-ink/10 p-4">
          <p className="mb-3 text-xs text-ink/60">Резюме и документы — ваши персональные данные. Чтобы сохранить первый файл, нужны две отметки; согласие на рекламу по желанию.</p>
          <ConsentCheck />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
          {busy ? 'Загружаем…' : 'Загрузить'}
        </button>
        {done && <span role="status" className="text-sm font-medium text-emerald-700">{done}</span>}
      </div>
    </form>
  )
}

function DocCard({ doc, state, onState }: { doc: CabinetDoc; state: DocumentsState; onState: (s: DocumentsState) => void }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const versions = [...doc.versions].sort((a, b) => b.n - a.n)
  const latest = versions[0]

  async function run(name: string, action: () => Promise<{ ok: true; data: DocumentsState } | { ok: false; error: string }>) {
    setBusy(name)
    setError('')
    const r = await action()
    setBusy('')
    if (!r.ok) return setError(errorText(r.error))
    onState(r.data)
    setEditing(false)
    setConfirming(false)
  }

  async function addVersion(file: File | undefined) {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!state.extensions.includes(ext)) return setError(errorText('bad_type'))
    if (file.size > state.limits.fileBytes) return setError(errorText('file_too_large'))
    await run('version', () => uploadDocument({ file, docId: doc.id }))
    if (fileRef.current) fileRef.current.value = ''
  }

  async function download(v: (typeof versions)[number]) {
    setBusy(`dl${v.n}`)
    setError('')
    const ok = await downloadVersion(doc.id, v)
    setBusy('')
    if (!ok) setError('Не удалось скачать файл. Попробуйте ещё раз.')
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    await run('save', () => updateDocument(doc.id, { title: String(data.get('title') ?? ''), target: String(data.get('target') ?? ''), note: String(data.get('note') ?? '') }))
  }

  return (
    <article className="glass min-w-0 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold">{doc.title}</h3>
          <p className="mt-0.5 text-sm text-ink/60">
            {state.types[doc.type]}
            {doc.target ? ` · для: ${doc.target}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.primary && <span className="rounded-full bg-gold-light px-3 py-1 text-xs font-semibold text-ink">Основное резюме</span>}
          <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium text-ink/70">обновлено {longDate(doc.updatedAt)}</span>
        </div>
      </div>
      {doc.note && <p className="mt-3 break-words text-sm text-ink/70">{doc.note}</p>}

      <ul className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10">
        {versions.map((v) => (
          <li key={v.n} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 text-sm">
              <div className="break-words font-medium">
                {v.filename}
                {v.n === latest.n && versions.length > 1 && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-700">актуальная</span>}
              </div>
              <div className="text-xs text-ink/50">версия {v.n} · {fileSize(v.size)} · {longDate(v.uploadedAt)}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => void download(v)} className={secondary}>{busy === `dl${v.n}` ? 'Скачиваем…' : 'Скачать'}</button>
              {versions.length > 1 && (
                <button type="button" disabled={Boolean(busy)} onClick={() => void run(`del${v.n}`, () => deleteDocumentVersion(doc.id, v.n))} className={secondary} aria-label={`Удалить версию ${v.n}`}>
                  {busy === `del${v.n}` ? 'Удаляем…' : 'Удалить'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <form onSubmit={save} className="mt-4 grid gap-3 rounded-xl border border-ink/10 p-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`t-${doc.id}`} className={labelClass}>Название</label>
            <input id={`t-${doc.id}`} name="title" defaultValue={doc.title} maxLength={120} className={inputClass} />
          </div>
          <div className="min-w-0">
            <label htmlFor={`g-${doc.id}`} className={labelClass}>Для кого</label>
            <input id={`g-${doc.id}`} name="target" defaultValue={doc.target} maxLength={120} className={inputClass} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`n-${doc.id}`} className={labelClass}>Заметка</label>
            <input id={`n-${doc.id}`} name="note" defaultValue={doc.note} maxLength={300} className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button type="submit" disabled={Boolean(busy)} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">{busy === 'save' ? 'Сохраняем…' : 'Сохранить'}</button>
            <button type="button" onClick={() => setEditing(false)} className={secondary}>Отмена</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          <span className="min-w-0 flex-1">Удалить «{doc.title}» вместе со всеми версиями? Это не отменить.</span>
          <button type="button" disabled={Boolean(busy)} onClick={() => void run('delete', () => deleteDocument(doc.id))} className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">{busy === 'delete' ? 'Удаляем…' : 'Да, удалить'}</button>
          <button type="button" onClick={() => setConfirming(false)} className={secondary}>Отмена</button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <label className={`${secondary} cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy === 'version' ? 'Загружаем…' : 'Новая версия'}
            <input ref={fileRef} type="file" accept={state.extensions.map((x) => `.${x}`).join(',')} className="sr-only" disabled={Boolean(busy) || doc.versions.length >= state.limits.versions} onChange={(e) => void addVersion(e.target.files?.[0])} />
          </label>
          {doc.type === 'cv' && !doc.primary && (
            <button type="button" disabled={Boolean(busy)} onClick={() => void run('primary', () => updateDocument(doc.id, { primary: true }))} className={secondary}>{busy === 'primary' ? 'Сохраняем…' : 'Сделать основным'}</button>
          )}
          <button type="button" disabled={Boolean(busy)} onClick={() => setEditing((v) => !v)} className={secondary}>Изменить</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => setConfirming(true)} className={`${secondary} hover:!text-red-600`}>Удалить</button>
        </div>
      )}
    </article>
  )
}
