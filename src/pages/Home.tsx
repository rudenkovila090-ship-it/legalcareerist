import { Link } from 'react-router-dom'
import FAQSection from '../components/FAQSection'
import ilyaPhoto from '../assets/ilya-rudenkov.jpg'

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
function IconHeartHands() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 8.8c-1-1.7-3.5-1.9-4.7-.5-1.2 1.4-1 3.3.5 4.6l4.2 3.6 4.2-3.6c1.5-1.3 1.7-3.2.5-4.6-1.2-1.4-3.7-1.2-4.7.5z" />
      <path d="M4 18.5c1.5-1 3-1.5 4.5-1.5h3.2c.9 0 1.7.5 1.9 1.4M20 18.5c-1.5-1-3-1.5-4.5-1.5" />
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
    icon: IconHeartHands,
    title: 'Поддержка',
    text: 'Не формальный сервис, а искренняя вовлеченность: разбираемся в вашей ситуации с интересом, держим связь и отзывчиво помогаем на каждом шаге — от первой заявки до результата.',
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
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/kadry/employers" className="rounded-2xl bg-ink p-5 text-center text-white shadow-lg transition-transform hover:-translate-y-0.5">
              <div className="text-lg font-semibold">Кадры</div>
              <div className="mt-1 text-sm text-white/70">Найдем сотрудника</div>
            </Link>
            <Link to="/community" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-transform hover:-translate-y-0.5">
              <div className="text-lg font-semibold">Сообщество</div>
              <div className="mt-1 text-sm text-ink/60">Студент или начинающий юрист?</div>
            </Link>
            <Link to="/events" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-transform hover:-translate-y-0.5">
              <div className="text-lg font-semibold">Мероприятия</div>
              <div className="mt-1 text-sm text-ink/60">События для студентов-юристов</div>
            </Link>
            <Link to="/marketplace" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-transform hover:-translate-y-0.5">
              <div className="text-lg font-semibold">Marketplace</div>
              <div className="mt-1 text-sm text-ink/60">Каталог юридических услуг</div>
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
          </div>
          <div className="glass flex flex-col gap-5 rounded-xl p-6">
            <div className="flex gap-5">
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
            <blockquote className="border-l-2 border-gold pl-4 text-sm italic text-ink/70">
              «Карьерный юрист — это пространство возможностей для юридического рынка, где каждая
              аудитория находит свое».
            </blockquote>
          </div>
        </div>

        <div className="mt-14 border-t border-ink/10 pt-14">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Кадровое агентство</div>
              <p className="mt-2 text-sm text-ink/60">
                Основа нашей деятельности. Помогаем юридическим фирмам, адвокатским образованиям,
                юристам, адвокатам, нотариусам, арбитражным управляющим и другим юридическим
                профессиям находить себе сотрудников — помощников, младших юристов, офис-менеджеров
                и других специалистов, без которых не работает ни одна практика.
              </p>
            </div>
            <div className="glass rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Сообщество</div>
              <p className="mt-2 text-sm text-ink/60">
                Более тесный круг для студентов-юристов, где мы обмениваемся знаниями и опытом.
                Резиденты получают вакансии в приоритетном порядке — часто раньше, чем они появляются
                в открытом доступе, а иногда такие предложения вообще не выходят за пределы
                сообщества.
              </p>
            </div>
            <div className="glass rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Ивент-агентство</div>
              <p className="mt-2 text-sm text-ink/60">
                Создаем и организовываем мероприятия для студентов и собственные события. К нам все
                чаще приходят запросы от юридических компаний, которые хотят организовать встречи со
                студентами, найти точки соприкосновения с будущими сотрудниками.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="group relative glass min-h-[140px] overflow-hidden rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Миссия</div>
              <p className="mt-2 font-medium text-ink">
                Помочь не просто найти работу или сотрудника, а осознанно построить карьеру.
              </p>
              <div className="pointer-events-none absolute inset-0 flex items-center bg-ink/95 p-6 text-sm leading-relaxed text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Миссия «Карьерного юриста» — не просто помочь человеку найти работу, определиться с
                направлением или найти себе сотрудника. Гораздо важнее — помочь осознанно выбрать
                профессию, подготовиться к выбору области профессиональной деятельности, построить
                успешную карьеру, найти амбициозных и перспективных сотрудников, у которых сочетаются
                профессиональная реализация, удовольствие от работы и понимание собственной ценности.
              </div>
            </div>
            <div className="group relative glass min-h-[140px] overflow-hidden rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Цель</div>
              <p className="mt-2 font-medium text-ink">
                Развивать юридическое сообщество, где профессиональный рост — естественный процесс.
              </p>
              <div className="pointer-events-none absolute inset-0 flex items-center bg-ink/95 p-6 text-sm leading-relaxed text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Наша цель гораздо шире, чем проведение отдельных мероприятий и закрытие вакансий. Мы
                стремимся развивать юридическое сообщество, в котором студентам и молодым юристам
                доступны реальные возможности для роста. Мы хотим помогать строить карьеру через
                развитие soft skills, психологическую устойчивость, понимание современного
                юридического рынка — создавая новые проекты, организуя мероприятия, объединяя людей
                для обмена опытом и взаимной поддержки, формируя среду, где профессиональный рост
                становится естественным процессом.
              </div>
            </div>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass rounded-xl p-6">
            <div className="mb-1 text-sm font-medium uppercase tracking-wide text-gold">Рейтинг юридических Telegram-каналов</div>
            <div className="mt-4 space-y-4 text-sm">
              {[
                { group: 'Юридические клубы', rows: [['Самый вовлеченный', '5 место'], ['Индекс качества', '12 место'], ['Самый большой', '8 место']] },
                { group: 'HR-направление', rows: [['Самый вовлеченный', '5 место'], ['Индекс качества', '26 место'], ['Самый большой', '31 место']] },
                { group: 'Каналы студентов', rows: [['Самый вовлеченный', '11 место'], ['Индекс качества', '15 место'], ['Самый большой', '11 место']] },
              ].map((cat) => (
                <div key={cat.group}>
                  <div className="font-semibold text-ink">{cat.group}</div>
                  <ul className="mt-1.5 space-y-1">
                    {cat.rows.map(([label, place]) => (
                      <li key={label} className="flex items-center justify-between text-ink/60">
                        <span>{label}</span>
                        <span className="font-medium text-ink">{place}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <div className="mb-1 text-sm font-medium uppercase tracking-wide text-gold">
              Консолидированный рейтинг репутационного капитала участников юридического рынка Москвы и Санкт-Петербурга
            </div>
            <p className="mt-1 text-xs text-ink/40">От комитета РАСО и Legal Business Forum, 2026</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3 py-2">
                <span className="text-ink/70">«Профессиональные сообщества»</span>
                <span className="font-medium text-ink">3-я группа</span>
              </li>
              <li className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3 py-2">
                <span className="text-ink/70">«Персональный бренд»</span>
                <span className="font-medium text-ink">отмечены отдельно</span>
              </li>
              <li className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3 py-2">
                <span className="text-ink/70">«Интегральные оценки»</span>
                <span className="font-medium text-ink">отмечены отдельно</span>
              </li>
            </ul>
          </div>
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
