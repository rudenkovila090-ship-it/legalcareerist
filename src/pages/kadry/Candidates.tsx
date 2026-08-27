import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import FAQSection from '../../components/FAQSection'
import { submitLead } from '../../lib/leads'

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

const consultHelp = [
  'Резюме и сопроводительное письмо',
  'Подготовка к собеседованию',
  'Выбор специализации',
  'Поиск первой работы',
  'Карьерный кризис: выгорание, тупик, потеря интереса к рутине',
  'Карьерный переход в другое направление',
  'Составление стратегии поиска работы',
]

const consultProcess = [
  'Узнаём ваш запрос и текущую ситуацию',
  'Объясняем, какой формат подойдёт именно вам',
  'Выбираем удобную дату и время',
  'На созвоне подробно разбираем вашу ситуацию в формате открытого диалога',
  'Отвечаем на дополнительные вопросы',
  'После консультации у вас остаётся план действий',
]

const consultOutcomes = [
  'Понимание, что делать дальше',
  'Уверенность в своих сильных сторонах',
  'Ответы на вопросы по поиску работы и собеседованиям',
  'Конкретный план действий',
  'Понимание, как презентовать себя работодателю',
  'Ощущение, что вы не один на один со своей карьерной ситуацией',
]

const positions = [
  'Помощник юриста', 'Помощник адвоката', 'Младший юрист', 'Секретарь',
  'Секретарь судебного заседания', 'Секретарь нотариальной конторы',
  'Делопроизводитель', 'Помощник патентного поверенного',
  'Помощник арбитражного управляющего', 'Офис-менеджер', 'Бизнес-ассистент', 'SMM-специалист',
]

const faqItems = [
  { q: 'Сколько это стоит для меня?', a: 'Нисколько — подбор для соискателей бесплатный. Комиссию платит работодатель.' },
  { q: 'Что если мне ничего не предложат сразу?', a: 'Анкета остаётся в кадровом резерве — мы возвращаемся к ней, как только появляется подходящая вакансия.' },
  { q: 'Как быстрее получить доступ к вакансиям?', a: 'Резиденты Сообщества видят новые вакансии первыми. Подробнее — на странице «Сообщество».' },
  { q: 'Какой опыт нужен?', a: 'Мы работаем с начинающими и средними специалистами — студентами последних курсов, выпускниками, помощниками с небольшим опытом.' },
]

export default function Candidates() {
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

  return (
    <div>
      <PageHero
        eyebrow="Кадровое юридическое агентство"
        title="Ищете работу помощником юриста или адвоката?"
        description="Помогаем начинающим и средним специалистам юридического рынка найти работу — бесплатно для соискателя."
      />

      {/* Как это работает */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Как это работает</div>
        <h2 className="mb-6 text-2xl font-semibold">От анкеты до выхода на работу</h2>
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

      {/* Каскад доступа к вакансиям */}
      <section className="border-y border-ink/10 bg-white py-12">
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

          <div className="mt-8 rounded-2xl bg-ink px-6 py-8 text-center text-white sm:px-10">
            <div className="text-xl font-semibold">Хотите видеть вакансии первыми?</div>
            <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
              Резиденты Сообщества получают доступ к вакансиям раньше кадрового резерва и открытого рынка.
            </p>
            <Link
              to="/community"
              className="mt-5 inline-block rounded-full bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
            >
              Вступить в Сообщество
            </Link>
          </div>
        </div>
      </section>

      {/* Какие позиции */}
      <section className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Какие позиции</div>
        <h2 className="mb-6 text-2xl font-semibold">С чем мы чаще всего помогаем</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {positions.map((p) => (
            <div key={p} className="rounded-lg bg-ink/[0.04] px-4 py-3 text-sm font-medium">{p}</div>
          ))}
        </div>
      </section>

      {/* Карьерные консультации */}
      <section className="border-y border-ink/10 bg-white py-14">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Формат работы</div>
          <h2 className="mb-6 max-w-2xl text-2xl font-semibold">
            Карьерная консультация, подготовка к собеседованию и поддержка при поиске работы
          </h2>

          <div className="max-w-2xl space-y-3 text-sm leading-relaxed text-ink/70">
            <p>Чувствуете, что застряли в поиске работы, потеряли уверенность или не понимаете, куда двигаться дальше в карьере юриста?</p>
            <p>Мы помогаем юристам и студентам-юристам разобраться в карьерной ситуации, подготовиться к собеседованиям, выстроить стратегию поиска работы и снова почувствовать опору в себе.</p>
            <p>С нами можно прийти не только за «советом», а за понятным планом действий: что делать, куда откликаться, как говорить о себе, как проходить интервью и как не теряться в процессе поиска.</p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-lg font-semibold">С чем помогаем</h3>
              <ul className="space-y-2 text-sm text-ink/70">
                {consultHelp.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-gold">·</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">Что вы получите</h3>
              <ul className="space-y-2 text-sm text-ink/70">
                {consultOutcomes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-ink">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h3 className="mb-4 mt-12 text-lg font-semibold">Как проходит работа</h3>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {consultProcess.map((item, i) => (
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

          <div className="mt-8 text-center">
            <a
              href="#lead-form"
              onClick={(e) => {
                e.preventDefault()
                document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
            >
              Записаться на консультацию
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection items={faqItems} title="Вопросы соискателей" />

      {/* Анкета */}
      <section id="lead-form" className="bg-ink py-16 text-white">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Оставить анкету</div>
            <h2 className="mb-4 text-3xl font-semibold">Расскажите о себе — подберём подходящие вакансии</h2>
            <p className="text-white/70">
              Опишите специализацию и опыт — свяжемся, как только появится подходящая позиция. Подбор для соискателей бесплатный.
            </p>
          </div>

          <div className="glass-dark rounded-2xl p-6 sm:p-8">
            {sent ? (
              <div className="rounded-xl bg-white/10 p-6 text-center">
                <div className="text-lg font-semibold">Анкета отправлена</div>
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
                  Отправить анкету
                </button>
                <p className="col-span-full text-xs text-white/50">
                  Нажимая «Отправить анкету», вы соглашаетесь на обработку персональных данных.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
