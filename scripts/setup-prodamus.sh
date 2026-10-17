#!/usr/bin/env bash
# Подключение отдельной платёжной страницы Prodamus для материалов или мероприятий.
# Запуск на сервере:  bash /var/www/legalcareerist/scripts/setup-prodamus.sh materials
#                     bash /var/www/legalcareerist/scripts/setup-prodamus.sh events
# Спрашивает домен страницы и секретный ключ, записывает в server/.env и перезапускает бота.
set -uo pipefail
cd "$(dirname "$0")/../server" || exit 1

KIND="${1:-materials}"
case "$KIND" in
  materials) PREFIX=PRODAMUS_MATERIALS; TITLE="полезных материалов" ;;
  events) PREFIX=PRODAMUS_EVENTS; TITLE="мероприятий" ;;
  *) echo "Использование: bash setup-prodamus.sh materials  (или events)"; exit 1 ;;
esac

# Некоторые терминалы при вставке добавляют служебные символы («[200~»): отключаем это и чистим ввод.
printf '\033[?2004l'
clean() { printf '%s' "$1" | sed $'s/\x1b\\[20[01]~//g' | tr -d '[:cntrl:][:space:]'; }

read -r -p "Домен платёжной страницы для $TITLE (например material.payform.ru): " DOMAIN
read -r -s -p "Секретный ключ этой платёжной страницы (при вводе ничего не видно, после вставки нажмите Enter): " KEY
echo
DOMAIN=$(clean "$DOMAIN" | sed -E 's#^https?://##; s#/.*$##')
KEY=$(clean "$KEY")

if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "❌ Домен выглядит неправильно: «$DOMAIN». Нужен вид name.payform.ru (без https:// и пробелов)."
  exit 1
fi
if [[ -z "$KEY" ]]; then
  echo "❌ Секретный ключ пустой. Запустите скрипт заново и вставьте ключ."
  exit 1
fi
echo "Получено: домен $DOMAIN, ключ из ${#KEY} символов"

BACKUP="/root/.env.backup-$(date +%s)"
cp .env "$BACKUP" && chmod 600 "$BACKUP"
sed -i "/^${PREFIX}_/d" .env
printf '\n%s_DOMAIN=%s\n%s_SECRET_KEY=%s\n' "$PREFIX" "$DOMAIN" "$PREFIX" "$KEY" >> .env
echo "✅ Записано в server/.env (копия старого файла: $BACKUP)"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart legalcareerist-api >/dev/null 2>&1 && echo "✅ Бот перезапущен"
  sleep 3
  echo "В журнале бота сейчас:"
  pm2 logs legalcareerist-api --lines 100 --nostream 2>/dev/null | grep "платёжные страницы" | tail -1
fi
echo "Готово. Платёжная страница для $TITLE: $DOMAIN"
