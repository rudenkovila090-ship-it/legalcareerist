// Deploy from a private git-archive checkout. Do not run from the live checkout.
// The existing paid data and .env stay in place; rollback restores code, not customers.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

process.umask(0o077)
const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(release, 'updates/site-reliability/manifest.json')
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const exists = file => fs.existsSync(file)
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function ensure(ok, message) { if (!ok) throw Error(message) }
function command(program, args, cwd, extra = {}) { return execFileSync(program, args, { cwd, stdio: 'inherit', ...extra }) }
function privateDir(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700) }
function inside(root, relative) {
  ensure(!path.isAbsolute(relative) && !relative.split('/').includes('..'), 'Недопустимый путь в пакете')
  return path.join(root, relative)
}
function plain(file) { return exists(file) && fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() }
function noSymlinkParents(root, relative) {
  let parent = root
  for (const part of relative.split('/').slice(0, -1)) {
    parent = path.join(parent, part)
    if (exists(parent)) ensure(!fs.lstatSync(parent).isSymbolicLink(), 'Обнаружена ссылка вместо папки: ' + relative)
  }
}
function atomicCopy(from, to, mode = 0o644) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  const tmp = to + '.reliability-' + crypto.randomBytes(6).toString('hex')
  try { fs.copyFileSync(from, tmp); fs.chmodSync(tmp, mode); fs.renameSync(tmp, to) }
  finally { fs.rmSync(tmp, { force: true }) }
}
function saveState(backup, state) {
  const file = path.join(backup, 'state.json'), tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}
