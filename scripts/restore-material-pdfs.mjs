// Recover the administrator's cached Telegram documents for the three paid products.
// Run from the website root with node --env-file=server/.env. No messages or payments.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const slugs = ['longlist-studencheskie-yuridicheskie-meropriyatiya', 'gaid-kariera-yurista-v-notariate', 'gaid-stipendii-i-granty']
const maxBytes = 50 * 1024 * 1024
const site = fs.realpathSync(process.env.MATERIAL_RECOVERY_SITE || process.cwd())
const dataDir = path.join(site, 'server/data')
const pdfDir = path.join(dataDir, 'material-pdfs')
const report = []
function check(ok, code) { if (!ok) throw Error(code) }
function localPdf(file) {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) return false
  const fd = fs.openSync(file, 'r')
  try { const bytes = Buffer.alloc(5); fs.readSync(fd, bytes, 0, 5, 0); return bytes.toString() === '%PDF-' }
  finally { fs.closeSync(fd) }
}
async function download(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  check(token, 'telegram_not_configured')
  const metaResponse = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }), signal: AbortSignal.timeout(15000),
  })
  const meta = await metaResponse.json()
  check(metaResponse.ok && meta.ok === true && meta.result?.file_path, 'telegram_file_unavailable')
  const parts = String(meta.result.file_path).split('/')
  check(parts.every(p => p && p !== '..' && p !== '.' && /^[a-zA-Z0-9_.-]+$/.test(p)), 'invalid_telegram_path')
  check(!meta.result.file_size || meta.result.file_size <= maxBytes, 'file_too_large')
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${parts.map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(60000) })
  check(response.ok && response.body, 'download_unavailable')
  check(Number(response.headers.get('content-length') || 0) <= maxBytes, 'file_too_large')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > maxBytes) { await response.body.cancel().catch(() => {}); throw Error('file_too_large') }
    chunks.push(chunk)
  }
  check(!meta.result.file_size || size === meta.result.file_size, 'incomplete_download')
  const buffer = Buffer.concat(chunks)
  check(buffer.subarray(0, 5).toString() === '%PDF-', 'not_a_pdf')
  return buffer
}
try {
  check(fs.existsSync(dataDir) && !fs.lstatSync(dataDir).isSymbolicLink(), 'invalid_data_directory')
  let registry = {}
  const registryFile = path.join(dataDir, 'material-files.json')
  if (fs.existsSync(registryFile)) registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  for (const slug of slugs) {
    const file = path.join(pdfDir, slug + '.pdf')
    const bundled = path.join(site, 'server/assets/materials', slug + '.pdf')
    try {
      if (localPdf(file) || localPdf(bundled)) { report.push({ slug, result: 'already_available' }); continue }
      check(!fs.existsSync(file), 'existing_file_needs_review')
      check(registry?.[slug]?.fileId, 'telegram_reference_missing')
      const buffer = await download(registry[slug].fileId)
      fs.mkdirSync(pdfDir, { recursive: true, mode: 0o700 })
      check(!fs.lstatSync(pdfDir).isSymbolicLink(), 'invalid_pdf_directory')
      const temp = path.join(pdfDir, '.recover-' + crypto.randomBytes(8).toString('hex'))
      try {
        const fd = fs.openSync(temp, 'wx', 0o600)
        try { fs.writeFileSync(fd, buffer); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
        // link is exclusive: a concurrently uploaded file is never replaced.
        fs.linkSync(temp, file)
      } finally { fs.rmSync(temp, { force: true }) }
      report.push({ slug, result: 'restored', bytes: buffer.length })
    } catch (error) {
      // Never print fetch exceptions: they can contain the bot token in a URL.
      const known = ['telegram_not_configured', 'telegram_file_unavailable', 'invalid_telegram_path', 'file_too_large', 'download_unavailable', 'incomplete_download', 'not_a_pdf', 'existing_file_needs_review', 'telegram_reference_missing', 'invalid_pdf_directory']
      report.push({ slug, result: 'needs_attention', reason: known.includes(error.message) ? error.message : 'recovery_failed' })
    }
  }
  console.log(JSON.stringify({ paidMaterialRecovery: report }, null, 2))
} catch { console.log(JSON.stringify({ paidMaterialRecovery: 'data_or_registry_needs_review' })) }
