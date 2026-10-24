interface LeadSuccessCardProps {
  /** Текст под заголовком — что произойдет дальше, конкретно под эту форму. */
  description: string
  /** Тёмный вариант — для форм на bg-ink/glass-dark секциях. */
  dark?: boolean
  /** Номер заявки (Контакты/Поддержка) — показывается перед description. */
  ticket?: string
  title?: string
}

// Единый экран подтверждения после отправки любой лид-формы сайта —
// см. legalcareerist-design skill, раздел 6: зелёный кружок с ✓ + одно
// предложение, что произойдет дальше, вместо голого текста "успех".
export default function LeadSuccessCard({ description, dark, ticket, title = 'Заявка отправлена' }: LeadSuccessCardProps) {
  return (
    <div className={`rounded-xl p-6 text-center ${dark ? 'bg-emerald-400/10 text-emerald-200' : 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      <div className="mb-3 flex justify-center">
        <span className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${dark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white text-emerald-600'}`}>
          ✓
        </span>
      </div>
      <div className="font-semibold">{title}</div>
      <p className={`mt-2 text-sm ${dark ? 'text-emerald-200/80' : 'text-emerald-800/80'}`}>
        {ticket && (
          <>
            Номер вашей заявки — <span className="font-semibold">№ {ticket}</span>.{' '}
          </>
        )}
        {description}
      </p>
    </div>
  )
}
