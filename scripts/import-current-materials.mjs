// Transfer only the three exact PDF versions supplied by the owner on 2026-11-02.
// The documents themselves are never part of this repository.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const CURRENT_MATERIALS = [
  { slug: 'gaid-kariera-yurista-v-notariate', title: 'Карьера в нотариате', sha256: '5ac103cd7aee3cf760573acd8319a996e0201e1fbbe95799c27e7f78cf29dc7b' },
  { slug: 'gaid-stipendii-i-granty', title: 'Стипендии и гранты', sha256: '24cbe6a2173b49aa4df6ecdfa3fc040ac9b8417945df0402ad062bb65a58c52c' },
  { slug: 'longlist-studencheskie-yuridicheskie-meropriyatiya', title: 'Юридические студенческие мероприятия', sha256: 'f8a4b45a487899a4ee6c16307c90a9b32fa5b6aaf97e3a92809a7c01c6671b55' },
]
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const ensure = (ok, message) => { if (!ok) throw Error(message) }
const exists = file => fs.existsSync(file)
const normalFile = file => exists(file) && fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink()

function atomicWrite(file, buffer) {
  const tmp = file + '.import-' + crypto.randomBytes(8).toString('hex')
  try {
    const fd = fs.openSync(tmp, 'wx', 0o600)
    try { fs.writeFileSync(fd, buffer); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(tmp, file)
  } finally { fs.rmSync(tmp, { force: true }) }
}

export function importMaterialSet({ site, source, backupRoot, expected = CURRENT_MATERIALS }) {
  site = fs.realpathSync(site)
  source = fs.realpathSync(source)
  const dataDir = path.join(site, 'server/data')
  const pdfDir = path.join(dataDir, 'material-pdfs')
  ensure(exists(dataDir) && !fs.lstatSync(dataDir).isSymbolicLink(), 'Не найдена обычная папка данных сайта.')
  ensure(!exists(pdfDir) || !fs.lstatSync(pdfDir).isSymbolicLink(), 'Папка PDF требует проверки: это ссылка.')
  const files = fs.readdirSync(source, { withFileTypes: true }).filter(f => f.isFile() && !f.isSymbolicLink() && /\.pdf$/i.test(f.name))
  ensure(files.length <= 100, 'В папке слишком много PDF; оставьте только нужные материалы.')
  const found = new Map()
  const hashes = new Set(expected.map(m => m.sha256))
  for (const item of files) {
    const file = path.join(source, item.name)
    if (fs.statSync(file).size > 50 * 1024 * 1024) continue
    const buffer = fs.readFileSync(file), hash = digest(buffer)
    if (hashes.has(hash) && buffer.subarray(0, 5).toString() === '%PDF-') found.set(hash, buffer)
  }
  const missing = expected.filter(m => !found.has(m.sha256))
  ensure(!missing.length, 'Не найдены актуальные версии: ' + missing.map(m => m.title).join('; ') + '. Сайт не изменён.')
  for (const material of expected) {
    ensure(/^[a-z0-9-]{1,100}$/.test(material.slug), 'Неверный адрес материала.')
    const target = path.join(pdfDir, material.slug + '.pdf')
    ensure(!exists(target) || normalFile(target), 'Целевой файл требует проверки: ' + material.title)
  }
  backupRoot = path.resolve(backupRoot)
  ensure(backupRoot !== site && !backupRoot.startsWith(site + path.sep), 'Резервная копия должна находиться вне папки сайта.')
  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 })
  const backup = fs.mkdtempSync(path.join(backupRoot, 'materials-current-'))
  fs.chmodSync(backup, 0o700)
  const before = expected.map(m => {
    const target = path.join(pdfDir, m.slug + '.pdf')
    const bytes = exists(target) ? fs.readFileSync(target) : null
    if (bytes) fs.writeFileSync(path.join(backup, m.slug + '.pdf'), bytes, { mode: 0o600 })
    return { ...m, before: bytes }
  })
  fs.writeFileSync(path.join(backup, 'receipt.json'), JSON.stringify({ at: new Date().toISOString(), materials: before.map(({ before: bytes, ...m }) => ({ ...m, previousSha256: bytes ? digest(bytes) : null })) }, null, 2), { mode: 0o600 })
  fs.mkdirSync(pdfDir, { recursive: true, mode: 0o700 })
  const changed = []
  try {
    for (const m of before) {
      const file = path.join(pdfDir, m.slug + '.pdf')
      atomicWrite(file, found.get(m.sha256))
      changed.push(m)
      ensure(digest(fs.readFileSync(file)) === m.sha256, 'Не прошла проверка записи: ' + m.title)
    }
    const fd = fs.openSync(pdfDir, 'r')
    try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  } catch (error) {
    for (const m of changed) {
      const file = path.join(pdfDir, m.slug + '.pdf')
      if (m.before) atomicWrite(file, m.before)
      else fs.rmSync(file, { force: true })
    }
    throw error
  }
  return { backup, materials: expected.map(m => ({ title: m.title, ready: true, bytes: found.get(m.sha256).length })) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    ensure(process.argv[2], 'Укажите папку с тремя актуальными PDF.')
    const result = importMaterialSet({ site: process.cwd(), source: process.argv[2], backupRoot: '/root/legalcareerist-backups' })
    for (const m of result.materials) console.log(`✅ ${m.title}: актуальный PDF загружен и проверен (${m.bytes} байт).`)
    console.log('Копия прежних файлов: ' + result.backup)
    console.log('Сайт может выдавать материалы по личным ссылкам. Перезапуск бота не требуется; сообщения покупателям не отправлялись.')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
