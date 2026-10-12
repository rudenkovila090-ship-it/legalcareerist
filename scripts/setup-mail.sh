#!/usr/bin/env bash
# Настройка почты для писем клиентам (материалы, билеты). Спрашивает адрес и пароль приложения,
# записывает их в server/.env, перезапускает бота и отправляет тестовое письмо на этот же адрес.
# Запуск на сервере: bash /var/www/legalcareerist/scripts/setup-mail.sh
set -uo pipefail
cd "$(dirname "$0")/../server" || exit 1

read -r -p "Адрес почты, с которого отправлять (например info@legalcareerist.ru): " MAILADDR
read -r -s -p "Пароль приложения (при вводе ничего не видно, после вставки нажмите Enter): " MAILPASS
echo
read -r -p "SMTP-сервер (просто нажмите Enter, если почта на Яндексе) [smtp.yandex.ru]: " MAILHOST
MAILHOST=${MAILHOST:-smtp.yandex.ru}
MAILADDR=$(printf '%s' "$MAILADDR" | tr -d '[:space:]')
MAILPASS=$(printf '%s' "$MAILPASS" | tr -d '[:space:]')

if [[ ! "$MAILADDR" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
  echo "❌ Адрес выглядит неправильно: «$MAILADDR». Запустите скрипт заново и введите адрес вида name@domain.ru"
  exit 1
fi
if [[ -z "$MAILPASS" ]]; then
  echo "❌ Пароль пустой. Запустите скрипт заново и вставьте пароль приложения."
  exit 1
fi

# Копия файла настроек на случай ошибки (лежит вне репозитория, доступ только у владельца).
BACKUP="/root/.env.backup-$(date +%s)"
cp .env "$BACKUP" && chmod 600 "$BACKUP"
# Убираем старые почтовые строки и случайный мусор от прошлых попыток (слово «Почта», строка из 16 букв — пароль).
sed -i '/^SMTP_/d;/^Почта$/d;/^[a-z]\{16\}$/d' .env
printf '\nSMTP_HOST=%s\nSMTP_PORT=465\nSMTP_USER=%s\nSMTP_PASS=%s\nSMTP_FROM=%s\n' "$MAILHOST" "$MAILADDR" "$MAILPASS" "$MAILADDR" >> .env
echo "✅ Настройки записаны в server/.env (копия старого файла: $BACKUP)"

echo "Отправляю тестовое письмо на $MAILADDR ..."
RESULT=$(node --env-file=.env -e "import('./lib/mailer.js').then(async (m) => { const r = await m.sendMail({ to: process.env.SMTP_USER, subject: 'Тест почты Карьерный юрист', text: 'Если вы это читаете, почта настроена и письма клиентам будут уходить.' }); console.log(JSON.stringify(r)) })" 2>&1 | tail -1)

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart legalcareerist-api >/dev/null 2>&1 && echo "✅ Бот перезапущен с новыми настройками"
fi

if [[ "$RESULT" == *'"ok":true'* ]]; then
  echo "✅ ГОТОВО: письмо отправлено. Проверьте почту $MAILADDR (и папку «Спам»)."
else
  echo "❌ Письмо не отправилось. Ответ почтового сервера: $RESULT"
  echo "Пришлите мне эту строку целиком (пароль в ней не показывается)."
fi
