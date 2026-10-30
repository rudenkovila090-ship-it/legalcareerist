#!/usr/bin/env bash
# Новая личная ссылка на купленный материал (действует 7 дней): покупатель не успел скачать, потерял письмо или файл загрузили позже.
# Запуск на сервере:
#   bash /var/www/legalcareerist/scripts/material-link.sh <почта | телефон | начало токена покупки>          — напечатать ссылку(и)
#   bash /var/www/legalcareerist/scripts/material-link.sh <почта | телефон | начало токена покупки> --send   — ещё и отправить письмо покупателю
cd "$(dirname "$0")/../server" || exit 1
node --env-file=.env scripts/materialLink.js "$@"
