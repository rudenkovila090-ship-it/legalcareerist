// Маска российского номера — используется PhoneInput (см. components/PhoneInput.tsx),
// вынесена в отдельный файл, чтобы компонент экспортировал только сам компонент
// (иначе react-refresh/only-export-components ругается на смешанный экспорт).
//
// Поддерживает оба привычных способа ввода: с "+7" (сохраняется как "+7 ...")
// и без плюса, с "8" или сразу с "9" (приводится к "8 ..."). Определяем это
// по тому, набрал ли пользователь символ "+" — а не жестко приводим все к 8,
// как раньше, чтобы не мешать тем, кто вводит номер в международном формате.

/** Код страны ("+7"/"8") и значимые цифры номера без него — не более 10. */
export function parsePhone(raw: string): { prefix: '+7' | '8'; digits: string } {
  const hasPlus = /^\s*\+/.test(raw)
  let digits = raw.replace(/\D/g, '')

  let prefix: '+7' | '8' = '8'
  if (hasPlus) {
    prefix = '+7'
    if (digits.startsWith('7')) digits = digits.slice(1)
  } else if (digits.startsWith('8') || digits.startsWith('7')) {
    digits = digits.slice(1)
  }

  return { prefix, digits: digits.slice(0, 10) }
}

export function formatPhone(raw: string): string {
  const { prefix, digits } = parsePhone(raw)
  if (!digits) {
    // Значимых цифр еще нет, но начало кода страны уже набрано — не
    // прячем его целиком, иначе кажется, что ввод "+" или "8" не сработал.
    if (/^\s*\+/.test(raw)) return '+'
    if (/^\s*8/.test(raw)) return '8'
    return ''
  }

  let out = prefix
  out += ` (${digits.slice(0, 3)}`
  if (digits.length >= 3) out += ')'
  if (digits.length > 3) out += ` ${digits.slice(3, 6)}`
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`
  return out
}
