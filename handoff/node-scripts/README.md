# Два скрипта для Node-бота (ветка `claude/website-example-build-ygtjbs`)

Лежат здесь, потому что писать в ветку бота из этого чата было нельзя. Применять в ветке бота:

```bash
git fetch origin claude/magical-pasteur-r0fe1j
git checkout origin/claude/magical-pasteur-r0fe1j -- handoff/node-scripts/importPayments.js handoff/node-scripts/setMailingConsent.js
git mv -f handoff/node-scripts/importPayments.js server/scripts/importPayments.js   # заменяет прежний
git mv handoff/node-scripts/setMailingConsent.js server/scripts/setMailingConsent.js
git commit -m "Загрузка платежей Prodamus: статусы, ID заказа, tg_user_id; скрипт согласия на рассылку" && git push
```

- `importPayments.js` — прежний скрипт, исправленный: читает выгрузку Prodamus (статус «Выплачен», «ID заказа», колонка `tg_user_id`), пропускает билеты, материалы и возвраты, не сокращает срок доступа, не трогает бессрочных; флаг `--only-linked` не создаёт карточки для тех, кого в боте нет.
- `setMailingConsent.js` — новый: `node scripts/setMailingConsent.js да 123456789`.

Проверено на копии данных: 45 подписок и 296 платежей, повторный запуск дублей не даёт.
