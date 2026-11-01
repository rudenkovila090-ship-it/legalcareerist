// Убирает платёж из карточки подписчика после возврата денег (иначе он остаётся доходом в отчётах):
//   node scripts/removePayment.js <начало токена карточки> <номер заказа Prodamus> [--dry]
// Меняется только список платежей и даты первой и последней оплаты; срок подписки (nextPaymentAt) и статус не трогаются.
// Номер заказа берётся из Prodamus («ID заказа» в списке платежей) или из команды поиска карточки.
import { listJoins, patchJoin } from '../lib/store.js'

const [prefix, orderKey] = process.argv.slice(2)
const dry = process.argv.includes('--dry')
if (!prefix || prefix.length < 4 || !orderKey || orderKey.startsWith('--')) {
  console.error('Использование: node scripts/removePayment.js <начало токена карточки> <номер заказа> [--dry]')
  process.exit(1)
}
const hit = listJoins().filter((j) => j.token.startsWith(prefix))
if (hit.length !== 1) {
  console.error(`«${prefix}»: найдено карточек ${hit.length}, нужна ровно одна. Укажите больше символов.`)
  process.exit(1)
}
const join = hit[0]
const payments = join.payments ?? []
const target = payments.filter((p) => String(p.orderKey ?? '') === String(orderKey))
if (target.length !== 1) {
  console.error(`В карточке ${join.token.slice(0, 6)} платёж с заказом ${orderKey} найден ${target.length} раз. Номера заказов в карточке: ${payments.map((p) => p.orderKey ?? '—').join(', ')}.`)
  process.exit(1)
}
const rest = payments.filter((p) => p !== target[0] && String(p.orderKey ?? '') !== String(orderKey))
const real = rest.filter((p) => !p.estimated && p.at)
const ruDate = (ts) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—')
console.log(`${dry ? '[пробный запуск, ничего не изменено]\n' : ''}Карточка ${join.token.slice(0, 6)}: убираю платёж ${ruDate(target[0].at)}, ${target[0].amount ?? '—'} ₽ (заказ ${orderKey}).`)
console.log(`Останется платежей: ${rest.length} (${rest.map((p) => `${ruDate(p.at)} ${p.amount ?? '—'}`).join(', ') || 'нет'}). Последняя оплата: ${ruDate(Math.max(0, ...real.map((p) => p.at)))}.`)
if (dry) process.exit(0)
patchJoin(join.token, {
  payments: rest,
  firstPaidAt: real.length ? Math.min(...real.map((p) => p.at)) : join.firstPaidAt,
  lastPaidAt: real.length ? Math.max(...real.map((p) => p.at)) : join.lastPaidAt,
})
console.log('Готово.')
