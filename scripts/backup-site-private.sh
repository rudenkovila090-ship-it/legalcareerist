#!/usr/bin/env bash
# Full private copy of code, configuration, PDFs and customer data. Dependencies restore from lockfiles.
# This does not upload anything to GitHub or Telegram and does not delete previous copies.
set -euo pipefail
umask 077
site_dir="${SITE_BACKUP_SOURCE:-/var/www/legalcareerist}"
backup_dir="${SITE_BACKUP_DESTINATION:-/root/legalcareerist-backups}"
site_dir="$(realpath "$site_dir")"
backup_dir="$(realpath -m "$backup_dir")"
case "$backup_dir/" in "$site_dir/"*) echo 'Папка копии должна находиться вне папки сайта.' >&2; exit 1 ;; esac
test -f "$site_dir/server/.env"
test -d "$site_dir/server/data"
test ! -L "$site_dir/server/data"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
work_dir="$(mktemp -d "$backup_dir/.creating.XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
archive="$work_dir/site.tar.gz"
tar -czf "$archive" --exclude='./.git' --exclude='./node_modules' --exclude='./server/node_modules' --exclude='./bot2/node_modules' --exclude='node_modules.reliability-*' --exclude='dist.reliability-*' -C "$site_dir" .
tar -tzf "$archive" >/dev/null
name="legalcareerist-$(date -u +%Y%m%d-%H%M%S)-$(basename "$work_dir" | cut -c11-).tar.gz"
mv "$archive" "$backup_dir/$name"
chmod 600 "$backup_dir/$name"
(cd "$backup_dir" && sha256sum "$name" > "$name.sha256")
echo "Локальная полная копия: $backup_dir/$name"
echo 'Для защиты от потери сервера нужна также отдельная копия у хостинга или на другом носителе.'
