import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import { submitLead } from '../../lib/leads'
import { consultationCategories, allConsultationServices, tierDiscountPct } from '../../data/consultationServices'

const proof = [
  { value: '50+', label: 'проведённых консультаций' },
  { value: '2+ года', label: 'в сфере Legal HR' },
  { value: 'Legal Tech', label: 'магистратура НИУ ВШЭ' },
]

// Минималистичные иконки для категорий услуг конструктора — по одной на
// категорию, без внешних библиотек.
function IconDoc() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  )
}
function IconCompass() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15 9l-2 6-6 2 2-6 6-2z" />
    </svg>
  )
}
function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4.5 12a7.5 7.5 0 0 1 12.6-5.5M19.5 12a7.5 7.5 0 0 1-12.6 5.5" />
      <path d="M17 3.5v3.5h-3.5M7 20.5V17h3.5" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3.5l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L12 15.7l-5 2.8 1.2-5.5-4.2-3.8 5.6-.6L12 3.5z" />
    </svg>
  )
}

const categoryIcons: Record<string, typeof IconDoc> = {
  'Резюме и сопроводительное письмо': IconDoc,
  'Подготовка к трудоустройству': IconTarget,
  'Карьерное консультирование': IconCompass,
  'Карьерные переходы и кризисы': IconRefresh,
  'Личный бренд': IconStar,
}

const benefits = [
  { title: 'Конкретный план, а не общие слова', text: 'Уходите с созвона со списком следующих шагов, а не с абстрактной мотивацией.' },
  { title: 'Понимание рынка изнутри', text: 'Ведёт консультант, который сам подбирает юристов и знает, на что смотрят работодатели.' },
  { title: 'Свой набор услуг', text: 'Берёте только то, что нужно именно вам — от разбора резюме до полного сопровождения поиска.' },
]

const who = [
  'Студентам-юристам, которые не знают, с чего начать поиск первой работы',
  'Юристам, которые хотят сменить специализацию или направление',
  'Тем, кто готовится к важному собеседованию',
  'Тем, кто чувствует выгорание или карьерный тупик',
  'Тем, кому нужен свежий взгляд на резюме и стратегию поиска',
]

const outcomes = [
  'Понимание, что делать дальше',
  'Уверенность в своих сильных сторонах',
  'Ответы на вопросы по поиску работы и собеседованиям',
  'Конкретный план действий',
  'Понимание, как презентовать себя работодателю',
  'Ощущение, что вы не один на один со своей карьерной ситуацией',
]

const process = [
  'Узнаём ваш запрос и текущую ситуацию',
  'Объясняем, какой формат подойдёт именно вам',
  'Выбираем удобную дату и время',
  'На созвоне подробно разбираем вашу ситуацию в формате открытого диалога',
  'Отвечаем на дополнительные вопросы',
  'После консультации у вас остаётся план действий',
]

const faqItems = [
  { q: 'Можно взять только одну услугу?', a: 'Да, конструктор работает от одной позиции — скидка появляется от двух услуг в заказе.' },
  { q: 'Как считаются скидки?', a: 'От 2 услуг в заказе — скидка 5%, от 3 услуг — скидка 10%. Скидка применяется автоматически ко всей корзине.' },
  { q: 'Что даёт промокод резидента?', a: 'По промокоду KQresident одна услуга в заказе (самая недорогая) предоставляется бесплатно — доступно резидентам Сообщества.' },
  { q: 'Как проходит консультация?', a: 'По видеосвязи в удобное для вас время, 60 минут — открытый диалог, а не лекция.' },
]

const railItems = [
  { id: 'hero', label: 'Консультация' },
  { id: 'who', label: 'Кому подойдёт' },
  { id: 'services', label: 'Услуги' },
  { id: 'outcomes', label: 'Что получите' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'faq', label: 'FAQ' },
]

