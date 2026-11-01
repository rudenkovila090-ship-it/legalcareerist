// Disposable files and HTTP server. No production records, Telegram or payment requests.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import express from 'express'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-materials-'))
fs.cpSync(new URL('../lib', import.meta.url), path.join(temp, 'lib'), { recursive: true })
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
fs.symlinkSync(path.resolve(import.meta.dirname, '../node_modules'), path.join(temp, 'node_modules'))
const { registerAdminMaterials } = await import(pathToFileURL(path.join(temp, 'lib/adminMaterials.js')))
const { saveMaterialPdf, getMaterialPdf } = await import(pathToFileURL(path.join(temp, 'lib/materialPdfs.js')))
const app = express(); app.use(express.json())
registerAdminMaterials(app, { requireOwner: (req, res) => {
  if (req.get('Authorization') === 'Bearer test-owner') return { login: 'owner' }
  res.status(req.get('Authorization') ? 403 : 401).json({ ok: false }); return null
} })
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
const base = `http://127.0.0.1:${server.address().port}/api/account/materials`
const slug = 'gaid-kariera-yurista-v-notariate'
const old = Buffer.from('%PDF-1.4\nSynthetic previous document\n%%EOF')
const current = Buffer.from('%PDF-1.7\nSynthetic current document\n' + 'x'.repeat(700000) + '\n%%EOF')
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
let count = 0
function check(name, fn) { fn(); count++; console.log('PASS ' + name) }
async function request(url = '', { auth = 'test-owner', method = 'GET', body, raw = false } = {}) {
  const r = await fetch(base + url, { method, headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body ? { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' } : {}) }, body: body ? (raw ? body : JSON.stringify(body)) : undefined })
  return { status: r.status, data: await r.json() }
}
async function begin(bytes, material = slug) { return request(`/${material}/uploads`, { method: 'POST', body: { name: 'Synthetic guide.pdf', size: bytes.length, sha256: sha(bytes) } }) }
try {
  for (const [auth, expected] of [['', 401], ['customer', 403]]) {
    const list = await request('', { auth })
    const write = await request(`/${slug}/uploads`, { auth, method: 'POST', body: { size: current.length, sha256: sha(current) } })
    check('unauthorized actor cannot list or start uploads: ' + (auth || 'anonymous'), () => { assert.equal(list.status, expected); assert.equal(write.status, expected); assert.equal(fs.existsSync(path.join(temp, 'data/material-upload-staging')), false) })
  }
  let r = await begin(current)
  check('initial upload rejects a different revision', () => { assert.equal(r.status, 400); assert.equal(r.data.error, 'wrong_version'); assert.equal(getMaterialPdf(slug), null) })
  saveMaterialPdf(slug, old)
  r = await request()
  check('owner sees three products without public file paths', () => { assert.equal(r.status, 200); assert.equal(r.data.materials.length, 3); assert.equal(JSON.stringify(r.data).includes(temp), false) })
  r = await begin(current); const id = r.data.id
  check('owner can start an upload', () => assert.equal(r.status, 201))
  r = await request(`/${slug}/uploads/${id}?offset=1`, { method: 'PUT', raw: true, body: current.subarray(0, 262144) })
  check('out of order chunks do not replace current PDF', () => { assert.equal(r.status, 409); assert.deepEqual(fs.readFileSync(getMaterialPdf(slug).path), old) })
  const chunk = current.subarray(0, 262144)
  r = await request(`/${slug}/uploads/${id}?offset=0`, { method: 'PUT', raw: true, body: chunk })
  assert.equal(r.status, 200)
  r = await request(`/${slug}/uploads/${id}?offset=0`, { method: 'PUT', raw: true, body: chunk })
  check('a retried chunk is idempotent', () => { assert.equal(r.status, 200); assert.equal(r.data.receivedBytes, chunk.length) })
  r = await request(`/${slug}/uploads/${id}/complete`, { method: 'POST', body: {} })
  check('incomplete upload never publishes a partial PDF', () => { assert.equal(r.status, 400); assert.equal(r.data.error, 'incomplete_upload'); assert.deepEqual(fs.readFileSync(getMaterialPdf(slug).path), old) })
  for (let offset = chunk.length; offset < current.length; offset += 262144) {
    r = await request(`/${slug}/uploads/${id}?offset=${offset}`, { method: 'PUT', raw: true, body: current.subarray(offset, offset + 262144) }); assert.equal(r.status, 200)
  }
  r = await request(`/${slug}/uploads/${id}/complete`, { method: 'POST', body: {} })
  check('complete upload publishes a verified PDF and keeps prior version', () => { assert.equal(r.status, 200); assert.deepEqual(fs.readFileSync(getMaterialPdf(slug).path), current); assert.equal(fs.statSync(getMaterialPdf(slug).path).mode & 0o777, 0o600); assert.deepEqual(fs.readFileSync(path.join(temp, 'data/material-pdf-versions', slug, sha(old) + '.pdf')), old) })
  r = await request(`/${slug}/restore`, { method: 'POST', body: { sha256: sha(old) } })
  check('owner restores a previous version without losing the newer one', () => { assert.equal(r.status, 200); assert.deepEqual(fs.readFileSync(getMaterialPdf(slug).path), old); assert.deepEqual(fs.readFileSync(path.join(temp, 'data/material-pdf-versions', slug, sha(current) + '.pdf')), current) })
  r = await begin(current); const corrupt = r.data.id
  const corrupted = Buffer.from(current); corrupted[50] ^= 1
  for (let offset = 0; offset < corrupted.length; offset += 262144) await request(`/${slug}/uploads/${corrupt}?offset=${offset}`, { method: 'PUT', raw: true, body: corrupted.subarray(offset, offset + 262144) })
  r = await request(`/${slug}/uploads/${corrupt}/complete`, { method: 'POST', body: {} })
  check('changed bytes fail verification and preserve old PDF', () => { assert.equal(r.data.error, 'file_changed'); assert.deepEqual(fs.readFileSync(getMaterialPdf(slug).path), old) })
  const fake = Buffer.from('not a PDF'); r = await begin(fake); const bad = r.data.id
  await request(`/${slug}/uploads/${bad}?offset=0`, { method: 'PUT', raw: true, body: fake })
  r = await request(`/${slug}/uploads/${bad}/complete`, { method: 'POST', body: {} })
  check('non-PDF bytes cannot be published', () => { assert.equal(r.data.error, 'invalid_pdf'); assert.deepEqual(fs.readFileSync(getMaterialPdf(slug).path), old) })
  r = await request(`/${slug}/uploads/${corrupt}`, { method: 'DELETE' })
  check('owner can discard a failed upload', () => assert.equal(r.status, 200))
  r = await request(`/${slug}/restore`, { auth: 'customer', method: 'POST', body: { sha256: sha(current) } })
  check('customers cannot restore or change paid files', () => assert.equal(r.status, 403))
  const { makeBackup } = await import(pathToFileURL(path.join(temp, 'lib/healthBackup.js')))
  const archive = path.join(temp, 'backup.tar.gz'); fs.writeFileSync(archive, await makeBackup())
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n')
  check('data backup includes paid PDFs and versions, excluding incomplete uploads', () => {
    assert.ok(entries.some(f => f.includes('material-pdfs/' + slug + '.pdf')))
    assert.ok(entries.some(f => f.includes('material-pdf-versions/' + slug)))
    assert.equal(entries.some(f => f.includes('material-upload-staging')), false)
  })
  console.log(`${count} private material management checks passed`)
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  fs.rmSync(temp, { recursive: true, force: true })
}
