#!/usr/bin/env bash
# Тестовое письмо с текущими настройками почты из server/.env.
# Запуск: bash /var/www/legalcareerist/scripts/test-mail.sh [адрес_получателя]   (без адреса — на SMTP_USER)
cd "$(dirname "$0")/../server" || exit 1
TO="${1:-}"
RESULT=$(TO="$TO" node --env-file=.env -e "import('./lib/mailer.js').then(async (m) => { const to = process.env.TO || process.env.SMTP_USER; const r = await m.sendMail({ to, subject: 'Тест почты Карьерный юрист', text: 'Если вы это читаете, письма клиентам уходят с адреса ' + process.env.SMTP_FROM }); console.log(JSON.stringify({ ...r, to, from: process.env.SMTP_FROM })) })" 2>&1 | tail -1)
echo "$RESULT"
if [[ "$RESULT" == *'"ok":true'* ]]; then echo "✅ Письмо отправлено. Откройте его и посмотрите, от кого оно (поле «От кого»)."; else echo "❌ Не отправилось, пришлите строку выше целиком."; fi
