import { Link } from 'react-router-dom'
import FAQSection from '../components/FAQSection'
import ilyaPhoto from '../assets/ilya-rudenkov.jpg'

const kadryStats = [
  { value: '8 000+', label: 'потенциальных кандидатов' },
  { value: '20+', label: 'позиций закрыто' },
]

const communityStats = [
  { value: '80+', label: 'резидентов' },
]

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
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
function IconShieldCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3.5l7 2.5v6c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5v-6l7-2.5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

const valueProps = [
  {
    icon: IconClock,
    title: 'Экономия времени',
    text: 'Работодателю не нужно самому публиковать вакансию, отсеивать отклики и проводить десятки собеседований — эту работу берем на себя.',
  },
  {
    icon: IconNetwork,
    title: 'Карьера без связей',
    text: 'Студенту не нужно надеяться на случайные знакомства: закрытые вакансии и живое сообщество работают на вашу карьеру с первого курса.',
  },
  {
    icon: IconShieldCheck,
    title: 'Прозрачность рынка',
    text: 'Открытая модель оплаты, документы на каждом этапе, честная отчетность — вместо расплывчатых обещаний, привычных для рынка.',
  },
]

const kadryAdvantages = [
  { title: 'Только юридический рынок', text: 'Специализируемся на начинающих и средних специалистах — понимаем их уровень, мотивацию и ожидания.' },
  { title: 'Собственная база 8 000+', text: 'Активное сообщество студентов и выпускников — кандидаты уже мотивированы и готовы к работе.' },
  { title: 'Оплата за результат', text: '30% от одного оклада кандидата: 75% предоплата до начала работ, 25% — после прохождения испытательного срока.' },
  { title: 'Бесплатная замена', text: 'Если кандидат не проходит испытательный срок — подбираем замену бесплатно в согласованные сроки.' },
]

// Соответствует реальным услугам соискателям (см. /kadry/candidates) —
// не сообщество, а кадровый резерв и карьерные консультации.
const candidateBenefits = [
  { title: 'Подбор работы без лишних хлопот', text: 'Берем переговоры с работодателем на себя и сопровождаем от заявки до выхода на позицию.' },
  { title: 'Карьерные консультации', text: 'Резюме, подготовка к собеседованию, стратегия поиска — соберите свой набор услуг под задачу.' },
  { title: 'Только юридический рынок', text: 'Понимаем специфику профессии — говорим с вами на одном языке с первого дня.' },
  { title: 'Приоритет резидентам', text: 'Резиденты Сообщества видят новые вакансии первыми — раньше кадрового резерва и открытого рынка.' },
]

