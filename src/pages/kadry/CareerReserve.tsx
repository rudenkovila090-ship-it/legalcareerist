import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import { submitLead } from '../../lib/leads'

const proof = [
  { value: '8 000+', label: 'кандидатов в кадровом резерве' },
  { value: '20+', label: 'позиций закрыто' },
  { value: '2 мин', label: 'чтобы подать заявку' },
]

function IconHandshake() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3.5 12.5l3.7-3.7a2 2 0 0 1 2.83 0l1.47 1.47M20.5 12.5l-3.7-3.7a2 2 0 0 0-2.83 0L12.5 10.3" />
      <path d="M7.2 10.8l-3.7 3.7 3 3a2 2 0 0 0 2.83 0l.5-.5M16.8 10.8l3.7 3.7-3 3a2 2 0 0 1-2.83 0l-3.37-3.37a1.5 1.5 0 0 1 0-2.12v0a1.5 1.5 0 0 1 2.12 0l1.25 1.25" />
    </svg>
  )
}
function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  )
}
function IconFlagCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M6 21V4" />
      <path d="M6 4.5h12l-3 3.5 3 3.5H6" />
    </svg>
  )
}

const benefits = [
  { icon: IconHandshake, title: 'Подбор без лишних хлопот', text: 'Берем переговоры с работодателем на себя — вам не нужно самим искать вакансии и откликаться.' },
  { icon: IconTarget, title: 'Только релевантные вакансии', text: 'Предлагаем позиции, которые реально подходят под ваш опыт и ожидания — без спама.' },
  { icon: IconFlagCheck, title: 'Сопровождение до оффера', text: 'Готовим к встрече с работодателем и на связи до самого выхода на позицию.' },
]

const steps = [
  { title: 'Подаете заявку на вступление в кадровый резерв', text: 'Специализация, опыт, ожидания по зарплате и формату работы — 2 минуты.' },
  { title: 'Попадаете в кадровый резерв', text: 'Мы держим связь и предлагаем вакансии, которые реально подходят — без спама нерелевантными офферами.' },
  { title: 'Скрининг по релевантной вакансии', text: 'Проводим короткий созвон, если появляется подходящая вакансия и вы отметили, что хотите на нее откликнуться.' },
  { title: 'Собеседование и оффер', text: 'Мы готовим вас к встрече с работодателем и сопровождаем до выхода на позицию.' },
]

const cascade = [
  { title: 'Резиденты Сообщества', text: 'Видят новые вакансии первыми — иногда за несколько дней до открытого рынка.' },
  { title: 'Кадровый резерв', text: 'Следующими получают предложение те, кто уже в нашей базе 8 000+ кандидатов.' },
  { title: 'Открытый рынок', text: 'Если позиция не закрылась резидентами или резервом — публикуем ее в открытом доступе.' },
]

const positions = [
  'Помощник юриста', 'Помощник адвоката', 'Младший юрист', 'Секретарь',
  'Секретарь судебного заседания', 'Секретарь нотариальной конторы',
  'Делопроизводитель', 'Помощник патентного поверенного',
  'Помощник арбитражного управляющего', 'Офис-менеджер', 'Бизнес-ассистент', 'SMM-специалист',
]

const faqItems = [
  { q: 'Сколько это стоит для меня?', a: 'Нисколько — расходы на подбор мы берем на себя.' },
  { q: 'Что если мне ничего не предложат сразу?', a: 'Заявка остается в кадровом резерве — мы возвращаемся к ней, как только появляется подходящая вакансия.' },
  { q: 'Как быстрее получить доступ к вакансиям?', a: 'Резиденты Сообщества видят новые вакансии первыми. Подробнее — на странице «Сообщество».' },
  { q: 'Какой опыт нужен?', a: 'Мы работаем с начинающими и средними специалистами — студентами последних курсов, выпускниками, помощниками с небольшим опытом.' },
]

