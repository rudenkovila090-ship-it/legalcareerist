// Ручная правка согласия на рекламную рассылку: например, если в BotHelp у человека стояли обе метки сразу
// («согласен» и «не согласен»), а владелец знает, что человек согласен. Запуск из папки server:
//   node scripts/setMailingConsent.js да 123456789 [ещё_id ...]   — согласен на рассылку
//   node scripts/setMailingConsent.js нет 123456789               — отказался от рассылки
// Меняет согласие и метки у уже загруженных людей (сначала загрузите выгрузку BotHelp: /import).
import { setMailingConsent } from '../lib/botUsers.js'

const [answer, ...ids] = process.argv.slice(2)
const agreed = { да: true, yes: true, нет: false, no: false }[String(answer ?? '').toLowerCase()]
if (agreed === undefined || !ids.length || ids.some((id) => !/^\d{5,11}$/.test(id))) {
  console.error('Пример: node scripts/setMailingConsent.js да 123456789 [ещё_id ...]   (да — согласен, нет — отказался)')
  process.exit(1)
}
for (const id of ids) {
  const user = setMailingConsent(id, agreed)
  console.log(user ? `${id}: ${agreed ? 'согласен на рассылку' : 'отказался от рассылки'}` : `${id}: такого пользователя в боте нет (сначала загрузите выгрузку BotHelp)`)
}
