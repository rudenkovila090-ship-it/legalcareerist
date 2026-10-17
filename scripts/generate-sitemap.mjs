// Генерирует public/sitemap.xml перед сборкой (см. package.json → "build").
// Статические разделы — фиксированный список (сверять с App.tsx при
// добавлении новых верхнеуровневых страниц). Динамические — slug'и
// вытащены простым regex'ом прямо из data/*.ts, чтобы не тащить в скрипт
// сборки TS-компилятор ради десятка строк: как только каталоги (вакансии,
// мероприятия, статьи, новости, клубы) наполнятся реальными данными,
// сайтмап переген��рируется на следующей сборке сам, без ручного шага.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const SITE_URL = 'https://legalcareerist.ru'

const staticPaths = [
  '/',
  '/kadry',
  '/kadry/candidates',
  '/kadry/candidates/reserve',
  '/kadry/candidates/consultation',
  '/kadry/vacancies',
  '/kadry/salary',
  '/kadry/knowledge',
  '/kadry/contacts',
  '/community',
  '/community/contacts',
  '/events',
  '/events/knowledge',
  '/events/materials',
  '/events/contacts',
  '/events/documents',
  '/about',
  '/news',
  '/marketplace',
  '/blog',
  '/legal/privacy',
  '/legal/consent',
  '/legal/offer',
]

function extractSlugs(file) {
  const full = path.join(ROOT, 'src/data', file)
  if (!fs.existsSync(full)) return []
  const text = fs.readFileSync(full, 'utf8')
  return [...text.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1])
}

const dynamicPaths = [
  ...extractSlugs('vacancies.ts').map((s) => `/vacancies/${s}`),
  ...extractSlugs('events.ts').map((s) => `/events/${s}`),
  ...extractSlugs('articles.ts').map((s) => `/knowledge/${s}`),
  ...extractSlugs('news.ts').map((s) => `/news/${s}`),
  ...extractSlugs('clubs.ts').map((s) => `/community/clubs/${s}`),
]

const allPaths = [...staticPaths, ...dynamicPaths]

const urls = allPaths
  .map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`)
  .join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`

fs.writeFileSync(path.join(ROOT, 'public/sitemap.xml'), xml)
console.log(`sitemap.xml: ${allPaths.length} адресов (${staticPaths.length} статических + ${dynamicPaths.length} из каталогов)`)
