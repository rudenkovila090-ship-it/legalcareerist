// Existing zero-grace policy regression; the default four-day policy has its own lifecycle suite.
process.env.SUBSCRIPTION_GRACE_DAYS = '0'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { hasAccess, paidPeriodEnded, preciseMoscowTime } from '../lib/subscriptionAccess.js'
import { createAccessExpiryWorker } from '../lib/accessExpiry.js'
import { createRenewalDelivery } from '../lib/residentDelivery.js'

// Imports that write JSON always run against a disposable copy, never real users.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'legalcareerist-reliability-'))
fs.cpSync(new URL('../lib', import.meta.url), path.join(temp, 'lib'), { recursive: true })
fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}')
fs.mkdirSync(path.join(temp, 'data'))
const inbox = await import(pathToFileURL(path.join(temp, 'lib/leadInbox.js')))
const store = await import(pathToFileURL(path.join(temp, 'lib/store.js')))
const profile = await import(pathToFileURL(path.join(temp, 'lib/accountProfile.js')))
const pending = await import(pathToFileURL(path.join(temp, 'lib/pendingNotices.js')))
after(() => fs.rmSync(temp, { recursive: true, force: true }))
const now = Date.parse('2026-11-01T10:12:34.000Z')
test('financial JSON rejects corrupt data instead of overwriting it', () => {
  const file = path.join(temp, 'data/pending-joins.json')
  const previous = fs.existsSync(file) ? fs.readFileSync(file) : null
  try {
    for (const broken of ['{', '[]', 'null', '{"bad":1}']) {
      fs.writeFileSync(file, broken)
      assert.throws(() => store.createPendingJoin({ tariffId: '1m', name: 'Synthetic' }))
      assert.equal(fs.readFileSync(file, 'utf8'), broken)
    }
  } finally { if (previous) fs.writeFileSync(file, previous); else fs.rmSync(file, { force: true }) }
})
test('failed atomic rename leaves the previous financial store intact', () => {
  const token = store.createPendingJoin({ tariffId: '1m', name: 'Synthetic atomic test' })
  const file = path.join(temp, 'data/pending-joins.json'), previous = fs.readFileSync(file)
  const rename = fs.renameSync
  try {
    fs.renameSync = () => { throw Error('synthetic failed rename') }
    assert.throws(() => store.createPendingJoin({ tariffId: '1m', name: 'Synthetic rejected' }))
    assert.deepEqual(fs.readFileSync(file), previous)
    assert.equal(fs.readdirSync(path.dirname(file)).filter(f => f.includes('.writing-')).length, 0)
  } finally { fs.renameSync = rename; store.removeJoin(token) }
})
const lead = n => inbox.normalizeLead({ name: 'Synthetic Customer', contact: 'test@example.invalid', email: 'test@example.invalid', formType: 'contact', requestId: `request-synthetic-${n}`, consent: { policy: true, processing: true }, interest: ['Test question'] }).body

test('consents are strict, contact is required, invalid details rejected', () => {
  for (const consent of [undefined, true, { policy: 'true', processing: true }, { policy: true, processing: false }]) assert.equal(inbox.normalizeLead({ consent }).error, 'consent_required')
  assert.equal(inbox.normalizeLead({ consent: { policy: true, processing: true } }).error, 'contact_required')
  assert.equal(inbox.normalizeLead({ ...lead(1), interest: [1] }).error, 'bad_details')
})

test('receipt persists before notification; same request retries are idempotent', () => {
  const first = inbox.receiveLead(lead(1), { text: 'Test' }, now)
  const same = inbox.receiveLead({ ...lead(1), date: 'different', ticketNumber: 'different' }, { text: 'Test' }, now)
  assert.equal(same.duplicate, true)
  assert.equal(first.receipt.token, same.receipt.token)
  assert.equal(inbox.receiveLead({ ...lead(1), contact: 'different' }, null, now).error, 'request_conflict')
  const persisted = JSON.parse(fs.readFileSync(path.join(temp, 'data/lead-inbox.json')))
  assert.equal(persisted[first.receipt.token].body.name, 'Synthetic Customer')
  assert.equal(fs.statSync(path.join(temp, 'data/lead-inbox.json')).mode & 0o777, 0o600)
})

test('network failure keeps a receipt pending; restart and successful retry complete it', async () => {
  const r = inbox.receiveLead(lead(2), { text: 'Retry' }, now).receipt
  assert.equal(await inbox.deliverLead(r.token, async () => { throw Error('offline') }, now), false)
  assert.equal(inbox.leadInboxStore.all().find(x => x.token === r.token).notifiedAt, null)
  const restarted = await import(pathToFileURL(path.join(temp, 'lib/leadInbox.js')) + '?restart=1')
  assert.equal(await restarted.deliverLead(r.token, async () => true, now + 20000), true)
  let calls = 0
  await restarted.deliverLead(r.token, async () => { calls++; return true }, now + 30000)
  assert.equal(calls, 0)
})

