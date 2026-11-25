#!/usr/bin/env bash
# Run this saved file with bash on the website server; no interactive variables needed.
set -euo pipefail
umask 077
exec </dev/null

arina_checkout=${ARINA_SITE_CHECKOUT:-/var/www/legalcareerist}
arina_backup_root=${ARINA_BACKUP_ROOT:-/root/legalcareerist-bot-backups}
arina_temp_root=${ARINA_TEMP_ROOT:-/tmp}
arina_ref=856ffcf8801b65973a67409910b0b50d6c126d96
arina_phase=prepare
mkdir -p "$arina_backup_root"
arina_log="$arina_backup_root/arina-photo-recovery-20261125-last.log"
exec > >(tee "$arina_log") 2>&1
arina_stage=$(mktemp -d "$arina_temp_root/arina-release.XXXXXXXX")

arina_finish() {
  arina_status=$?
  trap - EXIT
  if (( arina_status != 0 )); then
    printf 'ARINA_PHOTO_NOT_PUBLISHED: этап=%s; журнал=%s; файлы=%s\n' "$arina_phase" "$arina_log" "$arina_stage"
  else
    rm -rf -- "$arina_stage" || true
  fi
  exit "$arina_status"
}
trap arina_finish EXIT

printf 'ARINA_RELEASE: %s\n' "$arina_ref"
arina_phase=archive
git -C "$arina_checkout" archive --format=tar --output="$arina_stage/source.tar" "$arina_ref"
tar -xf "$arina_stage/source.tar" -C "$arina_stage"

arina_phase=source
for arina_file in package.json package-lock.json scripts/publish-community-page.mjs src/assets/ambassadors/arina-bachina.png; do
  if [[ ! -s "$arina_stage/$arina_file" ]]; then
    printf 'После распаковки отсутствует файл: %s\n' "$arina_file" >&2
    exit 1
  fi
done
cd "$arina_stage"
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { createHash } from "node:crypto";
  const digest = createHash("sha256").update(readFileSync("src/assets/ambassadors/arina-bachina.png")).digest("hex");
  if (digest !== "bb6e894e8922a9a3521212c9fd1112613a922df1ab2b84bec90dbca6c6ee542a") throw Error("Не подтвержден подготовленный портрет Арины");
'

arina_phase=install
npm ci --no-audit --no-fund
arina_phase=build
npm run build
arina_phase=publish
node scripts/publish-community-page.mjs --commit "$arina_ref"
printf 'ARINA_PHOTO_PUBLISHED: https://legalcareerist.ru/community?release=arina-856ffcf#ambassadors\n'