const faqItems = [
  { q: 'Что такое Карьерный юрист?', a: 'Кадровое агентство и сообщество для юридического рынка под одним брендом — под ним объединены подбор персонала для юридических фирм и закрытое сообщество студентов-юристов.' },
  { q: 'Чем вы занимаетесь?', a: 'Находим сотрудников для юридических фирм, помогаем соискателям с подбором работы и карьерными консультациями, объединяем студентов-юристов в закрытом сообществе.' },
  { q: 'Как заказать услугу?', a: 'Оставьте заявку удобным для вас способом, мы уточним детали задачи и подберем подходящий формат и специалиста.' },
  { q: 'Как понять, какая услуга мне нужна?', a: 'Опишите свою ситуацию при обращении — мы поможем определить, что решит вашу задачу быстрее всего: разовая консультация или комплексное сопровождение.' },
]

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-ink/10 bg-white">
        <div className="container-page py-16 text-center">
          <div className="mb-3 text-sm font-medium uppercase tracking-wide text-gold">Карьерный Юрист</div>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Карьера в праве строится легче — рядом со своими людьми
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-ink/60">
            Карьерный юрист — это кадровое агентство, которое помогает студентам и юристам расти,
            находить работу и строить карьеру через сообщества, мероприятия и консультации.
          </p>
          <div className="mx-auto mt-8 grid max-w-xl gap-4 sm:grid-cols-2">
            <Link to="/kadry/employers" className="rounded-2xl bg-ink p-5 text-center text-white shadow-lg transition-transform hover:-translate-y-0.5">
              <div className="text-lg font-semibold">Кадры</div>
              <div className="mt-1 text-sm text-white/70">Найдем сотрудника</div>
            </Link>
            <Link to="/community" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-transform hover:-translate-y-0.5">
              <div className="text-lg font-semibold">Сообщество</div>
              <div className="mt-1 text-sm text-ink/60">Студент или начинающий юрист?</div>
            </Link>
          </div>
        </div>
      </section>

      {/* О компании */}
      <section className="container-page py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-gold">О компании</div>
            <h2 className="mt-2 text-2xl font-semibold">Почему нам доверяют</h2>
            <p className="mt-3 text-ink/60">
              «Карьерный юрист» помогает находить работу, растить карьеру и заводить своих людей —
              студентам, начинающим юристам, а также юридическим фирмам и инхаус-командам, которым
              нужен сотрудник, но некому и некогда его искать.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink/70">
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" /><span>Основатель — практикующий юрист по персональным данным и карьерный консультант, изнутри понимающий и рынок труда, и профессию.</span></li>
              <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" /><span>Работаем только с юридическим рынком — не универсальный рекрутинг, а понимание специфики профессии.</span></li>
            </ul>
          </div>
          <div className="glass flex gap-5 rounded-xl p-6">
            <img
              src={ilyaPhoto}
              alt="Илья Руденков"
              style={{ objectPosition: '50% 22%' }}
              className="h-20 w-20 shrink-0 rounded-full object-cover shadow-md ring-4 ring-white"
            />
            <div>
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Основатель</div>
              <div className="mt-1 text-xl font-semibold">Илья Руденков</div>
              <ul className="mt-3 space-y-1.5 text-sm text-ink/60">
                <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" /><span>Основатель «Карьерного юриста»</span></li>
                <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" /><span>Юрист по персональным данным</span></li>
                <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" /><span>Карьерный консультант для студентов и юристов</span></li>
                <li className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" /><span>Студент НИУ ВШЭ по программе Legal Tech</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-8 border-t border-ink/10 pt-14 lg:grid-cols-2">
          <div className="space-y-4 text-ink/60">
            <p>
              Карьерный юрист — это пространство возможностей для юридического рынка, где каждая
              аудитория находит свое.
            </p>
            <p>
              <strong className="font-semibold text-ink">Кадровое агентство</strong> — это основа
              нашей деятельности. Мы помогаем юридическим фирмам, адвокатским образованиям, юристам,
              адвокатам, нотариусам, арбитражным управляющим и другим юридическим профессиям
              находить себе сотрудников — таких как помощники, младшие юристы, офис-менеджеры и
              другие специалисты, без которых не работает ни одна практика.
            </p>
            <p>
              Другое направление — <strong className="font-semibold text-ink">сообщество</strong>{' '}
              для студентов-юристов. Это более тесный круг, где мы обмениваемся знаниями и опытом.
              Резиденты получают вакансии в приоритетном порядке — часто раньше, чем они появляются
              в открытом доступе, а иногда такие предложения вообще не выходят за пределы
              сообщества.
            </p>
            <p>
              Третье направление — <strong className="font-semibold text-ink">ивент-агентство</strong>.
              Мы создаем и организовываем мероприятия для студентов и собственные события. Сейчас к
              нам все чаще приходят запросы от юридических компаний, которые хотят организовать
              встречи со студентами, найти точки соприкосновения с будущими сотрудниками.
            </p>
          </div>
          <div className="space-y-4 text-ink/60">
            <div className="text-sm font-medium uppercase tracking-wide text-gold">Миссия</div>
            <p>
              Миссия «Карьерного юриста» — не просто помочь человеку найти работу, определиться с
              направлением или найти себе сотрудника. Гораздо важнее — помочь осознанно выбрать
              профессию, подготовиться к выбору области профессиональной деятельности, построить
              успешную карьеру, найти амбициозных и перспективных сотрудников, у которых сочетаются
              профессиональная реализация, удовольствие от работы и понимание собственной ценности.
            </p>
            <p>
              Наша цель гораздо шире, чем проведение отдельных мероприятий и закрытие вакансий. Мы
              стремимся развивать юридическое сообщество, в котором студентам и молодым юристам
              доступны реальные возможности для роста. Мы хотим помогать строить карьеру через
              развитие soft skills, психологическую устойчивость, понимание современного
              юридического рынка — создавая новые проекты, организуя мероприятия, объединяя людей
              для обмена опытом и взаимной поддержки, формируя среду, где профессиональный рост
              становится естественным процессом.
            </p>
          </div>
        </div>
      </section>

      {/* В чем наша польза */}
      <section className="border-y border-ink/10 bg-white py-14">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">В чем наша польза</div>
          <h2 className="mb-6 text-2xl font-semibold">Решаем задачу, а не продаем услугу</h2>
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
        </div>
      </section>

      {/* Кейсы и результаты */}
      <section className="container-page py-14">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Кейсы и результаты</div>
        <h2 className="mb-6 text-2xl font-semibold">Признание на рынке и цифры за нами</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass rounded-xl p-5">
            <div className="font-semibold">3-я группа в номинации «Профессиональные сообщества»</div>
            <p className="mt-1 text-sm text-ink/60">
              Консолидированный рейтинг репутационного капитала участников юридического рынка Москвы
              и Санкт-Петербурга от комитета РАСО и Legal Business Forum. Также отдельно отмечены в
              номинациях «Персональный бренд» и «Интегральные оценки» этого рейтинга.
            </p>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="font-semibold">Рейтинг юридических Telegram-каналов</div>
            <p className="mt-1 text-sm text-ink/60">
              Юридические клубы: 5 место «самый вовлеченный», 12 место «индекс качества», 8 место
              «самый большой».
            </p>
          </div>
          <div className="glass rounded-xl p-5">
            <div className="font-semibold">Ещё две номинации того же рейтинга</div>
            <p className="mt-1 text-sm text-ink/60">
              HR-направление: 5 место «самый вовлеченный», 26 место «индекс качества», 31 место
              «самый большой». Каналы студентов: 11 место «самый вовлеченный», 15 место «индекс
              качества», 11 место «самый большой».
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link to="/kadry/employers" className="glass rounded-xl p-5">
            <div className="grid grid-cols-2 gap-3">
              {kadryStats.map((s) => (
                <div key={s.label}>
                  <div className="text-xl font-semibold text-ink">{s.value}</div>
                  <div className="text-xs text-ink/50">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm font-medium text-gold">Кейсы закрытия вакансий →</div>
          </Link>
          <Link to="/community" className="glass rounded-xl p-5">
            <div className="grid grid-cols-2 gap-3">
              {communityStats.map((s) => (
                <div key={s.label}>
                  <div className="text-xl font-semibold text-ink">{s.value}</div>
                  <div className="text-xs text-ink/50">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm font-medium text-gold">Подробнее о сообществе →</div>
          </Link>
        </div>
      </section>

      {/* Преимущества и выгоды */}
      <section className="border-y border-ink/10 bg-white py-14">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Преимущества и выгоды</div>
          <h2 className="mb-8 text-2xl font-semibold">Что вы получаете</h2>
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-3 font-semibold text-ink">Работодателям (Кадры)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {kadryAdvantages.map((a) => (
                  <div key={a.title} className="glass rounded-xl p-4">
                    <div className="font-medium">{a.title}</div>
                    <p className="mt-1 text-sm text-ink/60">{a.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 font-semibold text-ink">Соискателям (Кадры)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {candidateBenefits.map((b) => (
                  <div key={b.title} className="glass rounded-xl p-4">
                    <div className="font-medium">{b.title}</div>
                    <p className="mt-1 text-sm text-ink/60">{b.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Что мы предлагаем */}
      <section id="kadry" className="scroll-mt-16 border-b border-ink/10 bg-ink py-16 text-white">
        <div className="container-page">
          <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Что мы предлагаем · Кадры</div>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Находим сотрудников для юридических фирм — без лишних собеседований и потраченного времени
          </h2>
          <p className="mt-3 max-w-xl text-white/60">
            Подбор помощников, младших юристов, офис-менеджеров — быстро и точно.
          </p>

          <div className="glass-dark mt-10 flex flex-col items-start gap-4 rounded-xl p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Как мы ищем кандидата</div>
              <p className="mt-1 text-sm text-white/60">
                Сначала вакансию видят резиденты нашего Сообщества → затем кадровый резерв (8 000+
                контактов) → и только потом открытый доступ.
              </p>
            </div>
            <Link
              to="/kadry/employers"
              className="shrink-0 rounded-lg bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink hover:opacity-90"
            >
              Подробнее и оставить заявку
            </Link>
          </div>
        </div>
      </section>

      <section id="community" className="scroll-mt-16 border-b border-ink/10 bg-white py-16">
        <div className="container-page">
          <div className="text-sm font-medium uppercase tracking-wide text-gold">Что мы предлагаем · Сообщество</div>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Карьера в праве — легче, когда рядом свои люди
          </h2>
          <p className="mt-3 max-w-xl text-ink/60">
            Объединяем студентов и начинающих юристов из разных городов и университетов.
          </p>

          <div className="glass-dark mt-10 flex flex-col items-start gap-4 rounded-xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">От 690 ₽/мес · демодоступ 7 дней</div>
              <p className="mt-1 text-sm text-white/60">
                Выберите тариф, оплатите и укажите ник в Telegram — бот сам напишет вам и пришлет
                ссылку на вступление.
              </p>
            </div>
            <Link
              to="/community"
              className="shrink-0 rounded-lg bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink hover:opacity-90"
            >
              Вступить в сообщество
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection items={faqItems} />
    </div>
  )
}
