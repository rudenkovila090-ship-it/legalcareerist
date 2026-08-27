import { Link } from 'react-router-dom'
import LeadForm from '../components/LeadForm'

const kadryStats = [
  { value: '3 200+', label: 'потенциальных кандидатов' },
  { value: '20+', label: 'позиций закрыто' },
  { value: '5–7', label: 'дней на закрытие' },
  { value: '30%', label: 'оплата от 1 зарплаты' },
]

const communityStats = [
  { value: '70+', label: 'резидентов' },
  { value: '4', label: 'клуба' },
  { value: '690 ₽', label: 'подписка на 1 месяц' },
  { value: '2 города', label: 'офлайн-встреч' },
]

const kadryAdvantages = [
  { title: 'Только юридический рынок', text: 'Специализируемся на начинающих и средних специалистах — понимаем их уровень, мотивацию и ожидания.' },
  { title: 'Собственная база 3 200+', text: 'Активное сообщество студентов и выпускников — кандидаты уже мотивированы и готовы к работе.' },
  { title: 'Оплата за результат', text: '30% от одного оклада кандидата: 75% предоплата до начала работ, 25% — после прохождения испытательного срока.' },
  { title: 'Бесплатная замена', text: 'Если кандидат не проходит испытательный срок — подбираем замену бесплатно в согласованные сроки.' },
]

const kadryPositions = [
  'Помощник юриста', 'Младший юрист', 'Помощник адвоката',
  'Секретарь судебного заседания', 'Секретарь нотариальной конторы', 'Делопроизводитель',
  'Офис-менеджер', 'Бизнес-ассистент', 'Помощник арбитражного управляющего',
  'Помощник патентного поверенного', 'Юридический блок Секретарь', 'SMM-специалист',
]

const communityBenefits = [
  { title: 'Закрытые вакансии', text: 'Помощники, младшие юристы, секретари, офис-менеджеры — вакансий нет в открытом доступе.' },
  { title: 'Скидки на мероприятия', text: '30–50% на офлайн-встречи и участие в событиях сообщества.' },
  { title: 'Закрытые вебинары', text: 'С приглашёнными экспертами — доступны только резидентам.' },
  { title: 'База знаний', text: 'Юридическая литература, психология, soft skills, legal design & writing и многое другое.' },
  { title: 'Скидка на консультации', text: 'Льготная цена на консультацию психолога и карьерного консультанта для резидентов.' },
  { title: 'Личный бренд', text: 'Записываем подкасты с резидентами, публикуем статьи.' },
]

