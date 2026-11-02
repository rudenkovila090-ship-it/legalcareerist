#!/usr/bin/env bash
# Только информационный партнёр Legal Night Jazz 2; API и бот не перезапускаются.
set -euo pipefail
cd "${SITE_DIR:-/var/www/legalcareerist}"
git fetch origin codex/site-reliability
patch_file=$(mktemp /tmp/legal-jazz-patch.XXXXXX)
git show --format= --no-ext-diff e9e4b200009fef61f7198069591b0de08c7a27df -- src/data/eventStories.ts src/assets/noir/partner-placeholder.svg > "$patch_file"
if git apply --reverse --check "$patch_file" 2>/dev/null; then
  rm -f "$patch_file"
  echo 'Изменение уже есть в исходниках. Повторно ничего не изменено.'
  exit 0
fi
git apply --check "$patch_file"
backup_file=$(mktemp /tmp/legal-jazz-backup.XXXXXX.tar.gz)
tar -czf "$backup_file" src/data/eventStories.ts dist
git apply "$patch_file"
if ! npm run build; then
  rm -rf dist
  tar -xzf "$backup_file"
  rm -f src/assets/noir/partner-placeholder.svg
  rm -f "$patch_file"
  echo "Сборка не прошла, прежняя версия восстановлена. Копия: $backup_file" >&2
  exit 1
fi
rm -f "$patch_file"
printf 'Сайт собран. Резервная копия: %s\n' "$backup_file"
