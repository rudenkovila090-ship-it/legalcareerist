import { useState } from 'react'
import PageHero from '../components/PageHero'
import { materials } from '../data/materials'
import { materialKindLabel } from '../components/cards'
import type { MaterialItem, MaterialKind } from '../types'

const money = new Intl.NumberFormat('ru-RU')

// Витрина маркетплейса — блоки-подкатегории в духе Ozon/Amazon: карточка
// товара с рейтингом, числом покупок и ценой, вместо голого списка ссылок.
const sections: { kind: MaterialKind; title: string; text: string }[] = [
  { kind: 'guide', title: 'Гайды', text: 'Развернутые разборы конкретной карьерной задачи — от смены практики до личного бренда.' },
  { kind: 'checklist', title: 'Чек-листы', text: 'Короткие практические списки, которые можно применить сразу.' },
  { kind: 'longlist', title: 'Лонглисты', text: 'Подборки компаний и программ с контактами — экономят недели самостоятельного поиска.' },
  { kind: 'article', title: 'Статьи', text: 'Разборы конкретных карьерных ситуаций на цифрах и примерах.' },
  { kind: 'webinar', title: 'Вебинары', text: 'Часть — в бесплатном доступе, часть — запись, материалы или все вместе.' },
]

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Рейтинг ${rating} из 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${i < Math.round(rating) ? 'fill-gold text-gold' : 'fill-ink/10 text-ink/10'}`}>
          <path d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L1.4 7.7l6.1-.6z" />
        </svg>
      ))}
    </span>
  )
}

function ProductCard({ m, onOpen }: { m: MaterialItem; onOpen: (m: MaterialItem) => void }) {
  const free = m.price === 0 && !m.sale
  const fromPrice = m.sale ? Math.min(...Object.values(m.sale).filter((v): v is number => v !== undefined)) : m.price
  return (
    <div className="glass flex flex-col rounded-xl p-5">
      <div className="mb-3 flex h-28 items-center justify-center rounded-lg bg-gradient-to-br from-ink to-gold text-white">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{materialKindLabel[m.kind]}</span>
      </div>
      <h3 className="font-semibold leading-snug">{m.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-ink/60">{m.description}</p>

      {m.rating !== undefined && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink/50">
          <Stars rating={m.rating} />
          <span>{m.rating.toFixed(1)}</span>
          {m.reviewsCount !== undefined && <span>· {m.reviewsCount} отзывов</span>}
          {m.qnaCount !== undefined && <span>· {m.qnaCount} вопросов</span>}
        </div>
      )}
      {m.purchases !== undefined && (
        <div className="mt-1 text-xs text-ink/40">Купили {m.purchases}+ раз</div>
      )}

      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="text-base font-semibold">
          {free ? 'Бесплатно' : m.sale ? `от ${money.format(fromPrice)} ₽` : `${money.format(m.price)} ₽`}
        </span>
        <button
          type="button"
          onClick={() => onOpen(m)}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
        >
          {free || m.freePreview ? 'Посмотреть' : 'Купить'}
        </button>
      </div>
    </div>
  )
}

export default function MarketplaceHome() {
  const [gateFor, setGateFor] = useState<MaterialItem | null>(null)
  const [account, setAccount] = useState({ email: '', password: '' })
  const [created, setCreated] = useState(false)

  function closeGate() {
    setGateFor(null)
    setCreated(false)
    setAccount({ email: '', password: '' })
  }

  return (
    <div>
      <PageHero
        eyebrow="Карьерный Юрист"
        title="Маркетплейс"
        description="Каталог полезных материалов для юридической карьеры: гайды, чек-листы, лонглисты, статьи и вебинары."
        prototype
      />

      {/* Один блок с объяснением, что это такое */}
      <section className="border-b border-ink/10 bg-white py-10">
        <div className="container-page">
          <div className="glass rounded-2xl p-6 sm:p-8">
            <p className="max-w-2xl text-ink/70">
              Маркетплейс — это каталог платных и бесплатных материалов от «Карьерного юриста»: то, что
              обычно узнается методом проб и ошибок, здесь собрано в готовые гайды, чек-листы, подборки
              компаний, статьи и записи вебинаров. Купленные и открытые материалы сохраняются в личном
              кабинете — доступны в любой момент.
            </p>
          </div>
        </div>
      </section>

      {sections.map((s) => {
        const items = materials.filter((m) => m.kind === s.kind)
        if (items.length === 0) return null
        return (
          <section key={s.kind} className="border-b border-ink/10 py-12 last:border-b-0">
            <div className="container-page">
              <div className="mb-1 text-sm font-medium uppercase tracking-wide text-gold">{s.title}</div>
              <p className="mb-6 max-w-xl text-sm text-ink/60">{s.text}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => <ProductCard key={m.id} m={m} onOpen={setGateFor} />)}
              </div>
            </div>
          </section>
        )
      })}

      {/* Гейт создания аккаунта — при просмотре/покупке любого материала */}
      {gateFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGate()
          }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:p-8">
            {created ? (
              <div className="py-4 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                </div>
                <div className="font-semibold">Аккаунт создан</div>
                <p className="mt-2 text-sm text-ink/60">
                  «{gateFor.title}» сохранен в личном кабинете — там же будут храниться все купленные и открытые материалы.
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
                  Чтобы открыть «{gateFor.title}», сохраните его в личном кабинете — там же будут все ваши материалы.
                </p>
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!account.email.trim()) return
                    setCreated(true)
                  }}
                >
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
