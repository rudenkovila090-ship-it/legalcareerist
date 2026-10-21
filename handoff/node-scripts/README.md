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

## importSubscribers.js — точные сроки подписок из Prodamus

Кладётся в `server/scripts/`. Берёт выгрузку «Подписчики → Экспорт» из Prodamus (CSV, UTF-8 или Windows-1251) и для живых подписок
(клиент и менеджер «активна», дата списания в будущем) ставит `nextPaymentAt` по дате Prodamus (МСК), снимает признак `oneTime`
(такие подписки продлеваются сами), дописывает телефон и номер подписки Prodamus; недостающие карточки заводит. Бессрочных, отключённых
и подписки с датой списания в прошлом не трогает. `--dry` — только показать. Проверено на копии данных: 42 обновляются, 1 заводится,
повторный запуск ничего не меняет.

Вместе с ним нужна правка в `server/index.js`, `handleSubscriptionPayment`: подписки 350/500 в Prodamus автопродлеваемые, поэтому
`oneTime` ставить только если Prodamus не прислал дату следующего списания:

```js
const prodamusNext = pickNextPaymentDate(subscription, paidAt)
const oneTime = !tariff && [350, 500].includes(Math.round(amount)) && !prodamusNext
const nextPaymentAt = prodamusNext ?? (tariff ? addMonths(paidAt, tariff.months) : oneTime ? paidAt + 30 * 24 * 3600 * 1000 : null)
```

Без неё после каждого продления признак `oneTime` вернётся, отмена подписки в боте не отключит списания в Prodamus, а `processExpiry` будет предлагать исключить платящих.
