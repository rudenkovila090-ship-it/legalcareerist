import { useState, type FormEvent } from 'react'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { kadryTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import { submitLead } from '../../lib/leads'

const stats = [
  { value: '8 000+', label: 'потенциальных кандидатов' },
  { value: '20+', label: 'позиций закрыто' },
  { value: '5–7', label: 'Time to Hire, дней' },
  { value: '30%', label: 'оплата от 1 зарплаты' },
]

// Простые линейные иконки — без внешних иконок, только inline SVG.
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}
function IconUserCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16.5 11.5l1.7 1.7 3-3.2" />
    </svg>
  )
}
function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12.6 3.5H5a1.5 1.5 0 0 0-1.5 1.5v7.6c0 .4.16.78.44 1.06l8.6 8.6c.6.6 1.53.6 2.12 0l6.8-6.8c.6-.6.6-1.53 0-2.12l-8.6-8.6a1.5 1.5 0 0 0-1.06-.44z" />
      <circle cx="8.2" cy="8.2" r="1.3" />
    </svg>
  )
}
function IconContent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3.5" y="4.5" width="17" height="13" rx="1.5" />
      <path d="M7 20h10M9 8.5h6M9 12h6M9 15h3.5" />
    </svg>
  )
}
function IconNetwork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="12" cy="18" r="2.3" />
      <path d="M7.7 7.3L10.5 16M16.3 7.3L13.5 16M8.3 6h7.4" />
    </svg>
  )
}
function IconDatabase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5V18c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V5.5" />
      <path d="M4.5 11.75c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    </svg>
  )
}
function IconHandshake() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3.5 12.5l3.7-3.7a2 2 0 0 1 2.83 0l1.47 1.47M20.5 12.5l-3.7-3.7a2 2 0 0 0-2.83 0L12.5 10.3" />
      <path d="M7.2 10.8l-3.7 3.7 3 3a2 2 0 0 0 2.83 0l.5-.5M16.8 10.8l3.7 3.7-3 3a2 2 0 0 1-2.83 0l-3.37-3.37a1.5 1.5 0 0 1 0-2.12v0a1.5 1.5 0 0 1 2.12 0l1.25 1.25" />
    </svg>
  )
}
function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="7.5" width="18" height="12" rx="1.8" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18M10.5 12.5v1.6h3v-1.6" />
    </svg>
  )
}

const valueProps = [
  { icon: IconClock, title: 'Не тратите время на поиск', text: 'Размещение вакансии, отсев нерелевантных откликов, десятки собеседований — берём на себя.' },
  { icon: IconUserCheck, title: 'Кандидаты уже мотивированы', text: 'Наша база — активное сообщество студентов и выпускников, а не случайные отклики с job-бордов.' },
  { icon: IconTag, title: 'Фиксированная стоимость заранее', text: 'Процент от оклада известен до старта поиска — без скрытых доплат и пересмотра условий на середине пути.' },
]

const kpis = [
  { value: '5,5 дней', label: 'Time to Hire — среднее время закрытия вакансии', group: 'Операционный' },
  { value: '89%', label: 'Конверсия интервью в оффер', group: 'Операционный' },
  { value: '100%', label: 'Доля кандидатов, прошедших испытательный срок', group: 'Качественный' },
]

const kadryAdvantages = [
  { title: 'Только юридический рынок', text: 'Специализируемся на начинающих и средних специалистах — понимаем их уровень, мотивацию и ожидания.' },
  { title: 'Собственная база 8 000+', text: 'Активное сообщество студентов и выпускников — кандидаты уже мотивированы и готовы к работе.' },
  { title: 'Оплата за результат', text: '30% от одного оклада кандидата: 75% предоплата до начала работ, 25% — после прохождения испытательного срока.' },
  { title: 'Бесплатная замена', text: 'Если кандидат не проходит испытательный срок — подбираем замену бесплатно в согласованные сроки.' },
]

