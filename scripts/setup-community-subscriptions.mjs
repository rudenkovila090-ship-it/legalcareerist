// One installation entry point. Backups are private; financial history is never restored over new payments.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { prepareSubscriptionPolicy } from '../server/lib/subscriptionPolicy.js'
import { subscriptionDemo } from '../server/lib/subscriptionDemo.js'

process.umask(0o077)
async function main() {
const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const site = fs.realpathSync(process.argv[2] || '/var/www/legalcareerist')
const manifestName = 'updates/community-subscriptions/manifest.json'
const manifest = JSON.parse(fs.readFileSync(path.join(release, manifestName), 'utf8'))
if (!manifest.subscriptionLifecycle) throw Error('Неверный манифест пакета подписок.')
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
const ensure = (ok, text) => { if (!ok) throw Error(text) }
const run = (command, args, cwd = site, extra = {}) => execFileSync(command, args, { cwd, stdio: 'inherit', ...extra })
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
function save(file, data) {
  const temp = file + '.subscription-' + crypto.randomBytes(5).toString('hex')
  try { const fd = fs.openSync(temp, 'wx', 0o600); try { fs.writeFileSync(fd, data); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }; fs.renameSync(temp, file) }
  finally { fs.rmSync(temp, { force: true }) }
}
function app() {
  const found = JSON.parse(execFileSync('pm2', ['jlist'], { cwd: site, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).find(p => p.name === 'legalcareerist-api')
  ensure(found?.pm2_env?.pm_exec_path === path.join(site, 'server/index.js') && found.pm2_env.exec_mode === 'fork_mode', 'Нужна проверка конфигурации PM2: ожидается один процесс API из этой папки.')
  return found
}
const pm2 = app().pm2_env
const value = key => pm2[key] ?? pm2.env?.[key] ?? process.env[key]
const originalExclude = String(value('AUTO_EXCLUDE') ?? '0')
const originalGraceDays = String(value('SUBSCRIPTION_GRACE_DAYS') || 4)
const originalReminderFlag = String(value('AUTO_RESIDENT_REMINDERS') ?? '1')
const originalFailureFlag = String(value('CHARGE_FAILED_NOTICES') ?? '1')
ensure(pm2.status === 'online', 'Перед установкой API должен быть запущен.')
ensure(value('TELEGRAM_BOT_TOKEN') && value('PRODAMUS_SECRET_KEY'), 'Не найдены действующие настройки Telegram/Prodamus.')
const apiSource = fs.readFileSync(path.join(site, 'server/index.js'), 'utf8')
const chatId = value('COMMUNITY_CHAT_ID') || apiSource.match(/const COMMUNITY_CHAT_ID\s*=\s*process\.env\.COMMUNITY_CHAT_ID\s*\|\|\s*['"]([^'"]+)['"]/)?.[1]
ensure(chatId && value('COMMUNITY_INVITE_LINK'), 'Не определены чат сообщества или ссылка на вступление.')
const dataDir = path.join(site, 'server/data'), envFile = path.join(site, 'server/.env')
ensure(!fs.lstatSync(dataDir).isSymbolicLink(), 'Нужна обычная папка данных.')
const originalEnv = fs.readFileSync(envFile)
const policyFile = path.join(dataDir, 'subscription-policy.json')
const oldPolicy = fs.existsSync(policyFile) ? read(policyFile) : null
let days = Number(process.env.SUBSCRIPTION_SETUP_GRACE_DAYS || oldPolicy?.graceDays || 4)
ensure(Number.isInteger(days) && days >= 1 && days <= 30, 'Некорректная длительность общей отсрочки.')
run('node', [path.join(release, 'scripts/install-site-reliability.mjs'), '--verify-files', site], site, { env: { ...process.env, SITE_RELIABILITY_MANIFEST: manifestName } })
let username = String(process.env.SUBSCRIPTION_TEST_USERNAME || '').trim().replace(/^@/, '')
if (!username) {
  ensure(process.stdin.isTTY, 'Укажите SUBSCRIPTION_TEST_USERNAME для тестового сообщения.')
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try { username = (await input.question('Точный @username личного аккаунта для теста: ')).trim().replace(/^@/, '') } finally { input.close() }
}
ensure(/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username), 'Нужно точное Telegram-имя; угадывать получателя нельзя.')
const usersFile = path.join(dataDir, 'bot-users.json')
const matches = Object.values(read(usersFile)).filter(u => String(u.username || '').replace(/^@/, '').toLowerCase() === username.toLowerCase())
ensure(matches.length === 1 && matches[0].id, 'Нет однозначной карточки этого аккаунта. Откройте @legalcareerist_bot с личного аккаунта и нажмите Start.')
const target = String(matches[0].id)
async function telegram(method, body = {}) {
  const attempts = method.startsWith('get') ? 3 : 1
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${value('TELEGRAM_BOT_TOKEN')}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) })
      const result = await response.json()
      ensure(response.ok && result.ok, 'Telegram не подтвердил ' + method + ' (HTTP ' + response.status + ').')
      return result.result
    } catch (error) {
      if (i + 1 === attempts) throw Error('Не подтверждён ' + method + ': ' + (error.name === 'TimeoutError' ? 'таймаут' : error.code || error.name))
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }
}
const [me, hook, person] = await Promise.all([telegram('getMe'), telegram('getWebhookInfo'), telegram('getChat', { chat_id: target })])
ensure(person.type === 'private' && String(person.username || '').toLowerCase() === username.toLowerCase(), 'Аккаунт изменился: тестовое сообщение не отправлено.')
const member = await telegram('getChatMember', { chat_id: chatId, user_id: me.id })
ensure(member.status === 'creator' || (member.status === 'administrator' && member.can_invite_users && member.can_restrict_members), 'Боту нужны права приглашать и ограничивать участников.')
const siteUrl = new URL(value('SITE_URL') || 'https://legalcareerist.ru')
if (hook.url) ensure(new URL(hook.url).hostname === siteUrl.hostname && new URL(hook.url).pathname === '/api/telegram/webhook', 'У бота чужой вебхук. Автоматическое переключение не выполняется.')
const polling = value('TELEGRAM_POLLING') !== '0'
ensure(polling || hook.url, 'Отключён опрос и не установлен собственный вебхук.')
console.log(`Получатель теста подтверждён: @${username}. Общая отсрочка: ${days} суток.`)
console.log('До включения удаления старым просроченным активным карточкам будет дано одинаковое переходное окно.')
const backupRoot = process.env.SITE_RELIABILITY_BACKUPS || '/root/legalcareerist-backups'
fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 })
ensure(!path.resolve(backupRoot).startsWith(site + path.sep), 'Приватная копия должна быть вне сайта.')
const extraBackup = fs.mkdtempSync(path.join(backupRoot, 'subscription-policy-'))
fs.copyFileSync(envFile, path.join(extraBackup, 'server.env'))
if (oldPolicy) save(path.join(extraBackup, 'policy.json'), JSON.stringify(oldPolicy))
const beforeDeployments = new Set(fs.readdirSync(backupRoot))
let installed = false, stopped = false, envWritten = false, writtenEnvHash = null, writtenPolicyHash = null
try {
  run('node', [path.join(release, 'scripts/install-site-reliability.mjs')], site, { env: { ...process.env, SITE_RELIABILITY_MANIFEST: manifestName, SITE_RELIABILITY_TARGET: site, SITE_RELIABILITY_BACKUPS: backupRoot } })
  installed = true
  run('pm2', ['stop', 'legalcareerist-api']); stopped = true
  ensure(fs.readFileSync(envFile).equals(originalEnv), 'Настройки менялись во время установки; автоматическая замена остановлена.')
  const file = path.join(dataDir, 'pending-joins.json'), before = read(file)
  const prepared = prepareSubscriptionPolicy(before, oldPolicy, Date.now(), days)
  save(file, JSON.stringify(prepared.cards, null, 2))
  const people = read(usersFile), startedAt = Date.now()
  ensure(people[target] && String(people[target].username || '').replace(/^@/, '').toLowerCase() === username.toLowerCase(), 'Получатель теста изменился во время установки.')
  people[target] = { ...people[target], subscriptionDemoStartedAt: startedAt, subscriptionDemoUntil: startedAt + 86400000 }
  save(usersFile, JSON.stringify(people, null, 2))
  const webhookSecret = value('TELEGRAM_WEBHOOK_SECRET') || crypto.randomBytes(32).toString('hex')
  let env = fs.readFileSync(envFile, 'utf8')
  const settings = { SUBSCRIPTION_GRACE_DAYS: String(days), AUTO_EXCLUDE: '1', AUTO_RESIDENT_REMINDERS: '1', CHARGE_FAILED_NOTICES: '1', TELEGRAM_WEBHOOK_SECRET: webhookSecret }
  for (const [key, v] of Object.entries(settings)) {
    const line = `${key}=${v}`, pattern = new RegExp(`^${key}=.*$`, 'm')
    env = pattern.test(env) ? env.replace(pattern, line) : env.trimEnd() + '\n' + line + '\n'
  }
  save(envFile, env)
  envWritten = true; writtenEnvHash = hash(Buffer.from(env))
  for (const [key, v] of Object.entries(pm2)) if (/^(TELEGRAM_|PRODAMUS_|SMTP_|COMMUNITY_|ACCOUNT_|BOT_USERNAME$|SITE_URL$|SUPPORT_HANDLE$|AUTO_|DISABLE_|RETENTION_|LIFETIME_|EXPIRY_|REVIEW_|CAMPAIGNS$|CHARGE_FAILED_)/.test(key) && typeof v !== 'object' && v !== undefined) process.env[key] = String(v)
  Object.assign(process.env, settings)
  if (!polling) await telegram('setWebhook', { url: hook.url, secret_token: webhookSecret, allowed_updates: ['message', 'callback_query', 'chat_join_request', 'chat_member'], drop_pending_updates: false })
  run('pm2', ['restart', 'legalcareerist-api', '--update-env']); stopped = false
  let ready = false
  const port = value('PORT') || 3001
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok && (await r.json()).ok) { ready = true; break } } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  ensure(ready, 'API не восстановился после активации политики.')
  const html = fs.readFileSync(path.join(site, 'dist/index.html'), 'utf8')
  const entry = html.match(/<script[^>]*src=["']([^"']+)["']/)?.[1]
  ensure(entry?.startsWith('/assets/'), 'Не найден входной файл интерфейса.')
  const publicPage = await fetch(new URL('/cabinet', siteUrl), { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
  ensure(publicPage.ok && (await publicPage.text()).includes(entry), 'Публичный сайт отдаёт старый интерфейс.')
  const assets = fs.readdirSync(path.join(site, 'dist/assets')).filter(f => f.endsWith('.js') && fs.readFileSync(path.join(site, 'dist/assets', f), 'utf8').includes('/api/account/subscription/renew'))
  ensure(assets.length, 'В интерфейсе не найдено продление по прежней цене.')
  for (const asset of [entry, ...assets.map(f => '/assets/' + f)]) {
    const response = await fetch(new URL(asset, siteUrl), { signal: AbortSignal.timeout(15000) })
    ensure(response.ok && Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(path.join(site, 'dist', asset.replace(/^\//, '')))), 'Публичные файлы интерфейса отличаются от установленной сборки.')
  }
  const rejected = await fetch(`http://127.0.0.1:${port}/api/prodamus/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"diagnostic":true}', signal: AbortSignal.timeout(5000) })
  ensure(rejected.status === 400, 'Рабочий API не отклонил неподписанное событие.')
  save(policyFile, JSON.stringify({ ...prepared.policy, installedAt: Date.now() }, null, 2))
  writtenPolicyHash = hash(fs.readFileSync(policyFile))
  run('pm2', ['save'])
  const launcherFile = path.join(site, 'update-subscriptions.local')
  if (!fs.existsSync(launcherFile)) fs.writeFileSync(launcherFile, [
    '#!/usr/bin/env bash', 'set -euo pipefail', 'cd -- "$(dirname -- "$0")"',
    'git fetch origin refs/heads/codex/site-reliability:refs/remotes/origin/codex/site-reliability',
    'subscription_ref=$(git rev-parse refs/remotes/origin/codex/site-reliability^{commit})',
    'subscription_release=$(mktemp -d /root/legal-subscriptions.XXXXXX)',
    'git archive "$subscription_ref" | tar -x -C "$subscription_release"',
    'flock -n /run/lock/legalcareerist-subscriptions.lock node --env-file=server/.env "$subscription_release/scripts/setup-community-subscriptions.mjs" "$PWD"', '',
  ].join('\n'), { mode: 0o700, flag: 'wx' })
  const screen = subscriptionDemo('paid', startedAt)
  let sent = false
  try { await telegram('sendMessage', { chat_id: target, text: screen.text, reply_markup: { inline_keyboard: screen.keyboard } }); sent = true } catch { console.log('Тестовое сообщение не подтверждено. Проверьте личный чат с ботом; повторно автоматически не отправляем.') }
  console.log(JSON.stringify({ installed: true, graceDays: days, autoExclusion: true, transitionDeadline: new Date(prepared.policy.activatedAt + days * 86400000).toISOString(), migration: prepared.stats, testAccount: '@' + username, testMessageConfirmed: sent, realTestCharges: 0, realTestRemovals: 0, addressAndUtmUnchanged: true, privateBackup: extraBackup }, null, 2))
} catch (error) {
  if (installed) {
    try {
      if (envWritten) {
        ensure(hash(fs.readFileSync(envFile)) === writtenEnvHash, 'Настройки после установки менялись; их нельзя заменить автоматически.')
        save(envFile, originalEnv)
      }
      if (writtenPolicyHash && hash(fs.readFileSync(policyFile)) === writtenPolicyHash) {
        if (oldPolicy) save(policyFile, JSON.stringify(oldPolicy, null, 2))
        else fs.rmSync(policyFile)
      }
      process.env.AUTO_EXCLUDE = originalExclude
      process.env.SUBSCRIPTION_GRACE_DAYS = originalGraceDays
      process.env.AUTO_RESIDENT_REMINDERS = originalReminderFlag
      process.env.CHARGE_FAILED_NOTICES = originalFailureFlag
      const deployments = fs.readdirSync(backupRoot).filter(n => !beforeDeployments.has(n) && n.startsWith('deployment-'))
      ensure(deployments.length === 1, 'Не удалось однозначно найти кодовую копию.')
      const backup = path.join(backupRoot, deployments[0])
      run('node', [path.join(backup, 'installer.mjs'), '--rollback', backup])
      run('pm2', ['restart', 'legalcareerist-api', '--update-env']); stopped = false
    } catch { console.error('Автоматический возврат требует проверки; приватная копия: ' + extraBackup) }
  }
  if (stopped) run('pm2', ['restart', 'legalcareerist-api'])
  console.error('Установка остановлена: ' + (error.name === 'TimeoutError' ? 'таймаут соединения Telegram' : error.message))
  console.error('Данные оплат не восстанавливались из старой копии; реальные новые платежи сохранены.')
  process.exitCode = 1
}

}
await main().catch(error => { console.error('Предварительная проверка остановлена: ' + error.message); process.exitCode = 1 })
