// Разовое сообщение одному резиденту от имени бота и жёлтая метка «на контроле списания»: 🟡 в списках админа
// (подписчики, списания, просрочено), пока не придёт следующая успешная оплата (платёж снимает метку сам).
//   node --env-file=.env scripts/sendNotice.js return 4391 [--dry]   — вернуть в чат: подписка активна, а человека исключили по ошибке
//   node --env-file=.env scripts/sendNotice.js charge 7679 [--dry]   — списание не прошло: предложить оформить подписку на сайте
//   node --env-file=.env scripts/sendNotice.js mark 7679             — только поставить метку 🟡, ничего не отправляя
//   node --env-file=.env scripts/sendNotice.js clear 7679            — снять метку вручную
// Человека находим по последним цифрам его Telegram id (должен найтись ровно один человек). То же сообщение второй раз не отправляется.
// Писать можно только тому, кто открывал этого бота; если Telegram не доставит, скрипт скажет об этом, метка при этом всё равно ставится.
import { listJoins, setJoinField } from '../lib/store.js'
import { getBotUser, addTag } from '../lib/botUsers.js'

const [kind, suffix] = process.argv.slice(2)
const dry = process.argv.includes('--dry')
const KINDS = ['return', 'charge', 'mark', 'clear']
if (!KINDS.includes(kind) || !/^\d{3,11}$/.test(suffix ?? '')) {
  console.error('Использование: node --env-file=.env scripts/sendNotice.js return|charge|mark|clear <последние цифры id> [--dry]')
  process.exit(1)
}
const token = process.env.TELEGRAM_BOT_TOKEN
if (!token && !dry && (kind === 'return' || kind === 'charge')) {
  console.error('Нет TELEGRAM_BOT_TOKEN: запускайте как  node --env-file=.env scripts/sendNotice.js …')
  process.exit(1)
}
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'
const SUPPORT = (process.env.SUPPORT_HANDLE || '@legalcareerist_support').replace(/^@/, '')
const CHAT_ID = process.env.COMMUNITY_CHAT_ID || '-1002520943910'
const INVITE = process.env.COMMUNITY_INVITE_LINK
const WATCH_TAG = 'контроль_списания'

const people = new Map()
for (const j of listJoins()) if (j.tgUserId && String(j.tgUserId).endsWith(suffix)) people.set(String(j.tgUserId), [...(people.get(String(j.tgUserId)) ?? []), j])
if (people.size !== 1) {
  console.error(people.size ? `Под «…${suffix}» подходит ${people.size} человек: укажите больше цифр id.` : `Под «…${suffix}» никого не нашёл.`)
  process.exit(1)
}
const [[tgId, joins]] = [...people]
// та же карточка, что выбирает бот: бессрочная, затем активная, затем по последней оплате
const rank = (j) => (j.lifetime ? 2 : j.status === 'active' ? 1 : 0)
const join = joins.sort((a, b) => rank(b) - rank(a) || (b.lastPaidAt ?? 0) - (a.lastPaidAt ?? 0))[0]
const user = getBotUser(tgId) ?? {}
const first = user.firstName || (join.name && join.name !== '—' ? join.name.split(' ')[0] : '')
const hello = first ? `Привет, ${first}! 👋` : 'Привет! 👋'
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))
const who = `${first || 'без имени'} …${tgId.slice(-4)}`

if (kind === 'clear') {
  setJoinField(join.token, 'watch', undefined)
  console.log(`Метка снята: ${who}`)
  process.exit(0)
}

if (kind === 'mark') {
  setJoinField(join.token, 'watch', 'charge')
  addTag(tgId, WATCH_TAG)
  console.log(`Метка 🟡 поставлена: ${who} (снимется сама после следующей успешной оплаты)`)
  process.exit(0)
}

const support = { text: 'Поддержка', url: `https://t.me/${SUPPORT}` }
const NOTICES = {
  return: {
    text: `${hello}\n\nПри переезде на новую систему подписок тебя по ошибке исключили из закрытого чата сообщества. Твоя подписка активна и оплачена, поэтому возвращаем тебе доступ и приносим извинения за неудобство 🙏\n\nНажми кнопку «Подать заявку», и бот сразу примет тебя в чат. Если что-то не получится, напиши в поддержку.`,
    keyboard: [[{ text: 'Подать заявку', url: INVITE ?? '' }, support]],
  },
  charge: {
    text: `${hello}\n\n12 октября не получилось списать оплату за подписку на сообщество «Карьерный юрист»: возможно, банк отклонил платёж или у карты закончился срок.\n\nЧтобы сохранить доступ к сообществу, оформи подписку на сайте: ${SITE_URL.replace(/^https?:\/\//, '')}/community. После оплаты придёт ссылка на вступление. Если нужна помощь или есть вопросы, напиши в поддержку, всё решим 🧡`,
    keyboard: [[{ text: 'Оформить подписку', url: `${SITE_URL}/community` }, support]],
  },
}
const notice = NOTICES[kind]
const sentField = kind === 'return' ? 'noticeReturnAt' : 'noticeChargeAt'
if (kind === 'return' && !INVITE) {
  console.error('В server/.env не задана COMMUNITY_INVITE_LINK: кнопке «Подать заявку» некуда вести.')
  process.exit(1)
}
if (join[sentField]) {
  console.error(`Это сообщение уже отправлялось ${who} ${ruDate(join[sentField])}. Повторно не отправляю.`)
  process.exit(1)
}

console.log(`${dry ? '[пробный запуск, ничего не отправлено] ' : ''}Кому: ${who}, подписка: ${join.status}${join.nextPaymentAt ? `, дата списания ${ruDate(join.nextPaymentAt)}` : ''}\n\n${notice.text}\n`)
if (dry) process.exit(0)

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
  return res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))
}

// Если человека исключали из чата, снимаем блокировку, иначе заявка не пройдёт (как после оплаты).
if (kind === 'return') await tg('unbanChatMember', { chat_id: CHAT_ID, user_id: Number(tgId), only_if_banned: true })
const sent = await tg('sendMessage', { chat_id: tgId, text: notice.text, reply_markup: { inline_keyboard: notice.keyboard } })
setJoinField(join.token, 'watch', 'charge')
addTag(tgId, WATCH_TAG)
if (sent.ok) {
  setJoinField(join.token, sentField, Date.now())
  console.log(`Доставлено: ${who}. Метка 🟡 поставлена (снимется сама после следующей успешной оплаты).`)
} else {
  console.log(`НЕ доставлено: ${who}: ${sent.description ?? 'неизвестная ошибка'}. Метка 🟡 всё равно поставлена. Напишите человеку сами.`)
}