const communityTariffs = [
  { period: '1 месяц', price: '690 ₽', note: 'Стандартная' },
  { period: '3 месяца', price: '590 ₽/мес', note: '1 770 ₽ · выгоднее на 14%' },
  { period: '6 месяцев', price: '530 ₽/мес', note: '3 180 ₽ · выгоднее на 23%' },
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
            Кадровое агентство и сообщество для юридического рынка под одним брендом: находим
            специалистов для юридических фирм и объединяем студентов-юристов, которые растят
            карьеру вместе.
          </p>
          <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
            <a href="#kadry" className="rounded-xl border border-ink/10 bg-paper p-4 text-left transition-shadow hover:shadow-md">
              <div className="font-semibold">Кадры</div>
              <div className="mt-1 text-sm text-ink/60">Ищете сотрудника в юридическую фирму?</div>
            </a>
            <a href="#community" className="rounded-xl border border-ink/10 bg-paper p-4 text-left transition-shadow hover:shadow-md">
              <div className="font-semibold">Сообщество</div>
              <div className="mt-1 text-sm text-ink/60">Студент или начинающий юрист?</div>
            </a>
          </div>
        </div>
      </section>

      {/* Кадры */}
      <section id="kadry" className="scroll-mt-16 border-b border-ink/10 bg-ink py-16 text-white">
        <div className="container-page">
          <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Кадровое юридическое агентство</div>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Находим сотрудников для юридических фирм — без лишних собеседований и потраченного времени
          </h2>
          <p className="mt-3 max-w-xl text-white/60">
            Подбор помощников, младших юристов, офис-менеджеров — быстро и точно.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {kadryStats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 p-4">
                <div className="text-2xl font-semibold text-gold-light">{s.value}</div>
                <div className="mt-1 text-sm text-white/60">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {kadryAdvantages.map((a) => (
              <div key={a.title} className="rounded-xl bg-white/5 p-5">
                <div className="font-semibold text-white">{a.title}</div>
                <p className="mt-1 text-sm text-white/60">{a.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <div className="mb-3 font-semibold">Закрываем позиции</div>
            <div className="flex flex-wrap gap-2">
              {kadryPositions.map((p) => (
                <span key={p} className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/80">{p}</span>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <div>
              <p className="text-sm text-white/50">
                Мы работаем исключительно с юридическим рынком на уровне начинающих специалистов.
                Time to Hire — 5,5 дней в среднем, конверсия интервью в оффер — 89%, доля кандидатов,
                прошедших испытательный срок — 100%.
              </p>
            </div>
            <div id="kadry-form">
              <LeadForm
                sourceBlock="kadry"
                formType="employer_request"
                title="Расскажите о вакансии"
                description="Обсудим задачу и запустим поиск уже сегодня."
                contactLabel="Телефон / email компании"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Сообщество */}
      <section id="community" className="scroll-mt-16 border-b border-ink/10 bg-white py-16">
        <div className="container-page">
          <div className="text-sm font-medium uppercase tracking-wide text-gold">Сообщество для молодых юристов</div>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">
            Карьера в праве — легче, когда рядом свои люди
          </h2>
          <p className="mt-3 max-w-xl text-ink/60">
            Объединяем студентов и начинающих юристов из разных городов и университетов.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-4">
            {communityStats.map((s) => (
              <div key={s.label} className="rounded-xl border border-ink/10 bg-paper p-4">
                <div className="text-2xl font-semibold text-ink">{s.value}</div>
                <div className="mt-1 text-sm text-ink/60">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {communityBenefits.map((b) => (
              <div key={b.title} className="rounded-xl border border-ink/10 p-5">
                <div className="font-semibold">{b.title}</div>
                <p className="mt-1 text-sm text-ink/60">{b.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <div className="mb-4 font-semibold">Тарифы</div>
            <div className="grid gap-4 sm:grid-cols-3">
              {communityTariffs.map((t) => (
                <div key={t.period} className="rounded-xl bg-ink p-5 text-white">
                  <div className="text-sm text-white/60">Подписка · {t.period}</div>
                  <div className="mt-1 text-3xl font-semibold text-gold-light">{t.price}</div>
                  <div className="mt-2 text-xs text-white/50">{t.note}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink/50">Демодоступ — 7 дней: попробовать формат перед оплатой.</p>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <div className="text-sm text-ink/60">
              <p>
                Мы объединяемся не городом и не университетом, а одной целью. Понимаем специфику
                профессии и разницу между направлениями практики, даём доступ к закрытым вакансиям
                и живому общению — 4 клуба, встречи, обсуждения, челленджи.
              </p>
            </div>
            <LeadForm
              sourceBlock="community"
              formType="community_join"
              title="Вступить в сообщество"
              description="Оставьте контакт — пришлём приглашение и расскажем про тарифы."
              interestOptions={['1 месяц', '3 месяца', '6 месяцев', 'Демодоступ 7 дней']}
            />
          </div>
        </div>
      </section>

      {/* О нас */}
      <section className="container-page py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-gold">О нас</div>
            <h2 className="mt-2 text-2xl font-semibold">Кто мы и для кого</h2>
            <p className="mt-3 text-ink/60">
              «Карьерный юрист» помогает находить работу, растить карьеру и заводить своих людей —
              студентам, начинающим юристам, а также юридическим фирмам и инхаус-командам, которым
              нужен сотрудник, но некому и некогда его искать.
            </p>
            <p className="mt-3 text-ink/60">
              Наша миссия — помогать находить квалифицированные кадры, создавая прозрачный,
              уважительный и современный рынок юридического труда.
            </p>
          </div>
          <div className="rounded-xl border border-ink/10 bg-white p-6">
            <div className="text-sm font-medium uppercase tracking-wide text-gold">Основатель</div>
            <div className="mt-1 text-xl font-semibold">Илья Руденков</div>
            <ul className="mt-3 space-y-1.5 text-sm text-ink/60">
              <li>Основатель «Карьерного юриста»</li>
              <li>Юрист по персональным данным</li>
              <li>Карьерный консультант для студентов и юристов</li>
              <li>Студент НИУ ВШЭ по программе Legal Tech</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-paper p-5">
            <div className="font-semibold">Признание на рынке</div>
            <p className="mt-1 text-sm text-ink/60">
              3-я группа в номинации «Профессиональные сообщества» консолидированного рейтинга
              репутационного капитала участников юридического рынка Москвы и Санкт-Петербурга
              (РАСО и Legal Business Forum, 2026).
            </p>
          </div>
          <div className="rounded-xl bg-paper p-5">
            <div className="font-semibold">5 место</div>
            <p className="mt-1 text-sm text-ink/60">
              В номинации «Самые вовлечённые юридические клубы» — рейтинг юридических Telegram-каналов, 2025.
            </p>
          </div>
        </div>
      </section>

      {/* Контакты */}
      <section className="border-t border-ink/10 bg-white py-14">
        <div className="container-page grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Связаться с нами</h2>
            <div className="mt-4 space-y-2 text-sm text-ink/70">
              <div>Email: <a className="underline" href="mailto:info@legalcareerist.ru">info@legalcareerist.ru</a></div>
              <div>Телефон: <a className="underline" href="tel:+79214397031">8 (921) 439-70-31</a></div>
              <div>Telegram: <a className="underline" href="https://t.me/rudenkovrd" target="_blank" rel="noreferrer">@rudenkovrd</a> · <a className="underline" href="https://t.me/legalcareerst_support" target="_blank" rel="noreferrer">@legalcareerst_support</a></div>
            </div>
            <p className="mt-6 text-xs text-ink/40">
              Отправляя заявку через формы на сайте, вы соглашаетесь с{' '}
              <Link className="underline" to="/legal/privacy">Политикой обработки персональных данных</Link>{' '}
              и даёте <Link className="underline" to="/legal/consent">согласие на обработку персональных данных</Link>.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
