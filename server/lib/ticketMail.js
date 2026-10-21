// Письмо участнику об оплате билета: тема и текст. Общее для настоящей отправки (sendTicketMail в index.js)
// и тестовой (scripts/test-ticket.mjs), чтобы тест показывал ровно то, что получит покупатель.
import { tidyName } from './ticketImage.js'

const MSK = 'Europe/Moscow'
const clock = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: MSK })

/**
 * lead — регистрация (name, tariff, number, eventTitle), amount — сумма оплаты, event — мероприятие из каталога (или undefined),
 * ticket — результат renderTicket (или null, если билета нет), supportHandle — контакт поддержки.
 */
export function composeTicketMail({ lead, amount, event, ticket, supportHandle }) {
  const greetName = tidyName(lead.name) || lead.name
  const when = event
    ? `${new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: MSK })}, ${clock(event.dateTime)}${event.endDateTime ? `–${clock(event.endDateTime)}` : ''}`
    : ''
  const lines = [`${greetName ? `Здравствуйте, ${greetName}!` : 'Здравствуйте!'}`, '', `Оплата получена — вы зарегистрированы на мероприятие «${lead.eventTitle}».`, `Билет: ${lead.tariff}${amount ? ` · ${amount} ₽` : ''}`]
  if (when) lines.push(`Когда: ${when} (по Москве)`)
  if (event?.location) lines.push(`Где: ${event.location}`)
  lines.push(`Номер регистрации: ${lead.number}`)
  if (ticket) lines.push('', `Ваш именной билет — во вложении к этому письму (${ticket.filename}). Сохраните его на телефон или распечатайте.`)
  lines.push('', `За день до мероприятия пришлём напоминание на эту почту. Вопросы — ${supportHandle}`, '', 'Карьерный юрист')
  return { subject: `Вы зарегистрированы: ${lead.eventTitle}`, text: lines.join('\n') }
}
