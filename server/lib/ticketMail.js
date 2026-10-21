// Письмо участнику об оплате билета: тема, текст и вёрстка. Общее для настоящей отправки (sendTicketMail в index.js)
// и тестовой (scripts/test-ticket.mjs), чтобы тест показывал ровно то, что получит покупатель.
import { tidyName } from './ticketImage.js'

const MSK = 'Europe/Moscow'
const clock = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: MSK })
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export const CONTACTS = { phone: '+7 932 262 13 44', email: 'info@legalcareerist.ru', site: 'https://legalcareerist.ru' }

/**
 * lead — регистрация (name, tariff, number, eventTitle), amount — сумма оплаты, event — мероприятие из каталога (или undefined),
 * hasTicket — приложен ли билет, supportHandle — контакт поддержки (@ник).
 * Возвращает { subject, text, html }: html с выделением, text — то же простым текстом.
 */
export function composeTicketMail({ lead, amount, event, hasTicket, supportHandle }) {
  const greetName = tidyName(lead.name) || lead.name
  const hello = greetName ? `Здравствуйте, ${greetName}!` : 'Здравствуйте!'
  const paid = `Оплата получена — вы зарегистрированы на мероприятие «${lead.eventTitle}».`
  // название билета не повторяем, если оно и есть «Билет»; для других названий (например, «Участник») оставляем
  const tariff = lead.tariff && lead.tariff.trim().toLowerCase() !== 'билет' ? lead.tariff.trim() : ''
  const ticketValue = [`№${lead.number}`, tariff, amount ? `${amount} ₽` : ''].filter(Boolean).join(' · ')
  const when = event
    ? `${new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: MSK })}, ${clock(event.dateTime)}${event.endDateTime ? `–${clock(event.endDateTime)}` : ''} (по Москве)`
    : ''
  const where = event ? [event.city, event.location || event.venue].filter(Boolean).join(', ') : ''
  const chat = event?.participantsChat || ''
  const supportUrl = `https://t.me/${supportHandle.replace(/^@/, '')}`
  const reminder = `За день до мероприятия пришлём напоминание на эту почту. Вопросы — ${supportHandle}`
  const ticketLine = hasTicket ? 'Ваш именной билет — во вложении к этому письму.' : ''

  // простой текст (null — строка не нужна, '' — пустая строка-отступ)
  const text = [
    hello,
    paid,
    '',
    `Билет: ${ticketValue}`,
    when ? `Когда: ${when}` : null,
    where ? `Где: ${where}` : null,
    chat ? `Чат участников в Telegram: ${chat}` : null,
    ticketLine ? '' : null,
    ticketLine || null,
    '',
    reminder,
    '',
    'Карьерный юрист',
    'Мероприятия',
    '',
    `${CONTACTS.phone} | ${CONTACTS.email} | сайт: ${CONTACTS.site}`,
  ].filter((l) => l !== null).join('\n')

  // вёрстка: жирным — приветствие с «оплата получена» и подписи строк
  const p = (inner) => `<p style="margin:0 0 16px">${inner}</p>`
  const row = (label, value) => `<b>${label}</b> ${value}`
  const link = (href, label) => `<a href="${esc(href)}" style="color:#45608a">${esc(label)}</a>`
  const details = [
    row('Билет:', esc(ticketValue)),
    when && row('Когда:', esc(when)),
    where && row('Где:', esc(where)),
    chat && row('Чат участников:', link(chat, 'вступить в Telegram-чат')),
  ].filter(Boolean)
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${[
    p(`<b>${esc(hello)}<br>${esc(paid)}</b>`),
    p(details.join('<br>')),
    ticketLine && p(esc(ticketLine)),
    p(`За день до мероприятия пришлём напоминание на эту почту. Вопросы — ${link(supportUrl, supportHandle)}`),
    p('Карьерный юрист<br>Мероприятия'),
    p(`${link(`tel:${CONTACTS.phone.replace(/[^\d+]/g, '')}`, CONTACTS.phone)} | ${link(`mailto:${CONTACTS.email}`, CONTACTS.email)} | ${link(CONTACTS.site, 'сайт')}`),
  ].filter(Boolean).join('')}</div>`

  return { subject: `Вы зарегистрированы: ${lead.eventTitle}`, text, html }
}
