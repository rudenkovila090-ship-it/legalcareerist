import { useEffect, useState } from 'react'
import { downloadTemplate, fetchTemplates, peekTemplates, type TemplateCategory, type TemplateItem } from '../../../lib/careerCabinet'
import { icon } from '../sections'
import { BlockHead, Chip, Surface, TabSkeleton } from '../kit'
import { btnPrimary } from '../kitStyles'

// Библиотека шаблонов: резюме, письма, готовые ответы. Каталог — server/content/career/templates.json, файлы — server/assets/templates.
// Пока в каталоге ничего нет, показываем будущие разделы и подпись, что шаблоны скоро появятся.

function TemplateCard({ t }: { t: TemplateItem }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function get() {
    setBusy(true)
    setFailed(false)
    const ok = await downloadTemplate(t)
    setBusy(false)
    setFailed(!ok)
  }
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl bg-ink/[0.03] p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white [&>svg]:h-4 [&>svg]:w-4">{icon.doc}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold leading-snug">{t.title}</h3>
          {t.summary && <p className="mt-0.5 text-xs text-ink/60">{t.summary}</p>}
        </div>
        {t.format && <Chip>{t.format.toUpperCase()}</Chip>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void get()} disabled={busy} className={btnPrimary}>
          <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon.download}</span>
          {busy ? 'Скачиваем…' : 'Скачать'}
        </button>
        {failed && <span role="alert" className="text-xs text-red-600">Не получилось скачать. Попробуйте ещё раз.</span>}
      </div>
    </li>
  )
}

export default function TemplatesTab() {
  const [data, setData] = useState<{ categories: TemplateCategory[]; items: TemplateItem[] } | null>(() => peekTemplates() ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    fetchTemplates().then((r) => {
      if (!live) return
      if (r.ok) setData(r.data)
      else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  if (failed && !data) return <Surface><p className="text-[13px] text-ink/60">Не получилось загрузить шаблоны. Обновите страницу через минуту.</p></Surface>
  if (!data) return <TabSkeleton rows={2} />

  const { categories, items } = data
  if (!items.length) {
    return (
      <div className="space-y-2">
        <section className="relative overflow-hidden rounded-2xl bg-ink p-4 text-white sm:p-5">
          <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.06]" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.book}</span>Библиотека шаблонов
            </div>
            <h2 className="mt-2 text-lg font-semibold sm:text-xl">Шаблоны скоро появятся</h2>
            <p className="mt-1 max-w-xl text-[13px] text-white/70">Мы готовим шаблоны резюме, сопроводительных писем и готовые формулировки для сложных вопросов. Они откроются здесь, их можно будет скачать и подставить свои данные.</p>
          </div>
        </section>
        {categories.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <div key={c.id} className="rounded-2xl border border-dashed border-ink/20 bg-white/50 p-3">
                <div className="text-[13px] font-bold">{c.title}</div>
                {c.hint && <p className="mt-0.5 text-xs text-ink/55">{c.hint}</p>}
                <div className="mt-2"><Chip tone="soft">скоро</Chip></div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const uncategorized = items.filter((i) => !categories.some((c) => c.id === i.category))
  const groups = [...categories.map((c) => ({ ...c, items: items.filter((i) => i.category === c.id) })), ...(uncategorized.length ? [{ id: 'other', title: 'Другое', hint: '', items: uncategorized }] : [])].filter((g) => g.items.length)
  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <Surface key={g.id} as="section">
          <BlockHead title={g.title} note={g.hint || undefined} />
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-3">{g.items.map((t) => <TemplateCard key={t.slug} t={t} />)}</ul>
        </Surface>
      ))}
    </div>
  )
}
