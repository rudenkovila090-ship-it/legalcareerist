import { useState } from 'react'
import PageHero from '../../components/PageHero'
import ProcessSteps from '../../components/ProcessSteps'
import LeadForm from '../../components/LeadForm'

const stats = [
  { value: '3 200+', label: 'потенциальных кандидатов' },
  { value: '20+', label: 'позиций закрыто' },
  { value: '5–7', label: 'дней на закрытие' },
  { value: '30%', label: 'оплата от 1 зарплаты' },
]

const kpis = [
  { value: '5,5 дней', label: 'Time to Hire (среднее время закрытия вакансии)' },
  { value: '89%', label: 'конверсия интервью в оффер' },
  { value: '100%', label: 'доля кандидатов, прошедших испытательный срок' },
]

const processSteps = [
  { title: 'Формирование заказа', description: 'Приём заявки, формирование заказа.' },
  { title: 'Согласование работ', description: 'Подписание договора, оплата, согласование вакансии.' },
  { title: 'Представление плана работы', description: 'Аналитика рынка, поиск, скрининг, собеседование — план действий.' },
  { title: 'Поиск кандидатов', description: 'Закрытое сообщество, кадровый резерв, соцсети, рекомендации, чаты.' },
  { title: 'Скрининг и интервью', description: 'Первичный звонок с кандидатом, формирование списка кандидатов.' },
  { title: 'Передача кандидата', description: 'В виде карточек с рекомендациями.' },
  { title: 'Собеседование', description: 'Ваш финальный выбор — собираем обратную связь, формируем оффер.' },
  { title: 'Испытательный срок', description: '1 месяц, гарантия 1 замены, обратная связь через месяц.' },
]

const documentsByStage = [
  { stage: 'Этап 1', items: ['Бриф'] },
  { stage: 'Этап 2', items: ['Договор', 'Счёт на оплату', 'Сформированный заказ', 'Вакансия'] },
  { stage: 'Этап 3', items: ['План работ по поиску сотрудника'] },
  { stage: 'Этап 4–5', items: ['Еженедельная отчётность'] },
  { stage: 'Этап 6', items: ['Кандидаты с резюме'] },
  { stage: 'Этап 7', items: ['Рекомендации по собеседованию', 'Оффер и/или отказ кандидату'] },
  { stage: 'Этап 8', items: ['План адаптации нового сотрудника', 'Рекомендации по коммуникации', 'Форма обратной связи'] },
]

const marketingChannels = [
  { title: 'Контент-маркетинг', text: 'Telegram-канал, YouTube, подкаст, ВК и другие соцсети.' },
  { title: 'Нетворкинг', text: 'Юридические мероприятия, конференции, форумы, рекомендации коллег и соискателей.' },
  { title: 'Своя база', text: 'Более 3 100+ контактов, кадровый резерв.' },
  { title: 'Партнёрства', text: 'Юридические сообщества и организации, блогеры.' },
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
  { title: 'Младший юрист по строительству', days: '3 дня' },
  { title: 'Помощник адвоката по семейным делам', days: '2 дня' },
  { title: 'Помощник юриста по банкротству', days: '1 день', note: 'рекордный срок' },
  { title: 'Помощник юридического маркетолога', days: '3 дня' },
]

export default function KadryHome() {
  const [salary, setSalary] = useState(50000)
  const fee = Math.round(salary * 0.3)
  const prepay = Math.round(fee * 0.75)
  const afterProbation = fee - prepay

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

      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-6 text-2xl font-semibold">Закрываем следующие позиции</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((p) => (
              <div key={p.title} className="flex items-center justify-between rounded-lg bg-paper px-4 py-3 text-sm">
                <span className="font-medium">{p.title}</span>
                <span className="text-ink/50">{p.salary}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <h2 className="mb-2 text-2xl font-semibold">Как мы работаем</h2>
        <p className="mb-6 text-sm text-ink/60">8 этапов от заявки до выхода сотрудника.</p>
        <ProcessSteps steps={processSteps} />

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl bg-ink p-5 text-white">
              <div className="text-2xl font-semibold text-gold-light">{k.value}</div>
              <div className="mt-1 text-sm text-white/60">{k.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-6 text-2xl font-semibold">Какие документы вы получаете</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {documentsByStage.map((d) => (
              <div key={d.stage} className="rounded-xl border border-ink/10 p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">{d.stage}</div>
                <ul className="space-y-1 text-sm text-ink/70">
                  {d.items.map((i) => <li key={i}>· {i}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <h2 className="mb-6 text-2xl font-semibold">Как мы находим вам сотрудников</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {marketingChannels.map((m) => (
            <div key={m.title} className="rounded-xl border border-ink/10 bg-white p-5">
              <div className="font-semibold">{m.title}</div>
              <p className="mt-1 text-sm text-ink/60">{m.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page">
          <h2 className="mb-6 text-2xl font-semibold">Наши закрытые вакансии</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {cases.map((c) => (
              <div key={c.title} className="rounded-xl border border-ink/10 p-5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.title}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Закрыто</span>
                </div>
                <div className="mt-2 text-sm text-ink/60">
                  <span className="font-medium text-ink">{c.days}</span> срок закрытия вакансии
                  {c.note && <span className="text-gold"> · {c.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Прозрачная система оплаты и гарантий</h2>
            <ul className="mt-4 space-y-3 text-sm text-ink/70">
              <li><strong className="text-ink">Оплата за результат</strong> — 30% от одного месячного оклада кандидата: 75% предоплата до начала работ, 25% после прохождения испытательного срока.</li>
              <li><strong className="text-ink">Бесплатная замена</strong> — если кандидат не проходит испытательный срок, подбираем замену бесплатно в согласованные сроки.</li>
              <li><strong className="text-ink">Прозрачная отчётность</strong> — регулярно сообщаем о ходе поиска; если подходящих кандидатов нет — честно предупреждаем.</li>
            </ul>

            <div className="mt-6 rounded-xl border border-ink/10 bg-white p-5">
              <label className="text-sm font-medium text-ink/70">
                Оклад кандидата, ₽/мес
                <input
                  type="range"
                  min={20000}
                  max={150000}
                  step={5000}
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                  className="mt-3 w-full"
                />
              </label>
              <div className="mt-1 text-sm text-ink/60">{salary.toLocaleString('ru-RU')} ₽/мес</div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-paper p-3">
                  <div className="text-xs text-ink/50">Комиссия 30%</div>
                  <div className="mt-1 font-semibold">{fee.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="rounded-lg bg-paper p-3">
                  <div className="text-xs text-ink/50">75% предоплата</div>
                  <div className="mt-1 font-semibold">{prepay.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="rounded-lg bg-paper p-3">
                  <div className="text-xs text-ink/50">25% после срока</div>
                  <div className="mt-1 font-semibold">{afterProbation.toLocaleString('ru-RU')} ₽</div>
                </div>
              </div>
            </div>
          </div>

          <LeadForm
            sourceBlock="kadry"
            formType="employer_request"
            title="Найдём вашего специалиста!"
            description="Расскажите о вакансии — обсудим задачу и запустим поиск уже сегодня."
            contactLabel="Телефон / email компании"
          />
        </div>
      </section>
    </div>
  )
}
