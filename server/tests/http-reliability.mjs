// Integration checks use a disposable server and stub ALL outbound Telegram/Prodamus traffic.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('..', import.meta.url))
const noPaymentKeys = process.argv.includes('--no-payment-keys')
const lifecycleMode = process.argv.includes('--lifecycle')
const retentionMode = process.argv.includes('--retention')
const recoveryMode = process.argv.includes('--recovery')
const offboardingMode = process.argv.includes('--offboard')
const expirySyncMode = process.argv.includes('--expiry-sync')
const completionFollowupMode = process.argv.includes('--completion-followup')
const automationMode = process.argv.includes('--automation')
const rescueMode = process.argv.includes('--access-rescue')
const completionMode = process.argv.includes('--payment-completion')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legalcareerist-http-'))
fs.cpSync(path.join(source, 'lib'), path.join(root, 'lib'), { recursive: true })
for (const file of ['index.js', 'package.json']) fs.copyFileSync(path.join(source, file), path.join(root, file))
fs.symlinkSync(path.join(source, 'node_modules'), path.join(root, 'node_modules'))
for (const dir of ['assets', 'content']) if (fs.existsSync(path.join(source, dir))) fs.symlinkSync(path.join(source, dir), path.join(root, dir))
fs.mkdirSync(path.join(root, 'data'))
if(!automationMode&&!rescueMode)fs.writeFileSync(path.join(root,'data/community-subscription-automation.json'),JSON.stringify({policy:{version:1,enabled:true,graceDays:4}}))
const { hashPassword } = await import('../lib/password.js')
const env = { ...process.env, PORT: process.env.RELIABILITY_TEST_PORT || '3036', TELEGRAM_BOT_TOKEN: 'TEST_FAKE', TELEGRAM_ADMIN_CHAT_ID: '900000099', TELEGRAM_POLLING: '0', TELEGRAM_WEBHOOK_SECRET: 'test-hook-secret', DISABLE_DAILY_REPORT: '1', DISABLE_BACKUP: '1', AUTO_EXCLUDE: '0', TEST_HOOKS: '1', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', ACCOUNT_LOGIN: 'test-owner', ACCOUNT_PASSWORD_HASH: hashPassword('Test-Owner-2026!'), PRODAMUS_SECRET_KEY: 'test-no-real-provider', SUBSCRIPTION_GRACE_DAYS: '4', COMMUNITY_CHAT_ID: '-100900000001', SITE_URL: 'https://example.invalid' }
env.PRODAMUS_DOMAIN = 'legalcareerist.payform.ru'
env.PRODAMUS_MATERIALS_DOMAIN = ''
env.PRODAMUS_EVENTS_DOMAIN = ''
env.PRODAMUS_MATERIALS_SECRET_KEY = ''
env.PRODAMUS_EVENTS_SECRET_KEY = ''
env.COMMUNITY_INVITE_LINK = 'https://t.me/+SYNTHETIC_INVITE'
if (noPaymentKeys) env.PRODAMUS_SECRET_KEY = ''
fs.writeFileSync(path.join(root, 'bootstrap.mjs'), `
import fs from 'node:fs';
let clock = null; const realNow = Date.now; Date.now = () => clock ?? realNow();
const nativeFetch=globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if(u.hostname==='example.invalid'&&u.pathname==='/api/community/subscribe')return nativeFetch('http://127.0.0.1:'+process.env.PORT+u.pathname,init);
  if (u.hostname === 'legalcareerist.payform.ru' && u.searchParams.has('subscription')) { fs.writeFileSync(new URL('./checkout-plan', import.meta.url), u.searchParams.get('subscription')); fs.appendFileSync(new URL('./checkout-requests.jsonl', import.meta.url), JSON.stringify(Object.fromEntries(u.searchParams))+String.fromCharCode(10)); }
  if (u.hostname === 'api.telegram.org') { let body = {}; try { body = JSON.parse(init.body || '{}') } catch {} fs.appendFileSync(new URL('./telegram-calls.jsonl', import.meta.url), JSON.stringify({method:u.pathname.split('/').at(-1),body})+'\\n'); }
  if (String(url).includes('/rest/setActivity/')) { const params=new URLSearchParams(init.body);fs.appendFileSync(new URL('./prodamus-stop-requests.jsonl',import.meta.url),JSON.stringify({plan:params.get('subscription'),telegramId:params.get('tg_user_id'),active:params.get('active_user')})+String.fromCharCode(10));const fail=new URL('./prodamus-cancel-fail-id', import.meta.url); return Response.json({success:fs.existsSync(new URL('./prodamus-cancel-ok', import.meta.url))&&(!fs.existsSync(fail)||params.get('subscription')!==fs.readFileSync(fail,'utf8'))}); }
  if (String(url).startsWith('https://legalcareerist.payform.ru/')) return new Response('https://legalcareerist.payform.ru/SYNTHETIC_CHECKOUT/');
  if (!String(url).startsWith('https://api.telegram.org/')) throw Error('TEST outbound disabled');
  const success = fs.existsSync(new URL('./telegram-ok', import.meta.url));
  const body=JSON.parse(init.body||'{}');
  if(String(url).endsWith('/getMe'))return Response.json({ok:true,result:{id:900999001,username:'synthetic_bot'}});
  if(String(url).endsWith('/getChatMember')&&body.user_id===900999001)return Response.json({ok:true,result:{status:'administrator',can_invite_users:true,can_restrict_members:true}});
  if(String(url).endsWith('/sendMessage')&&String(body.chat_id)===process.env.TELEGRAM_ADMIN_CHAT_ID&&fs.existsSync(new URL('./admin-offline',import.meta.url)))return Response.json({ok:false,description:'TEST admin offline'},{status:503});
  const membersFile=new URL('./telegram-members.json', import.meta.url);
  if(success && fs.existsSync(membersFile)) {
    const members=JSON.parse(fs.readFileSync(membersFile,'utf8')), member=members[String(body.user_id)];
    if(String(url).endsWith('/getChatMember')&&member)return Response.json({ok:true,result:member});
    if(member&&String(url).endsWith('/approveChatJoinRequest')){if(member.requestPending===false)return Response.json({ok:false,description:'HIDE_REQUESTER_MISSING'},{status:400});member.status='member';member.requestPending=false;fs.writeFileSync(membersFile,JSON.stringify(members));return Response.json({ok:true,result:true})}
    if(member&&(String(url).endsWith('/banChatMember')||String(url).endsWith('/unbanChatMember'))) {
      if(String(url).endsWith('/banChatMember')&&fs.existsSync(new URL('./during-ban-payment.json',import.meta.url))){const b=JSON.parse(fs.readFileSync(new URL('./during-ban-payment.json',import.meta.url)));fs.rmSync(new URL('./during-ban-payment.json',import.meta.url));const {HmacHelper}=await import('./lib/hmac.js');await nativeFetch('http://127.0.0.1:'+process.env.PORT+'/api/prodamus/webhook',{method:'POST',headers:{'Content-Type':'application/json',sign:HmacHelper.create(b,process.env.PRODAMUS_SECRET_KEY)},body:JSON.stringify(b)});await new Promise(r=>setTimeout(r,100))}
      if(!(String(url).endsWith('/unbanChatMember')&&body.only_if_banned&&member.status!=='kicked'))member.status=String(url).endsWith('/banChatMember')?'kicked':'left';fs.writeFileSync(membersFile,JSON.stringify(members));if(String(url).endsWith('/banChatMember')&&fs.existsSync(new URL('./ambiguous-ban',import.meta.url))){fs.rmSync(new URL('./ambiguous-ban',import.meta.url));throw Error('TEST ambiguous ban after Telegram accepted it')}return Response.json({ok:true,result:true});
    }
  }
  return Response.json({ok:success,result:success?(String(url).endsWith('/getChatMember')?{status:'member'}:String(url).endsWith('/getChat')?{id:Number(body.chat_id),type:'private',first_name:'Synthetic',username:'synthetic_member'}:{message_id:1}):undefined,description:success?undefined:'TEST offline'},{status:success?200:503});
};
await import('./index.js');
process.on('message',async message=>{try { if(message.clock!==undefined) clock=message.clock; if(message.raisePrice) { const {TARIFFS}=await import('./lib/prodamus.js'); TARIFFS['1m'].price=990; TARIFFS['1m'].subscription=9999999; } if(message.hook) await globalThis.__hooks[message.hook](); process.send({id:message.id,ok:true}) } catch(e) {process.send({id:message.id,error:e.message})}});
`)
const child = spawn(process.execPath, [path.join(root, 'bootstrap.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
let output = '', count = 0, nonce = 0
child.stdout.on('data', b => { output += b })
child.stderr.on('data', b => { output += b })
const base = `http://127.0.0.1:${env.PORT}`
const wait = ms => new Promise(r => setTimeout(r, ms))
const check = (name, fn) => { fn(); count++; console.log(`PASS ${name}`) }
async function request(url, body, headers = {}) {
  const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(url === '/api/telegram/webhook' ? { 'X-Telegram-Bot-Api-Secret-Token': 'test-hook-secret' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  let result
  try { result = JSON.parse(text) } catch { result = text }
  return { status: response.status, body: result }
}
async function hook(name, extra = {}) {
  const id = ++nonce
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('hook timeout')), 10000)
    const listener = message => { if (message.id !== id) return; child.off('message', listener); clearTimeout(timer); if (message.error) reject(Error(message.error)); else resolve(message) }
    child.on('message', listener); child.send({ id, hook: name, ...extra })
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
  if (noPaymentKeys) {
    const r = await request('/api/prodamus/webhook', { payment_status: 'success', subscription: { id: '2854597' }, sum: '690' }, { sign: 'synthetic-signature' })
    check('missing verification keys reject payment before storage or accepted-event logging', () => { assert.equal(r.status, 503); assert.equal(fs.existsSync(path.join(root, 'data/pending-joins.json')), false); assert.equal(fs.existsSync(path.join(root, 'data/prodamus-webhooks.jsonl')), false) })
    console.log(`${count} missing-key check passed; no outbound provider calls`)
  } else if (completionFollowupMode) {
    const {runCommunityFollowup}=await import('./community-completion-http.mjs')
    await runCommunityFollowup({root,request,hook,read,check,wait,pathToFileURL})
    console.log(`${count} community follow-up checks passed; all external services synthetic`)
  } else if (automationMode) {
    const {runSubscriptionAutomation}=await import('./subscription-automation-http.mjs')
    await runSubscriptionAutomation({root,request,hook,read,check,wait,pathToFileURL})
    console.log(`${count} subscription automation checks passed; all external services synthetic`)
  } else if (rescueMode) {
    const { runAccessRescue } = await import('./community-access-rescue-http.mjs')
    await runAccessRescue({root,request,hook,read,check,wait,pathToFileURL})
    console.log(`${count} access rescue checks passed; all external calls synthetic`)
  } else if (completionMode) {
    const { runPaymentCompletion } = await import('./community-payment-completion-http.mjs')
    await runPaymentCompletion({root,request,hook,read,check,wait,pathToFileURL})
    console.log(`${count} payment completion checks passed; all provider and Telegram calls synthetic`)
  } else if (expirySyncMode) {
    const { runExpirySync } = await import('./subscription-expiry-sync-scenario.mjs')
    await runExpirySync({root,request,hook,read,check,wait,pathToFileURL})
    console.log(`${count} expiry synchronization checks passed; all external calls synthetic`)
  } else if (offboardingMode) {
    const { runOffboarding } = await import('./subscription-offboarding-scenario.mjs')
    await runOffboarding({ root, request, hook, read, check, wait, pathToFileURL })
    console.log(`${count} offboarding checks passed; all money, messages and membership changes synthetic`)
  } else if (recoveryMode) {
    const { runRecovery } = await import('./subscription-recovery-scenario.mjs')
    await runRecovery({ root, request, hook, read, check, wait, pathToFileURL })
    console.log(`${count} recovery checks passed; no real provider calls or messages`)
  } else if (retentionMode) {
    const { runRetention } = await import('./subscription-retention-scenario.mjs')
    await runRetention({ root, request, hook, read, check, wait, pathToFileURL })
    console.log(`${count} retention checks passed; provider and Telegram responses synthetic`)
  } else if (lifecycleMode) {
    const { runLifecycle } = await import('./subscription-lifecycle-scenario.mjs')
    await runLifecycle({ root, request, hook, read, check, wait, pathToFileURL })
    console.log(`${count} full-cycle checks passed; provider and Telegram responses synthetic`)
  } else {
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
  const beforeUnsigned = joins.getJoin(token)
  r = await request('/api/prodamus/webhook', payment)
  await wait(100)
  check('missing payment signature is rejected without modifying a subscription', () => { assert.equal(r.status, 400); assert.deepEqual(joins.getJoin(token), beforeUnsigned) })
  r = await request('/api/prodamus/webhook', { ...payment, payment_status: 'error', subscription: { ...payment.subscription, type: 'action', active_user: '0', active: '0' } })
  await wait(100)
  check('unsigned subscription state change is rejected without modifying access', () => { assert.equal(r.status, 400); assert.deepEqual(joins.getJoin(token), beforeUnsigned) })
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
  r = await request('/api/prodamus/webhook', { ...payment, signature: HmacHelper.create(payment, env.PRODAMUS_SECRET_KEY) })
  await wait(100)
  check('valid body signature remains supported without duplicating a payment', () => { assert.equal(r.status, 200); assert.equal(joins.getJoin(token).payments.length, 2) })
  const oldFailure = { ...payment, payment_status: 'error', subscription: { ...payment.subscription, notification_code: 'auto_payment', current_attempt: '2', error: 'Synthetic previous-period failure' } }
  await request('/api/prodamus/webhook', oldFailure, { sign: HmacHelper.create(oldFailure, env.PRODAMUS_SECRET_KEY) })
  await wait(100)
  check('late failure from the previous period cannot mark a renewed customer unpaid', () => { assert.equal(joins.getJoin(token).watch, undefined); assert.equal(joins.getJoin(token).nextPaymentAt, until) })
  const cancelToken = joins.createPendingJoin({ tariffId: '1m', name: 'Synthetic cancellation', email: 'member@example.invalid' })
  joins.recordPayment(cancelToken, { tariffId: '1m', amount: 690, paidAt: Date.now(), orderKey: 'synthetic-cancellation', nextPaymentAt: until, subscriptionId: '2854597' })
  const cancellationBefore = joins.getJoin(cancelToken)
  r = await request('/api/account/subscription/cancel', { reason: 'Synthetic cancellation request' }, { Authorization: `Bearer ${session.token}` })
  check('provider cancellation failure preserves finance/access and stores the requested reason for retry', () => {
    assert.equal(r.status, 200); assert.equal(r.body.confirmed, false)
    const { cancelReason, cancelReasonText, cancelRequest, ...financial } = joins.getJoin(cancelToken)
    assert.deepEqual(financial, cancellationBefore); assert.equal(cancelReason, 'other'); assert.equal(cancelReasonText, 'Synthetic cancellation request'); assert.equal(cancelRequest.status, 'pending')
  })
  fs.writeFileSync(path.join(root, 'prodamus-cancel-ok'), '')
  r = await request('/api/account/subscription/cancel', { reason: 'Synthetic retry' }, { Authorization: `Bearer ${session.token}` })
  check('confirmed cancellation changes status but preserves the paid period and payments', () => { assert.equal(r.status, 200); assert.equal(r.body.confirmed, true); assert.equal(joins.getJoin(cancelToken).status, 'cancelled'); assert.equal(joins.getJoin(cancelToken).nextPaymentAt, until); assert.equal(joins.getJoin(cancelToken).payments.length, 1) })
  joins.patchJoin(cancelToken, { status: 'active', payments: [...joins.getJoin(cancelToken).payments, { at: Date.now(), amount: 1770, subscriptionId: '3005286', orderKey: 'synthetic-other-plan' }] })
  fs.writeFileSync(path.join(root, 'prodamus-cancel-fail-id'), '3005286')
  r = await request('/api/account/subscription/cancel', { reason: 'Synthetic partial cancellation' }, { Authorization: `Bearer ${session.token}` })
  check('partial provider cancellation does not claim all historical subscriptions are stopped', () => { assert.equal(r.status, 200); assert.equal(r.body.confirmed, false); assert.equal(joins.getJoin(cancelToken).status, 'active') })
  console.log(`${count} integration checks passed; all users and outbound responses synthetic`)
  }
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  fs.rmSync(root, { recursive: true, force: true })
}
