// Загрузка PDF материала маркетплейса на сайт. Запуск из папки server (удобнее через scripts/upload-material.sh):
//   node scripts/uploadMaterial.js                      — показать материалы и есть ли у каждого файл
//   node scripts/uploadMaterial.js <адрес> <файл.pdf>   — загрузить или заменить файл материала
import fs from 'node:fs'
import { MATERIALS } from '../lib/prodamus.js'
import { getMaterialPdf, saveMaterialPdf } from '../lib/materialPdfs.js'

const [slug, filePath] = process.argv.slice(2)

const status = (s) => {
  const f = getMaterialPdf(s)
  return f ? `✅ загружен (${(f.size / 1024 / 1024).toFixed(1)} МБ, ${new Date(f.at).toLocaleDateString('ru-RU')})` : '— файла нет'
}

if (!slug) {
  console.log('Материалы в продаже на сайте:')
  for (const [s, m] of Object.entries(MATERIALS)) console.log(`  ${s}\n    ${m.title}: ${status(s)}`)
  console.log('\nЗагрузить: bash scripts/upload-material.sh <адрес материала> <файл.pdf>')
  process.exit(0)
}
if (!MATERIALS[slug]) {
  console.error(`Нет материала «${slug}». Доступные:\n${Object.keys(MATERIALS).map((s) => `  ${s}`).join('\n')}`)
  process.exit(1)
}
if (!filePath) {
  console.error(`Укажите файл: bash scripts/upload-material.sh ${slug} /путь/к/файлу.pdf`)
  process.exit(1)
}
try {
  const had = getMaterialPdf(slug)
  const saved = saveMaterialPdf(slug, fs.readFileSync(filePath))
  console.log(`✅ ${had ? 'Файл заменён' : 'Файл загружен'}: «${MATERIALS[slug].title}», ${(saved.size / 1024 / 1024).toFixed(1)} МБ.`)
  console.log('Теперь покупатели получают на почту личную ссылку на 7 дней. Покупателям, оплатившим раньше, отправьте ссылку: bash scripts/material-link.sh <почта> --send')
} catch (err) {
  console.error(`❌ ${err.message}`)
  process.exit(1)
}
