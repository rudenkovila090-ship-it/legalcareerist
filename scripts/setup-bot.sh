#!/usr/bin/env bash
# Смена Telegram-бота, от имени которого работает сервер (например, переезд с одного токена на другой).
# Запуск на сервере:  bash /var/www/legalcareerist/scripts/setup-bot.sh
# Спрашивает токен (при вводе ничего не видно), проверяет его у Telegram, сам определяет имя бота,
# записывает TELEGRAM_BOT_TOKEN и BOT_USERNAME в server/.env (копия старого файла — рядом с ним) и перезапускает бота.
# Токен нигде не печатается и в git не попадает.
set -uo pipefail
cd "$(dirname "$0")/../server" || exit 1

# Некоторые терминалы при вставке добавляют служебные символы («[200~»): отключаем это и чистим ввод.
printf '\033[?2004l'
clean() { printf '%s' "$1" | sed $'s/\x1b\\[20[01]~//g' | tr -d '[:cntrl:][:space:]'; }

read -r -s -p "Токен бота (из BotFather; после вставки нажмите Enter): " TOKEN
echo
TOKEN=$(clean "$TOKEN")
if [[ ! "$TOKEN" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ ]]; then
  echo "❌ Токен выглядит неправильно (должен быть вида 123456789:AAH...). Запустите скрипт заново."
  exit 1
fi

ANSWER=$(curl -sS -m 20 "https://api.telegram.org/bot${TOKEN}/getMe" 2>&1) || { echo "❌ Не удалось обратиться к Telegram: $ANSWER"; exit 1; }
if ! printf '%s' "$ANSWER" | grep -q '"ok":true'; then
  echo "❌ Telegram не принял токен: $(printf '%s' "$ANSWER" | head -c 200)"
  exit 1
fi
USERNAME=$(printf '%s' "$ANSWER" | sed -n 's/.*"username":"\([^"]*\)".*/\1/p')
if [[ -z "$USERNAME" ]]; then
  echo "❌ Не удалось определить имя бота из ответа Telegram."
  exit 1
fi

# Предупреждаем, если у бота стоит вебхук (например, подключён конструктор): сервер при запуске его снимет.
HOOK=$(curl -sS -m 20 "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" 2>/dev/null | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
echo "Бот найден: @${USERNAME}"
if [[ -n "$HOOK" ]]; then
  echo "⚠️  У этого бота подключён вебхук (${HOOK%%\?*}) — скорее всего конструктор. После перезапуска сервер снимет его, и конструктор перестанет получать сообщения."
fi
read -r -p "Заменить бота на @${USERNAME}? Прежний бот перестанет отвечать. Напишите да: " CONFIRM
if [[ "$(printf '%s' "$CONFIRM" | tr '[:upper:]' '[:lower:]')" != "да" ]]; then
  echo "Отменено, ничего не изменено."
  exit 0
fi

BACKUP="/root/.env.backup-$(date +%s)"
cp .env "$BACKUP" && chmod 600 "$BACKUP"
sed -i '/^TELEGRAM_BOT_TOKEN=/d;/^BOT_USERNAME=/d' .env
printf '\nTELEGRAM_BOT_TOKEN=%s\nBOT_USERNAME=%s\n' "$TOKEN" "$USERNAME" >> .env
echo "✅ Записано в server/.env (копия прежнего файла: $BACKUP)"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart legalcareerist-api >/dev/null 2>&1 && echo "✅ Бот перезапущен"
  sleep 4
  echo "В журнале бота сейчас:"
  pm2 logs legalcareerist-api --lines 40 --nostream 2>/dev/null | grep -i "telegram\|слушает" | tail -4
fi
echo "Готово. Сервер работает от имени @${USERNAME}."
echo "Дальше: откройте @${USERNAME} в Telegram, нажмите Start, и проверьте в админ-кабинете «Состояние системы»."
