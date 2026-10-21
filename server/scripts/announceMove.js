// НЕ ЗАПУСКАТЬ в нынешнем виде. Переезд идёт с BotHelp-бота на нашего (@LegalcareeristBot, токен в server/.env не меняется):
// сообщение «мы переехали» отправляет BotHelp-бот рассылкой из BotHelp. Этот скрипт пишет от имени бота из server/.env, то есть от
// нашего нового бота, которому люди ещё не писали, и Telegram такие сообщения не доставит (см. docs/bot-move.md).
// Прежнее назначение: разовое сообщение пользователям нынешнего бота «мы переехали в другого бота». Запускать ДО замены токена,
// пока сервер ещё работает от имени прежнего бота (скриптом scripts/setup-bot.sh токен меняется уже после).
//   node --env-file=.env scripts/announceMove.js --dry   — только посчитать, кому уйдёт
//   node --env-file=.env scripts/announceMove.js         — отправить
// Кому: тем, кто сам открывал этого бота (есть отметка последнего обращения) или привязан к подписке; админу не уходит.
// Людям из выгрузки BotHelp, которые этого бота не открывали, написать он всё равно не смог бы — их тут нет.
import { listBotUsers } from '../lib/botUsers.js'
import { listJoins } from '../lib/store.js'

const NEW_BOT = (process.env.NEW_BOT_USERNAME || 'LegalcareeristBot').replace(/^@/, '')
const TEXT = `Мы переехали! 🚀\n\nБот «Карьерный юрист» теперь работает здесь: @${NEW_BOT}\n\nОткройте его и нажмите Start — подписка, доступ и все данные сохранены. Этот бот скоро перестанет отвечать.`
const dry = process.argv.includes('--dry')
const token = process.env.TELEGRAM_BOT_TOKEN
const admin = String(process.env.TELEGRAM_ADMIN_CHAT_ID ?? '')
if (!token) {
  console.error('Нет TELEGRAM_BOT_TOKEN: запускайте как  node --env-file=.env scripts/announceMove.js')
  process.exit(1)
}

const audience = new Set()
for (const u of listBotUsers()) if (u.lastSeenAt) audience.add(String(u.id))
for (const j of listJoins()) if (j.tgUserId) audience.add(String(j.tgUserId))
audience.delete(admin)
const ids = [...audience].filter((id) => /^\d{5,11}$/.test(id))

console.log(`Получателей: ${ids.length}${dry ? ' (пробный запуск, ничего не отправлено)' : ''}`)
if (dry) process.exit(0)

let ok = 0
const failed = []
for (const id of ids) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: id, text: TEXT, reply_markup: { inline_keyboard: [[{ text: `Открыть @${NEW_BOT}`, url: `https://t.me/${NEW_BOT}` }]] } }),
      signal: AbortSignal.timeout(20000),
    })
    const json = await res.json().catch(() => null)
    if (json?.ok) ok += 1
    else failed.push(`${id}: ${json?.description ?? res.status}`)
    if (res.status === 429) await new Promise((r) => setTimeout(r, (json?.parameters?.retry_after ?? 5) * 1000))
  } catch (err) {
    failed.push(`${id}: ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, 60)) // не чаще ~15 сообщений в секунду
}
console.log(`Доставлено: ${ok}, не доставлено: ${failed.length} (заблокировали бота или не открывали его)`)
if (failed.length) console.log(failed.slice(0, 5).join('\n') + (failed.length > 5 ? `\n…и ещё ${failed.length - 5}` : ''))
