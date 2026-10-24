// Документы личного кабинета: резюме, сопроводительные письма, тестовые задания и другие файлы с версиями.
// Метаданные — account-documents.json (по логину), сами файлы — account-files/<хэш логина>/<id документа>-v<номер>.<расширение>
// под случайными именами: имя файла от пользователя на диск не попадает. Всё, что приходит из браузера, проверяется:
// расширение из белого списка, начало файла (сигнатура) должно совпадать с расширением, размер и количество ограничены.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
export const FILES_DIR = path.join(DATA_DIR, 'account-files')
const META_FILE = path.join(DATA_DIR, 'account-documents.json')

export const DOC_TYPES = { cv: 'Резюме', cover: 'Сопроводительное письмо', test: 'Тестовое задание', other: 'Другой документ' }
export const LIMITS = { fileBytes: 10 * 1024 * 1024, docs: 40, versions: 10, totalBytes: 150 * 1024 * 1024 }

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const startsWith = (buf, sig) => buf.length >= sig.length && buf.subarray(0, sig.length).equals(sig)
// расширение → проверка начала файла
const SIGNATURES = {
  pdf: (b) => startsWith(b, Buffer.from('%PDF-')),
  doc: (b) => startsWith(b, OLE),
  docx: (b) => startsWith(b, ZIP),
  odt: (b) => startsWith(b, ZIP),
  xlsx: (b) => startsWith(b, ZIP),
  pptx: (b) => startsWith(b, ZIP),
  rtf: (b) => startsWith(b, Buffer.from('{\\rtf')),
  txt: (b) => !b.subarray(0, 8192).includes(0),
}
export const ALLOWED_EXT = Object.keys(SIGNATURES)
export const MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8',
}

