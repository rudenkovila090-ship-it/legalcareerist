// Read-only: no messages, charges, subscription changes or membership changes.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const release = process.argv[2]
if (!/^[a-f0-9]{40}$/.test(release || '')) throw Error('Укажите полный SHA проверяемой версии.')
const result = { readOnly: true, secretsPrinted: false }
function pm2App() {
  try {
    const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }))
    return list.find(app => app.name === 'legalcareerist-api') || null
  } catch { return null }
}
const app = pm2App()
const state = app?.pm2_env || {}
const binding = name => state[name] ?? state.env?.[name] ?? process.env[name]
const entry = state.pm_exec_path || path.resolve('server/index.js')
const apiDir = path.dirname(entry)
const source = fs.existsSync(entry) ? fs.readFileSync(entry, 'utf8') : ''
const defaultChat = source.match(/const COMMUNITY_CHAT_ID\s*=\s*process\.env\.COMMUNITY_CHAT_ID\s*\|\|\s*['"]([^'"]+)['"]/)?.[1]
const chat = binding('COMMUNITY_CHAT_ID') || defaultChat
const token = binding('TELEGRAM_BOT_TOKEN')
result.process = { found: Boolean(app), status: state.status || null, entry, restartsBefore: state.restart_time ?? null }
result.config = {
  paymentKeyPresent: Boolean(binding('PRODAMUS_SECRET_KEY')),
  botTokenPresent: Boolean(token),
  communityChat: chat ? binding('COMMUNITY_CHAT_ID') ? 'configured' : 'fallback_in_server_code' : 'unknown',
  communityInvitePresent: Boolean(binding('COMMUNITY_INVITE_LINK')),
  autoExcludeEnabled: binding('AUTO_EXCLUDE') === '1',
  residentRemindersEnabled: binding('AUTO_RESIDENT_REMINDERS') !== '0',
  dailyJobsEnabled: binding('DISABLE_DAILY_REPORT') !== '1',
}
try {
  const modified = fs.statSync(path.join(apiDir, '.env')).mtimeMs
  result.process.envFileNewerThanProcessStart = Number.isFinite(state.pm_uptime) ? modified > state.pm_uptime : null
} catch { result.process.envFileNewerThanProcessStart = null }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
result.code = {}
for (const relative of ['index.js', 'lib/prodamus.js', 'lib/store.js', 'lib/subscriptionAccess.js']) {
  const file = path.join(apiDir, relative)
  let expected = null
  try { expected = execFileSync('git', ['show', `${release}:server/${relative}`], { stdio: ['ignore', 'pipe', 'ignore'] }) } catch { /* unknown */ }
  const actual = fs.existsSync(file) ? fs.readFileSync(file) : null
  result.code[relative] = { exists: Boolean(actual), matchesReviewedBranch: actual && expected ? hash(actual) === hash(expected) : null }
}
const safeError = error => ({ ok: false, error: error.name || 'Error', code: error.cause?.code || error.code || null })
async function api(method, data = {}) {
  if (!token) return { ok: false, notConfigured: true }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(25000),
    })
    const body = await response.json()
    return { ok: response.ok && body.ok === true, http: response.status, errorCode: body.error_code || null, data: body.result }
  } catch (error) { return safeError(error) }
}
const [me, hook] = await Promise.all([api('getMe'), api('getWebhookInfo')])
result.telegram = { ok: me.ok, http: me.http ?? null, error: me.error ?? null, code: me.code ?? me.errorCode ?? null, username: me.ok ? me.data?.username : null }
let host = null
try { host = hook.data?.url ? new URL(hook.data.url).hostname : null } catch { /* do not expose an unexpected URL */ }
result.telegram.webhook = { ok: hook.ok, configured: Boolean(hook.data?.url), host, pendingUpdates: hook.data?.pending_update_count ?? null, deliveryErrorPresent: Boolean(hook.data?.last_error_message) }
if (me.ok && chat && me.data?.id) {
  const [visible, member] = await Promise.all([api('getChat', { chat_id: chat }), api('getChatMember', { chat_id: chat, user_id: me.data.id })])
  result.community = {
    chatVisible: visible.ok,
    chatErrorCode: visible.errorCode ?? visible.code ?? null,
    membershipChecked: member.ok,
    botRole: member.data?.status || null,
    canApproveRequests: member.data?.status === 'creator' || member.data?.can_invite_users === true,
    canRestrictMembers: member.data?.status === 'creator' || member.data?.can_restrict_members === true,
  }
} else result.community = { checked: false, reason: me.ok ? 'chat_unknown' : 'telegram_getMe_failed' }
const later = pm2App()
result.process.restartsAfter = later?.pm2_env?.restart_time ?? null
console.log(JSON.stringify(result, null, 2))