function pm2App(site) {
  const apps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  const app = apps.find(p => p.name === 'legalcareerist-api')
  ensure(app, 'Процесс legalcareerist-api не найден')
  ensure(path.resolve(app.pm2_env.pm_exec_path) === path.join(site, 'server/index.js'), 'PM2 запускает другой файл; обновление остановлено')
  ensure(app.pm2_env.exec_mode === 'fork_mode', 'Нужна отдельная проверка конфигурации PM2')
  return app
}
function validateJson(site) {
  const dir = path.join(site, 'server/data')
  ensure(exists(dir) && !fs.lstatSync(dir).isSymbolicLink(), 'Не найдена обычная папка server/data')
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
    try { read(path.join(dir, name)) } catch { throw Error('Повреждён файл данных: ' + name + '. Обновление остановлено') }
  }
}
function verifyFiles(site, manifest, expected) {
  ensure(plain(path.join(site, 'server/.env')), 'Не найден server/.env')
  for (const entry of manifest.files) {
    noSymlinkParents(site, entry.path)
    const file = inside(site, entry.path), wanted = entry[expected]
    if (wanted === null) ensure(!exists(file), 'Новый файл уже существует: ' + entry.path)
    else ensure(plain(file) && hash(file) === wanted, 'Версия файла отличается от проверенной: ' + entry.path)
  }
  validateJson(site)
}
function environmentMeta(site, app) {
  const value = execFileSync(process.execPath, ['--env-file=server/.env', '-e', 'console.log(JSON.stringify({port:process.env.PORT||"3001",exclude:process.env.AUTO_EXCLUDE||"0"}))'], { cwd: site, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const env = JSON.parse(value)
  return { port: String(app.pm2_env.PORT ?? env.port), exclude: String(app.pm2_env.AUTO_EXCLUDE ?? env.exclude) }
}
function checkDisk(site, backupRoot) {
  const bytes = Number(execFileSync('du', ['-sb', site], { encoding: 'utf8' }).split(/\s/)[0])
  for (const dir of [site, backupRoot]) {
    const stat = fs.statfsSync(dir)
    ensure(stat.bavail * stat.bsize > bytes * 2 + 512 * 1048576, 'Недостаточно свободного места для сборки и резервной копии')
  }
}
function copyTree(from, to) { fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true }) }
function readableWebTree(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    ensure(!entry.isSymbolicLink(), 'Неожиданная ссылка в сборке сайта')
    if (entry.isDirectory()) readableWebTree(file)
    else fs.chmodSync(file, 0o644)
  }
  fs.chmodSync(dir, 0o755)
}
async function ready(site, port, expectReceiptRoute) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })
      const inbox = expectReceiptRoute ? await fetch(`http://127.0.0.1:${port}/api/account/lead-inbox`, { signal: AbortSignal.timeout(2000) }) : null
      if (r.ok && (await r.json()).ok === true && (!inbox || inbox.status === 401) && pm2App(site).pm2_env.status === 'online') return true
    } catch { /* bounded startup wait */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

async function rollback(backup, automatic = false) {
  const state = read(path.join(backup, 'state.json'))
  ensure(state.version === 1 && path.isAbsolute(state.site), 'Неверная копия для отката')
  const site = fs.realpathSync(state.site)
  // A later, unrelated deployment must not be silently replaced by an old rollback.
  for (const entry of state.files) {
    const target = inside(site, entry.path)
    if (exists(target)) ensure(plain(target) && [entry.before, entry.after].includes(hash(target)), 'После установки файл менялся: ' + entry.path)
    else ensure(entry.before === null || automatic, 'После установки файл удалён: ' + entry.path)
  }
  command('pm2', ['stop', 'legalcareerist-api'], site)
  for (const entry of state.files) {
    const target = inside(site, entry.path)
    if (entry.before === null) fs.rmSync(target, { force: true })
    else atomicCopy(inside(path.join(backup, 'files'), entry.path), target, entry.mode)
  }
  for (const item of state.trees.filter(t => t.swapped)) {
    const target = inside(site, item.path), next = target + '.rollback-' + state.id
    fs.rmSync(next, { recursive: true, force: true })
    copyTree(inside(backup, item.backup), next)
    fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(next, target)
  }
  command('pm2', ['restart', 'legalcareerist-api'], site)
  ensure(await ready(site, state.port, false), 'Откат записан, но API ещё не отвечает: проверьте PM2')
  for (const item of state.trees) fs.rmSync(inside(site, item.path) + '.reliability-old-' + state.id, { recursive: true, force: true })
  state.rolledBackAt = new Date().toISOString(); saveState(backup, state)
  console.log('Предыдущий код восстановлен. Текущие клиенты, оплаты и настройки сохранены.')
}

async function install(site) {
  const manifest = read(manifestPath)
  site = fs.realpathSync(site)
  ensure(site !== release && !release.startsWith(site + path.sep), 'Запустите пакет из отдельной папки вне рабочего сайта')
  const [major, minor] = process.versions.node.split('.').map(Number)
  ensure(major >= 24 || (major === 22 && minor >= 12), 'Для этой сборки нужен Node.js 22.12+ или 24+')
  verifyFiles(site, manifest, 'before')
  for (const entry of manifest.files) ensure(hash(inside(release, entry.path)) === entry.after, 'Файл пакета изменён: ' + entry.path)
  const app = pm2App(site), meta = environmentMeta(site, app)
  const envDigest = hash(path.join(site, 'server/.env'))
  ensure(app.pm2_env.status === 'online', 'Перед установкой API должен быть запущен')
  ensure(meta.exclude === '0', 'Автоисключение включено. Для этой установки сначала нужна проверка просроченных оплат')
  ensure(/^\d{2,5}$/.test(meta.port), 'Нестандартный порт API')
  const backupRoot = path.resolve(process.env.SITE_RELIABILITY_BACKUPS || '/root/legalcareerist-backups')
  ensure(backupRoot !== site && !backupRoot.startsWith(site + path.sep), 'Копии должны храниться вне папки сайта')
  privateDir(backupRoot); checkDisk(site, backupRoot)
  console.log('Подготавливаем зависимости и сборку. Рабочий сайт продолжает работать.')
  command('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], release)
  command('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], path.join(release, 'server'))
  // node:test also runs when the file is invoked directly, including Node 22.12.
  // --test-isolation is unavailable in earlier supported Node 22 releases.
  command('node', ['server/tests/reliability.test.mjs'], release)
  command('npm', ['run', 'lint'], release)
  command('npm', ['run', 'build'], release)
  const id = Date.now() + '-' + crypto.randomBytes(3).toString('hex')
  const backup = path.join(backupRoot, 'deployment-' + id)
  privateDir(backup)
  const state = { version: 1, id, site, port: meta.port, files: [], trees: [] }
  for (const entry of manifest.files) {
    const target = inside(site, entry.path)
    const mode = exists(target) ? fs.statSync(target).mode & 0o777 : 0o644
    state.files.push({ ...entry, mode })
    if (entry.before) { const to = inside(path.join(backup, 'files'), entry.path); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(target, to) }
  }
  try { for (const relative of ['node_modules', 'server/node_modules', 'dist']) {
    const target = inside(site, relative), staged = inside(release, relative)
    ensure(exists(staged) && exists(target) && !fs.lstatSync(target).isSymbolicLink(), 'Не найдена обычная папка ' + relative)
    const copyName = relative.replaceAll('/', '-')
    copyTree(target, inside(backup, copyName))
    const next = target + '.reliability-next-' + id
    state.trees.push({ path: relative, backup: copyName, next, swapped: false })
    copyTree(staged, next)
    if (relative === 'dist') {
      // Existing browser tabs may still request an asset from the previous build.
      if (exists(path.join(target, 'assets'))) fs.cpSync(path.join(target, 'assets'), path.join(next, 'assets'), { recursive: true, force: false })
      readableWebTree(next)
    }
  }
  fs.copyFileSync(fileURLToPath(import.meta.url), path.join(backup, 'installer.mjs'))
  saveState(backup, state)
  verifyFiles(site, manifest, 'before') // detect edits during the build
  } catch (error) { for (const item of state.trees) fs.rmSync(item.next, { recursive: true, force: true }); throw error }
  let stopped = false, changed = false
  try {
    console.log('Сборка готова. Короткая остановка API для согласованной копии и обновления.')
    ensure(hash(path.join(site, 'server/.env')) === envDigest, 'Настройки менялись во время сборки; обновление остановлено')
    command('pm2', ['stop', 'legalcareerist-api'], site); stopped = true
    validateJson(site)
    command('bash', [path.join(release, 'scripts/backup-site-private.sh')], release, { env: { ...process.env, SITE_BACKUP_SOURCE: site, SITE_BACKUP_DESTINATION: backupRoot } })
    changed = true
    for (const entry of manifest.files) atomicCopy(inside(release, entry.path), inside(site, entry.path), state.files.find(f => f.path === entry.path).mode)
    for (const item of state.trees) {
      const target = inside(site, item.path)
      item.swapped = true; saveState(backup, state)
      fs.renameSync(target, target + '.reliability-old-' + id)
      fs.renameSync(item.next, target)
    }
    ensure(hash(path.join(site, 'server/.env')) === envDigest, 'Настройки менялись во время установки; нужен повтор проверки')
    command('pm2', ['restart', 'legalcareerist-api'], site)
    ensure(await ready(site, meta.port, true), 'Новая версия API не прошла проверку')
    const publicResponse = await fetch(process.env.SITE_RELIABILITY_PUBLIC_URL || 'https://legalcareerist.ru/', { signal: AbortSignal.timeout(10000) })
    ensure(publicResponse.ok && (publicResponse.headers.get('content-type') || '').includes('text/html'), 'Публичная страница сайта не прошла проверку')
    ensure(environmentMeta(site, pm2App(site)).exclude === '0', 'Изменилась настройка автоисключения')
    state.installedAt = new Date().toISOString(); saveState(backup, state)
    for (const item of state.trees) fs.rmSync(inside(site, item.path) + '.reliability-old-' + id, { recursive: true, force: true })
    console.log('Обновление установлено, API отвечает. Автоисключение остаётся выключенным; расписание напоминаний сохранено.')
    console.log('Откат кода: node ' + path.join(backup, 'installer.mjs') + ' --rollback ' + backup)
    console.log('Полная копия и копия прежнего кода: ' + backupRoot)
    // Optional recovery never makes a successful code deployment roll back.
    try { command('node', ['--env-file=server/.env', path.join(release, 'scripts/restore-material-pdfs.mjs')], site) }
    catch { console.log('Материалы: восстановление требует отдельной проверки; код установлен.') }
  } catch (error) {
    console.error('Установка остановлена:', error.message)
    if (changed) { try { await rollback(backup, true) } catch (rollbackError) { console.error('Нужна проверка отката:', rollbackError.message); console.error('Копия: ' + backup) } }
    else if (stopped) command('pm2', ['restart', 'legalcareerist-api'], site)
    throw Error('Установка не завершена; пришлите этот результат')
  } finally {
    for (const item of state.trees) fs.rmSync(item.next, { recursive: true, force: true })
  }
}

try {
  const [mode, value] = process.argv.slice(2)
  if (mode === '--rollback') await rollback(path.resolve(value))
  else if (mode === '--verify-files') { verifyFiles(fs.realpathSync(value), read(manifestPath), 'before'); console.log('Исходные файлы и JSON прошли проверку') }
  else { ensure(!mode, 'Неизвестный параметр'); await install(process.env.SITE_RELIABILITY_TARGET || '/var/www/legalcareerist') }
} catch (error) { console.error(error.message); process.exitCode = 1 }
