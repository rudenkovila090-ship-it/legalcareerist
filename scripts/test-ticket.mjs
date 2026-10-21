// Тестовое подтверждение оплаты билета: то же письмо и тот же билет, что получает покупатель (регистрация №999999, оплата сегодня),
// с пометкой [ТЕСТ] в теме. Ничего не записывает в регистрации и в финансы.
// Запуск: bash /var/www/legalcareerist/scripts/test-ticket.sh [адрес ...] ["Фамилия Имя Отчество"]
//   адреса — всё, где есть «@» (можно несколько); остальные слова — имя на билете; без адресов письмо уходит на SMTP_USER.
import fs from 'node:fs'
import path from 'node:path'
import { renderTicket } from '../server/lib/ticketImage.js'
import { composeTicketMail } from '../server/lib/ticketMail.js'
import { sendMail } from '../server/lib/mailer.js'

const SLUG = 'dzhazovyy-vecher-dlya-yuristov-2'
const args = process.argv.slice(2)
const addresses = [...new Set(args.filter((a) => a.includes('@')))]
const name = args.filter((a) => !a.includes('@')).join(' ') || 'Иванов Иван Иванович'
if (!addresses.length && process.env.SMTP_USER) addresses.push(process.env.SMTP_USER)
if (!addresses.length) {
  console.log('❌ Не указан адрес и не найден SMTP_USER в server/.env')
  process.exit(1)
}

const catalog = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'server', 'data', 'event-catalog.json'), 'utf8'))
const event = catalog.find((e) => e.slug === SLUG)
if (!event) {
  console.log('❌ Мероприятие не найдено в каталоге (server/data/event-catalog.json). Выполните сборку сайта: bash deploy.sh')
  process.exit(1)
}
const amount = event.tariffs?.[0]?.price ?? 2490
const support = process.env.SUPPORT_HANDLE || '@legalcareerist_support'

let failed = 0
for (const email of addresses) {
  const lead = { name, tariff: event.tariffs?.[0]?.name ?? 'Билет', number: 999999, eventTitle: event.title, eventSlug: SLUG, phone: '+7 900 123-45-67', email, paidAt: Date.now() }
  try {
    const ticket = await renderTicket({ eventSlug: SLUG, number: lead.number, name: lead.name, phone: lead.phone, email: lead.email, paidAt: lead.paidAt })
    const { subject, text } = composeTicketMail({ lead, amount, event, ticket, supportHandle: support })
    const r = await sendMail({ to: email, subject: `[ТЕСТ] ${subject}`, text, attachments: [{ filename: ticket.filename, content: ticket.buffer, contentType: ticket.contentType }] })
    if (r.ok) console.log(`✅ ${email}: отправлено (билет ${ticket.filename}, ${Math.round(ticket.buffer.length / 1024)} КБ)`)
    else {
      failed += 1
      console.log(`❌ ${email}: не ушло (${r.error})`)
    }
  } catch (err) {
    failed += 1
    console.log(`❌ ${email}: не удалось нарисовать билет (${err.message})`)
  }
}
console.log(failed ? `\nНе отправилось: ${failed} из ${addresses.length}. Пришлите строки выше целиком.` : '\nГотово. Откройте письма и посмотрите вложение (в некоторых почтах картинка видна под текстом письма).')
process.exit(failed ? 1 : 0)
