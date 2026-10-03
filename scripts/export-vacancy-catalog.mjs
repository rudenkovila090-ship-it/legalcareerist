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

  // Каталог материалов (описания для карточек в боте)
  const matSource = fs.readFileSync(path.join(ROOT, 'src/data/materials.ts'), 'utf8')
  const matJs = ts.transpileModule(matSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const { materials } = await import(`data:text/javascript;base64,${Buffer.from(matJs).toString('base64')}`)
  fs.writeFileSync(path.join(dir, 'material-catalog.json'), JSON.stringify(materials.map((m) => ({ slug: m.slug, title: m.title, description: m.description, forWhom: m.forWhom, price: m.price })), null, 2))
  console.log(`material catalog: ${materials.length}`)

  // Каталог мероприятий: сервер сам берёт название и цену билета (клиенту цену доверять нельзя)
  const evSource = fs.readFileSync(path.join(ROOT, 'src/data/events.ts'), 'utf8')
  const evJs = ts.transpileModule(evSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const { events } = await import(`data:text/javascript;base64,${Buffer.from(evJs).toString('base64')}`)
  fs.writeFileSync(path.join(dir, 'event-catalog.json'), JSON.stringify(events.map((e) => ({ slug: e.slug, title: e.title, dateTime: e.dateTime, status: e.status, city: e.city, format: e.format, location: e.location ?? '', registrationLink: e.registrationLink ?? '', tariffs: (e.tariffs ?? []).map((t) => ({ id: t.id, name: t.name, price: t.price })) })), null, 2))
  console.log(`event catalog: ${events.length}`)
} catch (err) {
  console.warn('vacancy catalog: не удалось выгрузить —', err.message)
}