test('concurrent delivery sends only once and does not overwrite another receipt', async () => {
  const r = inbox.receiveLead(lead(3), { text: 'Slow' }, now).receipt
  let release
  const first = inbox.deliverLead(r.token, () => new Promise(resolve => { release = resolve }), now)
  const other = inbox.receiveLead(lead(4), null, now).receipt
  assert.equal(await inbox.deliverLead(r.token, async () => true, now), false)
  release(true)
  await first
  assert.ok(inbox.leadInboxStore.all().some(x => x.token === other.token))
})

test('files survive failed delivery, deduplicate retries and follow privacy deletion', async () => {
  const r = inbox.receiveLead(lead(5), null, now).receipt
  const file = { originalname: '../resume.pdf', buffer: Buffer.from('Synthetic PDF') }
  assert.equal(inbox.attachLeadFile(r.token, file, 'Resume').ok, true)
  assert.equal(inbox.attachLeadFile(r.token, file, 'Resume').ok, true)
  assert.equal(inbox.leadInboxStore.all().find(x => x.token === r.token).attachments.length, 1)
  await inbox.deliverLead(r.token, async () => true, now, async () => false)
  assert.equal(inbox.leadInboxStore.all().find(x => x.token === r.token).attachments[0].notifiedAt, null)
  await inbox.deliverLead(r.token, async () => true, now + 60000, async (bytes, name) => { assert.equal(name, 'resume.pdf'); assert.deepEqual(bytes, file.buffer); return true })
  assert.ok(inbox.leadInboxStore.all().find(x => x.token === r.token).attachments[0].notifiedAt)
  inbox.leadInboxStore.remove(r.token)
  assert.equal(fs.existsSync(path.join(temp, 'data/lead-files', r.token)), false)
  assert.equal(inbox.attachLeadFile('../../x', file, 'Resume').error, 'receipt_not_found')
})

test('long questions split into Telegram-sized messages and retry from the failed part', async () => {
  const text = 'A'.repeat(4000), r = inbox.receiveLead(lead(7), { text }, now).receipt
  let calls = 0
  await inbox.deliverLead(r.token, async message => { assert.ok(message.length <= 3600); return ++calls === 1 }, now)
  assert.equal(inbox.leadInboxStore.all().find(x => x.token === r.token).notification.sentParts, 1)
  const remaining = []
  await inbox.deliverLead(r.token, async message => { remaining.push(message); return true }, now + 60000)
  assert.equal(remaining.join('').length, 2200)
  assert.ok(inbox.leadInboxStore.all().find(x => x.token === r.token).notifiedAt)
})

test('corrupt or wrong-shaped JSON is never silently overwritten', () => {
  const file = path.join(temp, 'data/lead-inbox.json'), backup = fs.readFileSync(file)
  for (const damaged of ['{"broken":', '[]', 'null', '{"record":null}']) {
    fs.writeFileSync(file, damaged)
    assert.throws(() => inbox.receiveLead(lead(6), null))
    assert.equal(fs.readFileSync(file, 'utf8'), damaged)
  }
  fs.writeFileSync(file, backup)
})

test('pending admin notices are removed only by acknowledgement or payment cancellation', () => {
  pending.queuePending({ kind: 'join', text: 'Synthetic unpaid notice', email: 'pending@example.invalid' })
  const due = pending.takeDuePending(now + 1000 * 86400000)
  assert.equal(due.length, 1)
  assert.equal(pending.takeDuePending(now + 1000 * 86400000).length, 1)
  pending.acknowledgePending(due[0].id)
  assert.equal(pending.takeDuePending(now + 1000 * 86400000).length, 0)
})

test('paid access ends at the precise boundary for recurring, one-time and cancelled cards', () => {
  for (const status of ['active', 'cancelled']) for (const oneTime of [true, false]) {
    const join = { paid: true, status, oneTime, nextPaymentAt: now }
    assert.equal(hasAccess(join, now - 1), true)
    assert.equal(hasAccess(join, now), false)
    assert.equal(paidPeriodEnded(join, now), true)
    assert.equal(hasAccess(join, now + 1000), false)
  }
  assert.equal(hasAccess({ status: 'active', paid: true }, now), false)
  assert.equal(paidPeriodEnded({ status: 'active', paid: true }, now), false)
  assert.equal(hasAccess({ lifetime: true }, now), true)
  assert.equal(hasAccess({ paid: false, status: 'active', nextPaymentAt: now + 100 }, now), false)
  assert.ok(preciseMoscowTime(now).includes('13:12:34'))
})

