// Файлы материалов маркетплейса для выдачи в боте после оплаты. Админ отправляет
// PDF боту с подписью «/material <slug>», бот запоминает Telegram file_id и
// потом отправляет этот файл покупателям (загружать файл на сервер не нужно).
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'material-files.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function getMaterialFile(slug) {
  return load()[slug] ?? null
}

export function setMaterialFile(slug, fileId, fileName) {
  const all = load()
  all[slug] = { fileId, fileName, at: Date.now() }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2))
}
