import { useEffect, useState } from 'react'
import { api, getToken } from '../../lib/cabinet'

type Version = { sha256: string; name?: string; bytes: number; at: number }
type Material = { slug: string; title: string; price: number; current: Version | null; versions: Version[] }
const size = (bytes: number) => `${(bytes / 1048576).toFixed(1)} МБ`
const date = (at: number) => new Date(at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const messages: Record<string, string> = {
  wrong_version: 'Выбран другой файл. Проверьте, что это актуальная версия нужного гайда.',
  invalid_pdf: 'Не удалось прочитать PDF. Проверьте выбранный файл.',
  invalid_file: 'Выберите PDF размером до 50 МБ.',
  file_too_large: 'Файл слишком большой. Допустимый размер — 50 МБ.',
  unauthorized: 'Войдите в кабинет снова.',
  admin_only: 'Загружать материалы может только владелец сайта.',
  incomplete_upload: 'Файл передался не полностью. Повторите загрузку.',
  file_changed: 'Переданный файл не прошёл проверку. Повторите загрузку.',
  chunk_conflict: 'Передача прервалась. Повторите загрузку.',
  network: 'Не удалось связаться с сервером. Проверьте соединение и повторите загрузку.',
}
const message = (code: string) => messages[code] || 'Не удалось подтвердить сохранение. Обновите статус и попробуйте ещё раз.'

export default function MaterialManager() {
  const [materials, setMaterials] = useState<Material[] | null>(null)
  const [files, setFiles] = useState<Record<string, File | undefined>>({})
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState<Record<string, { text: string; ok: boolean }>>({})
  const [loadError, setLoadError] = useState('')
  async function load() {
    const r = await api<{ materials: Material[] }>('/api/account/materials')
    if (r.ok) { setMaterials(r.data.materials); setLoadError('') }
    else setLoadError(message(r.error))
  }
  useEffect(() => {
    let active = true
    api<{ materials: Material[] }>('/api/account/materials').then(r => {
      if (!active) return
      if (r.ok) setMaterials(r.data.materials)
      else setLoadError(message(r.error))
    })
    return () => { active = false }
  }, [])

  async function upload(material: Material) {
    const file = files[material.slug]
    if (!file || busy) return
    if (!/\.pdf$/i.test(file.name) || file.size < 8 || file.size > 50 * 1048576) {
      setNotice(n => ({ ...n, [material.slug]: { text: messages.invalid_file, ok: false } })); return
    }
    setBusy(material.slug); setProgress(0)
    setNotice(n => ({ ...n, [material.slug]: { text: '', ok: false } }))
    let uploadId = ''
    try {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
      const sha256 = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      const base = `/api/account/materials/${material.slug}/uploads`
      const started = await api<{ id: string }>(base, { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size, sha256 }) })
      if (!started.ok) throw Error(started.error)
      uploadId = started.data.id
      let offset = 0
      while (offset < file.size) {
        const chunk = file.slice(offset, offset + 256 * 1024)
        const response = await fetch(`${base}/${uploadId}?offset=${offset}`, {
          method: 'PUT', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/octet-stream' },
          body: chunk, signal: AbortSignal.timeout(60000),
        })
        const r = await response.json().catch(() => ({})) as { receivedBytes?: number; error?: string }
        if (!response.ok) throw Error(r.error || 'network')
        if (typeof r.receivedBytes !== 'number' || r.receivedBytes <= offset || r.receivedBytes > file.size) throw Error('incomplete_upload')
        offset = r.receivedBytes; setProgress(Math.round(offset / file.size * 100))
      }
      const completed = await api<{ saved: Version }>(`${base}/${uploadId}/complete`, { method: 'POST', body: '{}' })
      if (!completed.ok) throw Error(completed.error)
      uploadId = ''
      setFiles(f => ({ ...f, [material.slug]: undefined }))
      setNotice(n => ({ ...n, [material.slug]: { text: 'PDF загружен и проверен. Теперь сайт может выдавать его после оплаты.', ok: true } }))
      await load()
    } catch (error) {
      setNotice(n => ({ ...n, [material.slug]: { text: message(error instanceof Error ? error.message : 'network'), ok: false } }))
      await load()
    } finally {
      if (uploadId) await api(`/api/account/materials/${material.slug}/uploads/${uploadId}`, { method: 'DELETE' })
      setBusy('')
    }
  }
  async function restore(material: Material, version: Version) {
    if (busy) return
    setBusy(material.slug)
    const r = await api<{ saved: Version }>(`/api/account/materials/${material.slug}/restore`, { method: 'POST', body: JSON.stringify({ sha256: version.sha256 }) })
    setNotice(n => ({ ...n, [material.slug]: { text: r.ok ? 'Выбранная версия восстановлена. Прежняя версия тоже сохранена.' : message(r.error), ok: r.ok } }))
    await load(); setBusy('')
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Материалы сайта</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/65">Выберите PDF на компьютере и нажмите «Загрузить». Файл будет храниться на сервере. Покупатели получают личную ссылку после оплаты.</p>
      <p className="mt-2 text-sm text-ink/65">Копии загруженных версий сохраняются на сервере. Управлять файлами можете только вы.</p>
      {loadError && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{loadError} <button type="button" onClick={() => void load()} className="underline">Обновить статус</button></div>}
      {!materials && !loadError && <p className="mt-6 text-sm text-ink/60">Проверяем материалы…</p>}
      <div className="mt-6 space-y-5">
        {materials?.map(material => (
          <section key={material.slug} className="glass rounded-2xl p-5">
            <h2 className="text-lg font-semibold">{material.title}</h2>
            <p className="mt-1 text-sm text-ink/60">{material.price} ₽</p>
            <p className={`mt-3 text-sm font-medium ${material.current ? 'text-emerald-700' : 'text-amber-800'}`}>
              {material.current ? `PDF на сервере · ${size(material.current.bytes)} · ${date(material.current.at)} мск` : 'PDF пока не загружен'}
            </p>
            <label className="mt-4 block text-sm font-medium">
              PDF для «{material.title}»
              <input key={material.current?.at ?? 'missing'} type="file" accept="application/pdf,.pdf" disabled={Boolean(busy)} onChange={e => setFiles(f => ({ ...f, [material.slug]: e.target.files?.[0] }))} className="mt-2 block w-full max-w-full rounded-xl border border-ink/15 bg-white p-3 text-sm" />
            </label>
            <p className="mt-1 text-xs text-ink/50">До 50 МБ. Выбранный файл: {files[material.slug]?.name || 'не выбран'}.</p>
            <button type="button" disabled={!files[material.slug] || Boolean(busy)} onClick={() => void upload(material)} className="mt-3 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === material.slug ? `Сохраняем… ${progress}%` : material.current ? 'Заменить PDF' : 'Загрузить PDF'}
            </button>
            {busy === material.slug && <progress aria-label="Передача PDF" value={progress} max={100} className="mt-3 block w-full" />}
            {notice[material.slug]?.text && <p role={notice[material.slug].ok ? 'status' : 'alert'} className={`mt-3 text-sm ${notice[material.slug].ok ? 'text-emerald-700' : 'text-red-700'}`}>{notice[material.slug].text}</p>}
            {material.versions.length > 0 && <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium">Сохранённые версии</summary>
              <ul className="mt-3 space-y-2">
                {material.versions.map(version => <li key={version.sha256} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/[0.04] p-3">
                  <span>{date(version.at)} мск · {size(version.bytes)}</span>
                  {version.sha256 === material.current?.sha256 ? <span className="text-emerald-700">Текущая</span> : <button disabled={Boolean(busy)} onClick={() => void restore(material, version)} className="font-medium underline disabled:opacity-50">Восстановить</button>}
                </li>)}
              </ul>
            </details>}
          </section>
        ))}
      </div>
    </div>
  )
}
