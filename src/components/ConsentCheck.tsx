import { Link } from 'react-router-dom'

interface Props {
  tone?: 'light' | 'dark'
  className?: string
  /** Показывать необязательную галочку про рекламу. */
  marketing?: boolean
}

// Три отдельные галочки под формой, ни одна не отмечена заранее:
//   1) ознакомлен с Политикой — обязательна; 2) согласие на обработку персональных данных — обязательна;
//   3) согласие на рекламные и информационные сообщения — по желанию.
// Обязательные закрыты браузером (required): форма не отправится. Состояние читает consentOf(e) из src/lib/consent.ts.
export default function ConsentCheck({ tone = 'light', className = '', marketing = true }: Props) {
  const text = tone === 'dark' ? 'text-white/60' : 'text-ink/60'
  const link = tone === 'dark' ? 'underline hover:text-white' : 'underline hover:text-ink'
  const row = `flex cursor-pointer items-start gap-2 text-left text-xs leading-relaxed ${text}`
  const box = 'mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold'
  return (
    <div className={`grid gap-2 ${className}`}>
      <label className={row}>
        <input type="checkbox" name="policy" required className={box} />
        <span>
          Я ознакомлен(а) с{' '}
          <Link to="/legal/privacy" target="_blank" className={link}>Политикой обработки персональных данных</Link>
        </span>
      </label>
      <label className={row}>
        <input type="checkbox" name="processing" required className={box} />
        <span>
          Я даю{' '}
          <Link to="/legal/consent" target="_blank" className={link}>согласие на обработку персональных данных</Link>
        </span>
      </label>
      {marketing && (
        <label className={row}>
          <input type="checkbox" name="marketing" className={box} />
          <span>
            Хочу получать{' '}
            <Link to="/legal/marketing-consent" target="_blank" className={link}>рекламные и информационные сообщения</Link>
            {' '}о мероприятиях, материалах и сообществе — по желанию
          </span>
        </label>
      )}
    </div>
  )
}
