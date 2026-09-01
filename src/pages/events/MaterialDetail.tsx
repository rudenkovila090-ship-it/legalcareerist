import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { materials } from '../../data/materials'
import { TagRow } from '../../components/Tag'
import RelatedContentBlock from '../../components/RelatedContentBlock'
import { getRelatedContent } from '../../lib/related'
import { materialKindLabel as kindLabel } from '../../components/cards'

const money = new Intl.NumberFormat('ru-RU')

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Рейтинг ${rating} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`h-4 w-4 ${i < Math.round(rating) ? 'fill-gold text-gold' : 'fill-ink/10 text-ink/10'}`}>
          <path d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L1.4 7.7l6.1-.6z" />
        </svg>
      ))}
    </span>
  )
}

export default function MaterialDetail() {
  const { slug } = useParams()
  const material = materials.find((m) => m.slug === slug)
  const [purchased, setPurchased] = useState(false)

  // Клик по любому варианту получения (бесплатно или платно) сначала открывает
  // гейт создания аккаунта — доступ считается открытым только после него.
  // Исключение — материалы с realPurchase: там гейт заменяется формой с
  // настоящей оплатой через Продамус (см. ниже handlePurchaseSubmit).
  const [gateOpen, setGateOpen] = useState(false)
  const [pendingLabel, setPendingLabel] = useState('')
  const [account, setAccount] = useState({ email: '', password: '' })
  const [accountCreated, setAccountCreated] = useState(false)

  const [purchaseForm, setPurchaseForm] = useState({ name: '', phone: '', email: '' })
  const [purchasing, setPurchasing] = useState(false)
  const [purchaseError, setPurchaseError] = useState(false)

  // При возврате кнопкой «Назад» после редиректа на оплату браузер может
  // восстановить страницу из bfcache вместе с "замороженной" кнопкой
  // «Переходим к оплате…» — сбрасываем состояние загрузки.
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        setPurchasing(false)
        setPurchaseError(false)
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  if (!material) {
    return (
      <div className="container-page py-16">
        <p>Материал не найден. <Link className="underline" to="/events/materials">Все материалы</Link></p>
      </div>
    )
  }

  const related = getRelatedContent(material, 'material', material.id)

  function openGate(label: string) {
    setPendingLabel(label)
    setGateOpen(true)
  }

  function closeGate() {
    setGateOpen(false)
    setAccountCreated(false)
    setAccount({ email: '', password: '' })
  }

  function handleAccountSubmit(e: FormEvent) {
    e.preventDefault()
    if (!account.email.trim()) return
    setAccountCreated(true)
    setPurchased(true)
  }

  async function handlePurchaseSubmit(e: FormEvent) {
    e.preventDefault()
    if (!purchaseForm.name.trim() || !purchaseForm.phone.trim()) return
    setPurchasing(true)
    setPurchaseError(false)
    try {
      const res = await fetch('/api/marketplace/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialSlug: material!.slug, ...purchaseForm }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error('purchase_failed')
      window.location.assign(data.url)
    } catch {
      setPurchasing(false)
      setPurchaseError(true)
    }
  }

  return (
    <div className="container-page py-12">
      <Link to="/marketplace" className="text-sm text-ink/50 hover:text-ink">← Все материалы</Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <span className="text-sm font-medium uppercase tracking-wide text-gold">{kindLabel[material.kind]}</span>
          <h1 className="mt-1 text-3xl font-semibold">{material.title}</h1>
          <div className="mt-3"><TagRow specialization={material.specialization} industry={material.industry} /></div>

          {material.rating !== undefined && (
            <div className="mt-3 flex items-center gap-2 text-sm text-ink/60">
              <Stars rating={material.rating} />
              <span className="font-medium text-ink">{material.rating.toFixed(1)}</span>
              {material.reviewsCount !== undefined && <span>· {material.reviewsCount} отзывов</span>}
              {material.purchases !== undefined && <span>· купили {material.purchases}+ раз</span>}
            </div>
          )}

          <p className="mt-6 leading-relaxed text-ink/80">{material.description}</p>
          <div className="mt-2 text-sm text-ink/50">Для кого: {material.forWhom}</div>

          <RelatedContentBlock items={related} />
        </div>

        {/* Блок приобретения — справа, закреплен при скролле */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="glass rounded-xl p-6">
            {purchased ? (
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                Доступ открыт — ссылка отправлена на email, также появится в личном кабинете.
              </div>
            ) : material.kind === 'webinar' && material.sale ? (
              <div className="space-y-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/40">Что купить</div>
                {material.sale.recording !== undefined && (
                  <button onClick={() => openGate('Запись')} className="flex w-full items-center justify-between rounded-lg border border-ink/15 px-4 py-2.5 text-sm hover:border-ink/30">
                    <span>Запись</span>
                    <span className="font-semibold">{material.sale.recording === 0 ? 'Бесплатно' : `${money.format(material.sale.recording)} ₽`}</span>
                  </button>
                )}
                {material.sale.materials !== undefined && (
                  <button onClick={() => openGate('Материалы')} className="flex w-full items-center justify-between rounded-lg border border-ink/15 px-4 py-2.5 text-sm hover:border-ink/30">
                    <span>Материалы</span>
                    <span className="font-semibold">{money.format(material.sale.materials)} ₽</span>
                  </button>
                )}
                {material.sale.bundle !== undefined && (
                  <button onClick={() => openGate('Запись + материалы')} className="flex w-full items-center justify-between rounded-lg bg-ink px-4 py-2.5 text-sm text-white hover:bg-ink/90">
                    <span>Запись + материалы</span>
                    <span className="font-semibold">{material.sale.bundle === 0 ? 'Бесплатно' : `${money.format(material.sale.bundle)} ₽`}</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold">
                  {material.price === 0 ? 'Бесплатно' : `${money.format(material.price)} ₽`}
                </div>
                <button
                  onClick={() => (material.realPurchase ? setGateOpen(true) : openGate(material.title))}
                  className="mt-4 w-full rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  {material.price === 0 ? 'Получить бесплатно' : 'Оплатить и получить доступ'}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Форма настоящей оплаты — для материалов с realPurchase, вместо гейта аккаунта */}
      {gateOpen && material.realPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGateOpen(false)
          }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:p-8">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Оформить покупку</h3>
              <button type="button" onClick={() => setGateOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
            </div>
            <div className="mb-4 flex items-center justify-between rounded-lg bg-ink/[0.04] px-4 py-3 text-sm">
              <span className="text-ink/60 line-clamp-1">{material.title}</span>
              <span className="shrink-0 font-semibold text-ink">{money.format(material.price)} ₽</span>
            </div>
            <form className="grid gap-3" onSubmit={handlePurchaseSubmit}>
              <input
                required
                placeholder="Имя"
                value={purchaseForm.name}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              <input
                type="tel"
                required
                placeholder="Телефон, например +79990000000"
                value={purchaseForm.phone}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, phone: e.target.value }))}
                className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              <input
                type="email"
                placeholder="Почта (необязательно)"
                value={purchaseForm.email}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              {purchaseError && (
                <p className="text-sm text-red-600">Не получилось перейти к оплате — попробуйте еще раз через минуту.</p>
              )}
              <button
                type="submit"
                disabled={purchasing}
                className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
              >
                {purchasing ? 'Переходим к оплате…' : 'Перейти к оплате'}
              </button>
              <p className="text-xs text-ink/50">Нажимая «Перейти к оплате», вы соглашаетесь на обработку персональных данных.</p>
            </form>
          </div>
        </div>
      )}

      {/* Гейт создания аккаунта — появляется после выбора варианта получения материала */}
      {gateOpen && !material.realPurchase && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGate()
          }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:p-8">
            {accountCreated ? (
              <div className="py-4 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                </div>
                <div className="font-semibold">Аккаунт создан</div>
                <p className="mt-2 text-sm text-ink/60">
                  «{material.title}» сохранен в личном кабинете — там же будут храниться все купленные и открытые материалы.
                </p>
                <button type="button" onClick={closeGate} className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white">
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Создайте аккаунт</h3>
                  <button type="button" onClick={closeGate} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
                </div>
                <p className="mb-4 text-sm text-ink/60">
                  Чтобы получить «{pendingLabel}», сохраните материал в личном кабинете — там же будут все ваши материалы.
                </p>
                <form className="grid gap-3" onSubmit={handleAccountSubmit}>
                  <input
                    type="email"
                    required
                    placeholder="Почта"
                    value={account.email}
                    onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Пароль"
                    value={account.password}
                    onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90">
                    Создать аккаунт и продолжить
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
