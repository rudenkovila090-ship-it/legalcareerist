// Operator-only client. Credentials stay on the server; data mutations run inside its API process.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { recoveryRecipient, recoveryRequestSignature } from '../server/lib/subscriptionRecovery.js'

process.umask(0o077)
try {
  const site = fs.realpathSync(process.cwd()), release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = process.argv.slice(2).find(a => !a.startsWith('--'))
  const input = JSON.parse(fs.readFileSync(file || 0, 'utf8'))
  input.recipients.forEach(recoveryRecipient)
  for (const name of ['server/index.js', 'server/lib/subscriptionRecovery.js', 'server/lib/store.js', 'server/lib/prodamus.js', 'server/lib/subscriptionAccess.js']) {
    if (!fs.readFileSync(path.join(site, name)).equals(fs.readFileSync(path.join(release, name)))) throw Error('Сначала установите пакет обновления: код API отличается.')
  }
  const app = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).find(p => p.name === 'legalcareerist-api')
  if (app?.pm2_env?.status !== 'online' || app.pm2_env.exec_mode !== 'fork_mode' || app.pm2_env.pm_exec_path !== path.join(site, 'server/index.js')) throw Error('Нужно проверить процесс API в PM2.')
  const value = key => app.pm2_env[key] ?? app.pm2_env.env?.[key] ?? process.env[key]
  const secret = value('PRODAMUS_SECRET_KEY'), port = value('PORT') || 3001
  if (!secret || !/^\d{2,5}$/.test(String(port))) throw Error('Не найдены рабочие настройки API.')
  const health = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) })
  if (!health.ok || (await health.json()).subscriptionRecovery !== 1) throw Error('Работающий API ещё не поддерживает восстановление. Нужна установка обновления.')
  const body = { purpose: 'community-subscription-recovery', issuedAt: Date.now(), nonce: crypto.randomBytes(12).toString('hex'), send: process.argv.includes('--send'), input }
  const response = await fetch(`http://127.0.0.1:${port}/api/internal/subscription-recovery`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Recovery-Signature': recoveryRequestSignature(body, secret) }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) })
  if (!response.ok) throw Error('API не подтвердил обработку восстановления (HTTP ' + response.status + ').')
  const report = await response.json()
  console.log(JSON.stringify(report, null, 2))
  if (report.results.some(r => ['blocked', 'busy', 'delivery_unknown', 'send_failed'].includes(r.status))) process.exitCode = 1
} catch (error) {
  const known = /^(Сначала|Нужно|Не найдены|Работающий API|API не подтвердил)/.test(error.message)
  console.error(known ? error.message : 'Восстановление остановлено: проверьте формат данных или доступность API. Секреты и платёжные ссылки не выводятся.')
  process.exitCode = 1
}