export default function CareerConsultation() {
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [promo, setPromo] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', telegram: '', phone: '' })
  const [sent, setSent] = useState(false)

  const selectedServices = useMemo(() => allConsultationServices.filter((s) => selected[s.id]), [selected])
  const count = selectedServices.length
  const subtotal = selectedServices.reduce((sum, s) => sum + s.price, 0)
  const tierPct = tierDiscountPct(count)
  const tierDiscount = Math.round((subtotal * tierPct) / 100)
  const isResidentPromo = promo.trim().toLowerCase() === 'kqresident'
  const cheapest = count ? Math.min(...selectedServices.map((s) => s.price)) : 0
  const promoDiscount = isResidentPromo ? cheapest : 0
  const total = Math.max(0, subtotal - tierDiscount - promoDiscount)

  function toggle(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !count) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'consultation_order',
      name: form.name,
      contact: [form.email, form.telegram, form.phone].filter(Boolean).join(' / '),
      interest: [
        ...selectedServices.map((s) => s.title),
        promo.trim() ? `Промокод: ${promo.trim()}` : '',
        `Итого: ${total.toLocaleString('ru-RU')} ₽`,
      ].filter(Boolean),
    })
    setSent(true)
  }

  return (
    <div>
      <SectionRail items={railItems} />

      <div id="hero">
        <PageHero
          eyebrow="Кадры · Соискателям"
          title="Карьерная консультация: понятный план вместо общих советов"
          description="Разбираем вашу карьерную ситуацию, готовим к собеседованиям и помогаем выстроить стратегию поиска работы — соберите свой набор услуг под задачу."
        />
      </div>

      <div className="container-page flex flex-wrap gap-3 pt-8">
        <Link to="/kadry/candidates" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-medium text-ink/60 hover:text-ink">
          ← Соискателям
        </Link>
        <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white">Карьерная консультация</span>
        <Link to="/kadry/candidates/reserve" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-medium text-ink/60 hover:text-ink">
          Кадровый резерв
        </Link>
      </div>

      {/* Соц. доказательства */}
      <section className="container-page py-12">
        <div className="grid gap-3 sm:grid-cols-3">
          {proof.map((p) => (
            <div key={p.label} className="rounded-xl border border-ink/10 bg-white p-4">
              <div className="text-2xl font-semibold text-ink">{p.value}</div>
              <div className="mt-1 text-sm text-ink/60">{p.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Преимущества */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Преимущества</div>
          <h2 className="mb-6 text-2xl font-semibold">Почему стоит прийти на консультацию</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="glass rounded-xl p-5">
                <div className="font-semibold">{b.title}</div>
                <p className="mt-2 text-sm text-ink/60">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Кому подойдёт */}
      <section id="who" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Кому подойдёт</div>
        <h2 className="mb-6 text-2xl font-semibold">Это для вас, если</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {who.map((item) => (
            <li key={item} className="flex gap-2 rounded-lg bg-ink/[0.04] p-4 text-sm">
              <span className="text-ink">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* Конструктор услуг */}
      <section id="services" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Услуги</div>
          <h2 className="mb-2 text-2xl font-semibold">Соберите свою консультацию</h2>
          <p className="mb-8 max-w-2xl text-sm text-ink/60">
            Выбирайте нужные услуги — заказ и стоимость собираются внизу справа. От 2 услуг — скидка 5%, от 3 — 10%.
          </p>

          <div className="space-y-8">
            {consultationCategories.map((cat) => {
              const CatIcon = categoryIcons[cat.title]
              return (
                <div key={cat.title}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/50">{cat.title}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.services.map((s) => {
                      const isSelected = !!selected[s.id]
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggle(s.id)}
                          className={`flex flex-col items-start gap-3 rounded-xl border p-4 text-left text-sm transition-colors ${
                            isSelected ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white hover:border-ink/30'
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${
                              isSelected ? 'bg-white/15 text-white' : 'bg-gold-light/20 text-ink'
                            }`}
                          >
                            <CatIcon />
                          </span>
                          <span className="font-medium">{s.title}</span>
                          <span className="flex w-full items-center justify-between">
                            <span className={isSelected ? 'text-white/70' : 'text-ink/50'}>{s.price.toLocaleString('ru-RU')} ₽</span>
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                isSelected ? 'bg-white text-ink' : 'bg-ink/10 text-ink'
                              }`}
                            >
                              {isSelected ? '✓' : '+'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Что вы получите */}
      <section id="outcomes" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Что вы получите</div>
        <h2 className="mb-6 text-2xl font-semibold">После консультации у вас будет</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {outcomes.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-ink/70">
              <span className="text-ink">✓</span>
              {item}
            </li>
          ))}
        </ul>

        <h3 className="mb-4 mt-12 text-lg font-semibold">Как проходит работа</h3>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {process.map((item, i) => (
            <li key={item} className="glass rounded-xl p-4 text-sm">
              <span className="mr-2 font-semibold text-gold">{i + 1}.</span>
              {item}
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-6 rounded-2xl border border-ink/10 p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink text-lg font-semibold text-white">РИ</div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Проводит консультацию</div>
            <div className="text-lg font-semibold">Руденков Илья — основатель «Карьерного юриста»</div>
            <p className="mt-2 text-sm text-ink/60">
              Больше 2 лет работает в сфере Legal HR, провёл более 50 карьерных консультаций. Юрист по персональным данным
              и рекламному праву, студент магистратуры Legal Tech в НИУ ВШЭ, карьерный консультант.
            </p>
          </div>
        </div>
      </section>

      {/* Отзывы */}
      <div id="reviews">
        <Testimonials />
      </div>

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={faqItems} title="Вопросы о консультациях" />
      </div>

      {/* Доп. призыв к действию */}
      <section className="container-page pb-16">
        <div className="rounded-2xl bg-ink px-6 py-10 text-center text-white sm:px-10">
          <div className="text-xl font-semibold">Не уверены, какая услуга нужна?</div>
          <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
            Напишите в Telegram — подскажем, с чего лучше начать, и поможем собрать заказ.
          </p>
          <a
            href="https://t.me/legalcareerst_support"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block rounded-full bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
          >
            Написать в Telegram
          </a>
        </div>
      </section>

      {/* Плавающая корзина */}
      {count > 0 && !modalOpen && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="glass-dark fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-ink px-5 py-3 text-white shadow-xl"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold-light text-xs font-bold text-ink">{count}</span>
          <span className="text-sm font-semibold">{total.toLocaleString('ru-RU')} ₽</span>
        </button>
      )}

      {/* Модалка оформления заказа */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:p-8">
            {sent ? (
              <div className="py-8 text-center">
                <div className="text-lg font-semibold">Заявка отправлена</div>
                <p className="mt-2 text-sm text-ink/60">Мы свяжемся с вами, чтобы согласовать дату и время консультации.</p>
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false)
                    setSent(false)
                    setSelected({})
                  }}
                  className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Ваш заказ</h3>
                  <button type="button" onClick={() => setModalOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">
                    ✕
                  </button>
                </div>

                <ul className="mb-4 space-y-2 text-sm">
                  {selectedServices.map((s) => (
                    <li key={s.id} className="flex items-center justify-between">
                      <span className="text-ink/70">{s.title}</span>
                      <span className="flex items-center gap-2">
                        <span>{s.price.toLocaleString('ru-RU')} ₽</span>
                        <button type="button" onClick={() => toggle(s.id)} className="text-ink/30 hover:text-ink" aria-label="Убрать">
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>

                <input
                  className="mb-3 w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  placeholder="Промокод (необязательно)"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                />

                <div className="space-y-1 border-t border-ink/10 pt-3 text-sm">
                  <div className="flex justify-between text-ink/60">
                    <span>Сумма</span>
                    <span>{subtotal.toLocaleString('ru-RU')} ₽</span>
                  </div>
                  {tierDiscount > 0 && (
                    <div className="flex justify-between text-ink/60">
                      <span>Скидка за количество ({tierPct}%)</span>
                      <span>−{tierDiscount.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  )}
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-ink/60">
                      <span>Промокод резидента</span>
                      <span>−{promoDiscount.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-base font-semibold text-ink">
                    <span>Итого</span>
                    <span>{total.toLocaleString('ru-RU')} ₽</span>
                  </div>
                </div>

                <form className="mt-5 grid gap-3" onSubmit={handleSubmit}>
                  <input
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    placeholder="ФИО"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      placeholder="Почта"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                    <input
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      placeholder="Telegram"
                      value={form.telegram}
                      onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                    />
                    <input
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                      placeholder="Телефон"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90">
                    Оформить заявку
                  </button>
                  <p className="text-xs text-ink/50">Нажимая «Оформить заявку», вы соглашаетесь на обработку персональных данных.</p>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
