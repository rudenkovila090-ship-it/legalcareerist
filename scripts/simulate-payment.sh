#!/usr/bin/env bash
# Запуск имитации оплаты материала (без денег). См. комментарий в simulate-payment.mjs.
cd "$(dirname "$0")/../server" || exit 1
exec node --env-file=.env ../scripts/simulate-payment.mjs
