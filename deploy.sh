#!/usr/bin/env bash
# Обновление боевого сервера одной командой: bash deploy.sh
set -euo pipefail
BRANCH="${BRANCH:-claude/website-example-build-ygtjbs}"
cd "$(dirname "$0")"
git pull origin "$BRANCH"
npm install --no-audit --no-fund
npm run build
(cd server && npm install --no-audit --no-fund --omit=dev)
pm2 restart legalcareerist-api
sleep 3
pm2 status legalcareerist-api
echo "Готово: сайт собран, бот перезапущен."
