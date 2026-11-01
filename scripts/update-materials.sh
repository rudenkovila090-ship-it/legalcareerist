#!/usr/bin/env bash
# Run after fetching the owner's reviewed release branch. PDFs are not carried through Git.
set -euo pipefail
umask 077
cd /var/www/legalcareerist
material_release_ref="$(git rev-parse --verify FETCH_HEAD)"
material_release_dir="$(mktemp -d /root/material-manager.XXXXXX)"
git archive --format=tar "$material_release_ref" | tar -xf - -C "$material_release_dir"
echo "Подготовлен пакет $(git rev-parse --short "$material_release_ref"). Сначала проверяем файлы сервера."
node "$material_release_dir/scripts/install-material-manager.mjs" </dev/null
