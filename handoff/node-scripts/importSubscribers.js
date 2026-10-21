// Точные сроки подписок из выгрузки Prodamus («Подписчики» → Экспорт). Деньги списывает Prodamus, поэтому его дата
// «Будущий платёж» главная: она ставится в карточку вместо «дней» из BotHelp.
//   node scripts/importSubscribers.js файл.csv --dry   — только показать, что будет сделано
//   node scripts/importSubscribers.js файл.csv         — записать
// Берутся подписки, у которых и клиент, и менеджер «активна» и дата следующего списания в будущем (время московское):
//   • карточка есть — nextPaymentAt = дата Prodamus, статус «активна», снимается признак «разовая» (такая подписка продлевается
//     сама), дописывается телефон, если его не было, и номер подписки Prodamus;
//   • карточки нет — заводится (как при импорте BotHelp, без истории платежей).
// Бессрочных не трогает. Подписки с датой списания в прошлом (списание не прошло) и отключённые не меняет, а показывает списком.
// Повторный запуск безопасен. Файл может быть в UTF-8 или Windows-1251.
import fs from 'node:fs'
import { listJoins, setJoinField, createImportedJoin } from '../lib/store.js'
import { getBotUser } from '../lib/botUsers.js'
import { parseCsv } from '../lib/botHelpImport.js'

const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) {
  console.error('Укажите файл: node scripts/importSubscribers.js выгрузка.csv [--dry]')
  process.exit(1)
}

function readText(path) {
  const buf = fs.readFileSync(path)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1251').decode(buf)
  }
}

/** «26.10.2026 15:52» (московское время) → миллисекунды; NaN, если не дата. */
function parseDate(value) {
  const m = String(value ?? '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  return m ? Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4] ?? '12'}:${m[5] ?? '00'}:${m[6] ?? '00'}+03:00`) : NaN
}

const rows = parseCsv(readText(file))
const header = rows.shift()?.map((h) => h.trim().toLowerCase().replace('ё', 'е')) ?? []
const col = (name) => header.indexOf(name)
const need = ['tg id', 'id', 'будущий платеж', 'активность (пользователь)', 'активность (менеджер)']
const missing = need.filter((n) => col(n) < 0)
if (missing.length) {
  console.error(`Это не выгрузка подписчиков Prodamus: нет колонок ${missing.join(', ')}. Заголовки: ${header.join(' | ')}`)
  process.exit(1)
}
const get = (r, name) => String(r[col(name)] ?? '').trim()

const now = Date.now()
const live = new Map() // tg id → строка с самой поздней датой списания
let notTelegram = 0
let off = 0
const overdue = []
for (const r of rows) {
  const tg = get(r, 'tg id')
  if (!/^\d{5,11}$/.test(tg)) {
    notTelegram += 1
    continue
  }
  if (get(r, 'активность (пользователь)') !== 'активна' || get(r, 'активность (менеджер)') !== 'активна') {
    off += 1
    continue
  }
  const next = parseDate(get(r, 'будущий платеж'))
  if (Number.isNaN(next)) {
    off += 1
    continue
  }
  if (next < now) {
    overdue.push(tg)
    continue
  }
  const prev = live.get(tg)
  if (!prev || next > prev.next) live.set(tg, { next, subId: get(r, 'id'), price: Number(get(r, 'стоимость')) || null, phone: get(r, 'телефон'), since: parseDate(get(r, 'дата подписки')) })
}

const label = (tg) => {
  const u = getBotUser(tg)
  return `${[u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.name || 'без имени'} …${tg.slice(-4)}`
}

let updated = 0
let unchanged = 0
let created = 0
let lifetime = 0
const joins = listJoins()
for (const [tg, s] of live) {
  const mine = joins.filter((j) => String(j.tgUserId) === tg)
  if (mine.some((j) => j.lifetime)) {
    lifetime += 1
    continue
  }
  const join = mine.sort((a, b) => (b.nextPaymentAt ?? 0) - (a.nextPaymentAt ?? 0) || b.createdAt - a.createdAt)[0]
  if (!join) {
    created += 1
    if (!dry) {
      const u = getBotUser(tg)
      const token = createImportedJoin({ tgUserId: tg, name: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || u?.name || '', amount: s.price, oneTime: false, nextPaymentAt: s.next, firstPaidAt: Number.isNaN(s.since) ? null : s.since, phone: s.phone })
      if (s.subId) setJoinField(token, 'prodamusSubscriptionId', s.subId)
    }
    continue
  }
  const same = join.nextPaymentAt === s.next && join.status === 'active' && join.paid && !join.oneTime && String(join.prodamusSubscriptionId ?? '') === s.subId && (join.phone || !s.phone)
  if (same) {
    unchanged += 1
    continue
  }
  updated += 1
  if (dry) continue
  setJoinField(join.token, 'nextPaymentAt', s.next)
  setJoinField(join.token, 'status', 'active')
  setJoinField(join.token, 'paid', true)
  if (join.oneTime) setJoinField(join.token, 'oneTime', undefined)
  if (s.subId) setJoinField(join.token, 'prodamusSubscriptionId', s.subId)
  if (!join.phone && s.phone) setJoinField(join.token, 'phone', s.phone)
}

console.log(`Строк в файле: ${rows.length}. Живых подписок с датой списания в будущем: ${live.size}${dry ? ' (пробный запуск, ничего не записано)' : ''}`)
console.log(`  срок обновлён по Prodamus: ${updated}, уже совпадает: ${unchanged}, заведено новых карточек: ${created}${lifetime ? `, бессрочных пропущено: ${lifetime}` : ''}`)
console.log(`  отключённых клиентом или менеджером (не меняю): ${off}${notTelegram ? `, без Telegram id: ${notTelegram}` : ''}`)
if (overdue.length) console.log(`  дата списания уже прошла, не меняю: ${overdue.map(label).join('; ')}`)
