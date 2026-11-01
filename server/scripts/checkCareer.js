// Проверка содержимого раздела «Построение карьеры» перед выкладкой: шаги плана, банк вопросов, анкета капитала, шаблоны.
// Запуск из папки server: node scripts/checkCareer.js   (папка — server/content/career или CAREER_DIR)
import { careerCheck, CAREER_DIR } from '../lib/careerContent.js'

const { steps, blocks, questions, capitalFields, templates, problems } = careerCheck()
console.log(`Построение карьеры (${CAREER_DIR}): шагов плана — ${steps}, блоков вопросов — ${blocks} (вопросов — ${questions}), полей капитала — ${capitalFields}, шаблонов — ${templates}.`)
if (problems.length) {
  console.log(`\nЗамечания (${problems.length}):`)
  for (const p of problems) console.log(`  • ${p}`)
} else console.log('Замечаний нет.')
process.exit(problems.length ? 1 : 0)
