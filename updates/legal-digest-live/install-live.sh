#!/usr/bin/env bash
# Run as root on Timeweb AFTER extracting this release. Never run on the Mac.
set -Eeuo pipefail
cd "$(dirname "$0")"
release="$PWD"
app=/opt/legal-digest
test "$(id -u)" -eq 0
exec 9>/run/lock/legal-digest-update.lock
flock -n 9 || { echo 'Другое обновление уже выполняется'; exit 1; }
test -x "$app/.venv/bin/python"
test -f "$app/.env"
test -d "$app/data"
test -f /etc/systemd/system/legal-digest.service
if [ -n "$(systemctl show legal-digest.service -p DropInPaths --value)" ]; then
  echo 'Найдены дополнительные настройки службы. Нужна проверка перед обновлением.'
  exit 1
fi

python3 - "$release" "$app" <<'PY'
import hashlib,json,sys
from pathlib import Path
release,app=map(Path,sys.argv[1:])
old=json.loads((release/'original-sha256.json').read_text())
new=json.loads((release/'new-sha256.json').read_text())
for name,digest in new.items():
    assert hashlib.sha256((release/'app/digest'/name).read_bytes()).hexdigest()==digest, 'Повреждён файл обновления: '+name
for name,digest in old.items():
    p=app/'digest'/name
    if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
        raise SystemExit('Код на сервере отличается от проверенной версии: '+name+'. Ничего не изменено.')
for name in new.keys()-old.keys():
    if (app/'digest'/name).exists():
        raise SystemExit('Новый файл уже существует: '+name+'. Ничего не изменено.')
print('Исходная версия совпала с проверенной.')
PY

# Tests run against this release, not the production .env/data, with mocked Telegram.
(cd "$release/app" && "$app/.venv/bin/python" -m unittest discover -s tests -t .)
systemd-analyze verify "$release/deploy/legal-digest.service"
backup="$(mktemp -d /root/legal-digest-live-backup.XXXXXX)"
chmod 700 "$backup"
cp -a "$app/digest" "$backup/digest"
cp -a /etc/systemd/system/legal-digest.service "$backup/legal-digest.service"
cp "$release/original-sha256.json" "$release/new-sha256.json" "$backup/"
timer_was_enabled=0
if systemctl is-enabled --quiet legal-digest.timer; then timer_was_enabled=1; fi
printf '%s\n' "$timer_was_enabled" > "$backup/timer-was-enabled"

cat > "$backup/rollback.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
systemctl stop legal-digest.service
systemctl disable legal-digest.service || true
python3 - "$PWD" <<'PY'
import json,shutil,sys
from pathlib import Path
backup=Path(sys.argv[1]);dest=Path('/opt/legal-digest/digest')
old=json.loads((backup/'original-sha256.json').read_text())
new=json.loads((backup/'new-sha256.json').read_text())
for name in old:
    shutil.copy2(backup/'digest'/name,dest/name)
for name in new.keys()-old.keys():
    (dest/name).unlink(missing_ok=True)
PY
chown -R legal-digest:legal-digest /opt/legal-digest/digest
cp legal-digest.service /etc/systemd/system/legal-digest.service
chmod 644 /etc/systemd/system/legal-digest.service
systemctl daemon-reload
if [ "$(cat timer-was-enabled)" = 1 ]; then systemctl enable --now legal-digest.timer; fi
echo 'Возвращены прежний код и расписание. Текущая история отправок сохранена.'
ROLLBACK
chmod 700 "$backup/rollback.sh"

rollback_on_error() {
  trap - ERR
  echo "Обновление прервано. Возвращаю прежнюю службу. Копия: $backup"
  bash "$backup/rollback.sh" || echo "Автоматический откат не завершён. Сохраните этот путь: $backup"
}
trap rollback_on_error ERR
systemctl stop legal-digest.timer legal-digest.service
tar -czf "$backup/private-state.tar.gz" -C "$app" .env data
chmod 600 "$backup/private-state.tar.gz"
for file in "$release"/app/digest/*.py; do
  install -o legal-digest -g legal-digest -m 640 "$file" "$app/digest/"
done
install -m 644 "$release/deploy/legal-digest.service" /etc/systemd/system/legal-digest.service
systemctl daemon-reload
systemctl disable legal-digest.timer
systemctl enable --now legal-digest.service
trap - ERR
echo "Обновление установлено. Запуск и подключение к Telegram ещё нужно проверить."
echo "Резервная копия и откат: $backup/rollback.sh"
systemctl show legal-digest.service -p ActiveState -p SubState
journalctl -u legal-digest.service -n 10 --no-pager
