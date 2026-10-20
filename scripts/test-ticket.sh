#!/usr/bin/env bash
# Тестовый билет на почту: так выглядит письмо, которое получает покупатель после оплаты (письмо с билетом во вложении).
# Запуск: bash /var/www/legalcareerist/scripts/test-ticket.sh [адрес_получателя] ["Фамилия Имя Отчество"]
#   без адреса — на SMTP_USER, без имени — «Иванов Иван Иванович». Номер билета в тесте 999999, оплата — сегодняшняя дата.
cd "$(dirname "$0")/../server" || exit 1
TO="${1:-}"
NAME="${2:-Иванов Иван Иванович}"
RESULT=$(TO="$TO" NAME="$NAME" node --env-file=.env --input-type=module -e "
const t = await import('./lib/ticketImage.js')
const m = await import('./lib/mailer.js')
const to = process.env.TO || process.env.SMTP_USER
const ticket = await t.renderTicket({ eventSlug: 'dzhazovyy-vecher-dlya-yuristov-2', number: 999999, name: process.env.NAME, phone: '+7 900 123-45-67', email: to, paidAt: Date.now() })
const r = await m.sendMail({ to, subject: 'ТЕСТ: ваш билет на Legal Night Jazz 2', text: 'Это тестовое письмо: так выглядит билет, который получает покупатель после оплаты. Билет во вложении.', attachments: [{ filename: ticket.filename, content: ticket.buffer, contentType: ticket.contentType }] })
console.log(JSON.stringify({ ...r, to, file: ticket.filename, kb: Math.round(ticket.buffer.length / 1024) }))
" 2>&1 | tail -1)
echo "$RESULT"
if [[ "$RESULT" == *'"ok":true'* ]]; then echo "✅ Письмо с тестовым билетом отправлено. Откройте его и посмотрите вложение (в некоторых почтах картинка показывается под текстом письма)."; else echo "❌ Не отправилось, пришлите строку выше целиком."; fi
