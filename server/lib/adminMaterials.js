// Owner-only PDF management. Small upload chunks also work behind nginx's default request limit.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import express from 'express'
import { MATERIALS } from './prodamus.js'
import { getMaterialPdf, saveMaterialPdf, MAX_PDF_BYTES } from './materialPdfs.js'

const DATA = path.join(import.meta.dirname, '..', 'data')
const STAGING = path.join(DATA, 'material-upload-staging')
const HISTORY = path.join(DATA, 'material-pdf-versions')
const TTL = 60 * 60 * 1000
const CHUNK = 512 * 1024
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const shaOk = v => /^[a-f0-9]{64}$/.test(String(v ?? ''))
const idOk = v => /^[a-f0-9]{48}$/.test(String(v ?? ''))
const initialVersions = {
  'gaid-kariera-yurista-v-notariate': '5ac103cd7aee3cf760573acd8319a996e0201e1fbbe95799c27e7f78cf29dc7b',
  'gaid-stipendii-i-granty': '24cbe6a2173b49aa4df6ecdfa3fc040ac9b8417945df0402ad062bb65a58c52c',
  'longlist-studencheskie-yuridicheskie-meropriyatiya': 'f8a4b45a487899a4ee6c16307c90a9b32fa5b6aaf97e3a92809a7c01c6671b55',
}
function fail(code, status = 400) { const e = Error(code); e.status = status; throw e }
function mkdir(dir) {
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) fail('storage_unavailable', 503)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function safeName(name) { return String(name ?? 'material.pdf').split(/[\\/]/).at(-1).slice(0, 180) }
function pdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.length > MAX_PDF_BYTES || buffer.subarray(0, 5).toString() !== '%PDF-' || !buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) fail('invalid_pdf')
}
function version(slug, bytes, name, at = Date.now()) {
  mkdir(HISTORY); const dir = path.join(HISTORY, slug); mkdir(dir)
  const sha256 = hash(bytes), file = path.join(dir, sha256 + '.pdf'), meta = file + '.json'
  if (!fs.existsSync(file)) {
    const fd = fs.openSync(file, 'wx', 0o600)
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  }
  else if (hash(fs.readFileSync(file)) !== sha256) fail('backup_invalid', 503)
  if (!fs.existsSync(meta)) {
    const tmp = meta + '.' + crypto.randomBytes(8).toString('hex') + '.tmp'
    try {
      const fd = fs.openSync(tmp, 'wx', 0o600)
      try { fs.writeFileSync(fd, JSON.stringify({ sha256, name: safeName(name), bytes: bytes.length, at })); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      fs.renameSync(tmp, meta)
    } finally { fs.rmSync(tmp, { force: true }) }
  }
  const directory = fs.openSync(dir, 'r')
  try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
  return { sha256, bytes: bytes.length, at }
}
function history(slug) {
  const dir = path.join(HISTORY, slug)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => /^[a-f0-9]{64}\.pdf\.json$/.test(f)).map(f => readJson(path.join(dir, f))).sort((a, b) => b.at - a.at).slice(0, 20)
}
function save(slug, bytes, name) {
  pdf(bytes)
  const old = getMaterialPdf(slug)
  if (old) version(slug, fs.readFileSync(old.path), 'Предыдущая версия.pdf', old.at)
  const record = version(slug, bytes, name)
  saveMaterialPdf(slug, bytes)
  if (hash(fs.readFileSync(getMaterialPdf(slug).path)) !== record.sha256) fail('save_failed', 503)
  return record
}
function cleanup() {
  if (!fs.existsSync(STAGING)) return
  for (const name of fs.readdirSync(STAGING).filter(idOk)) {
    const dir = path.join(STAGING, name)
    if (Date.now() - fs.statSync(dir).mtimeMs > TTL) fs.rmSync(dir, { recursive: true, force: true })
  }
}
function session(slug, id, login) {
  if (!Object.hasOwn(MATERIALS, slug) || !idOk(id)) fail('upload_not_found', 404)
  const dir = path.join(STAGING, id), file = path.join(dir, 'session.json')
  if (!fs.existsSync(file)) fail('upload_not_found', 404)
  const meta = readJson(file)
  if (meta.slug !== slug || meta.login !== login || Date.now() - meta.at > TTL) fail('upload_not_found', 404)
  return { ...meta, dir, file: path.join(dir, 'content') }
}
export function registerAdminMaterials(app, { requireOwner }) {
  const prefix = '/api/account/materials'
  app.use(prefix, (req, res, next) => { const owner = requireOwner(req, res); if (owner) { req.materialOwner = owner; next() } })
  const handle = fn => (req, res) => {
    try { fn(req, res) }
    catch (error) {
      if (!error.status) console.error('[admin-materials]', error.code || error.name)
      res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'storage_unavailable' })
    }
  }
  app.get(prefix, handle((_req, res) => {
    const materials = Object.entries(MATERIALS).map(([slug, material]) => {
      const current = getMaterialPdf(slug)
      return { slug, title: material.title, price: material.price, current: current ? { bytes: current.size, at: current.at, sha256: hash(fs.readFileSync(current.path)) } : null, versions: history(slug) }
    })
    res.set('Cache-Control', 'no-store').json({ ok: true, materials, maxBytes: MAX_PDF_BYTES, chunkBytes: 256 * 1024 })
  }))
  app.post(prefix + '/:slug/uploads', handle((req, res) => {
    const slug = req.params.slug, size = Number(req.body?.size), sha256 = req.body?.sha256
    if (!Object.hasOwn(MATERIALS, slug)) fail('unknown_material', 404)
    if (!Number.isSafeInteger(size) || size < 8 || size > MAX_PDF_BYTES || !shaOk(sha256)) fail('invalid_file')
    if (!getMaterialPdf(slug) && initialVersions[slug] && sha256 !== initialVersions[slug]) fail('wrong_version')
    mkdir(STAGING); cleanup()
    if (fs.readdirSync(STAGING).filter(idOk).length >= 10) fail('too_many_uploads', 429)
    const id = crypto.randomBytes(24).toString('hex'), dir = path.join(STAGING, id); mkdir(dir)
    fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ slug, size, sha256, name: safeName(req.body?.name), login: req.materialOwner.login, at: Date.now() }), { flag: 'wx', mode: 0o600 })
    res.status(201).json({ ok: true, id })
  }))
  app.put(prefix + '/:slug/uploads/:id', express.raw({ type: 'application/octet-stream', limit: CHUNK }), handle((req, res) => {
    const s = session(req.params.slug, req.params.id, req.materialOwner.login)
    const offset = Number(req.query.offset), chunk = req.body
    if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(chunk) || !chunk.length) fail('invalid_chunk')
    const stored = fs.existsSync(s.file) ? fs.statSync(s.file).size : 0
    if (offset < stored && offset + chunk.length <= stored) {
      const fd = fs.openSync(s.file, 'r'), previous = Buffer.alloc(chunk.length)
      try { fs.readSync(fd, previous, 0, chunk.length, offset) } finally { fs.closeSync(fd) }
      if (!previous.equals(chunk)) fail('chunk_conflict', 409)
      return res.json({ ok: true, receivedBytes: stored })
    }
    if (offset !== stored || stored + chunk.length > s.size) fail('chunk_conflict', 409)
    const fd = fs.openSync(s.file, stored ? 'a' : 'wx', 0o600)
    try { fs.writeFileSync(fd, chunk); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    res.json({ ok: true, receivedBytes: stored + chunk.length })
  }))
  app.post(prefix + '/:slug/uploads/:id/complete', handle((req, res) => {
    const s = session(req.params.slug, req.params.id, req.materialOwner.login)
    if (!fs.existsSync(s.file) || fs.statSync(s.file).size !== s.size) fail('incomplete_upload')
    const bytes = fs.readFileSync(s.file)
    if (hash(bytes) !== s.sha256) fail('file_changed')
    const saved = save(s.slug, bytes, s.name)
    fs.rmSync(s.dir, { recursive: true, force: true })
    res.json({ ok: true, saved })
  }))
  app.delete(prefix + '/:slug/uploads/:id', handle((req, res) => {
    const s = session(req.params.slug, req.params.id, req.materialOwner.login)
    fs.rmSync(s.dir, { recursive: true, force: true }); res.json({ ok: true })
  }))
  app.post(prefix + '/:slug/restore', handle((req, res) => {
    const slug = req.params.slug, sha256 = req.body?.sha256
    if (!Object.hasOwn(MATERIALS, slug) || !shaOk(sha256)) fail('version_not_found', 404)
    const file = path.join(HISTORY, slug, sha256 + '.pdf')
    if (!fs.existsSync(file)) fail('version_not_found', 404)
    const bytes = fs.readFileSync(file)
    if (hash(bytes) !== sha256) fail('backup_invalid', 503)
    res.json({ ok: true, saved: save(slug, bytes, 'Восстановленная версия.pdf') })
  }))
  app.use(prefix, (error, _req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'chunk_too_large' })
    next(error)
  })
}
