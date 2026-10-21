#!/usr/bin/env bash
# Тестовое письмо с билетом (то же, что получает покупатель после оплаты, с пометкой [ТЕСТ] в теме).
# Запуск: bash /var/www/legalcareerist/scripts/test-ticket.sh [адрес1 адрес2 ...] ["Фамилия Имя Отчество"]
#   без адресов — на SMTP_USER, без имени — «Иванов Иван Иванович». Номер билета в тесте 999999, регистрации не создаются.
cd "$(dirname "$0")/../server" || exit 1
exec node --env-file=.env ../scripts/test-ticket.mjs "$@"
