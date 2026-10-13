import { Link } from 'react-router-dom'

interface Props {
  tone?: 'light' | 'dark'
  className?: string
}

// Галочка согласия на обработку персональных данных для всех форм сайта. Не отмечена по умолчанию и обязательна:
// форма не отправится, пока её не поставят (required). Состояние читает consentOf(e) из src/lib/consent.ts.
export default function ConsentCheck({ tone = 'light', className = '' }: Props) {
  const text = tone === 'dark' ? 'text-white/60' : 'text-ink/60'
  const link = tone === 'dark' ? 'underline hover:text-white' : 'underline hover:text-ink'
  return (
    <label className={`flex cursor-pointer items-start gap-2 text-left text-xs leading-relaxed ${text} ${className}`}>
      <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold" />
      <span>
        Я даю{' '}
        <Link to="/legal/consent" target="_blank" className={link}>согласие на обработку персональных данных</Link>
        {' '}на условиях{' '}
        <Link to="/legal/privacy" target="_blank" className={link}>Политики обработки персональных данных</Link>.
      </span>
    </label>
  )
}
