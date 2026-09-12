import { formatPhone } from '../lib/phone'

// Единое поле ввода телефона для всех форм сайта — вместо примера в
// placeholder ("Телефон, например 89990000000") показывает реальную маску
// прямо во время ввода ("8 (999) 123-45-67"), приводя к российскому
// формату с 8 в начале, откуда бы пользователь ни начал вводить (7, +7, 8).
export default function PhoneInput({
  value,
  onChange,
  required,
  className,
  placeholder = 'Номер телефона',
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  className?: string
  placeholder?: string
}) {
  return (
    <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={(e) => onChange(formatPhone(e.target.value))}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  )
}
