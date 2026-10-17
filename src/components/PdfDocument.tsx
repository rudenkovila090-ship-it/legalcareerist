import { useSyncExternalStore, type ReactNode } from 'react'

// Юридический документ, который публикуется файлом PDF без изменений (Политика, Согласие).
// Чтобы заменить файл: положите новый в public/documents/, поменяйте version (всегда, даже если дата та же — по параметру ?v=
// браузеры забирают новую копию, а не показывают старую из кэша), а при необходимости число страниц и размер.
export interface PdfFile {
  /** Адрес файла на сайте, например /documents/politika.pdf */
  file: string
  /** Любая строка, которая меняется вместе с файлом. */
  version: string
  pages: number
  sizeKb: number
  /** Имя файла при скачивании. */
  downloadName: string
}

const WIDE = '(min-width: 768px)'
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}

export default function PdfDocument({ doc, title, note }: { doc: PdfFile; title: string; note?: ReactNode }) {
  // Встроенный просмотр PDF есть только в настольных браузерах; на телефоне файл открывается в системном просмотрщике.
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false)
  const url = `${doc.file}?v=${doc.version}`
  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
          <div className="min-w-0">
            <div className="text-lg font-semibold">{title}</div>
            <div className="mt-1 text-sm text-ink/60">
              ИП Руденков И. В. · PDF, {doc.pages} стр., {doc.sizeKb} КБ
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={url} target="_blank" rel="noopener" className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
              Открыть PDF
            </a>
            <a href={url} download={doc.downloadName} className="rounded-full border border-ink/15 px-6 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink">
              Скачать
            </a>
          </div>
        </div>

        {wide ? (
          <object data={url} type="application/pdf" aria-label={title} className="h-[80vh] min-h-[480px] w-full rounded-2xl border border-ink/10 bg-white">
            <p className="p-6 text-sm text-ink/60">Браузер не показывает PDF прямо на странице. Откройте документ кнопкой «Открыть PDF» выше.</p>
          </object>
        ) : (
          <p className="text-sm text-ink/60">Нажмите «Открыть PDF» — документ откроется в просмотрщике вашего телефона.</p>
        )}

        {note && <p className="text-xs text-ink/50">{note}</p>}
      </div>
    </div>
  )
}
