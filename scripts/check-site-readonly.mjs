// Run from the website folder: node --env-file=server/.env scripts/check-site-readonly.mjs
// No payment mutations, messages, email sends, or customer details in the output.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const root = process.cwd()
const data = path.join(root, 'server/data')
const read = file => { try { return JSON.parse(fs.readFileSync(path.join(data, file), 'utf8')) } catch { return null } }
const flag = v => v === undefined ? 'default' : ['0', '1'].includes(String(v)) ? String(v) : 'nonstandard'
const flags = ['TELEGRAM_POLLING', 'DISABLE_DAILY_REPORT', 'AUTO_RESIDENT_REMINDERS', 'CHARGE_FAILED_NOTICES', 'EXPIRY_NOTICES', 'AUTO_EXCLUDE', 'DISABLE_BACKUP', 'RETENTION_AUTO']
const output = { node: process.version, flagsFromShellAndEnvFile: Object.fromEntries(flags.map(k => [k, flag(process.env[k])])) }
try { output.websiteCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { output.websiteCommit = null }
try { execFileSync('git', ['diff', '--quiet', '--', 'src', 'server/index.js', 'server/lib', 'package.json', 'package-lock.json', 'server/package.json', 'server/package-lock.json'], { stdio: 'ignore' }); output.trackedCodeChanged = false } catch { output.trackedCodeChanged = true }
try {
  const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }))
  const app = processes.find(p => p.name === 'legalcareerist-api')
  output.process = app ? { status: app.pm2_env.status, restarts: app.pm2_env.restart_time, node: app.pm2_env.node_version, memoryMb: Math.round((app.monit?.memory || 0) / 1048576), flagsFromPm2: Object.fromEntries(flags.map(k => [k, flag(app.pm2_env[k])])) } : { found: false }
} catch { output.process = { checked: false } }
output.configured = Object.fromEntries(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_CHAT_ID', 'COMMUNITY_CHAT_ID', 'PRODAMUS_SECRET_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ACCOUNT_LOGIN', 'ACCOUNT_PASSWORD_HASH'].map(k => [k, Boolean(process.env[k])]))
output.jsonFiles = { checked: 0, invalid: [] }
for (const file of fs.readdirSync(data).filter(f => f.endsWith('.json'))) {
  output.jsonFiles.checked++
  try { JSON.parse(fs.readFileSync(path.join(data, file), 'utf8')) } catch { output.jsonFiles.invalid.push(file) }
}
const now = Date.now(), cards = Object.values(read('pending-joins.json') || {})
const paid = cards.filter(c => c.paid && !c.lifetime)
output.subscriptions = { paidCards: paid.length, expiredCards: paid.filter(c => Number(c.nextPaymentAt) > 0 && Number(c.nextPaymentAt) <= now).length, missingEndDate: paid.filter(c => !(Number(c.nextPaymentAt) > 0)).length }
output.paidMaterialFiles = {}
for (const slug of ['longlist-studencheskie-yuridicheskie-meropriyatiya', 'gaid-kariera-yurista-v-notariate', 'gaid-stipendii-i-granty']) {
  const file = [path.join(data, 'material-pdfs', slug + '.pdf'), path.join(root, 'server/assets/materials', slug + '.pdf')].find(f => fs.existsSync(f))
  let valid = false, size = 0
  if (file) { const fd = fs.openSync(file, 'r'); try { const header = Buffer.alloc(5); fs.readSync(fd, header, 0, 5, 0); valid = header.toString() === '%PDF-'; size = fs.fstatSync(fd).size } finally { fs.closeSync(fd) } }
  output.paidMaterialFiles[slug] = { exists: Boolean(file), pdfHeaderValid: valid, bytes: size }
}
const backupAt = Number(read('backup-state.json')?.lastAt)
output.botBackups = { lastSuccessfulAt: Number.isFinite(backupAt) && backupAt > 0 ? new Date(backupAt).toISOString() : null, nightBackupSetting: read('admin-settings.json')?.nightBackup ?? 'default' }
output.privateBackupDirectory = fs.existsSync('/root/legalcareerist-backups')
async function check(name, fn) { try { output[name] = await fn() } catch (e) { output[name] = { ok: false, error: e.code || e.name } } }
await Promise.all([
  check('localApi', async () => { const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/health`, { signal: AbortSignal.timeout(8000) }); return { http: r.status, ok: (await r.json()).ok === true } }),
  check('publicSite', async () => { const r = await fetch('https://legalcareerist.ru/', { signal: AbortSignal.timeout(8000) }); return { http: r.status } }),
  check('telegram', async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) return { configured: false }
    const prefix = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/`
    const me = await (await fetch(prefix + 'getMe', { signal: AbortSignal.timeout(8000) })).json()
    const hook = await (await fetch(prefix + 'getWebhookInfo', { signal: AbortSignal.timeout(8000) })).json()
    return { ok: me.ok === true, username: me.result?.username, webhookConfigured: Boolean(hook.result?.url), pendingUpdates: hook.result?.pending_update_count ?? null, deliveryErrorPresent: Boolean(hook.result?.last_error_message) }
  }),
  check('smtpAuthentication', async () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return { configured: false }
    const mailer = createRequire(path.join(root, 'server/package.json'))('nodemailer')
    const port = Number(process.env.SMTP_PORT) || 465
    const t = mailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000 })
    try { await t.verify(); return { ok: true, emailSent: false } } finally { t.close() }
  }),
])
console.log(JSON.stringify(output, null, 2))