test('website and Telegram agree and a late successful payment restores access', () => {
  const token = store.createPendingJoin({ tariffId: '1m', name: 'Synthetic Customer', phone: '+79000000111', email: 'renew@example.invalid' })
  store.setTgUserId(token, '900000001')
  store.recordPayment(token, { paidAt: now - 1000, nextPaymentAt: now, amount: 690, orderKey: 'synthetic-first' })
  assert.equal(profile.residentStatus('900000001', now).status, 'ended')
  assert.equal(hasAccess(store.getJoin(token), now), false)
  store.recordPayment(token, { tariffId: '3m', paidAt: now + 1000, nextPaymentAt: now + 30 * 86400000, amount: 1770, orderKey: 'synthetic-renewal', paymentNum: 2, enqueueConfirmation: true })
  assert.equal(profile.residentStatus('900000001', now + 1000).status, 'active')
  assert.equal(hasAccess(store.getJoin(token), now + 1000), true)
  assert.equal(store.getJoin(token).payments.length, 2)
  assert.equal(store.getJoin(token).tariffId, '3m')
  assert.equal(store.getJoin(token).renewalNotices.length, 1)
  const expiry = store.getJoin(token).nextPaymentAt
  const late = store.recordPayment(token, { paidAt: now - 2000, nextPaymentAt: now - 500, amount: 690, orderKey: 'synthetic-out-of-order', paymentNum: 1 })
  assert.equal(late.stale, true)
  assert.equal(store.getJoin(token).nextPaymentAt, expiry)
  assert.equal(store.getJoin(token).lastPaidAt, now + 1000)
  assert.equal(profile.residentStatus('900000001', now + 1000).status, 'active')
})

test('payment confirmation retries only the failed channel and survives sender failure', async () => {
  const join = { token: 'delivery', tgUserId: '900000001', email: 'delivery@example.invalid', renewalNotices: [{ id: 'payment', botDone: false, mailDone: false }] }
  const calls = []
  let attempt = 0
  const run = createRenewalDelivery({ list: () => [join], patch: (_token, values) => Object.assign(join, values),
    send: async (_join, _notice, channels) => { calls.push(channels); attempt++; if (attempt === 1) throw Error('offline'); return { bot: attempt === 2 ? true : null, mail: attempt >= 3 } },
  })
  await run(); assert.equal(join.renewalNotices.length, 1)
  await run(); assert.equal(join.renewalNotices[0].botDone, true)
  await run(); assert.equal(join.renewalNotices.length, 0)
  assert.deepEqual(calls.at(-1), { bot: false, mail: true })
})

test('an unfinished unban is repaired after renewal without removing the paid customer', async () => {
  const join = { token: 'repair', tgUserId: '900000002', status: 'active', paid: true, nextPaymentAt: now + 1000, accessUnbanPending: true }
  let repaired = 0, removed = 0
  const run = createAccessExpiryWorker({ list: () => [join], now: () => now, membership: async () => 'out',
    releaseBan: async () => { repaired++; return true }, remove: async () => { removed++; return true }, patch: (_token, values) => Object.assign(join, values),
  })
  await run(); assert.equal(repaired, 1); assert.equal(removed, 0); assert.equal(join.accessUnbanPending, undefined)
})

test('expiry skips founders, administrators, unknown dates, active duplicates and lookup errors', async () => {
  const expired = id => ({ token: id, tgUserId: id, paid: true, status: 'active', nextPaymentAt: now })
  const joins = [expired('expired'), { ...expired('founder'), lifetime: true }, expired('admin'), { ...expired('undated'), nextPaymentAt: null }, expired('error'), expired('double'), { ...expired('valid'), tgUserId: 'double', nextPaymentAt: now + 1000 }]
  const removed = [], patched = []
  const run = createAccessExpiryWorker({ list: () => joins, now: () => now,
    membership: async id => id === 'admin' ? 'admin' : id === 'error' ? 'unknown' : 'in',
    remove: async j => { removed.push(j.token); return true }, patch: (id, fields) => { patched.push(id); Object.assign(joins.find(x => x.token === id), fields) },
  })
  await run(); await run()
  assert.deepEqual(removed, ['expired'])
  assert.deepEqual(patched, ['expired'])
  assert.equal(joins[0].status, 'active') // expiry must not cancel provider billing
})

test('payment during membership lookup prevents removal; failed removals retry', async () => {
  const j = { token: 'race', tgUserId: 'race', paid: true, status: 'active', nextPaymentAt: now }
  let removed = 0
  const run = createAccessExpiryWorker({ list: () => [j], now: () => now, membership: async () => { j.nextPaymentAt = now + 100; return 'in' }, remove: async () => { removed++; return false }, patch: () => {} })
  await run(); assert.equal(removed, 0)
  j.nextPaymentAt = now
  const retry = createAccessExpiryWorker({ list: () => [j], now: () => now, membership: async () => 'in', remove: async () => { removed++; return removed > 1 }, patch: (_id, values) => Object.assign(j, values) })
  await retry(); assert.equal(j.accessClosedFor, undefined)
  await retry(); assert.equal(j.accessClosedFor, now)
})
