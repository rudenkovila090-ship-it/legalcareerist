#!/usr/bin/env bash
# PDF материала маркетплейса — на сайт (файл лежит на сервере, покупатель получает личную ссылку на 7 дней).
# Запуск на сервере:
#   bash /var/www/legalcareerist/scripts/upload-material.sh                       — показать материалы и есть ли у каждого файл
#   bash /var/www/legalcareerist/scripts/upload-material.sh <адрес> <файл.pdf>    — загрузить или заменить файл
# Адрес материала — последняя часть его адреса на сайте, например gaid-kariera-yurista-v-notariate. Сначала скопируйте PDF на сервер (scp или файловый менеджер хостинга).
cd "$(dirname "$0")/../server" || exit 1
node --env-file=.env scripts/uploadMaterial.js "$@"
