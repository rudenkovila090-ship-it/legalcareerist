import { parsePhone } from './phone'

export interface JoinContacts {
  name: string
  phone: string
  email: string
  telegram: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Проверка контактов на формах оплаты подписки сообщества. Все четыре поля
 * обязательны — по ним мы опознаём плательщика и ведём CRM (на странице
 * оплаты Prodamus люди не всегда указывают свои данные). Возвращает текст
 * первой найденной ошибки или null, если всё заполнено верно.
 */
export function validateJoinContacts({ name, phone, email, telegram }: JoinContacts): string | null {
  if (!name.trim()) return 'Укажите ФИО.'
  if (parsePhone(phone).digits.length !== 10) return 'Укажите номер телефона полностью.'
  if (!EMAIL_RE.test(email.trim())) return 'Укажите корректную почту.'
  if (!telegram.trim().replace(/^@/, '')) return 'Укажите ник в Telegram.'
  return null
}
