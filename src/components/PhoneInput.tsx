import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { formatPhone, parsePhone } from '../lib/phone'

// Курсор после форматирования ставим не в конец строки, а сразу после той
// же по счету значимой цифры (без учета кода страны — "8"/"+7", он всегда
// один символ в начале и не набирается пользователем отдельно), что стояла
// перед курсором до форматирования. Без этого курсор после каждого
// нажатия прыгал бы в конец, и отредактировать середину номера можно было
// бы только кликнув туда мышкой отдельно.
function caretForDigitCount(formatted: string, prefixLength: number, significantDigitCount: number): number {
  if (!formatted) return 0
  if (significantDigitCount <= 0) return Math.min(prefixLength + 2, formatted.length)

  let seenPrefixDigit = false
  let count = 0
  for (let i = 0; i < formatted.length; i++) {
    if (!/\d/.test(formatted[i])) continue
    if (!seenPrefixDigit) {
      seenPrefixDigit = true
      continue
    }
    count++
    if (count === significantDigitCount) return i + 1
  }
  return formatted.length
}

// Единое поле ввода телефона для всех форм сайта — вместо примера в
// placeholder ("Телефон, например 89990000000") показывает реальную маску
// прямо во время ввода ("8 (999) 123-45-67" или "+7 (999) 123-45-67" —
// смотря как начал вводить пользователь). Backspace/Delete рядом со
// скобкой, пробелом или тире по умолчанию упираются в служебный символ
// маски, а не в цифру — из-за этого казалось, что удалить номер можно
// только кликнув мышкой в нужное место. Здесь эти клавиши всегда удаляют
// ближайшую цифру, а не символ маски.
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
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)

  useEffect(() => {
    if (caretRef.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current)
      caretRef.current = null
    }
  }, [value])

  function applyRaw(raw: string, caretInRaw: number) {
    // Значимые цифры до курсора считаем тем же алгоритмом, что и само
    // форматирование, применённым к подстроке до курсора — так учитывается,
    // успел ли уже "съесться" ведущий 7/8/+7 в качестве кода страны.
    const significantBefore = parsePhone(raw.slice(0, caretInRaw)).digits.length
    const formatted = formatPhone(raw)
    const prefixLength = parsePhone(raw).prefix.length
    caretRef.current = caretForDigitCount(formatted, prefixLength, significantBefore)
    onChange(formatted)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const caret = e.target.selectionStart ?? raw.length
    applyRaw(raw, caret)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const input = e.currentTarget
    const { selectionStart, selectionEnd, value: current } = input
    if (selectionStart == null || selectionEnd == null || selectionStart !== selectionEnd) return

    if (e.key === 'Backspace' && selectionStart > 0) {
      let i = selectionStart - 1
      while (i >= 0 && !/\d/.test(current[i])) i--
      if (i < 0) return
      e.preventDefault()
      applyRaw(current.slice(0, i) + current.slice(i + 1), i)
    } else if (e.key === 'Delete' && selectionStart < current.length) {
      let i = selectionStart
      while (i < current.length && !/\d/.test(current[i])) i++
      if (i >= current.length) return
      e.preventDefault()
      applyRaw(current.slice(0, i) + current.slice(i + 1), selectionStart)
    }
  }

  return (
    <input
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  )
}
