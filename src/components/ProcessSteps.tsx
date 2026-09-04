// <ProcessSteps> — переиспользуемый компонент степ-процесса (раздел 6.2 ТЗ).
// Используется и для «Работодателям» (заявка → бриф → ... → гарантия),
// и для «Мероприятий» (регистрация → оплата → напоминание → участие → материалы).
export interface ProcessStep {
  title: string
  description: string
}

export default function ProcessSteps({ steps }: { steps: ProcessStep[] }) {
  return (
    <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.title} className="glass rounded-xl p-5">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-gold-light/30 text-sm font-semibold text-ink">
            {i + 1}
          </div>
          <div className="font-semibold">{step.title}</div>
          <p className="mt-1 text-sm text-ink/60">{step.description}</p>
        </li>
      ))}
    </ol>
  )
}
