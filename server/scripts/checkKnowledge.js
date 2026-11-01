// Проверка базы знаний перед выкладкой: битые «Смотрите также» и ссылки kb:, неизвестные значки, пустые разделы, повторы названий.
// Запуск из папки server: node scripts/checkKnowledge.js   (папка базы — server/content/knowledge или KB_DIR)
import { knowledgeCheck, KB_DIR } from '../lib/knowledgeBase.js'

const { pages, sections, problems } = knowledgeCheck()
console.log(`База знаний (${KB_DIR}): ${pages} страниц, ${sections} разделов.`)
if (problems.length) {
  console.log(`\nЗамечания (${problems.length}):`)
  for (const p of problems) console.log(`  • ${p}`)
}
else console.log('Замечаний нет.')
// «нет summary» и «раздел без страниц» — напоминания (пустой раздел скрыт от резидентов); остальное мешает выкладке
process.exit(problems.some((p) => !/нет summary|раздел без страниц/.test(p)) ? 1 : 0)
