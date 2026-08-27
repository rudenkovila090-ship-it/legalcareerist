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

const benefits = [
  { title: 'Подбор без лишних хлопот', text: 'Берём переговоры с работодателем на себя — вам не нужно самим искать вакансии и откликаться.' },
  { title: 'Только релевантные вакансии', text: 'Предлагаем позиции, которые реально подходят под ваш опыт и ожидания — без спама.' },
  { title: 'Сопровождение до оффера', text: 'Готовим к встрече с работодателем и на связи до самого выхода на позицию.' },
]

const steps = [
  { title: 'Подаёте заявку на вступление в кадровый резерв', text: 'Специализация, опыт, ожидания по зарплате и формату работы — 2 минуты.' },
  { title: 'Попадаете в кадровый резерв', text: 'Мы держим связь и предлагаем вакансии, которые реально подходят — без спама нерелевантными офферами.' },
  { title: 'Скрининг по релевантной вакансии', text: 'Проводим короткий созвон, если появляется подходящая вакансия и вы отметили, что хотите на неё откликнуться.' },
  { title: 'Собеседование и оффер', text: 'Мы готовим вас к встрече с работодателем и сопровождаем до выхода на позицию.' },
]

const cascade = [
  { title: 'Резиденты Сообщества', text: 'Видят новые вакансии первыми — иногда за несколько дней до открытого рынка.' },
  { title: 'Кадровый резерв', text: 'Следующими получают предложение те, кто уже в нашей базе 8 000+ кандидатов.' },
  { title: 'Открытый рынок', text: 'Если позиция не закрылась резидентами или резервом — публикуем её в открытом доступе.' },
]

const positions = [
  'Помощник юриста', 'Помощник адвоката', 'Младший юрист', 'Секретарь',
  'Секретарь судебного заседания', 'Секретарь нотариальной конторы',
  'Делопроизводитель', 'Помощник патентного поверенного',
  'Помощник арбитражного управляющего', 'Офис-менеджер', 'Бизнес-ассистент', 'SMM-специалист',
]

const faqItems = [
  { q: 'Сколько это стоит для меня?', a: 'Нисколько — расходы на подбор мы берём на себя.' },
  { q: 'Что если мне ничего не предложат сразу?', a: 'Заявка остаётся в кадровом резерве — мы возвращаемся к ней, как только появляется подходящая вакансия.' },
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

export default function CareerReserve() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', position: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'candidate_application',
      name: form.name,
      contact: [form.email, form.phone].filter(Boolean).join(' / '),
      interest: form.position ? [form.position] : [],
    })
    setSent(true)
  }

  const [priorityForm, setPriorityForm] = useState({ name: '', phone: '', email: '', telegram: '' })
  const [prioritySent, setPrioritySent] = useState(false)

  function handlePrioritySubmit(e: FormEvent) {
    e.preventDefault()
    if (!priorityForm.name.trim() || !priorityForm.phone.trim()) return
    submitLead({
      sourceBlock: 'community',
      formType: 'priority_access_request',
      name: priorityForm.name,
      contact: [priorityForm.phone, priorityForm.email, priorityForm.telegram].filter(Boolean).join(' / '),
      interest: ['Приоритетный доступ к вакансиям — вступление в Сообщество'],
    })
    setPrioritySent(true)
  }

  return (
    <div>
      <SectionRail items={railItems} />

      <div id="hero">
        <PageHero
          eyebrow="Кадры · Соискателям"
          title="Кадровый резерв: бесплатный подбор работы для юристов"
          description="Подайте заявку один раз — мы будем предлагать вам релевантные вакансии, пока не найдётся подходящая."
        />
      </div>

      <div className="container-page flex flex-wrap gap-3 pt-8">
        <Link to="/kadry/candidates" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-medium text-ink/60 hover:text-ink">
          ← Соискателям
        </Link>
        <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white">Кадровый резерв</span>
        <Link to="/kadry/candidates/consultation" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-medium text-ink/60 hover:text-ink">
          Карьерная консультация
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
          <h2 className="mb-6 text-2xl font-semibold">Почему стоит вступить в резерв</h2>
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
          <h2 className="mb-2 text-2xl font-semibold">Кто узнаёт о новых вакансиях первым</h2>
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
              <div className="text-xl font-semibold">Хотите видеть вакансии первыми?</div>
              <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
                Резиденты Сообщества получают доступ к вакансиям раньше кадрового резерва и открытого рынка.
              </p>
            </div>

            {prioritySent ? (
              <div className="mx-auto mt-6 max-w-md rounded-xl bg-white/10 p-6 text-center">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm text-white/70">Мы свяжемся с вами, чтобы оформить вступление в Сообщество.</p>
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
                <button
                  type="submit"
                  className="col-span-full rounded-full bg-gold-light py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
                >
                  Вступить в Сообщество
                </button>
                <p className="col-span-full text-center text-xs text-white/50">
                  Нажимая «Вступить в Сообщество», вы соглашаетесь на обработку персональных данных.
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
            <h2 className="mb-4 text-3xl font-semibold">Расскажите о себе — подберём подходящие вакансии</h2>
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
