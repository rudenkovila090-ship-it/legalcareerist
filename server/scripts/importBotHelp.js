// Перенос подписчиков из выгрузки BotHelp (CSV «Подписчики → Экспорт»).
//   node scripts/importBotHelp.js файл.csv --dry          — только показать, что будет сделано
//   node scripts/importBotHelp.js файл.csv                — записать
//   node scripts/importBotHelp.js файл.csv --with-review  — записать и завести подпиской тех, кто «на проверку»
// То же самое умеет бот: пришлите файл админу в чат с подписью /import. Правила и подробности — lib/botHelpImport.js.
import fs from 'node:fs'
import { planImport, applyImport, planSummary, doneSummary } from '../lib/botHelpImport.js'

const file = process.argv[2]
if (!file) {
  console.error('Укажите файл: node scripts/importBotHelp.js выгрузка.csv [--dry] [--with-review]')
  process.exit(1)
}
const plan = planImport(fs.readFileSync(file, 'utf8'))
console.log(planSummary(plan))
if (process.argv.includes('--dry')) process.exit(0)
console.log(`\n${doneSummary(applyImport(plan, { includeReview: process.argv.includes('--with-review') }))}`)
