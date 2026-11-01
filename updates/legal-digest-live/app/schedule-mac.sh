#!/bin/bash
# Автозапуск дайджеста на Mac через launchd.
#
#   bash schedule-mac.sh                  каждый день в 9:00 и в 15:00
#   bash schedule-mac.sh 8:30             один раз в день, в 8:30
#   bash schedule-mac.sh 9:00 13:00 17:30 в каждое из названных времён
#   bash schedule-mac.sh --dry-run        показать, что будет сделано, ничего не меняя
#   bash schedule-mac.sh --remove         убрать автозапуск
#
# Первый запуск за день (и любой до полудня) присылает всю сводку: мероприятия, вакансии, новости о людях,
# законодательство и практику. Следующие запуски днём присылают только новые вакансии и молчат, если новых нет.
#
# Если в нужное время Mac спал, запуск произойдёт при пробуждении. Если он был выключен, сводка придёт сразу
# после включения Mac и входа в систему (а при установке расписания первая сводка придёт сразу):
# прочитанное программа помнит, ничего не потеряется и не повторяется.
set -eu

LABEL="ru.careerlawyer.digest"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$HERE/.venv/bin/python"
TIMES=""
DRY=0
REMOVE=0

say() { printf '%s\n' "$*" >&2; }
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --remove) REMOVE=1 ;;
    [0-9]*:[0-9][0-9]) TIMES="$TIMES $arg" ;;
    *) say "Непонятный параметр: $arg (ожидается время вида 9:00, --dry-run или --remove)"; exit 1 ;;
  esac
done
[ -n "$TIMES" ] || TIMES="9:00 15:00"

if [ "$REMOVE" = 1 ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  say "Автозапуск удалён."
  exit 0
fi

# Каждое время превращаем в запись для launchd; для одного времени достаточно словаря, для нескольких нужен массив.
COUNT=0
DICTS=""
SHOWN=""
for t in $TIMES; do
  HOUR=$((10#${t%%:*}))
  MINUTE=$((10#${t##*:}))
  if [ "$HOUR" -gt 23 ] || [ "$MINUTE" -gt 59 ]; then
    say "Неверное время: $t (пример: 9:00 или 08:30)"
    exit 1
  fi
  COUNT=$((COUNT + 1))
  DICTS="$DICTS
      <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>"
  SHOWN="$SHOWN, $(printf '%d:%02d' "$HOUR" "$MINUTE")"
  ONE="<dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>"
done
SHOWN="${SHOWN#, }"
if [ "$COUNT" = 1 ]; then
  INTERVAL_XML="$ONE"
else
  INTERVAL_XML="<array>$DICTS
    </array>"
fi

# macOS не даёт фоновым задачам читать «Загрузки», «Рабочий стол» и «Документы».
case "$HERE" in
  "$HOME/Downloads"/*|"$HOME/Desktop"/*|"$HOME/Documents"/*)
    say "Папка лежит в «Загрузках», «Рабочем столе» или «Документах», а оттуда фоновый запуск не сработает."
    say "Перенесите её в домашнюю папку и запустите скрипт оттуда:"
    say "  mv \"$HERE\" \"$HOME/telegram-digest\""
    say "  cd \"$HOME/telegram-digest\" && bash schedule-mac.sh"
    exit 1
    ;;
esac

[ -f "$HERE/.env" ] || { say "Нет файла .env (см. README, шаг 5)."; exit 1; }
[ -f "$HERE/data/session.session" ] || { say "Нет входа в Telegram. Сначала выполните: python -m digest login"; exit 1; }

if ! "$PY" -c "import telethon, dotenv" 2>/dev/null; then
  say "Готовлю окружение (после переноса папки это нужно сделать заново)..."
  if [ "$DRY" = 0 ]; then
    rm -rf "$HERE/.venv"
    python3 -m venv "$HERE/.venv"
    "$PY" -m pip install -q -r "$HERE/requirements.txt"
  fi
fi

make_plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(esc "$PY")</string>
    <string>-m</string>
    <string>digest</string>
    <string>run</string>
    <string>--auto</string>
  </array>
  <key>WorkingDirectory</key><string>$(esc "$HERE")</string>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PYTHONIOENCODING</key><string>utf-8</string>
  </dict>
  <key>StartCalendarInterval</key>
  $INTERVAL_XML
  <key>StandardOutPath</key><string>$(esc "$HERE")/data/run.log</string>
  <key>StandardErrorPath</key><string>$(esc "$HERE")/data/run.log</string>
</dict>
</plist>
PLIST
}

if [ "$DRY" = 1 ]; then
  make_plist
  exit 0
fi

mkdir -p "$HERE/data" "$HOME/Library/LaunchAgents"
make_plist > "$PLIST"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

say "Готово: дайджест будет приходить каждый день в $SHOWN."
say "Первая сводка запущена прямо сейчас: через пару минут смотрите чат с ботом."
say "Проверить, что всё настроено:  $PY -m digest status"
say "Отключить:                     bash schedule-mac.sh --remove"
