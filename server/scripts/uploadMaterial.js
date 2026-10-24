// Загрузка PDF материала маркетплейса на сайт. Запуск из папки server (удобнее через scripts/upload-material.sh):
//   node scripts/uploadMaterial.js                      — показать материалы и есть ли у каждого файл
//   node scripts/uploadMaterial.js <адрес> <файл.pdf>   — загрузить или заменить файл материала
import fs from 'node:fs'
import { allMaterials, materialInfo } from '../lib/materialCatalog.js'
import { getMaterialPdf, saveMaterialPdf } from '../lib/materialPdfs.js'

const [slug, filePath] = process.argv.slice(2)

const status = (s) => {
  const f = getMaterialPdf(s)
  return f ? `✅ ${f.bundled ? 'из репозитория' : 'загружен'} (${(f.size / 1024 / 1024).toFixed(1)} МБ, ${new Date(f.at).toLocaleDateString('ru-RU')})` : '— файла нет'
}

if (!slug) {
  console.log('Материалы маркетплейса на сайте (платные и бесплатные):')
  for (const [s, m] of allMaterials()) console.log(`  ${s}\n    ${m.title}${m.free ? ' [бесплатно]' : ''}: ${status(s)}`)
  console.log('\nЗагрузить: bash scripts/upload-material.sh <адрес материала> <файл.pdf>')
  process.exit(0)
}
const material = materialInfo(slug)
if (!material) {
  console.error(`Нет материала «${slug}». Доступные:\n${allMaterials().map(([s]) => `  ${s}`).join('\n')}`)
  process.exit(1)
}
if (!filePath) {
  console.error(`Укажите файл: bash scripts/upload-material.sh ${slug} /путь/к/файлу.pdf`)
  process.exit(1)
}
try {
  const had = getMaterialPdf(slug)
  const saved = saveMaterialPdf(slug, fs.readFileSync(filePath))
  console.log(`✅ ${had && !had.bundled ? 'Файл заменён' : 'Файл загружен'}: «${material.title}», ${(saved.size / 1024 / 1024).toFixed(1)} МБ.`)
  console.log('Теперь покупатели получают на почту личную ссылку на 7 дней. Покупателям, оплатившим раньше, отправьте ссылку: bash scripts/material-link.sh <почта> --send')
  if (saved.bundled === false && material.free) console.log('Загруженный файл главнее того, что лежит в репозитории (server/assets/materials).')
} catch (err) {
  console.error(`❌ ${err.message}`)
  process.exit(1)
}
