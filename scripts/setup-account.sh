#!/usr/bin/env bash
# Логин и пароль администратора для входа в личный кабинет на сайте (/cabinet).
# Запуск на сервере:  bash /var/www/legalcareerist/scripts/setup-account.sh
# Спрашивает логин и пароль (при вводе пароля ничего не видно; пароль просит повторить, чтобы не опечататься),
# записывает в server/.env только логин и хэш пароля (сам пароль нигде не сохраняется), закрывает прежние входы
# администратора, перезапускает сервер и в конце сам проверяет, что вход с этими логином и паролем работает.
# Повторный запуск меняет пароль. Входы резидентов (по почте) не затрагиваются.
set -uo pipefail
cd "$(dirname "$0")/../server" || exit 1

printf '\033[?2004l'
# Из введённого убираем только то, что добавляет терминал при вставке (маркеры вставки и перевод строки).
# Пробелы внутри пароля остаются: в браузере он вводится ровно так же.
paste_clean() { printf '%s' "$1" | sed $'s/\x1b\\[20[01]~//g' | tr -d '\r\n'; }

read -r -p "Логин: " LOGIN
read -r -s -p "Пароль (не меньше 12 знаков; ничего не видно, после ввода или вставки нажмите Enter): " PW
echo
read -r -s -p "Повторите пароль: " PW2
echo
LOGIN=$(paste_clean "$LOGIN" | tr -d '[:cntrl:][:space:]')
PW=$(paste_clean "$PW")
PW2=$(paste_clean "$PW2")

if [ "$PW" != "$PW2" ]; then
  echo "❌ Пароли не совпали. Ничего не изменено, запустите скрипт ещё раз."
  exit 1
fi
LEN=$(ACC_PW="$PW" node -e 'console.log([...process.env.ACC_PW].length)')
echo "Принято: логин ${LOGIN}, пароль из ${LEN} знаков."

LINES=$(ACC_LOGIN="$LOGIN" ACC_PW="$PW" node scripts/setAccount.js) || exit 1

BACKUP="/root/.env.backup-$(date +%s)"
cp .env "$BACKUP" && chmod 600 "$BACKUP"
sed -i '/^ACCOUNT_LOGIN=/d;/^ACCOUNT_PASSWORD_HASH=/d' .env
printf '\n%s\n' "$LINES" >> .env
# закрываются только входы администратора; резиденты, вошедшие в кабинет по почте, остаются на месте
node -e "import('./lib/accountAuth.js').then((m) => m.revokeAdminSessions())"
echo "✅ Записано в server/.env: логин и хэш пароля (копия прежнего файла: $BACKUP)"

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart legalcareerist-api >/dev/null 2>&1 && echo "✅ Сервер перезапущен"
fi

# Проверка: входим этим логином и паролем в только что перезапущенный сервер (ждём его до 15 секунд) и сразу выходим.
PORT=$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]"')
RESULT=$(ACC_LOGIN="$LOGIN" ACC_PW="$PW" ACC_PORT="${PORT:-3001}" node --input-type=module -e '
const base = `http://127.0.0.1:${process.env.ACC_PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 15; i++) {
  try {
    const r = await fetch(base + "/api/account/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login: process.env.ACC_LOGIN, password: process.env.ACC_PW }) })
    const j = await r.json().catch(() => ({}))
    if (j.token) {
      await fetch(base + "/api/account/logout", { method: "POST", headers: { authorization: "Bearer " + j.token } })
      console.log("ok")
    } else console.log(r.status === 429 ? "limit" : "bad")
    process.exit(0)
  } catch {
    await sleep(1000)
  }
}
console.log("down")
' 2>/dev/null | tail -1)
case "$RESULT" in
  ok) echo "✅ Проверка: вход с этим логином и паролем работает. Можно открывать https://legalcareerist.ru/cabinet" ;;
  bad) echo "❌ Проверка: сервер не принял этот логин и пароль. Запустите скрипт ещё раз; если повторится, пришлите этот экран." ;;
  limit) echo "⚠️ Проверка не прошла: слишком много неудачных входов за последние 15 минут. Подождите 15 минут и войдите на сайте." ;;
  *) echo "⚠️ Не удалось проверить: сервер не ответил за 15 секунд. Посмотрите: pm2 status и pm2 logs legalcareerist-api --lines 30 --nostream" ;;
esac
echo "Вход: https://legalcareerist.ru/cabinet"
