import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

interface PurchaseData {
  name: string
  materialTitle: string
  paid: boolean
  accessUrl: string | null
}

// Личный кабинет покупки материала маркетплейса — Prodamus возвращает сюда
// после оплаты (urlSuccess в server/lib/prodamus.js createProductPaymentLink).
// Данные хранятся по token на сервере (server/lib/materialsStore.js), без
// логина/пароля — доступ по ссылке.
export default function PurchaseCabinet() {
  useDocumentTitle('Личный кабинет')
  const [params] = useSearchParams()
  const token = params.get('token')
  const [data, setData] = useState<PurchaseData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(token ? 'loading' : 'error')

  useEffect(() => {
    if (!token) return
    fetch(`/api/marketplace/purchase/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not_found')
        return res.json()
      })
      .then((json: PurchaseData) => {
        setData(json)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div>
      <PageHero eyebrow="Маркет" title="Личный кабинет" description="Здесь хранятся ваши покупки материалов." />

      <section className="container-page pb-16">
        <div className="glass mx-auto max-w-xl rounded-2xl p-8">
          {status === 'loading' && <p className="text-center text-sm text-ink/50">Загружаем данные…</p>}

          {status === 'error' && (
            <div className="text-center">
              <p className="text-sm text-ink/60">Не нашли данные о покупке — если вы только что оплатили, напишите нам, поможем разобраться.</p>
              <Link to="/marketplace" className="mt-4 inline-block text-sm font-medium text-ink underline">В маркет</Link>
            </div>
          )}

          {status === 'ready' && data && !data.paid && (
            <div className="text-center">
              <p className="text-sm text-ink/60">Ждём подтверждения оплаты от банка — обычно это занимает меньше минуты. Обновите страницу через немного.</p>
            </div>
          )}

          {status === 'ready' && data && data.paid && (
            <div className="text-center">
              <div className="mb-3 flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
              </div>
              <div className="font-semibold">Оплата получена{data.name ? `, ${data.name}` : ''}!</div>
              <p className="mt-2 text-sm text-ink/60">«{data.materialTitle}» — ваш материал готов.</p>
              {data.accessUrl ? (
                <a
                  href={data.accessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-block rounded-full bg-ink px-8 py-3 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  Открыть материал
                </a>
              ) : (
                <p className="mt-4 text-sm text-ink/50">Ссылку на материал пришлём отдельно — свяжемся с вами в ближайшее время.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
