import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../..', import.meta.url)), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-install-'))
const packet = path.join(repo, 'updates/event-ticket-delivery'), manifest = JSON.parse(fs.readFileSync(path.join(packet, 'manifest.json')))
const write = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true });fs.writeFileSync(file, bytes) }
async function scenario(kind) {
  const root = path.join(temporary, kind), runtime = path.join(root, 'runtime'), bin = path.join(root, 'bin'), commands = path.join(root, 'commands.jsonl')
  write(path.join(runtime, 'package.json'), '{"type":"module"}')
  fs.symlinkSync(path.join(repo, 'server/node_modules'), path.join(runtime, 'node_modules'))
  const before = []
  for (const f of manifest.files) {
    let value
    try { value = execFileSync('git', ['show', manifest.baseCommit + ':server/' + f.path], { cwd: repo, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { value = null }
    if (value) write(path.join(runtime, f.path), value)
    before.push({ file: path.join(runtime, f.path), value })
  }
  for (const a of manifest.assets) write(path.join(runtime, a.path), fs.readFileSync(path.join(repo, 'server', a.path)))
  if (kind === 'unknown-code') { const file = path.join(runtime, 'lib/ticketMail.js');fs.appendFileSync(file, '\n// unrecognized owner change\n');before.find(f => f.file === file).value = fs.readFileSync(file) }
  const lead = { number: 41, kind: 'registration', eventSlug: 'dzhazovyy-vecher-dlya-yuristov-2', eventTitle: 'Synthetic Jazz', status: 'paid', amount: 3990, email: 'private-buyer@example.invalid', name: 'Private Buyer', paymentRef: 'SYNTHETIC_BANK_ORDER' }
  const leads = path.join(runtime, 'data/event-leads.json'), initial = JSON.stringify({ ['a'.repeat(24)]: lead })
  write(leads, initial);write(path.join(runtime, 'data/prodamus-webhooks.jsonl'), '')
  write(path.join(runtime, 'data/payments.json'), 'IMMUTABLE_PAYMENT_HISTORY')
  const envText = 'SMTP_HOST=synthetic.invalid\nSMTP_USER=synthetic@example.invalid\nSMTP_PASS=SYNTHETIC_PRIVATE_PASSWORD\n'
  write(path.join(runtime, '.env'), envText)
  let injected = false
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url !== '/api/health') { res.statusCode = 404;res.end('{}');return }
    const updated = fs.readFileSync(path.join(runtime, 'index.js'), 'utf8').includes('eventTicketDelivery:1')
    if (kind === 'health-failure' && updated) {
      if (!injected) { const d = JSON.parse(fs.readFileSync(leads));d.newPayment = { ...lead, number: 42, paymentRef: 'NEW_VERIFIED_PAYMENT_DURING_RESTART' };write(leads, JSON.stringify(d));injected = true }
      res.statusCode = 503;res.end('{}');return
    }
    res.end(JSON.stringify({ ok: true, eventTicketDelivery: updated ? 1 : undefined, subscriptionExpiry: 3, automaticProviderCancellation: false, autoExclude: true, graceDays: 4, subscriptionAutomation: 1 }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));const port = server.address().port
  const app = [{ name: 'legalcareerist-api', pm2_env: { status: 'online', pm_exec_path: path.join(runtime, 'index.js'), PORT: port, TELEGRAM_BOT_TOKEN: 'SYNTHETIC_BOT_SECRET', BOT_USERNAME: 'synthetic_bot', TELEGRAM_POLLING: '1', SITE_URL: 'https://example.invalid' } }]
  const pm2 = `#!/usr/bin/env node\nimport fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(commands)},JSON.stringify(args)+'\\n');if(args[0]==='jlist')process.stdout.write(${JSON.stringify(JSON.stringify(app))});else{if(!['stop','restart'].includes(args[0])||args[1]!=='legalcareerist-api')process.exit(2);if(${JSON.stringify(kind)}==='restart-failure'&&args[0]==='restart'&&!fs.existsSync(${JSON.stringify(path.join(root, 'failed-once'))})){fs.writeFileSync(${JSON.stringify(path.join(root, 'failed-once'))},'1');process.exit(1)}}\n`
  write(path.join(bin, 'pm2'), pm2);fs.chmodSync(path.join(bin, 'pm2'), 0o755)
  const stub = path.join(root, 'stub.mjs')
  write(stub, `import {createRequire}from'node:module';const mailer=createRequire(${JSON.stringify(path.join(repo, 'server/package.json'))})('nodemailer');mailer.createTransport=()=>({verify:async()=>{if(${JSON.stringify(kind)}==='smtp-failure')throw Object.assign(Error('private error'),{code:'EAUTH'})},sendMail:()=>{throw Error('installer must never send mail')},close:()=>{}});const original=globalThis.fetch;globalThis.fetch=(u,o)=>{const url=new URL(String(u));if(url.hostname==='127.0.0.1')return original(u,o);if(url.hostname!=='api.telegram.org')throw Error('forbidden outbound');const method=url.pathname.split('/').at(-1);if(!['getMe','getWebhookInfo'].includes(method))throw Error('installer must never message a buyer');return Promise.resolve(Response.json({ok:true,result:method==='getMe'?{username:'synthetic_bot'}:{url:''}}))};\n`)
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, NODE_OPTIONS: '--import ' + stub }
  const install = () => new Promise(resolve => {
    const args = [path.join(repo, 'scripts/install-event-ticket-delivery.mjs'), '--backup-root', path.join(root, 'backups'), ...(['retry-paid', 'health-failure'].includes(kind) ? ['--retry-paid', '41'] : [])]
    const child = spawn(process.execPath, args, { env });let output = ''
    child.stdout.on('data', b => output += b);child.stderr.on('data', b => output += b);child.on('close', code => resolve({ code, output }))
  })
  try {
    let r = await install()
    for (const secret of ['SYNTHETIC_PRIVATE_PASSWORD', 'SYNTHETIC_BOT_SECRET', 'private-buyer@example.invalid', 'Private Buyer']) assert.ok(!r.output.includes(secret), r.output)
    if (['success', 'retry-paid', 'smtp-failure'].includes(kind)) {
      assert.equal(r.code, 0, r.output);assert.ok(r.output.includes('EVENT_TICKET_DELIVERY_INSTALLED'))
      if (kind === 'success') {
        assert.equal(fs.readFileSync(leads, 'utf8'), initial)
        const calls = fs.readFileSync(commands, 'utf8');r = await install();assert.equal(r.code, 0, r.output)
        assert.equal(fs.readFileSync(commands, 'utf8').split(calls)[1].includes('restart'), false)
      }
      if (kind === 'retry-paid') { const after = Object.values(JSON.parse(fs.readFileSync(leads)))[0];assert.equal(after.ticketDelivery.email.state, 'pending');assert.equal(after.amount, 3990);assert.equal(after.paymentRef, lead.paymentRef) }
      if (kind === 'smtp-failure') assert.ok(r.output.includes('DELIVERY_CONFIGURATION_REQUIRED') && r.output.includes('EAUTH'))
    } else {
      assert.equal(r.code, 1, r.output)
      for (const f of before) assert.deepEqual(fs.existsSync(f.file) ? fs.readFileSync(f.file) : null, f.value, f.file)
      if (kind === 'health-failure') assert.equal(JSON.parse(fs.readFileSync(leads)).newPayment.paymentRef, 'NEW_VERIFIED_PAYMENT_DURING_RESTART')
      else assert.equal(fs.readFileSync(leads, 'utf8'), initial)
    }
    assert.equal(fs.readFileSync(path.join(runtime, 'data/payments.json'), 'utf8'), 'IMMUTABLE_PAYMENT_HISTORY')
    assert.equal(fs.readFileSync(path.join(runtime, '.env'), 'utf8'), envText)
    console.log('PASS ticket installer ' + kind + ': guarded code, real PDF preflight, private audit, preserved payments and no unrequested sends')
  } finally { await new Promise(resolve => server.close(resolve)) }
}
try { for (const kind of ['success', 'unknown-code', 'restart-failure', 'retry-paid', 'smtp-failure', 'health-failure']) await scenario(kind) } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
