import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { importMaterialSet } from '../import-current-materials.mjs'
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-pdfs-'))
  const site = path.join(root, 'site'), source = path.join(root, 'upload'), backupRoot = path.join(root, 'backups')
  fs.mkdirSync(path.join(site, 'server/data'), { recursive: true }); fs.mkdirSync(source)
  const buffers = [Buffer.from('%PDF-current-a'), Buffer.from('%PDF-current-b'), Buffer.from('%PDF-current-c')]
  const expected = buffers.map((b, i) => ({ slug: 'material-' + i, title: 'Synthetic ' + i, sha256: hash(b) }))
  const args = { site, source, backupRoot, expected }
  const put = () => buffers.forEach((b, i) => fs.writeFileSync(path.join(source, 'Файл ' + i + '.pdf'), b))
  try { run({ args, root, site, source, expected, buffers, put }) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
test('requires all exact current versions before changing the site', () => fixture(({ args, site, source, put }) => {
  put(); fs.writeFileSync(path.join(source, 'Файл 1.pdf'), '%PDF-old version')
  assert.throws(() => importMaterialSet(args), /Не найдены актуальные версии/)
  assert.equal(fs.existsSync(path.join(site, 'server/data/material-pdfs')), false)
}))
test('maps Unicode filenames by content and saves private verified PDFs', () => fixture(({ args, site, buffers, put }) => {
  put(); const result = importMaterialSet(args)
  assert.ok(result.materials.every(m => m.ready))
  buffers.forEach((b, i) => {
    const file = path.join(site, 'server/data/material-pdfs', 'material-' + i + '.pdf')
    assert.deepEqual(fs.readFileSync(file), b)
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  })
  assert.equal(fs.statSync(result.backup).mode & 0o777, 0o700)
}))
test('backs up existing PDFs and preserves financial records', () => fixture(({ args, site, put }) => {
  put(); const pdf = path.join(site, 'server/data/material-pdfs')
  fs.mkdirSync(pdf); fs.writeFileSync(path.join(pdf, 'material-0.pdf'), '%PDF-old edition')
  const payments = path.join(site, 'server/data/payments.json'); fs.writeFileSync(payments, '{"syntheticPaid":true}')
  const result = importMaterialSet(args)
  assert.equal(fs.readFileSync(path.join(result.backup, 'material-0.pdf'), 'utf8'), '%PDF-old edition')
  assert.equal(fs.readFileSync(payments, 'utf8'), '{"syntheticPaid":true}')
}))
test('refuses linked destination without touching the link target', () => fixture(({ args, root, site, put }) => {
  put(); const outside = path.join(root, 'outside'); fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(site, 'server/data/material-pdfs'))
  assert.throws(() => importMaterialSet(args), /это ссылка/)
  assert.deepEqual(fs.readdirSync(outside), [])
}))
