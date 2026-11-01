import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const script = fileURLToPath(new URL('../restore-material-pdfs.mjs', import.meta.url))
const slugs = ['longlist-studencheskie-yuridicheskie-meropriyatiya', 'gaid-kariera-yurista-v-notariate', 'gaid-stipendii-i-granty']
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'material-recovery-test-'))
  const data = path.join(root, 'server/data'), pdf = path.join(data, 'material-pdfs')
  fs.mkdirSync(data, { recursive: true })
  fs.writeFileSync(path.join(data, 'material-files.json'), JSON.stringify(Object.fromEntries(slugs.map((slug, i) => [slug, { fileId: 'synthetic-' + i }]))))
  const preload = path.join(root, 'preload.mjs')
  fs.writeFileSync(preload, `
globalThis.fetch=async (url, init={})=>{
  const mode=process.env.RECOVERY_FIXTURE_MODE;
  if (String(url).endsWith('/getFile')) {
    const id=JSON.parse(init.body).file_id;
    if (mode==='missing') return Response.json({ok:false},{status:400});
    return Response.json({ok:true,result:{file_path:mode==='path'?'../private':'documents/'+id+'.pdf'}});
  }
  if (mode==='network') throw Error('should-not-print-token-'+String(url));
  return new Response(mode==='invalid'?'not a PDF':'%PDF-synthetic fixture', {headers:mode==='large'?{'Content-Length':'999999999'}:{}});
};
`)
  const call = mode => {
    const output = execFileSync(process.execPath, ['--import', preload, script], { cwd: root, env: { ...process.env, TELEGRAM_BOT_TOKEN: 'SYNTHETIC_TOKEN_DO_NOT_PRINT', RECOVERY_FIXTURE_MODE: mode }, encoding: 'utf8' })
    assert.ok(!output.includes('SYNTHETIC_TOKEN_DO_NOT_PRINT'))
    return JSON.parse(output).paidMaterialRecovery
  }
  try { run({ root, data, pdf, call }) } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
test('cached PDFs recover privately without sending Telegram messages', () => fixture(({ pdf, call }) => {
  assert.ok(call('ok').every(r => r.result === 'restored'))
  for (const slug of slugs) {
    const file = path.join(pdf, slug + '.pdf')
    assert.equal(fs.readFileSync(file, 'utf8'), '%PDF-synthetic fixture')
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  }
  assert.equal(fs.statSync(pdf).mode & 0o777, 0o700)
}))
test('existing valid PDFs are never overwritten', () => fixture(({ pdf, call }) => {
  call('ok')
  const file = path.join(pdf, slugs[0] + '.pdf')
  fs.writeFileSync(file, '%PDF-existing material')
  assert.ok(call('invalid').every(r => r.result === 'already_available'))
  assert.equal(fs.readFileSync(file, 'utf8'), '%PDF-existing material')
}))
test('invalid, oversized or unsafe-path responses create no PDFs', () => {
  for (const [mode, reason] of [['invalid', 'not_a_pdf'], ['large', 'file_too_large'], ['path', 'invalid_telegram_path'], ['missing', 'telegram_file_unavailable']]) fixture(({ pdf, call }) => {
    assert.ok(call(mode).every(r => r.reason === reason))
    assert.equal(fs.existsSync(pdf), false)
  })
})
test('network errors cannot expose bot tokens in diagnostics', () => fixture(({ call, pdf }) => {
  assert.ok(call('network').every(r => r.reason === 'recovery_failed'))
  assert.equal(fs.existsSync(pdf), false)
}))
test('invalid existing files require review and are preserved', () => fixture(({ pdf, call }) => {
  fs.mkdirSync(pdf)
  const file = path.join(pdf, slugs[0] + '.pdf')
  fs.writeFileSync(file, 'existing bad file')
  assert.equal(call('ok')[0].reason, 'existing_file_needs_review')
  assert.equal(fs.readFileSync(file, 'utf8'), 'existing bad file')
}))