// 8 этапов и документы, которые кандидат/заказчик получает на каждом из них —
// объединены в одну карточку на этап, чтобы не листать вверх-вниз между
// процессом и документами.
const processWithDocs = [
  { title: 'Формирование заказа', description: 'Приём заявки, формирование заказа.', docs: ['Бриф'] },
  { title: 'Согласование работ', description: 'Подписание договора, оплата, согласование вакансии.', docs: ['Договор', 'Счёт на оплату', 'Сформированный заказ', 'Вакансия'] },
  { title: 'Представление плана работы', description: 'Аналитика рынка, поиск, скрининг, собеседование — план действий.', docs: ['План работ по поиску сотрудника'] },
  { title: 'Поиск кандидатов', description: 'Закрытое сообщество, кадровый резерв, соцсети, рекомендации, чаты.', docs: ['Еженедельная отчётность'] },
  { title: 'Скрининг и интервью', description: 'Первичный звонок с кандидатом, формирование списка кандидатов.', docs: ['Еженедельная отчётность'] },
  { title: 'Передача кандидата', description: 'В виде карточек с рекомендациями.', docs: ['Кандидаты с резюме'] },
  { title: 'Собеседование', description: 'Ваш финальный выбор — собираем обратную связь, формируем оффер.', docs: ['Рекомендации по собеседованию', 'Оффер и/или отказ кандидату'] },
  { title: 'Испытательный срок', description: '1 месяц, гарантия 1 замены, обратная связь через месяц.', docs: ['План адаптации нового сотрудника', 'Рекомендации по коммуникации', 'Форма обратной связи'] },
]

const marketingChannels = [
  { icon: IconContent, title: 'Контент-маркетинг', text: 'Telegram-канал, YouTube, подкаст, ВК и другие соцсети.' },
  { icon: IconNetwork, title: 'Нетворкинг', text: 'Юридические мероприятия, конференции, форумы, рекомендации коллег и соискателей.' },
  { icon: IconDatabase, title: 'Своя база', text: 'Более 8 000 контактов, кадровый резерв.' },
  { icon: IconHandshake, title: 'Партнёрства', text: 'Юридические сообщества и организации, блогеры.' },
]

const positions = [
  { title: 'Помощник юриста', salary: 'от 20 000 ₽' },
  { title: 'Помощник адвоката', salary: 'от 20 000 ₽' },
  { title: 'Младший юрист', salary: 'от 60 000 ₽' },
  { title: 'Секретарь', salary: 'от 40 000 ₽' },
  { title: 'Секретарь судебного заседания', salary: 'от 50 000 ₽' },
  { title: 'Секретарь нотариальной конторы', salary: 'от 60 000 ₽' },
  { title: 'Делопроизводитель', salary: 'от 50 000 ₽' },
  { title: 'Помощник патентного поверенного', salary: 'от 50 000 ₽' },
  { title: 'Помощник арбитражного управляющего', salary: 'от 50 000 ₽' },
  { title: 'Офис-менеджер', salary: 'от 50 000 ₽' },
  { title: 'Бизнес-ассистент', salary: 'от 50 000 ₽' },
  { title: 'SMM-специалист', salary: 'от 50 000 ₽' },
]

const cases = [
  { title: 'Младший юрист по строительству', city: 'Санкт-Петербург', salary: '80 000 ₽', days: '2 дня' },
  { title: 'Помощник адвоката по семейным делам', city: 'Москва', salary: '20 000 ₽', days: '3 дня' },
  { title: 'Помощник юриста по банкротству', city: 'Санкт-Петербург', salary: '30 000 ₽', days: '1 день', note: 'рекордный срок' },
  { title: 'Помощник юридического маркетолога', city: undefined, salary: '30 000 ₽', days: '3 дня' },
  { title: 'Помощник адвоката по семейным делам', city: 'Москва', salary: '25 000 ₽', days: '5 дней' },
  { title: 'Помощник арбитражного управляющего', city: 'Санкт-Петербург', salary: '65 000 ₽', days: '7 дней' },
  { title: 'Помощник адвоката по уголовному праву', city: 'Санкт-Петербург', salary: '25 000 ₽', days: '3 дня' },
  { title: 'Секретарь нотариальной конторы', city: 'Санкт-Петербург', salary: '50 000 ₽', days: '3 дня' },
]

