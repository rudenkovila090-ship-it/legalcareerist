import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/** Add selected public vacancies to the catalogs read by the running API(s). */
export function prepareVacancyPublication(value, source, text) {
  const slugs = value.split(',').map(s => s.trim())
  if (!slugs.length || new Set(slugs).size !== slugs.length || slugs.some(s => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) throw Error('Укажите уникальные корректные --vacancy-slugs через запятую')
  const built = JSON.parse(fs.readFileSync(new URL('../../server/data/vacancy-catalog.json', import.meta.url), 'utf8'))
  if (!Array.isArray(built)) throw Error('Не сформирован каталог вакансий при сборке')
  const records = slugs.map(slug => {
    const matches = built.filter(v => v.slug === slug)
    if (matches.length !== 1 || matches[0].status !== 'open' || matches[0].technicalExample) throw Error('Не подтверждена открытая вакансия: ' + slug)
    const record = matches[0]
    for (const word of [slug, record.title]) if (!text.includes(word.replace(/ё/g, 'е').replace(/Ё/g, 'Е'))) throw Error('Вакансия отсутствует в сборке: ' + slug)
    if (!fs.readFileSync(path.join(source.root, 'sitemap.xml'), 'utf8').includes('https://legalcareerist.ru/vacancies/' + slug)) throw Error('Вакансия отсутствует в sitemap: ' + slug)
    return record
  })
  const result = spawnSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw Error('Не удалось определить действующий API через pm2 jlist')
  let processes
  try { processes = JSON.parse(result.stdout) } catch { throw Error('PM2 вернул некорректный список процессов') }
  if (!Array.isArray(processes) || processes.filter(p => p.name === 'legalcareerist-api').length !== 1 || processes.find(p => p.name === 'legalcareerist-api').pm2_env?.status !== 'online') throw Error('Не найден единственный работающий legalcareerist-api')
  if (processes.filter(p => p.name === 'legalcareerist-resident-demo').length > 1) throw Error('Не определен единственный демо-API')
  const plans = []
  for (const process of processes.filter(p => ['legalcareerist-api', 'legalcareerist-resident-demo'].includes(p.name))) {
    const script = process.pm2_env?.pm_exec_path
    if (!script || !path.isAbsolute(script)) throw Error('Не подтвержден путь API: ' + process.name)
    const file = fs.realpathSync(path.join(path.dirname(fs.realpathSync(script)), 'data/vacancy-catalog.json'))
    if (plans.some(p => p.file === file)) continue
    const owner = fs.statSync(file)
    if (!owner.isFile()) throw Error('Каталог вакансий должен быть обычным файлом')
    const before = fs.readFileSync(file), rows = JSON.parse(before.toString('utf8'))
    if (!Array.isArray(rows) || rows.some(v => !v || typeof v.slug !== 'string') || new Set(rows.map(v => v.slug)).size !== rows.length) throw Error('Каталог вакансий API поврежден; изменений нет')
    const merged = [...rows]
    for (const record of records) {
      const existing = merged.find(v => v.slug === record.slug)
      if (existing && Object.keys(record).some(key => JSON.stringify(existing[key]) !== JSON.stringify(record[key]))) throw Error('Вакансия уже есть с другими данными: ' + record.slug)
      if (record.number != null && merged.some(v => v.number === record.number && v.slug !== record.slug)) throw Error('Номер вакансии уже занят: ' + record.number)
      if (!existing) merged.push(record)
    }
    const after = merged.length === rows.length ? before : Buffer.from(JSON.stringify(merged, null, 2) + '\n')
    plans.push({ file, before, after, owner, changed: !before.equals(after), installed: false })
  }
  return { slugs, records, plans }
}
