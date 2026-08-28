import { useEffect, useState } from 'react'
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

// Новости «Карьерного юриста» — что изменилось у бота, на сайте, в подкасте
// и на встречах с резидентами. Отдельный блок, не смешан с кейсами/отзывами.
const news = [
  { tag: 'Сайт', date: '18 августа 2026', title: 'Обновили доску вакансий', text: 'Добавили фильтры по городу, зарплате, формату и графику работы — вакансию теперь проще найти под себя.' },
  { tag: 'Бот', date: '10 августа 2026', title: 'Бот сам пишет первым после оплаты', text: 'Больше не нужно писать боту вручную — после оплаты тарифа сообщества он сам присылает ссылку на вступление.' },
  { tag: 'Подкаст', date: '2 августа 2026', title: 'Новый выпуск: как устроен найм в юрфирмах', text: 'Обсудили с приглашенным партнером, как компании выбирают между кадровым резервом и открытым рынком.' },
  { tag: 'Достижения', date: '25 июля 2026', title: 'Вошли в рейтинг юридических Telegram-каналов', text: '5 место по вовлеченности среди юридических клубов — подробности в разделе «Признание на рынке».' },
  { tag: 'Встречи', date: '14 июля 2026', title: 'Прошла встреча резидентов в Москве', text: 'Обсудили тему месяца с приглашенным экспертом — запись доступна резидентам Сообщества.' },
  { tag: 'Сайт', date: '5 июля 2026', title: 'Запустили карьерный калькулятор для работодателей', text: 'Теперь можно сразу увидеть итоговую стоимость подбора и срок закрытия вакансии.' },
]

// Табло достижений на главной — по одному пункту с автопереключением,
// вместо статичных таблиц. Собрано из тех же реальных рейтингов.
// Единый формат для каждого пункта табло: «Номинация «X» — место» —
// source (эйбров сверху), nomination (что именно за номинация) и place
// (само место/результат).
const achievements = [
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'Юридические клубы — самый вовлеченный', place: '5 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'Юридические клубы — индекс качества', place: '12 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'Юридические клубы — самый большой', place: '8 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'HR-направление — самый вовлеченный', place: '5 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'HR-направление — индекс качества', place: '26 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'HR-направление — самый большой', place: '31 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'Каналы студентов — самый вовлеченный', place: '11 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'Каналы студентов — индекс качества', place: '15 место' },
  { source: 'Рейтинг юридических Telegram-каналов · 2025', nomination: 'Каналы студентов — самый большой', place: '11 место' },
  { source: 'Консолидированный рейтинг репутационного капитала юррынка Москвы и Санкт-Петербурга · РАСО и Legal Business Forum, 2026', nomination: 'Профессиональные сообщества', place: '3-я группа' },
  { source: 'Консолидированный рейтинг репутационного капитала юррынка Москвы и Санкт-Петербурга · РАСО и Legal Business Forum, 2026', nomination: 'Персональный бренд', place: 'специально отмечены' },
  { source: 'Консолидированный рейтинг репутационного капитала юррынка Москвы и Санкт-Петербурга · РАСО и Legal Business Forum, 2026', nomination: 'Интегральные оценки', place: 'специально отмечены' },
]

function AchievementsBoard() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % achievements.length), 3500)
    return () => clearInterval(id)
  }, [])

  const current = achievements[active]

  return (
    <div className="overflow-hidden rounded-2xl bg-ink text-white">
      <div className="mx-auto flex min-h-[320px] max-w-2xl flex-col justify-between p-8 text-center sm:min-h-[360px] sm:p-12">
        <div className="text-xs uppercase tracking-wide text-white/40">{current.source}</div>
        <div key={active} className="animate-board-fade">
          <div className="text-xl font-semibold sm:text-2xl">Номинация «{current.nomination}»</div>
          <div className="mt-3 text-7xl font-bold text-gold-light sm:text-8xl">{current.place}</div>
        </div>
        <div className="flex justify-center gap-1.5">
          {achievements.map((a, i) => (
            <button
              key={`${a.source}-${a.nomination}`}
              type="button"
              aria-label={`Показать: ${a.nomination}`}
              onClick={() => setActive(i)}
              className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-gold-light' : 'w-1.5 bg-white/25 hover:bg-white/50'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

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
            <Link to="/kadry/employers" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_8px_rgba(111,147,196,0.18)]">
              <div className="text-lg font-semibold">Кадры</div>
              <div className="mt-1 text-sm text-ink/60">Найдем сотрудника</div>
            </Link>
            <Link to="/community" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_8px_rgba(111,147,196,0.18)]">
              <div className="text-lg font-semibold">Сообщество</div>
              <div className="mt-1 text-sm text-ink/60">Студент или начинающий юрист?</div>
            </Link>
            <Link to="/events" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_8px_rgba(111,147,196,0.18)]">
              <div className="text-lg font-semibold">Мероприятия</div>
              <div className="mt-1 text-sm text-ink/60">События для студентов-юристов</div>
            </Link>
            <Link to="/marketplace" className="rounded-2xl border-2 border-ink bg-white p-5 text-center shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-[0_0_0_8px_rgba(111,147,196,0.18)]">
              <div className="text-lg font-semibold">Маркетплейс</div>
              <div className="mt-1 text-sm text-ink/60">Каталог полезных материалов</div>
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
            <div className="group relative glass min-h-[180px] overflow-hidden rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Миссия</div>
              <p className="mt-2 font-medium text-ink">
                Помочь не просто найти работу или сотрудника, а осознанно построить карьеру.
              </p>
              <div className="pointer-events-none absolute inset-0 overflow-y-auto bg-ink/95 p-5 text-sm leading-relaxed text-white opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                Миссия «Карьерного юриста» — не просто помочь человеку найти работу, определиться с
                направлением или найти себе сотрудника. Гораздо важнее — помочь осознанно выбрать
                профессию, подготовиться к выбору области профессиональной деятельности, построить
                успешную карьеру, найти амбициозных и перспективных сотрудников, у которых сочетаются
                профессиональная реализация, удовольствие от работы и понимание собственной ценности.
              </div>
            </div>
            <div className="group relative glass min-h-[180px] overflow-hidden rounded-xl p-6">
              <div className="text-sm font-medium uppercase tracking-wide text-gold">Цель</div>
              <p className="mt-2 font-medium text-ink">
                Развивать юридическое сообщество, где профессиональный рост — естественный процесс.
              </p>
              <div className="pointer-events-none absolute inset-0 overflow-y-auto bg-ink/95 p-5 text-sm leading-relaxed text-white opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
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
        <AchievementsBoard />
      </section>

      {/* Новости */}
      <section className="border-y border-ink/10 bg-white py-14">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Новости</div>
          <h2 className="mb-6 text-2xl font-semibold">Что нового у «Карьерного юриста»</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <div key={n.title} className="glass rounded-xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{n.tag}</span>
                  <span className="text-xs text-ink/40">{n.date}</span>
                </div>
                <div className="mt-3 font-semibold">{n.title}</div>
                <p className="mt-1.5 text-sm text-ink/60">{n.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection items={faqItems} />
    </div>
  )
}
