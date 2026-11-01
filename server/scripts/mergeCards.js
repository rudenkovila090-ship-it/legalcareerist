// Слияние двух карточек одного человека (дубль после повторной покупки или после ошибки сопоставления платежа):
//   node scripts/mergeCards.js <оставить> <убрать> [--dry]
// Карточки задаются началом токена (4–6 символов, его показывает команда поиска). Платежи объединяются без повторов, пустые поля оставляемой
// карточки добираются из убираемой (Telegram, телефон, почта, перенос из BotHelp, профиль Prodamus, даты первой оплаты и вступления), убираемая удаляется.
// Дата следующего списания и сумма остаются как в оставляемой карточке: после слияния сверьте их с Prodamus (scripts/importSubscribers.js со свежей выгрузкой).
import { listJoins, patchJoin, removeJoin } from '../lib/store.js'

const [keepPrefix, dropPrefix] = process.argv.slice(2)
const dry = process.argv.includes('--dry')
if (!keepPrefix || !dropPrefix || keepPrefix.length < 4 || dropPrefix.length < 4) {
  console.error('Использование: node scripts/mergeCards.js <начало токена оставляемой> <начало токена убираемой> [--dry]')
  process.exit(1)
}
const joins = listJoins()
const find = (prefix) => {
  const hit = joins.filter((j) => j.token.startsWith(prefix))
  if (hit.length !== 1) {
    console.error(`«${prefix}»: найдено карточек ${hit.length}, нужна ровно одна. Укажите больше символов.`)
    process.exit(1)
  }
  return hit[0]
}
const keep = find(keepPrefix)
const drop = find(dropPrefix)
if (keep.token === drop.token) {
  console.error('Это одна и та же карточка.')
  process.exit(1)
}
const digits = (v) => String(v ?? '').replace(/\D/g, '')
const mail = (v) => String(v ?? '').trim().toLowerCase()
const same = (keep.tgUserId && keep.tgUserId === drop.tgUserId) || (digits(keep.phone) && digits(keep.phone) === digits(drop.phone)) || (mail(keep.email) && mail(keep.email) === mail(drop.email))
if (!same) {
  console.error('У карточек не совпал ни Telegram id, ни телефон, ни почта: похоже, это разные люди. Ничего не делаю.')
  process.exit(1)
}

// платежи: объединяем, повторы (тот же заказ или тот же день и сумма) не добавляем; приблизительные записи убираемой карточки не нужны, если у оставляемой есть платежи
const key = (p) => p.orderKey || `${new Date(p.at).toISOString().slice(0, 10)}:${p.amount}`
const seen = new Set((keep.payments ?? []).map(key))
const extra = (drop.payments ?? []).filter((p) => !(p.estimated && (keep.payments ?? []).length) && !seen.has(key(p)))
const payments = [...(keep.payments ?? []), ...extra].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
const fill = {}
for (const f of ['tgUserId', 'phone', 'email', 'telegram', 'importedFromBotHelp', 'prodamusProfileId', 'prodamusSubscriptionId', 'joinedAt', 'reviewAskedAt', 'reviewThankedAt', 'reviewRequestedAt']) if (!keep[f] && drop[f]) fill[f] = drop[f]
if (!keep.name || keep.name === '—') fill.name = drop.name
const firsts = [keep.firstPaidAt, drop.firstPaidAt].filter(Boolean)
if (firsts.length) fill.firstPaidAt = Math.min(...firsts)
fill.bonusDays = Math.max(keep.bonusDays ?? 0, drop.bonusDays ?? 0) || undefined
fill.payments = payments
fill.lastPaidAt = Math.max(keep.lastPaidAt ?? 0, drop.lastPaidAt ?? 0, ...payments.filter((p) => !p.estimated).map((p) => p.at ?? 0)) || undefined

const ruDate = (ts) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—')
const show = (j) => `${j.token.slice(0, 6)} · тариф ${j.tariffId ?? 'нет'} · ${j.status} · списание ${ruDate(j.nextPaymentAt)} · платежи ${(j.payments ?? []).map((p) => p.amount ?? '—').join('+')}`
console.log(`${dry ? '[пробный запуск, ничего не изменено]\n' : ''}Оставляю: ${show(keep)}\nУбираю:   ${show(drop)}`)
console.log(`Платежей после слияния: ${payments.length} (${payments.map((p) => `${ruDate(p.at)} ${p.amount ?? '—'}`).join(', ')})`)
console.log(`Из убираемой переходят поля: ${Object.keys(fill).filter((f) => !['payments', 'lastPaidAt', 'bonusDays', 'firstPaidAt'].includes(f)).join(', ') || 'нет'}`)
if (dry) process.exit(0)
patchJoin(keep.token, fill)
removeJoin(drop.token)
console.log('Готово. Сверьте дату списания в карточке с Prodamus.')
