// Маска российского номера — используется PhoneInput (см. components/PhoneInput.tsx),
// вынесена в отдельный файл, чтобы компонент экспортировал только сам компонент
// (иначе react-refresh/only-export-components ругается на смешанный экспорт).
export function formatPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('7')) digits = `8${digits.slice(1)}`
  else if (digits && !digits.startsWith('8')) digits = `8${digits}`
  digits = digits.slice(0, 11)

  if (!digits) return ''
  const rest = digits.slice(1)
  let out = '8'
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`
  if (rest.length >= 3) out += ')'
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`
  return out
}
