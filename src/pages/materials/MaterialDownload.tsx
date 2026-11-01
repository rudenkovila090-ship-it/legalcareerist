import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const SUPPORT_URL = 'https://t.me/legalcareerist_support'
const TOKEN_RE = /^[0-9a-f]{48}$/i

type State =
  | { state: 'loading' }
  | { state: 'ready'; title: string; expiresAt: number; fileReady: boolean }
  | { state: 'expired'; expiresAt?: number }
  | { state: 'invalid' }
  | { state: 'error' }

const formatDeadline = (ts: number) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

// Личная ссылка на купленный материал: приходит в письме после оплаты и действует 7 дней (сервер: /api/materials/link).
// Страница показывает название и срок, кнопка «Скачать PDF» отдаёт файл (/api/materials/download). Ссылка в поиск и в Метрику не идёт.
export default function MaterialDownload() {
  useDocumentTitle('Ваш материал')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [info, setInfo] = useState<State>(TOKEN_RE.test(token) ? { state: 'loading' } : { state: 'invalid' })

  useEffect(() => {
    if (!TOKEN_RE.test(token)) return
    let active = true
    fetch(`/api/materials/link?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; title?: string; expiresAt?: number; fileReady?: boolean }
        if (!active) return
        if (j.ok && j.title && j.expiresAt) setInfo({ state: 'ready', title: j.title, expiresAt: j.expiresAt, fileReady: Boolean(j.fileReady) })
        else if (j.error === 'expired') setInfo({ state: 'expired', expiresAt: j.expiresAt })
        else if (r.status === 404) setInfo({ state: 'invalid' })
        else setInfo({ state: 'error' })
      })
      .catch(() => active && setInfo({ state: 'error' }))
    return () => {
      active = false
    }
  }, [token])

  const support = (
    <a className="underline" href={SUPPORT_URL} target="_blank" rel="noreferrer">@legalcareerist_support</a>
  )

  return (
    <div>
      <PageHero eyebrow="Маркетплейс" title="Ваш материал" />
      <section className="container-page pb-16">
        <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center">
          {info.state === 'loading' && <p className="text-sm text-ink/60">Проверяем ссылку…</p>}

          {info.state === 'ready' && (
            <>
              <div className="font-semibold">{info.title}</div>
              {info.fileReady ? (
                <>
                  <p className="mt-2 text-sm text-ink/60">Ссылка личная и действует до {formatDeadline(info.expiresAt)} (мск). Скачайте файл и сохраните у себя.</p>
                  <a
                    href={`/api/materials/download?token=${encodeURIComponent(token)}`}
                    download
                    className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90"
                  >
                    Скачать PDF
                  </a>
                </>
              ) : (
                <p className="mt-2 text-sm text-ink/60">Файл ещё готовится. Напишите в поддержку, и мы пришлём материал: {support}.</p>
              )}
            </>
          )}

          {info.state === 'expired' && (
            <>
              <div className="font-semibold">Срок ссылки закончился</div>
              <p className="mt-2 text-sm text-ink/60">Личная ссылка действует 7 дней. Напишите в поддержку, мы пришлём новую: {support}.</p>
            </>
          )}

          {info.state === 'invalid' && (
            <>
              <div className="font-semibold">Ссылка не подошла</div>
              <p className="mt-2 text-sm text-ink/60">Проверьте, что адрес из письма скопирован целиком. Если не получается, напишите в поддержку: {support}.</p>
            </>
          )}

          {info.state === 'error' && (
            <>
              <div className="font-semibold">Не получилось проверить ссылку</div>
              <p className="mt-2 text-sm text-ink/60">Обновите страницу через минуту. Если не помогло, напишите в поддержку: {support}.</p>
            </>
          )}

          <Link to="/marketplace" className="mt-6 block text-sm font-medium text-ink underline">В маркетплейс</Link>
        </div>
      </section>
    </div>
  )
}