// eslint-disable-next-line no-control-regex
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Имя файла для показа: без путей и служебных символов, не длиннее 120 знаков. */
export function safeFilename(name) {
  const base = text(path.basename(String(name ?? '').replace(/\\/g, '/')), 200).replace(/[\\/:*?"<>|]/g, '_')
  return base.length > 120 ? `${base.slice(0, 100)}${path.extname(base).slice(0, 10)}` : base
}

/** Проверка загружаемого файла: возвращает { ext } или { error }. */
export function checkFile(buffer, filename) {
  if (!buffer?.length) return { error: 'empty_file' }
  if (buffer.length > LIMITS.fileBytes) return { error: 'file_too_large' }
  const ext = path.extname(String(filename ?? '')).slice(1).toLowerCase()
  if (!ALLOWED_EXT.includes(ext)) return { error: 'bad_type' }
  if (!SIGNATURES[ext](buffer)) return { error: 'bad_content' }
  return { ext }
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${META_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, META_FILE)
}

const dirOf = (login) => path.join(FILES_DIR, crypto.createHash('sha256').update(String(login)).digest('hex').slice(0, 16))
const filePath = (login, docId, n, ext) => path.join(dirOf(login), `${docId}-v${n}.${ext}`)

export const listDocuments = (login) => load()[login]?.docs ?? []
export const usedBytes = (login) => listDocuments(login).reduce((acc, d) => acc + d.versions.reduce((s, v) => s + v.size, 0), 0)

function mutate(login, fn) {
  const data = load()
  data[login] ??= { docs: [] }
  const result = fn(data[login])
  save(data)
  return result
}

function writeFile(login, docId, n, ext, buffer) {
  fs.mkdirSync(dirOf(login), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath(login, docId, n, ext), buffer, { mode: 0o600 })
}

/** Новый документ с первой версией. Возвращает { doc } или { error }. */
export function addDocument(login, { type, title, note, target }, file, now = Date.now()) {
  if (!(type in DOC_TYPES)) return { error: 'bad_doc_type' }
  const checked = checkFile(file.buffer, file.filename)
  if (checked.error) return { error: checked.error }
  if (listDocuments(login).length >= LIMITS.docs) return { error: 'too_many_documents' }
  if (usedBytes(login) + file.buffer.length > LIMITS.totalBytes) return { error: 'storage_full' }
  const id = crypto.randomBytes(5).toString('hex')
  const filename = safeFilename(file.filename)
  const doc = mutate(login, (acc) => {
    const d = {
      id,
      type,
      title: text(title, 120) || filename.replace(/\.[^.]+$/, '') || DOC_TYPES[type],
      note: text(note, 300),
      target: text(target, 120),
      // первое резюме становится основным само
      primary: type === 'cv' && !acc.docs.some((x) => x.type === 'cv' && x.primary),
      createdAt: now,
      updatedAt: now,
      nextVersion: 2,
      versions: [{ n: 1, filename, ext: checked.ext, size: file.buffer.length, uploadedAt: now }],
    }
    acc.docs.push(d)
    return d
  })
  writeFile(login, id, 1, checked.ext, file.buffer)
  return { doc }
}

/** Новая версия существующего документа. */
export function addVersion(login, docId, file, now = Date.now()) {
  const existing = listDocuments(login).find((d) => d.id === docId)
  if (!existing) return { error: 'not_found' }
  const checked = checkFile(file.buffer, file.filename)
  if (checked.error) return { error: checked.error }
  if (existing.versions.length >= LIMITS.versions) return { error: 'too_many_versions' }
  if (usedBytes(login) + file.buffer.length > LIMITS.totalBytes) return { error: 'storage_full' }
  const n = existing.nextVersion
  const filename = safeFilename(file.filename)
  const doc = mutate(login, (acc) => {
    const d = acc.docs.find((x) => x.id === docId)
    d.versions.push({ n, filename, ext: checked.ext, size: file.buffer.length, uploadedAt: now })
    d.nextVersion = n + 1
    d.updatedAt = now
    return d
  })
  writeFile(login, docId, n, checked.ext, file.buffer)
  return { doc }
}

/** Название, заметка, «для чего» и признак основного резюме. */
export function updateDocument(login, docId, patch, now = Date.now()) {
  if (!listDocuments(login).some((d) => d.id === docId)) return { error: 'not_found' }
  const doc = mutate(login, (acc) => {
    const d = acc.docs.find((x) => x.id === docId)
    if (patch.title !== undefined) d.title = text(patch.title, 120) || d.title
    if (patch.note !== undefined) d.note = text(patch.note, 300)
    if (patch.target !== undefined) d.target = text(patch.target, 120)
    if (patch.primary === true && d.type === 'cv') for (const x of acc.docs) if (x.type === 'cv') x.primary = x.id === docId
    d.updatedAt = now
    return d
  })
  return { doc }
}

function removeFiles(login, d, only) {
  for (const v of d.versions) if (only == null || v.n === only) fs.rmSync(filePath(login, d.id, v.n, v.ext), { force: true })
}

export function deleteDocument(login, docId) {
  const d = listDocuments(login).find((x) => x.id === docId)
  if (!d) return { error: 'not_found' }
  removeFiles(login, d)
  mutate(login, (acc) => {
    acc.docs = acc.docs.filter((x) => x.id !== docId)
    // удалили основное резюме — основным становится самое свежее из оставшихся
    if (d.primary) {
      const next = acc.docs.filter((x) => x.type === 'cv').sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (next) next.primary = true
    }
  })
  return { ok: true }
}

export function deleteVersion(login, docId, n) {
  const d = listDocuments(login).find((x) => x.id === docId)
  const v = d?.versions.find((x) => x.n === n)
  if (!d || !v) return { error: 'not_found' }
  if (d.versions.length === 1) return deleteDocument(login, docId)
  removeFiles(login, d, n)
  mutate(login, (acc) => {
    const x = acc.docs.find((y) => y.id === docId)
    x.versions = x.versions.filter((y) => y.n !== n)
  })
  return { ok: true }
}

/** Путь к файлу версии и данные для заголовков ответа. */
export function versionFile(login, docId, n) {
  const d = listDocuments(login).find((x) => x.id === docId)
  const v = d?.versions.find((x) => x.n === n)
  if (!v) return null
  const p = filePath(login, docId, n, v.ext)
  return fs.existsSync(p) ? { path: p, filename: v.filename, ext: v.ext, size: v.size } : null
}

/** Удаляет все файлы и записи человека (при удалении данных по запросу). Возвращает число файлов. */
export function eraseAccountFiles(login) {
  const docs = listDocuments(login)
  const count = docs.reduce((acc, d) => acc + d.versions.length, 0)
  fs.rmSync(dirOf(login), { recursive: true, force: true })
  const data = load()
  delete data[login]
  save(data)
  return count
}