const faqItems = [
  { q: 'Сколько это стоит?', a: '30% от одного месячного оклада кандидата: 75% предоплата до начала работ, 25% — после прохождения испытательного срока.' },
  { q: 'Что если кандидат не подойдёт?', a: 'Бесплатно подберём замену в согласованные сроки — это часть условий сотрудничества, а не платная опция.' },
  { q: 'Сколько ждать первых кандидатов?', a: 'В среднем вакансия закрывается за 5–7 дней (Time to Hire — 5,5 дней). Есть кейсы закрытия за 1–3 дня.' },
  { q: 'Кого вы подбираете?', a: 'Помощников юристов и адвокатов, младших юристов, секретарей, офис-менеджеров и смежные административные позиции на юридическом рынке.' },
  { q: 'Где вы берёте кандидатов?', a: 'Сначала предлагаем вакансию резидентам нашего Сообщества, затем — кадровому резерву (8 000+ контактов), и только потом размещаем в открытом доступе.' },
  { q: 'Какие документы я получу?', a: 'Договор, план работ, еженедельную отчётность, карточки кандидатов с рекомендациями и план адаптации нового сотрудника — на каждом этапе своя подтверждающая документация.' },
]

export default function KadryHome() {
  const [salary, setSalary] = useState(50000)
  const fee = Math.round(salary * 0.3)
  const prepay = Math.round(fee * 0.75)
  const afterProbation = fee - prepay

  const [form, setForm] = useState({ name: '', email: '', phone: '', position: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'employer_request',
      name: form.name,
      contact: [form.email, form.phone].filter(Boolean).join(' / '),
      interest: form.position ? [form.position] : [],
    })
    setSent(true)
  }

  return (
    <div>
      <PageHero
        eyebrow="Кадровое юридическое агентство"
        title="Находим сотрудников для юридических фирм — без лишних собеседований и потраченного времени"
        description="Подбор помощников, младших юристов, офис-менеджеров — быстро и точно."
      />

      <section className="container-page py-12">
        <div className="grid gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-ink/10 bg-white p-4">
              <div className="text-2xl font-semibold text-ink">{s.value}</div>
              <div className="mt-1 text-sm text-ink/60">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* О компании */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">О компании</div>
          <h2 className="mb-6 text-2xl font-semibold">Почему работодатели выбирают нас</h2>
          <div className="grid gap-8 lg:grid-cols-2">
            <p className="text-ink/60">
              Мы работаем исключительно с юридическим рынком на уровне начинающих специалистов. Мы не
              универсальный рекрутер, случайно попавший в юридическую нишу — знаем рынок изнутри,
              понимаем специфику профессии и говорим с кандидатами на одном языке с первого дня.
            </p>
            <p className="text-ink/60">
              За кандидатами не нужно идти на открытый рынок: у нас собственная база из 8 000+
              контактов и активное сообщество студентов-юристов, из которого вакансия закрывается в
              среднем за 5–7 дней — с гарантией бесплатной замены, если кандидат не пройдёт
              испытательный срок.
            </p>
          </div>
        </div>
      </section>

      {/* Польза */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">В чём наша польза</div>
        <h2 className="mb-6 text-2xl font-semibold">Что вы получаете, работая с нами</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {valueProps.map((v) => (
            <div key={v.title} className="glass flex gap-3 rounded-xl p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <v.icon />
              </div>
              <div>
                <div className="font-semibold">{v.title}</div>
                <p className="mt-1 text-sm text-ink/60">{v.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Кейсы и результаты */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Кейсы и результаты</div>
          <h2 className="mb-6 text-2xl font-semibold">Наши закрытые вакансии</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {cases.map((c, i) => (
              <div key={`${c.title}-${i}`} className="glass rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{c.title}</span>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Закрыто</span>
                </div>
                <div className="mt-1 text-sm text-ink/50">{c.city ?? 'Удалённо / любой город'} · {c.salary}</div>
                <div className="mt-2 text-sm text-ink/60">
                  <span className="font-medium text-ink">{c.days}</span> срок закрытия вакансии
                  {c.note && <span className="text-gold"> · {c.note}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/50">Ключевые показатели (KPI)</div>
            <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
              {kpis.map((k) => (
                <div key={k.label} className="glass-dark rounded-xl bg-ink p-5 text-white">
                  <div className="text-xs uppercase tracking-wide text-white/40">{k.group}</div>
                  <div className="mt-1 text-2xl font-semibold text-gold-light">{k.value}</div>
                  <div className="mt-1 text-sm text-white/60">{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Преимущества и выгоды */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Преимущества и выгоды</div>
        <h2 className="mb-6 text-2xl font-semibold">Чем мы отличаемся</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {kadryAdvantages.map((a) => (
            <div key={a.title} className="glass rounded-xl p-5">
              <div className="font-semibold">{a.title}</div>
              <p className="mt-1 text-sm text-ink/60">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Отзывы (компактнее, чем на других страницах) */}
      <Testimonials items={kadryTestimonials} compact />

      {/* Что мы предлагаем */}
      <section className="bg-ink py-12 text-white">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Что мы предлагаем</div>
          <h2 className="mb-6 text-2xl font-semibold text-white">Закрываем следующие позиции</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((p) => (
              <div key={p.title} className="flex items-center justify-between rounded-lg bg-white/10 px-4 py-3 text-sm">
                <span className="font-medium text-white">{p.title}</span>
                <span className="text-white/50">{p.salary}</span>
              </div>
            ))}
          </div>

          <h3 className="mb-2 mt-12 text-xl font-semibold text-white">Как мы работаем</h3>
          <p className="mb-6 text-sm text-white/60">8 этапов от заявки до выхода сотрудника — с документами, которые вы получаете на каждом из них.</p>
          <ol className="grid gap-4 sm:grid-cols-2">
            {processWithDocs.map((step, i) => (
              <li key={step.title} className="glass-dark rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-light/30 text-sm font-semibold text-white">
                    {i + 1}
                  </div>
                  <div className="font-semibold text-white">{step.title}</div>
                </div>
                <p className="mt-2 text-sm text-white/60">{step.description}</p>
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/40">Документы</div>
                  <ul className="space-y-0.5 text-sm text-white/70">
                    {step.docs.map((d) => <li key={d}>· {d}</li>)}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          <h3 className="mb-2 mt-14 text-xl font-semibold text-white">Как мы находим вам сотрудников</h3>
          <p className="mb-8 text-sm text-white/60">От заявки работодателя до найденного кандидата — как маршрут, который выстраивает навигатор, подсвечивая каналы поиска один за другим.</p>

          <div className="mx-auto max-w-3xl">
            <div className="relative h-28 w-full sm:h-36">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                <defs>
                  <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path
                  d="M 4 36 L 24 29 L 44 21 L 64 13 L 84 7 L 96 4"
                  fill="none"
                  stroke="rgba(111,147,196,0.18)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  id="route-path"
                  d="M 4 36 L 24 29 L 44 21 L 64 13 L 84 7 L 96 4"
                  fill="none"
                  stroke="transparent"
                  strokeWidth="1.4"
                />
                <path
                  className="route-build"
                  d="M 4 36 L 24 29 L 44 21 L 64 13 L 84 7 L 96 4"
                  pathLength={100}
                  fill="none"
                  stroke="#5ea1ff"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  filter="url(#route-glow)"
                />
                <circle r="1.6" fill="#eaf2ff" filter="url(#route-glow)">
                  <animateMotion dur="7s" repeatCount="indefinite">
                    <mpath href="#route-path" />
                  </animateMotion>
                </circle>
              </svg>

              <div className="glass-dark absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white" style={{ left: '4%', top: '90%' }}>
                <IconBriefcase />
              </div>
              <div className="glass-dark absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white" style={{ left: '96%', top: '10%' }}>
                <IconUserCheck />
              </div>
            </div>
            <div className="mb-8 flex justify-between text-[11px] text-white/50">
              <span>Заявка от работодателя</span>
              <span>Кандидат найден</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {marketingChannels.map((m, i) => (
                <div key={m.title} className="text-center">
                  <div className="mx-auto mb-2 h-1.5 w-1.5 rounded-full bg-gold-light" />
                  <div
                    className="route-pulse glass-dark h-full rounded-xl p-3 text-center"
                    style={{ animationDelay: `${i * 1.75}s` }}
                  >
                    <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-gold-light/30 text-white">
                      <m.icon />
                    </div>
                    <div className="text-xs font-semibold text-white">{m.title}</div>
                    <p className="mt-1 text-[11px] leading-snug text-white/50">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Цены */}
      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Цены</div>
          <h2 className="mb-6 text-2xl font-semibold">Прозрачная система оплаты и гарантий</h2>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <ul className="space-y-3 pt-1 text-sm text-ink/70">
              <li><strong className="text-ink">Оплата за результат</strong> — 30% от одного месячного оклада кандидата: 75% предоплата до начала работ, 25% после прохождения испытательного срока.</li>
              <li><strong className="text-ink">Бесплатная замена</strong> — если кандидат не проходит испытательный срок, подбираем замену бесплатно в согласованные сроки.</li>
              <li><strong className="text-ink">Прозрачная отчётность</strong> — регулярно сообщаем о ходе поиска; если подходящих кандидатов нет — честно предупреждаем.</li>
            </ul>

            <div className="glass rounded-2xl p-8 lg:-mt-1">
              <label className="text-base font-semibold text-ink">
                Оклад кандидата, ₽/мес
                <input
                  type="range"
                  min={20000}
                  max={150000}
                  step={5000}
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                  className="mt-4 w-full accent-ink"
                />
              </label>
              <div className="mt-1 text-lg font-medium text-ink/70">{salary.toLocaleString('ru-RU')} ₽/мес</div>

              <div className="mt-8">
                <div className="mx-auto w-fit rounded-xl bg-ink px-6 py-4 text-center text-white">
                  <div className="text-xs text-white/60">Комиссия 30%</div>
                  <div className="mt-1 text-2xl font-semibold text-gold-light">{fee.toLocaleString('ru-RU')} ₽</div>
                </div>

                <svg viewBox="0 0 200 36" className="mx-auto block h-9 w-56" aria-hidden="true">
                  <defs>
                    <marker id="calc-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" fill="rgba(40,57,83,0.55)" />
                    </marker>
                  </defs>
                  <path d="M72 2 L40 32" stroke="rgba(40,57,83,0.55)" strokeWidth="2.5" strokeLinecap="round" fill="none" markerEnd="url(#calc-arrow)" />
                  <path d="M128 2 L160 32" stroke="rgba(40,57,83,0.55)" strokeWidth="2.5" strokeLinecap="round" fill="none" markerEnd="url(#calc-arrow)" />
                </svg>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-ink p-4 text-center text-white">
                    <div className="text-xs text-white/60">75% предоплата</div>
                    <div className="mt-1 text-2xl font-semibold text-gold-light">{prepay.toLocaleString('ru-RU')} ₽</div>
                  </div>
                  <div className="rounded-xl bg-ink p-4 text-center text-white">
                    <div className="text-xs text-white/60">25% после срока</div>
                    <div className="mt-1 text-2xl font-semibold text-gold-light">{afterProbation.toLocaleString('ru-RU')} ₽</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection items={faqItems} />

      {/* Найти сотрудника — объединённый яркий CTA-блок с формой */}
      <section id="lead-form" className="scroll-mt-16 bg-ink py-16 text-white">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Найти сотрудника</div>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Расскажите о вакансии — запустим поиск уже сегодня</h2>
            <p className="mt-4 max-w-md text-white/60">
              Опишите, кого ищете — свяжемся, обсудим бриф и условия. Первая подборка кандидатов —
              обычно в течение 5–7 дней.
            </p>
          </div>

          <div className="glass-dark rounded-2xl p-8">
            {sent ? (
              <div className="rounded-xl bg-emerald-400/10 p-6 text-emerald-200">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm">Мы свяжемся с вами в ближайшее время.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Имя"
                    required
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="Кого ищем"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-gold-light py-3.5 text-sm font-semibold text-ink hover:opacity-90"
                >
                  Найти сотрудника
                </button>
                <p className="text-xs text-white/40">Нажимая «Найти сотрудника», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
