// Выгружает каталог вакансий сайта (src/data/vacancies.ts) в server/data/vacancy-catalog.json,
// чтобы бот мог показывать вакансии в работе, даже если на них ещё нет откликов.
// Запускается перед сборкой (package.json → "build"). Ошибка здесь не должна
// ломать сборку сайта — тогда бот просто покажет вакансии, по которым были отклики.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = path.join(import.meta.dirname, '..')

try {
  const source = fs.readFileSync(path.join(ROOT, 'src/data/vacancies.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const { vacancies } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  const catalog = vacancies.map((v) => ({
    slug: v.slug,
    number: v.number ?? null,
    title: v.title,
    company: v.anonymous ? 'Компания скрыта' : v.company,
    city: v.city,
    format: v.format,
    employment: v.employment,
    salaryFrom: v.salaryFrom ?? null,
    salaryTo: v.salaryTo ?? null,
    status: v.status,
    publishedAt: v.publishedAt,
    urgent: Boolean(v.urgent),
    technicalExample: Boolean(v.technicalExample),
  }))
  const dir = path.join(ROOT, 'server/data')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'vacancy-catalog.json'), JSON.stringify(catalog, null, 2))
  console.log(`vacancy catalog: ${catalog.length}`)
} catch (err) {
  console.warn('vacancy catalog: не удалось выгрузить —', err.message)
}
