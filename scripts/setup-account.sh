#!/usr/bin/env bash
# Логин и пароль для входа в личный кабинет на сайте (/cabinet).
# Запуск на сервере:  bash /var/www/legalcareerist/scripts/setup-account.sh
# Спрашивает логин и пароль (при вводе пароля ничего не видно), записывает в server/.env только логин и хэш пароля
# (сам пароль нигде не сохраняется), закрывает прежние входы и перезапускает сервер. Повторный запуск меняет пароль.
set -uo pipefail
cd "$(dirname "$0")/../server" || exit 1

printf '\033[?2004l'
clean() { printf '%s' "$1" | sed $'s/\x1b\\[20[01]~//g' | tr -d '[:cntrl:][:space:]'; }

read -r -p "Логин: " LOGIN
read -r -s -p "Пароль (не меньше 12 знаков; ничего не видно, после вставки нажмите Enter): " PW
echo
LOGIN=$(clean "$LOGIN")
PW=$(clean "$PW")

LINES=$(ACC_LOGIN="$LOGIN" ACC_PW="$PW" node scripts/setAccount.js) || exit 1

BACKUP="/root/.env.backup-$(date +%s)"
cp .env "$BACKUP" && chmod 600 "$BACKUP"
sed -i '/^ACCOUNT_LOGIN=/d;/^ACCOUNT_PASSWORD_HASH=/d' .env
printf '\n%s\n' "$LINES" >> .env
rm -f data/account-sessions.json
echo "✅ Записано в server/.env: логин и хэш пароля (копия прежнего файла: $BACKUP)"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart legalcareerist-api >/dev/null 2>&1 && echo "✅ Сервер перезапущен"
fi
echo "Готово. Вход: https://legalcareerist.ru/cabinet"
