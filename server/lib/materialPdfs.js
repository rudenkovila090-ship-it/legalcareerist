// PDF материалов маркетплейса, которые продаются на сайте. Файлы лежат на сервере сайта, а не в Telegram:
// server/data/material-pdfs/<адрес материала>.pdf. Загружает администратор командой `bash scripts/upload-material.sh <адрес> <файл.pdf>`.
// Бесплатные гайды лежат ещё и в репозитории — server/assets/materials/<адрес>.pdf: они приезжают на сервер вместе с обновлением (deploy.sh)
// и работают, пока администратор не загрузил свою версию (загруженный файл всегда главнее).
// Покупатель получает файл по личной ссылке (materialLinks.js), сам файл по почте не уходит.
import fs from 'node:fs'
import path from 'node:path'

export const PDF_DIR = path.join(import.meta.dirname, '..', 'data', 'material-pdfs')
export const BUNDLED_PDF_DIR = path.join(import.meta.dirname, '..', 'assets', 'materials')
export const MAX_PDF_BYTES = 50 * 1024 * 1024
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/

/** Путь к файлу материала; null, если адрес материала не похож на допустимый (защита от выхода из папки). */
export function materialPdfPath(slug) {
  return SLUG_RE.test(String(slug)) ? path.join(PDF_DIR, `${slug}.pdf`) : null
}

function statPdf(file) {
  try {
    const st = fs.statSync(file)
    return st.isFile() ? { path: file, size: st.size, at: st.mtimeMs } : null
  } catch {
    return null
  }
}

/** Файл материала: { path, size, at, bundled } или null, если файла нет ни загруженного, ни из репозитория. */
export function getMaterialPdf(slug) {
  const file = materialPdfPath(slug)
  if (!file) return null
  const uploaded = statPdf(file)
  if (uploaded) return { ...uploaded, bundled: false }
  const bundled = statPdf(path.join(BUNDLED_PDF_DIR, `${slug}.pdf`))
  return bundled ? { ...bundled, bundled: true } : null
}

/** Сохраняет PDF материала (заменяет прежний). Бросает Error с понятным текстом, если файл не подошёл. */
export function saveMaterialPdf(slug, buffer) {
  const file = materialPdfPath(slug)
  if (!file) throw new Error('Адрес материала должен состоять из строчных латинских букв, цифр и дефисов.')
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Файл пустой.')
  if (buffer.length > MAX_PDF_BYTES) throw new Error(`Файл больше ${MAX_PDF_BYTES / 1024 / 1024} МБ.`)
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Это не PDF: файл должен начинаться с «%PDF-».')
  fs.mkdirSync(PDF_DIR, { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, buffer, { mode: 0o600 })
  fs.renameSync(tmp, file)
  return getMaterialPdf(slug)
}
