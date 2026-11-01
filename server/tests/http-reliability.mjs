// Integration checks use a disposable server and stub ALL outbound Telegram/Prodamus traffic.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('..', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legalcareerist-http-'))
fs.cpSync(path.join(source, 'lib'), path.join(root, 'lib'), { recursive: true })
for (const file of ['index.js', 'package.json']) fs.copyFileSync(path.join(source, file), path.join(root, file))
fs.symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'))
for (const dir of ['assets', 'content']) if (fs.existsSync(path.join(source, dir))) fs.symlinkSync(path.join(source, dir), path.join(root, dir))
fs.mkdirSync(path.join(root, 'data'))
const { hashPassword } = await import('../lib/password.js')
const env = { ...process.env, PORT: process.env.RELIABILITY_TEST_PORT || '3036', TELEGRAM_BOT_TOKEN: 'TEST_FAKE', TELEGRAM_ADMIN_CHAT_ID: '900000099', TELEGRAM_POLLING: '0', DISABLE_DAILY_REPORT: '1', DISABLE_BACKUP: '1', AUTO_EXCLUDE: '0', TEST_HOOKS: '1', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', ACCOUNT_LOGIN: 'test-owner', ACCOUNT_PASSWORD_HASH: hashPassword('Test-Owner-2026!'), PRODAMUS_SECRET_KEY: 'test-no-real-provider', SITE_URL: 'https://example.invalid' }
fs.writeFileSync(path.join(root, 'bootstrap.mjs'), `
import fs from 'node:fs';
globalThis.fetch = async (url) => {
  if (String(url).startsWith('https://legalcareerist.payform.ru/')) return new Response('https://legalcareerist.payform.ru/SYNTHETIC_CHECKOUT/');
  if (!String(url).startsWith('https://api.telegram.org/')) throw Error('TEST outbound disabled');
  const success = fs.existsSync(new URL('./telegram-ok', import.meta.url));
  return Response.json({ok:success,result:success?{message_id:1}:undefined,description:success?undefined:'TEST offline'},{status:success?200:503});
};
await import('./index.js');
process.on('message',async message=>{try { await globalThis.__hooks[message.hook](); process.send({id:message.id,ok:true}) } catch(e) {process.send({id:message.id,error:e.message})}});
`)
const child = spawn(process.execPath, [path.join(root, 'bootstrap.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
let output = '', count = 0, nonce = 0
child.stdout.on('data', b => { output += b })
child.stderr.on('data', b => { output += b })
const base = `http://127.0.0.1:${env.PORT}`
const wait = ms => new Promise(r => setTimeout(r, ms))
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`) }
async function request(url, body, headers = {}) {
  const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch { result = text }
  return { status: response.status, body: result }
}
async function hook(name) {
  const id = ++nonce
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('hook timeout')), 10000)
    const listener = message => { if (message.id !== id) return; child.off('message', listener); clearTimeout(timer); if (message.error) reject(Error(message.error)); else resolve(message) }
    child.on('message', listener); child.send({ id, hook: name })
  })
}
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'))
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/health')).status === 200) { ready = true; break } } catch { }
    if (child.exitCode !== null) throw Error(output)
    await wait(50)
  }
  if (!ready) throw Error('isolated server did not start: ' + output)
  const payload = { requestId: 'http-synthetic-request-0001', formType: 'contact', name: 'Synthetic Customer', phone: '+79000000222', email: 'http@example.invalid', contact: 'http@example.invalid', interest: ['Synthetic question'], ticketNumber: '41' }
  let r = await request('/api/notify', payload)
  check('no consent: rejects before persistence', () => { assert.equal(r.status, 400); assert.equal(fs.existsSync(path.join(root, 'data/lead-inbox.json')), false) })
  payload.consent = { policy: true, processing: true, marketing: false }
  r = await request('/api/marketplace/purchase', { ...payload, materialSlug: 'gaid-kariera-yurista-v-notariate' })
  check('missing paid material cannot start checkout', () => { assert.equal(r.status, 503); assert.equal(r.body.error, 'material_unavailable'); assert.equal(fs.existsSync(path.join(root, 'data/material-purchases.json')), false) })
  fs.mkdirSync(path.join(root, 'data/material-pdfs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'data/material-pdfs/gaid-kariera-yurista-v-notariate.pdf'), '%PDF-synthetic fixture')
  r = await request('/api/marketplace/purchase', { ...payload, materialSlug: 'gaid-kariera-yurista-v-notariate' })
  check('available paid PDF permits a checkout link', () => { assert.equal(r.status, 200); assert.ok(r.body.url?.includes('SYNTHETIC_CHECKOUT')) })
  r = await request('/api/notify', { ...payload, vacancySlug: 'nonexistent-synthetic-slug' })
  check('unknown vacancy cannot create a request or counter', () => { assert.equal(r.status, 400); assert.equal(fs.existsSync(path.join(root, 'data/lead-inbox.json')), false) })
  r = await request('/api/notify', payload)
  const receipt = r.body.receiptId
  check('accepted only after durable receipt, even when Telegram is offline', () => { assert.equal(r.status, 202); assert.equal(r.body.received, true); assert.ok(read('lead-inbox.json')[receipt]) })
  await wait(100)
  check('failed delivery is still pending', () => assert.equal(read('lead-inbox.json')[receipt].notifiedAt, null))
  r = await request('/api/notify', { ...payload, ticketNumber: '42' })
  check('retry uses original receipt and customer-visible ticket number', () => { assert.equal(r.status, 202); assert.equal(r.body.receiptId, receipt); assert.equal(r.body.ticketNumber, '41'); assert.equal(Object.keys(read('lead-inbox.json')).length, 1) })
  r = await request('/api/notify', { ...payload, contact: 'changed@example.invalid' })
  check('reused nonce with changed data conflicts', () => assert.equal(r.status, 409))
  const file = new FormData(); file.append('receiptId', receipt); file.append('label', 'Resume'); file.append('file', new Blob(['Synthetic PDF']), 'resume.pdf')
  const upload = await fetch(base + '/api/upload-document', { method: 'POST', body: file })
  check('file is acknowledged after saving and remains pending', () => { assert.equal(upload.status, 202); assert.equal(read('lead-inbox.json')[receipt].attachments.length, 1); assert.equal(read('lead-inbox.json')[receipt].attachments[0].notifiedAt, null) })
  r = await request('/api/account/lead-inbox')
  check('inbox is private', () => assert.equal(r.status, 401))
  const auth = await import(pathToFileURL(path.join(root, 'lib/accountAuth.js')))
  const admin = auth.login(env.ACCOUNT_LOGIN, 'Test-Owner-2026!', env)
  r = await request('/api/account/lead-inbox', undefined, { Authorization: `Bearer ${admin.token}` })
  check('authenticated owner sees persisted receipts', () => { assert.equal(r.status, 200); assert.ok(r.body.leads.some(l => l.token === receipt)) })
  r = await request('/api/account/me', undefined, { Authorization: `Bearer ${admin.token}` })
  check('only authenticated owner receives material management capability', () => assert.equal(r.body.capabilities.manageMaterials, true))
  r = await request('/api/account/materials', undefined, { Authorization: `Bearer ${admin.token}` })
  check('owner can view private material management', () => assert.equal(r.status, 200))
  const users = await import(pathToFileURL(path.join(root, 'lib/accountUsers.js')))
  const registration = users.startRegistration({ email: 'member@example.invalid', name: 'Synthetic member', consentAt: Date.now() })
  const account = users.consumeToken(registration.token, 'Test-Member-2026!').account
  const session = auth.startSession('u:' + account.id)
  r = await request('/api/account/lead-inbox', undefined, { Authorization: `Bearer ${session.token}` })
  check('resident cannot read other customers requests', () => assert.equal(r.status, 403))
  r = await request('/api/account/me', undefined, { Authorization: `Bearer ${session.token}` })
  check('resident does not receive material management capability', () => assert.equal(r.body.capabilities.manageMaterials, false))
  r = await request('/api/account/materials', undefined, { Authorization: `Bearer ${session.token}` })
  check('resident cannot view private material management', () => assert.equal(r.status, 403))
  const original = fs.readFileSync(path.join(root, 'data/lead-inbox.json'))
  fs.writeFileSync(path.join(root, 'data/lead-inbox.json'), '{broken')
  r = await request('/api/notify', { ...payload, requestId: 'http-synthetic-request-0002' })
  check('corrupt storage gives 503 without overwriting history', () => { assert.equal(r.status, 503); assert.equal(fs.readFileSync(path.join(root, 'data/lead-inbox.json'), 'utf8'), '{broken') })
  fs.writeFileSync(path.join(root, 'data/lead-inbox.json'), original)
  const joins = await import(pathToFileURL(path.join(root, 'lib/store.js')))
  const token = joins.createPendingJoin({ tariffId: '1m', name: 'Synthetic reminder', email: 'reminder@example.invalid' })
  joins.setTgUserId(token, '900000003')
  const next = Date.now() + 86400000
  joins.recordPayment(token, { paidAt: Date.now(), nextPaymentAt: next, amount: 690, orderKey: 'http-reminder' })
  await hook('sendAutoResidentReminders')
  check('failed reminder is not marked delivered', () => assert.notEqual(joins.getJoin(token).remindedFor, `${next}:1`))
  fs.writeFileSync(path.join(root, 'telegram-ok'), '')
  await hook('sendAutoResidentReminders')
  check('retry can deliver reminder and only then mark it', () => assert.equal(joins.getJoin(token).remindedFor, `${next}:1`))
  fs.rmSync(path.join(root, 'telegram-ok'))
  const { HmacHelper } = await import('../lib/hmac.js')
  const paidAt = Date.now(), until = paidAt + 30 * 86400000
  const payment = { payment_status: 'success', date: new Date(paidAt).toISOString(), order_id: 'http-renewal-confirmation', sum: '690', customer_email: 'reminder@example.invalid', tg_user_id: '900000003', subscription: { id: '2854597', payment_num: '2', profile_id: 'http-profile', date_next_payment: new Date(until).toISOString() } }
  r = await request('/api/prodamus/webhook', payment, { sign: 'invalid-test-signature' })
  check('incorrect payment signature does not change paid access', () => { assert.equal(r.status, 400); assert.equal(joins.getJoin(token).nextPaymentAt, next) })
  r = await request('/api/prodamus/webhook', payment, { sign: HmacHelper.create(payment, env.PRODAMUS_SECRET_KEY) })
  await wait(150)
  check('signed successful renewal records the provider date even if notifications fail', () => { assert.equal(r.status, 200); assert.equal(joins.getJoin(token).nextPaymentAt, until); assert.equal(joins.getJoin(token).renewalNotices.length, 1) })
  fs.writeFileSync(path.join(root, 'telegram-ok'), '')
  await hook('deliverRenewalNotices')
  check('confirmation retry completes the queue without changing the payment history', () => { assert.equal(joins.getJoin(token).renewalNotices.length, 1); assert.equal(joins.getJoin(token).renewalNotices[0].botDone, true); assert.equal(joins.getJoin(token).renewalNotices[0].mailDone, false); assert.equal(joins.getJoin(token).payments.length, 2) })
  await request('/api/prodamus/webhook', payment, { sign: HmacHelper.create(payment, env.PRODAMUS_SECRET_KEY) })
  await wait(100)
  check('duplicate provider notification does not add a payment or confirmation', () => { assert.equal(joins.getJoin(token).payments.length, 2); assert.equal(joins.getJoin(token).renewalNotices.length, 1) })
  const oldFailure = { ...payment, payment_status: 'error', subscription: { ...payment.subscription, notification_code: 'auto_payment', current_attempt: '2', error: 'Synthetic previous-period failure' } }
  await request('/api/prodamus/webhook', oldFailure, { sign: HmacHelper.create(oldFailure, env.PRODAMUS_SECRET_KEY) })
  await wait(100)
  check('late failure from the previous period cannot mark a renewed customer unpaid', () => { assert.equal(joins.getJoin(token).watch, undefined); assert.equal(joins.getJoin(token).nextPaymentAt, until) })
  console.log(`${count} integration checks passed; all users and outbound responses synthetic`)
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  fs.rmSync(root, { recursive: true, force: true })
}
