// Ручное добавление оплаты в учёт — для платежей, которые прошли в Prodamus,
// но вебхук не дошёл (или прошли до запуска учёта). Запуск из папки server:
//   node scripts/addPayment.js --order 49311292 --sum 690 --date "2026-09-29 22:31" \
//     --tariff 1m --phone 89991234567 --email a@b.ru --name "Иванов Иван" --telegram @ivan [--renewal] [--label "Скидка 350"]
// Дата — московское время. Повторный запуск с тем же --order ничего не дублирует.
import { findJoinForPayment, createOrphanJoin, recordPayment } from '../lib/store.js'

const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue
  const key = argv[i].slice(2)
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) args[key] = true
  else {
    args[key] = next
    i++
  }
}

if (!args.order || !args.sum || !args.date) {
  console.error('Нужны --order, --sum и --date "ГГГГ-ММ-ДД ЧЧ:ММ" (МСК). См. комментарий в начале файла.')
  process.exit(1)
}

const dateStr = String(args.date).replace(' ', 'T')
const paidAt = new Date(`${dateStr}${dateStr.length <= 16 ? ':00' : ''}+03:00`).getTime()
if (Number.isNaN(paidAt)) {
  console.error('Не разобрал дату:', args.date)
  process.exit(1)
}
const amount = Number(args.sum)
const tariffId = args.tariff && args.tariff !== true ? String(args.tariff) : null
const subscriptionName = tariffId && ['1m', '3m', '6m'].includes(tariffId) ? null : String(args.label || `Скидочный тариф ${amount} ₽`)
const contact = { phone: args.phone, email: args.email, telegram: args.telegram }

let match = findJoinForPayment({ ...contact, tariffId: null })
if (!match) {
  match = { join: { token: createOrphanJoin({ tariffId, name: args.name || '—', ...contact }) } }
}
const result = recordPayment(match.join.token, {
  tariffId,
  amount,
  paidAt,
  orderKey: String(args.order),
  nextPaymentAt: null,
  paymentNum: args.renewal ? 2 : 1,
  subscriptionName,
})
console.log(result?.duplicate ? 'Уже учтено, пропускаю.' : `Оплата добавлена: ${result?.kind}, ${amount} ₽, карточка ${match.join.token}`)