const railItems = [
  { id: 'hero', label: 'Кадровый резерв' },
  { id: 'how', label: 'Как это работает' },
  { id: 'access', label: 'Доступ к вакансиям' },
  { id: 'positions', label: 'Позиции' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'faq', label: 'FAQ' },
]

export default function CareerReserve({ embedded = false }: { embedded?: boolean }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', telegram: '', position: '' })
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [sent, setSent] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'candidate_application',
      name: form.name,
      contact: [form.email, form.phone, form.telegram].filter(Boolean).join(' / '),
      interest: [form.position, resumeFile ? `Резюме: ${resumeFile.name}` : ''].filter(Boolean),
    })
    setSent(true)
  }

  const [priorityForm, setPriorityForm] = useState({ name: '', phone: '', email: '', telegram: '' })
  const [priorityResumeFile, setPriorityResumeFile] = useState<File | null>(null)
  const [prioritySent, setPrioritySent] = useState(false)

  function handlePrioritySubmit(e: FormEvent) {
    e.preventDefault()
    if (!priorityForm.name.trim() || !priorityForm.phone.trim()) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'reserve_join_request',
      name: priorityForm.name,
      contact: [priorityForm.phone, priorityForm.email, priorityForm.telegram].filter(Boolean).join(' / '),
      interest: ['Вступление в кадровый резерв', priorityResumeFile ? `Резюме: ${priorityResumeFile.name}` : ''].filter(Boolean),
    })
    setPrioritySent(true)
  }

  return (
    <div>
      <SectionRail items={railItems} />

      {!embedded && (
        <div id="hero">
          <PageHero
            eyebrow="Кадры · Соискателям"
            title="Кадровый резерв: бесплатный подбор работы для юристов"
            description="Подайте заявку один раз — мы будем предлагать вам релевантные вакансии, пока не найдется подходящая."
          />
        </div>
      )}

      {!embedded && (
        <div className="container-page flex flex-wrap gap-3 pt-8">
          <Link to="/kadry/candidates" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-medium text-ink/60 hover:text-ink">
            ← Соискателям
          </Link>
          <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white">Кадровый резерв</span>
          <Link to="/kadry/candidates/consultation" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-medium text-ink/60 hover:text-ink">
            Карьерная консультация
          </Link>
        </div>
      )}

      {/* Что такое кадровый резерв — вводный блок, наполнение уточняется */}
      <section className="container-page pt-10">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Что такое кадровый резерв</div>
        <div className="rounded-2xl border border-dashed border-ink/15 p-10 text-center text-sm text-ink/30">
          Раздел «Что такое кадровый резерв» — наполнение уточняется
        </div>
      </section>

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
          <h2 className="mb-6 text-2xl font-semibold">Почему стоит вступить в резерв</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="glass rounded-xl p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-gold-light/25 text-ink">
                  <b.icon />
                </div>
                <div className="font-semibold">{b.title}</div>
                <p className="mt-2 text-sm text-ink/60">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Как это работает */}
      <section id="how" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Как это работает</div>
        <h2 className="mb-6 text-2xl font-semibold">От заявки до выхода на работу</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="glass rounded-xl p-5">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gold-light/30 text-sm font-semibold text-ink">
                {i + 1}
              </div>
              <div className="font-semibold">{s.title}</div>
              <p className="mt-2 text-sm text-ink/60">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Доступ к вакансиям */}
      <section id="access" className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Доступ к вакансиям</div>
          <h2 className="mb-2 text-2xl font-semibold">Кто узнает о новых вакансиях первым</h2>
          <p className="mb-6 text-sm text-ink/60">
            Вакансия открывается по приоритету, прежде чем попасть в открытый доступ — чем раньше вы в нашей базе, тем выше шанс успеть.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {cascade.map((c, i) => (
              <div key={c.title} className="glass rounded-xl p-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Приоритет {i + 1}</div>
                <div className="font-semibold">{c.title}</div>
                <p className="mt-2 text-sm text-ink/60">{c.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl bg-ink px-6 py-8 text-white sm:px-10 sm:py-10">
            <div className="text-center">
              <div className="text-xl font-semibold">Хотите попасть в кадровый резерв?</div>
              <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
                Оставьте контакты — добавим вас в кадровый резерв и будем предлагать релевантные
                вакансии по приоритету, до того как они попадут в открытый доступ.
              </p>
            </div>

            {prioritySent ? (
              <div className="mx-auto mt-6 max-w-md rounded-xl bg-white/10 p-6 text-center">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm text-white/70">Мы свяжемся с вами, чтобы оформить вступление в кадровый резерв.</p>
              </div>
            ) : (
              <form className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-2" onSubmit={handlePrioritySubmit}>
                <input
                  className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="ФИО"
                  value={priorityForm.name}
                  onChange={(e) => setPriorityForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Номер телефона"
                  value={priorityForm.phone}
                  onChange={(e) => setPriorityForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Почта"
                  value={priorityForm.email}
                  onChange={(e) => setPriorityForm((f) => ({ ...f, email: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Telegram"
                  value={priorityForm.telegram}
                  onChange={(e) => setPriorityForm((f) => ({ ...f, telegram: e.target.value }))}
                />
                <label className="col-span-full flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-white/25 bg-white/5 px-4 py-3 text-sm text-white/60 hover:border-white/40">
                  <span>{priorityResumeFile ? priorityResumeFile.name : 'Загрузить резюме (PDF)'}</span>
                  <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">Выбрать файл</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setPriorityResumeFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="submit"
                  className="col-span-full rounded-full bg-gold-light py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
                >
                  Вступить в кадровый резерв
                </button>
                <p className="col-span-full text-center text-xs text-white/50">
                  Нажимая «Вступить в кадровый резерв», вы соглашаетесь на обработку персональных данных.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Какие позиции */}
      <section id="positions" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Какие позиции</div>
        <h2 className="mb-6 text-2xl font-semibold">С чем мы чаще всего помогаем</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {positions.map((p) => (
            <div key={p} className="rounded-lg bg-ink/[0.04] px-4 py-3 text-sm font-medium">{p}</div>
          ))}
        </div>
      </section>

      {/* Отзывы */}
      <div id="reviews">
        <Testimonials />
      </div>

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={faqItems} title="Вопросы о кадровом резерве" />
      </div>

      {/* Доп. призыв к действию + заявка */}
      <section id="lead-form" className="bg-ink py-16 text-white">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Оставить заявку</div>
            <h2 className="mb-4 text-3xl font-semibold">Расскажите о себе — подберем подходящие вакансии</h2>
            <p className="text-white/70">
              Опишите специализацию и опыт — свяжемся, как только появится подходящая позиция. Подбор для соискателей бесплатный.
            </p>
          </div>

          <div className="glass-dark rounded-2xl p-6 sm:p-8">
            {sent ? (
              <div className="rounded-xl bg-white/10 p-6 text-center">
                <div className="text-lg font-semibold">Заявка отправлена</div>
                <p className="mt-2 text-sm text-white/70">Мы свяжемся с вами, как только появится подходящая вакансия.</p>
              </div>
            ) : (
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
                <input
                  className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Имя"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Специализация / позиция"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Почта"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Номер телефона"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  placeholder="Telegram"
                  value={form.telegram}
                  onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                />
                <label className="col-span-full flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-white/25 bg-white/5 px-4 py-3 text-sm text-white/60 hover:border-white/40">
                  <span>{resumeFile ? resumeFile.name : 'Загрузить резюме (PDF)'}</span>
                  <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">Выбрать файл</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="submit"
                  className="col-span-full rounded-lg bg-gold-light py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
                >
                  Отправить заявку
                </button>
                <p className="col-span-full text-xs text-white/50">
                  Нажимая «Отправить заявку», вы соглашаетесь на обработку персональных данных.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
