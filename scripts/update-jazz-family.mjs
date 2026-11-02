// Targeted frontend update. Never changes routes, UTM handling, API, bot or private data.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const release = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(release || '')) throw Error('Укажите полный SHA проверенного выпуска.')
const site = fs.realpathSync(process.env.SITE_DIR || process.cwd())
process.chdir(site)
const storyFile = 'src/data/eventStories.ts'
const componentFile = 'src/pages/events/NoirSections.tsx'
const cssFile = 'src/pages/events/noir.css'
const logos = ['src/assets/noir/partner-sma-spb.jpg', 'src/assets/noir/partner-pro-career.jpg']
function payload(file) {
  const r = spawnSync('git', ['show', `${release}:${file}`], { maxBuffer: 8 * 1024 * 1024 })
  if (r.status !== 0) throw Error('Не удалось получить файл выпуска: ' + file)
  return r.stdout
}
function between(text, startMarker, endMarker, offset = 0) {
  const start = text.indexOf(startMarker, offset)
  const end = text.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw Error('Не найден ожидаемый блок: ' + startMarker)
  return { start, end, text: text.slice(start, end) }
}
function members(text) {
  const family = text.indexOf('    family: {')
  if (family < 0) throw Error('Не найден блок партнёров мероприятия.')
  return between(text, '          members: [', '\n          ],', family)
}
function replaceRange(text, range, replacement) {
  return text.slice(0, range.start) + replacement + text.slice(range.end)
}
const desiredStory = payload(storyFile).toString('utf8')
let story = fs.readFileSync(storyFile, 'utf8')
story = replaceRange(story, members(story), members(desiredStory).text)
for (const name of ['partnerSmaSpb', 'partnerProCareer']) {
  const line = desiredStory.match(new RegExp(`^import ${name} from .+$`, 'm'))?.[0]
  if (!line) throw Error('В выпуске нет импорта логотипа: ' + name)
  const current = story.match(new RegExp(`^import ${name} from .+$`, 'm'))?.[0]
  if (current && current !== line) throw Error('Обнаружен другой импорт: ' + name)
  if (!current) story = line + '\n' + story
}
if ((story.match(/\bpartnerPlaceholder\b/g) || []).length === 1) {
  story = story.replace(/^import partnerPlaceholder from .*\r?\n/m, '')
}
const component = fs.readFileSync(componentFile, 'utf8')
const desiredComponent = payload(componentFile).toString('utf8')
const functionRange = text => {
  const r = between(text, 'export function NoirFamily(', '\n}\n')
  return { ...r, end: r.end + 2, text: text.slice(r.start, r.end + 2) }
}
const nextComponent = replaceRange(component, functionRange(component), functionRange(desiredComponent).text)
const css = fs.readFileSync(cssFile, 'utf8')
const desiredCss = payload(cssFile).toString('utf8')
const cssRange = text => between(text,
  text.includes('/* Карточки партнёров и подписи') ? '/* Карточки партнёров и подписи' : '/* Круглые картинки партнёров:',
  '/* Телефон: в половине ширины')
const nextCss = replaceRange(css, cssRange(css), cssRange(desiredCss).text)
const updates = new Map([[storyFile, Buffer.from(story)], [componentFile, Buffer.from(nextComponent)], [cssFile, Buffer.from(nextCss)]])
for (const logo of logos) {
  const data = payload(logo)
  if (data[0] !== 0xff || data[1] !== 0xd8) throw Error('Неверный формат логотипа: ' + logo)
  updates.set(logo, data)
}

const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-jazz-family-'))
const existed = new Map()
for (const file of [...updates.keys(), 'dist']) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('Остановлено: путь является символьной ссылкой: ' + file)
  existed.set(file, fs.existsSync(file))
  if (existed.get(file)) {
    const dest = path.join(backup, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.cpSync(file, dest, { recursive: true })
  }
}
function readable(dir) {
  fs.chmodSync(dir, 0o755)
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name)
    if (e.isSymbolicLink()) throw Error('Неожиданная символьная ссылка в сборке.')
    if (e.isDirectory()) readable(file)
    else fs.chmodSync(file, 0o644)
  }
}
async function verify() {
  const files = fs.readdirSync('dist/assets')
  const dataModules = files.filter(f => f.endsWith('.js') && (() => {
    const js = fs.readFileSync('dist/assets/' + f, 'utf8')
    return js.includes('https://t.me/sma_spb') && js.includes('https://t.me/proocareer')
  })())
  const styleModules = files.filter(f => f.endsWith('.css') && fs.readFileSync('dist/assets/' + f, 'utf8').includes('.fam-member'))
  if (!dataModules.length || !styleModules.length) throw Error('В сборке не найдены новые партнёры или их стили.')
  const imageModules = []
  for (const logo of logos) {
    const prefix = path.basename(logo, '.jpg') + '-'
    const asset = files.find(f => f.startsWith(prefix) && f.endsWith('.jpg'))
    if (!asset || !fs.readFileSync('dist/assets/' + asset).equals(updates.get(logo))) throw Error('Логотип в сборке не совпадает с оригиналом: ' + logo)
    imageModules.push(asset)
  }
  const html = fs.readFileSync('dist/index.html', 'utf8')
  const entry = html.match(/<script[^>]*src=["']([^"']+)["']/)?.[1]
  if (!entry?.startsWith('/assets/')) throw Error('Не найден входной файл сборки.')
  // Existing event URL, without adding or replacing any UTM/query parameters.
  const page = new URL(process.env.SITE_PUBLIC_URL || 'https://legalcareerist.ru/events/dzhazovyy-vecher-dlya-yuristov-2')
  async function get(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } })
    if (!r.ok) throw Error(`Публичная проверка: HTTP ${r.status}, ${url.pathname}`)
    return Buffer.from(await r.arrayBuffer())
  }
  if (!(await get(page)).toString('utf8').includes(entry)) throw Error('Сайт отдаёт другую версию страницы.')
  for (const asset of [entry, ...[...dataModules, ...styleModules, ...imageModules].map(f => '/assets/' + f)]) {
    if (!(await get(new URL(asset, page))).equals(fs.readFileSync('dist' + asset))) throw Error('Опубликованный файл отличается от сборки: ' + asset)
  }
}
try {
  for (const [file, data] of updates) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, data, { mode: 0o644 })
  }
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' })
  if (build.status !== 0) throw Error('Сборка завершилась с ошибкой.')
  readable('dist')
  await verify()
  console.log('Проверено: сайт отдаёт оба оригинальных логотипа, новый порядок и уменьшенные карточки партнёров.')
  console.log('Адрес мероприятия и UTM сохранены. Резервная копия: ' + backup)
} catch (error) {
  for (const [file, present] of existed) {
    fs.rmSync(file, { recursive: true, force: true })
    if (present) fs.cpSync(path.join(backup, file), file, { recursive: true })
  }
  console.error('Обновление остановлено, прежняя версия восстановлена:', error.message)
  console.error('Резервная копия: ' + backup)
  process.exitCode = 1
}
