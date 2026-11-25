#!/usr/bin/env bash
# Run a saved file with an explicitly reviewed Git revision, from any directory.
set -euo pipefail
umask 077
exec </dev/null

if [[ $# != 1 || ! $1 =~ ^[a-f0-9]{7,40}$ ]]; then
  printf 'Укажите версию: bash publish-ambassador-photos.sh COMMIT\n' >&2
  exit 2
fi
portrait_checkout=${PORTRAIT_SITE_CHECKOUT:-/var/www/legalcareerist}
portrait_backup_root=${PORTRAIT_BACKUP_ROOT:-/root/legalcareerist-bot-backups}
portrait_temp_root=${PORTRAIT_TEMP_ROOT:-/tmp}
portrait_phase=prepare
mkdir -p "$portrait_backup_root"
portrait_log="$portrait_backup_root/ambassador-photos-20261125-last.log"
exec > >(tee "$portrait_log") 2>&1
portrait_stage=$(mktemp -d "$portrait_temp_root/ambassador-release.XXXXXXXX")

portrait_finish() {
  portrait_status=$?
  trap - EXIT
  if (( portrait_status != 0 )); then
    printf 'AMBASSADOR_PHOTOS_NOT_PUBLISHED: этап=%s; журнал=%s; файлы=%s\n' "$portrait_phase" "$portrait_log" "$portrait_stage"
  else
    rm -rf -- "$portrait_stage" || true
  fi
  exit "$portrait_status"
}
trap portrait_finish EXIT

portrait_phase=archive
portrait_ref=$(git -C "$portrait_checkout" rev-parse --verify "$1^{commit}")
printf 'AMBASSADOR_RELEASE: %s\n' "$portrait_ref"
git -C "$portrait_checkout" archive --format=tar --output="$portrait_stage/source.tar" "$portrait_ref"
tar -xf "$portrait_stage/source.tar" -C "$portrait_stage"

portrait_phase=source
for portrait_file in package.json package-lock.json scripts/publish-community-page.mjs src/assets/ambassadors/arina-bachina.png src/assets/ambassadors/anastasia-domanova.png; do
  if [[ ! -s "$portrait_stage/$portrait_file" ]]; then
    printf 'После распаковки отсутствует файл: %s\n' "$portrait_file" >&2
    exit 1
  fi
done
cd "$portrait_stage"
node --input-type=module -e '
  import { readFileSync, readdirSync } from "node:fs";
  const directory = "src/assets/ambassadors/";
  const files = readdirSync(directory).filter(file => file.endsWith(".png"));
  for (const file of files) {
    if (!readFileSync(directory + file).subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw Error("Некорректный PNG: " + file);
  }
  console.log("Проверены файлы портретов: " + files.length);
'
portrait_phase=install
npm ci --no-audit --no-fund
portrait_phase=build
npm run build
portrait_phase=publish
node scripts/publish-community-page.mjs --commit "$portrait_ref"
printf 'AMBASSADOR_PHOTOS_PUBLISHED: https://legalcareerist.ru/community?release=%s#ambassadors\n' "${portrait_ref:0:8}"
