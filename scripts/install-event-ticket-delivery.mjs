// Patch only ticket handlers in the active API; never replace live billing code or env files.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { runtimeSettings, telegramRead } from './lib/bot-runtime-settings.mjs'
import { auditEventTickets } from './lib/event-ticket-audit.mjs'
import { newTicketDelivery } from '../server/lib/eventTicketDelivery.js'

process.umask(0o077)
const args = process.argv.slice(2), option = key => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1] }
const run = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const hash = v => crypto.createHash('sha256').update(v).digest('hex')
const write = (file, bytes, mode = 0o600, owner = null) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 })
  const temp = file + '.ticket-' + crypto.randomBytes(5).toString('hex')
  try { fs.writeFileSync(temp, bytes, { flag: 'wx', mode }); if (owner) fs.chownSync(temp, owner.uid, owner.gid);fs.chmodSync(temp, mode);fs.renameSync(temp, file) } finally { fs.rmSync(temp, { force: true }) }
}
let stopped = false, mutated = false, installed = false, restarted = false, app, backup, phase = 'preflight', planned = [], recoveryBefore = null, recoveryAfter = null, recoveryFile
try {
  const packet = path.join(import.meta.dirname, '../updates/event-ticket-delivery'), manifest = JSON.parse(fs.readFileSync(path.join(packet, 'manifest.json')))
  if (manifest.version !== 1) throw Error('unknown_package')
  const found = JSON.parse(run('pm2', ['jlist'])).filter(p => p.name === 'legalcareerist-api')
  if (found.length !== 1 || found[0].pm2_env?.status !== 'online') throw Error('single_online_api_required')
  app = found[0]
  const config = runtimeSettings(app.pm2_env, {}), root = config.runtime, port = Number(config.value('PORT') || 3001)
  if (root !== fs.realpathSync(root) || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('runtime_not_confirmed')
  const health = async () => {
    const r = await fetch('http://127.0.0.1:' + port + '/api/health', { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw Error('api_health_failed');return r.json()
  }
  const previous = await health()
  if (!previous.ok) throw Error('api_health_failed')
  const base = option('--backup-root') || '/root/legalcareerist-bot-backups'
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });backup = fs.mkdtempSync(path.join(base, 'event-ticket-20261123-'));fs.chmodSync(backup, 0o700)
  const beforeAudit = auditEventTickets(root)
  write(path.join(backup, 'before.json'), JSON.stringify(beforeAudit, null, 2))
  for (const entry of manifest.files) {
    if (!/^(?:index\.js|lib\/[a-zA-Z0-9_-]+\.js)$/.test(entry.path)) throw Error('invalid_package_path')
    const file = path.join(root, entry.path), before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw Error('unexpected_source_symlink')
    let after = before
    if (entry.edits) {
      if (after === null) throw Error('missing_runtime_source')
      for (const [old, next] of entry.edits) {
        if (after.split(next).length === 2) continue
        if (after.split(old).length !== 2) throw Error('unrecognized_ticket_handler')
        after = after.replace(old, next)
      }
    } else {
      after = fs.readFileSync(path.join(packet, 'server', entry.path), 'utf8')
      if (hash(after) !== entry.sha256) throw Error('package_checksum_failed')
      if (before !== after && !entry.beforeSha256.includes(before === null ? null : hash(before))) throw Error('unrecognized_ticket_module')
    }
    const syntax = path.join(backup, 'syntax', entry.path)
    write(syntax, after);run(process.execPath, ['--check', syntax])
    planned.push({ file, relative: entry.path, before, after, mode: before === null ? 0o644 : fs.statSync(file).mode & 0o777, owner: fs.statSync(before === null ? app.pm2_env.pm_exec_path : file) })
  }
  // Render a real PDF in private staging using the runtime dependencies and original assets.
  phase = 'ticket_pdf'
  const probe = path.join(backup, 'probe');write(path.join(probe, 'package.json'), '{"type":"module"}')
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(probe, 'node_modules'))
  for (const name of ['ticketImage.js', 'code128.js', 'simplePdf.js']) write(path.join(probe, 'lib', name), planned.find(f => f.relative === 'lib/' + name)?.after ?? fs.readFileSync(path.join(root, 'lib', name)))
  for (const asset of manifest.assets) {
    if (!/^assets\/(?:fonts\/[\w.-]+\.woff2|tickets\/[\w.-]+\.png)$/.test(asset.path)) throw Error('invalid_asset_path')
    const source = path.join(import.meta.dirname, '../server', asset.path), target = path.join(root, asset.path)
    if (hash(fs.readFileSync(source)) !== asset.sha256) throw Error('asset_checksum_failed')
    const bytes = fs.readFileSync(fs.existsSync(target) ? target : source)
    write(path.join(probe, asset.path), bytes)
    if (!fs.existsSync(target)) planned.push({ file: target, relative: asset.path, before: null, after: bytes, mode: 0o644, owner: fs.statSync(app.pm2_env.pm_exec_path) })
  }
  const { renderTicketPdf } = await import(pathToFileURL(path.join(probe, 'lib/ticketImage.js')))
  const pdf = await renderTicketPdf({ eventSlug: 'dzhazovyy-vecher-dlya-yuristov-2', number: 999999, name: 'Техническая проверка', email: 'audit@example.invalid' })
  if (!pdf?.buffer?.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw Error('ticket_pdf_failed')
  phase = 'delivery_configuration'
  const token = config.value('TELEGRAM_BOT_TOKEN'), bot = token ? await telegramRead(token, 'getMe') : { ok: false }
  const configuredName = String(config.value('BOT_USERNAME') || 'legalcareerist_bot').replace(/^@/, '')
  if (bot.ok && configuredName.toLowerCase() !== String(bot.result.username).toLowerCase()) throw Error('BOT_USERNAME_does_not_match_active_bot')
  const webhook = token ? await telegramRead(token, 'getWebhookInfo') : { ok: false }
  const hookUrl = webhook.result?.url, site = config.value('SITE_URL') || 'https://legalcareerist.ru'
  const botUpdatesReady = webhook.ok && (hookUrl ? new URL(hookUrl).hostname === new URL(site).hostname : String(config.value('TELEGRAM_POLLING') ?? '1') !== '0')
  const smtp = { configured: Boolean(config.value('SMTP_HOST') && config.value('SMTP_USER') && config.value('SMTP_PASS')), verified: false }
  if (smtp.configured) {
    const nodemailer = createRequire(path.join(root, 'package.json'))('nodemailer')
    const transport = nodemailer.createTransport({ host: config.value('SMTP_HOST'), port: Number(config.value('SMTP_PORT')) || 465, secure: (Number(config.value('SMTP_PORT')) || 465) === 465, auth: { user: config.value('SMTP_USER'), pass: config.value('SMTP_PASS') }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000 })
    try { await transport.verify();smtp.verified = true } catch (e) { smtp.errorCode = e.code || 'smtp_verify_failed' } finally { transport.close() }
  }
  const retry = option('--retry-paid')?.split(',').map(Number) ?? []
  if (retry.some(n => !Number.isInteger(n) || n < 1) || new Set(retry).size !== retry.length || retry.length > 50) throw Error('invalid_retry_registration_numbers')
  // All preparation is complete before stopping or editing the running service.
  phase = 'install'
  for (const f of planned) if (f.before === null ? fs.existsSync(f.file) : !fs.readFileSync(f.file).equals(Buffer.from(f.before))) throw Error('source_changed_during_preflight')
  const needsRestart = retry.length || previous.eventTicketDelivery !== 1 || planned.some(f => f.before === null || !Buffer.from(f.before).equals(Buffer.from(f.after)))
  if (needsRestart) {
  write(path.join(backup, 'plan.json'), JSON.stringify(planned.map(f => ({ path: f.relative, existed: f.before !== null, mode: f.mode, beforeSha256: f.before === null ? null : hash(f.before), afterSha256: hash(f.after) })), null, 2))
  run('pm2', ['stop', app.name]);stopped = true
  recoveryFile = path.join(root, 'data/event-leads.json')
  if (fs.existsSync(recoveryFile)) {
    recoveryBefore = fs.readFileSync(recoveryFile);write(path.join(backup, 'event-leads.before.json'), recoveryBefore)
  }
  if (retry.length) {
    const data = JSON.parse(recoveryBefore?.toString('utf8') || '{}')
    for (const number of retry) {
      const matches = Object.values(data).filter(l => l.number === number && l.kind === 'registration' && ['paid', 'attended'].includes(l.status) && ['dzhazovyy-vecher-dlya-yuristov-2', 'yuridicheskaya-noch-dzhaza-2'].includes(l.eventSlug))
      if (matches.length !== 1) throw Error('retry_requires_existing_paid_jazz_registration')
      const lead = matches[0], fresh = newTicketDelivery()
      lead.ticketDelivery = { ...(lead.ticketDelivery ?? fresh), email: { state: 'pending', requestedAt: Date.now() }, telegram: lead.ticketDelivery?.telegram?.state === 'sent' ? lead.ticketDelivery.telegram : fresh.telegram }
    }
    recoveryAfter = Buffer.from(JSON.stringify(data, null, 2))
    write(recoveryFile, recoveryAfter, fs.statSync(recoveryFile).mode & 0o777, fs.statSync(recoveryFile))
  }
  for (const f of planned) {
    if (f.before !== null) write(path.join(backup, 'before', f.relative), f.before)
    if (f.before === null || !Buffer.from(f.before).equals(Buffer.from(f.after))) { write(f.file, f.after, f.mode, f.owner);f.written = true;mutated = true }
  }
  run('pm2', ['restart', app.name]);stopped = false;restarted = true
  }
  let current
  for (let i = 0; i < 40; i++) {
    try { current = await health();if (current.ok && current.eventTicketDelivery === 1) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!current?.ok || current.eventTicketDelivery !== 1) throw Error('new_api_health_failed')
  for (const key of ['subscriptionExpiry', 'automaticProviderCancellation', 'autoExclude', 'graceDays', 'subscriptionAutomation']) if (current[key] !== previous[key]) throw Error('unrelated_billing_setting_changed')
  installed = true
  const report = { installedAt: Date.now(), codeVersion: 1, pdfBytes: pdf.buffer.length, smtp, botReady: bot.ok, botUpdatesReady, recoveredNumbers: retry, audit: auditEventTickets(root), financialHistoryReplaced: false, report: backup }
  write(path.join(backup, 'installed.json'), JSON.stringify(report, null, 2))
  console.log('EVENT_TICKET_DELIVERY_INSTALLED ' + JSON.stringify(report))
  if (!smtp.verified || !bot.ok || !botUpdatesReady) console.log('DELIVERY_CONFIGURATION_REQUIRED: проверьте поля smtp и botUpdatesReady в отчете; ключи и контакты покупателей не выводятся.')
  if (report.audit.paidWithoutDeliveryHistory.length) console.log('LEGACY_TICKETS_REQUIRE_REVIEW: у старых оплаченных регистраций нет истории отправки. Автоматическая массовая повторная отправка не выполнялась. Номера: ' + report.audit.paidWithoutDeliveryHistory.join(','))
} catch (error) {
  if (!installed && (mutated || stopped)) {
    try { run('pm2', ['stop', app.name]) } catch {}
    for (const f of planned.filter(f => f.written)) try { if (!fs.readFileSync(f.file).equals(Buffer.from(f.after))) continue;if (f.before === null) fs.rmSync(f.file, { force: true });else write(f.file, f.before, f.mode, f.owner) } catch {}
    if (!restarted && recoveryBefore && recoveryAfter && recoveryFile) try { if (fs.readFileSync(recoveryFile).equals(recoveryAfter)) write(recoveryFile, recoveryBefore, fs.statSync(recoveryFile).mode & 0o777, fs.statSync(recoveryFile)) } catch {}
    try { run('pm2', ['restart', app.name]) } catch {}
  }
  console.error('EVENT_TICKET_DELIVERY_NOT_INSTALLED ' + JSON.stringify({ phase, reason: /^[a-zA-Z_]+$/.test(error.message) ? error.message : 'preflight_or_install_failed', report: backup ?? null }))
  process.exitCode = 1
}
