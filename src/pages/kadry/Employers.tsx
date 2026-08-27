import { useState } from 'react'
import PageHero from '../../components/PageHero'
import ProcessSteps from '../../components/ProcessSteps'
import LeadForm from '../../components/LeadForm'

const steps = [
  { title: 'Заявка', description: 'Оставляете заявку на сайте или в личном кабинете.' },
  { title: 'Бриф', description: 'Консультант уточняет требования, специализацию и бюджет.' },
  { title: 'Представление кандидатов', description: 'Первая подборка — в течение 5 рабочих дней.' },
  { title: 'Интервью', description: 'Организуем встречи, собираем обратную связь от обеих сторон.' },
  { title: 'Оффер', description: 'Помогаем согласовать условия и оформить оффер.' },
  { title: 'Гарантийный период', description: 'Бесплатная замена, если кандидат не прошёл испытательный срок.' },
]

export default function Employers() {
  const [salary, setSalary] = useState(2400000)
  const percent = 0.18
  const fee = Math.round(salary * percent)

  return (
    <div>
      <PageHero
        eyebrow="Кадры · Работодателям"
        title="Прозрачный подбор юристов и адвокатов"
        description="Открытая модель оплаты, тройная гарантия, консультанты с профильной специализацией."
      />

      <section className="container-page py-12">
        <h2 className="mb-6 text-2xl font-semibold">Как проходит подбор</h2>
        <ProcessSteps steps={steps} />
      </section>

      <section className="border-y border-ink/10 bg-white py-12">
        <div className="container-page grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold">Тарифы</h2>
            <p className="mt-2 text-sm text-ink/60">
              Стоимость подбора — процент от годового дохода кандидата. Доступна рассрочка и оплата
              по факту выхода сотрудника.
            </p>
            <div className="mt-6 rounded-xl border border-ink/10 p-5">
              <label className="text-sm font-medium text-ink/70">
                Годовой доход кандидата, ₽
                <input
                  type="range"
                  min={800000}
                  max={8000000}
                  step={50000}
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                  className="mt-3 w-full"
                />
              </label>
              <div className="mt-2 text-sm text-ink/60">{salary.toLocaleString('ru-RU')} ₽ / год</div>
              <div className="mt-4 rounded-lg bg-paper p-4">
                <div className="text-xs uppercase tracking-wide text-ink/50">Примерная стоимость подбора</div>
                <div className="mt-1 text-2xl font-semibold">{fee.toLocaleString('ru-RU')} ₽</div>
                <div className="mt-1 text-xs text-ink/40">{Math.round(percent * 100)}% от годового дохода — итоговый процент фиксируется в договоре</div>
              </div>
            </div>
          </div>
          <LeadForm
            sourceBlock="kadry"
            formType="employer_request"
            title="Оставить заявку на подбор"
            description="Свяжемся для брифа в течение рабочего дня."
            contactLabel="Телефон / email компании"
          />
        </div>
      </section>
    </div>
  )
}
