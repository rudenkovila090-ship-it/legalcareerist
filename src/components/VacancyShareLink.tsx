import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SITE_URL } from '../lib/pageMeta'

/** Always share the vacancy's public address, including from an embedded card. */
export default function VacancyShareLink({ slug }: { slug: string }) {
  const path = `/vacancies/${encodeURIComponent(slug)}`
  const url = `${SITE_URL}${path}`
  const location = useLocation()
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (status === 'manual') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [status])

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setStatus('copied')
    } catch {
      setStatus('manual')
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={copy} aria-label="Скопировать ссылку на вакансию" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 py-2 text-sm font-medium text-ink hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            {status === 'copied' ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></>}
          </svg>
          {status === 'copied' ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </button>
        {location.pathname !== path && <Link to={path} title="Открыть вакансию на отдельной странице" className="inline-flex min-h-11 items-center text-sm text-gold underline underline-offset-4 hover:text-ink">Открыть отдельно</Link>}
      </div>
      <p role="status" className={status === 'manual' ? 'text-sm text-ink/70' : 'sr-only'}>{status === 'copied' ? 'Ссылка на вакансию скопирована.' : status === 'manual' ? 'Скопируйте ссылку из поля ниже.' : ''}</p>
      {status === 'manual' && <div>
        <label htmlFor={id} className="sr-only">Ссылка на вакансию</label>
        <input ref={inputRef} id={id} type="text" readOnly value={url} onFocus={event => event.currentTarget.select()} className="min-h-11 w-full min-w-0 rounded-lg border border-ink/20 bg-white px-3 py-2 text-base text-ink" />
      </div>}
    </div>
  )
}
