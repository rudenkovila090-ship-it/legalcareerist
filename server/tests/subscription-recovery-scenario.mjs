import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { recoveryRequestSignature } from '../lib/subscriptionRecovery.js'

export async function runRecovery({ root, request, hook, read, check, wait, pathToFileURL }) {
  const now = Date.parse('2026-11-03T15:00:00+03:00'), DAY = 86400000
  const joins = await import(pathToFileURL(path.join(root, 'lib/store.js')))
  const bot = await import(pathToFileURL(path.join(root, 'lib/botUsers.js')))
  const { HmacHelper } = await import(pathToFileURL(path.join(root, 'lib/hmac.js')))
  const { subscriptionDetails } = await import(pathToFileURL(path.join(root, 'lib/accountProfile.js')))
  const recipients = [
    { telegramId: '900000021', name: 'Synthetic one', phone: '+79000000221', planId: '2611880', amount: 500, months: 1, endedAt: '2026-11-01T15:00:00+03:00' },
    { telegramId: '900000022', name: 'Synthetic two', phone: '+79000000222', planId: '2854589', amount: 1350, months: 3, endedAt: '2026-11-01T15:00:00+03:00' },
    { telegramId: '900000023', name: 'Synthetic three', phone: '+79000000223', planId: '2611880', amount: 500, months: 1, endedAt: '2026-11-01T15:00:00+03:00' },
  ]
  const originals = []
  for (const [i, r] of recipients.entries()) {
    const token = joins.createPendingJoin({ tariffId: null, name: r.name, phone: r.phone })
    joins.recordPayment(token, { amount: i === 2 ? 350 : r.amount, paidAt: now - 100 * DAY, nextPaymentAt: now - 4 * DAY,
      subscriptionId: r.planId, tgUserId: r.telegramId, profileId: 'old-profile-' + i, orderKey: 'old-order-' + i })
    if (i === 2) joins.recordPayment(token, { amount: 500, paidAt: now - 40 * DAY, nextPaymentAt: now - 4 * DAY, subscriptionId: r.planId, profileId: 'old-profile-' + i, orderKey: 'old-third-renewal' })
    joins.patchJoin(token, { inChat: true, joinedAt: now - 100 * DAY })
    bot.touchBotUser({ id: r.telegramId, first_name: r.name })
    originals.push(joins.getJoin(token))
  }
  await hook('', { clock: now })
  fs.writeFileSync(path.join(root, 'telegram-ok'), '')
  const input = { campaignId: 'synthetic-recovery-20261103', recipients }
  let stamp = now
  const body = (send = true) => ({ purpose: 'community-subscription-recovery', issuedAt: stamp, nonce: 'a'.repeat(24), send, input })
  const post = data => request('/api/internal/subscription-recovery', data, { 'X-Recovery-Signature': recoveryRequestSignature(data, 'test-no-real-provider') })
  let r = await request('/api/internal/subscription-recovery', body())
  check('private recovery operation cannot be triggered without its purpose-bound signature', () => { assert.equal(r.status, 403); assert.equal(joins.listJoins().length, 3) })
  // Exercise the exact operator client with fake PM2 and a real loopback API.
  const site = path.join(root, 'site'), bin = path.join(root, 'bin')
  fs.mkdirSync(site); fs.mkdirSync(bin); fs.symlinkSync(root, path.join(site, 'server'))
  fs.writeFileSync(path.join(bin, 'pm2'), '#!/usr/bin/env node\nprocess.stdout.write(' + JSON.stringify(JSON.stringify([{ name: 'legalcareerist-api', pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_exec_path: path.join(site, 'server/index.js'), PORT: process.env.RELIABILITY_TEST_PORT || '3036', PRODAMUS_SECRET_KEY: 'test-no-real-provider' } }])) + ')\n', { mode: 0o700 })
  const clock = path.join(root, 'client-clock.mjs'); fs.writeFileSync(clock, 'Date.now = () => ' + now)
  const client = spawn(process.execPath, ['--import', clock, fileURLToPath(new URL('../../scripts/recover-community-subscriptions.mjs', import.meta.url))], { cwd: site, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe'] })
  let clientOutput = '', clientError = ''
  client.stdout.on('data', b => { clientOutput += b }); client.stderr.on('data', b => { clientError += b })
  client.stdin.end(JSON.stringify(input))
  const exit = await new Promise(resolve => client.once('exit', resolve))
  check('operator client validates live version, reads private stdin and previews without exposing credentials', () => {
    assert.equal(exit, 0, clientError); assert.equal(JSON.parse(clientOutput).results.length, 3); assert.ok(!clientOutput.includes('test-no-real-provider')); assert.equal(joins.listJoins().length, 3)
  })
  r = await post(body())
  check('unconfirmed provider stop blocks every link and message', () => { assert.equal(r.body.sent, 0); assert.ok(r.body.results.every(r => r.stage === 'provider_stop')); assert.equal(fs.existsSync(path.join(root, 'checkout-plan')), false) })
  recipients.forEach(r => { r.providerCompleted = true })
  r = await post(body())
  check('one authorized run sends exactly one personal invitation to each numeric recipient', () => { assert.equal(r.body.sent, 3); assert.ok(r.body.results.every(r => r.status === 'sent')) })
  const pending = recipients.map(recipient => joins.listJoins().find(j => j.recovery && String(j.tgUserId) === recipient.telegramId))
  check('invitation never records fake money, and the recovery window does not rewrite paid dates', () => {
    pending.forEach(j => assert.equal(j.paid, false))
    originals.forEach(old => { const current = joins.getJoin(old.token); assert.deepEqual(current.payments, old.payments); assert.equal(current.nextPaymentAt, old.nextPaymentAt); assert.equal(current.recoveryAccessUntil, now + 4 * DAY) })
  })
  const checkouts = fs.readFileSync(path.join(root, 'checkout-requests.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s))
  check('links retain the monthly 500 / quarterly 1350 / monthly 500 plans and carry signed fresh-card correlation', () => {
    assert.deepEqual(checkouts.map(c => c.subscription), ['2611880', '2854589', '2611880'])
    checkouts.forEach((c, i) => { assert.ok(c.customer_extra.includes('KY_RESTART:' + pending[i].token)); assert.equal(c.tg_user_id, recipients[i].telegramId); assert.ok(c.urlSuccess.endsWith(pending[i].token)) })
  })
  stamp = now + DAY; await hook('', { clock: stamp })
  r = await post(body())
  check('rerun does not resend messages or reset temporary access', () => { assert.equal(r.body.sent, 0); assert.ok(r.body.results.every(r => r.status === 'already_sent')); originals.forEach(j => assert.equal(joins.getJoin(j.token).recoveryAccessUntil, now + 4 * DAY)) })
  const paidAt = stamp + 1000
  await hook('', { clock: paidAt })
  for (const [i, recipient] of recipients.entries()) {
    const next = recipient.months === 3 ? '2027-02-04T15:00:01+03:00' : '2026-12-04T15:00:01+03:00'
    const payment = { payment_status: 'success', date: new Date(paidAt).toISOString(), sum: String(i === 2 ? 350 : recipient.amount), order_id: 'recovery-paid-' + i,
      customer_phone: recipient.phone, tg_user_id: recipient.telegramId, customer_extra: checkouts[i].customer_extra,
      subscription: { id: recipient.planId, profile_id: 'old-profile-' + i, payment_num: '7', date_next_payment: next } }
    await request('/api/prodamus/webhook', payment, { sign: HmacHelper.create(payment, 'test-no-real-provider') }); await wait(100)
    check(`recipient ${i + 1}: payment starts a fresh period despite an old reused profile and provider counter`, () => {
      const fresh = joins.getJoin(pending[i].token), old = joins.getJoin(originals[i].token)
      assert.equal(fresh.firstPaidAt, paidAt); assert.equal(fresh.payments[0].kind, 'first'); assert.equal(fresh.payments.length, 1)
      assert.equal(fresh.nextPaymentAt, Date.parse(next)); assert.equal(fresh.priceLock.amount, recipient.amount)
      assert.equal(fresh.recovery.expectedUntil, Date.parse(next)); assert.equal(fresh.recovery.periodNeedsReview, false)
      assert.equal(fresh.payments[0].amount, i === 2 ? 350 : recipient.amount)
      assert.deepEqual(old.payments, originals[i].payments); assert.equal(old.firstPaidAt, originals[i].firstPaidAt); assert.equal(old.supersededBy, fresh.token)
      const details = subscriptionDetails(recipient.telegramId, '', paidAt)
      assert.equal(details.since, paidAt); assert.equal(details.price, recipient.amount); assert.equal(details.joined, true)
      const user = read('bot-users.json')[recipient.telegramId]
      assert.ok(user.tags.includes('резидент_сообщества')); assert.ok(user.tags.includes('цена_' + recipient.amount)); assert.ok(!user.tags.includes('восстановление_ожидается')); assert.equal(user.subscriptionStartedAt, paidAt)
    })
  }
  const renewal = { payment_status: 'success', date: '2026-12-04T15:00:01+03:00', sum: '500', order_id: 'recovery-next-cycle', tg_user_id: recipients[0].telegramId, customer_phone: recipients[0].phone,
    subscription: { id: '2611880', profile_id: 'old-profile-0', payment_num: '8', date_next_payment: '2027-01-04T15:00:01+03:00' } }
  await request('/api/prodamus/webhook', renewal, { sign: HmacHelper.create(renewal, 'test-no-real-provider') }); await wait(100)
  check('later renewal without custom metadata goes to the restarted profile card', () => { assert.equal(joins.getJoin(pending[0].token).payments.length, 2); assert.equal(joins.getJoin(pending[0].token).firstPaidAt, paidAt); assert.deepEqual(joins.getJoin(originals[0].token).payments, originals[0].payments) })
  const oldDuplicate = { ...renewal, order_id: 'old-order-0', date: new Date(originals[0].firstPaidAt).toISOString(), subscription: { ...renewal.subscription, payment_num: '1', date_next_payment: '2026-10-01T15:00:00+03:00' } }
  await request('/api/prodamus/webhook', oldDuplicate, { sign: HmacHelper.create(oldDuplicate, 'test-no-real-provider') }); await wait(100)
  check('old duplicate cannot be reassigned to the new card or rewind the new period', () => { assert.equal(joins.getJoin(pending[0].token).payments.length, 2); assert.equal(joins.getJoin(pending[0].token).nextPaymentAt, Date.parse('2027-01-04T15:00:01+03:00')) })
  stamp = paidAt; r = await post(body())
  check('paid recoveries are skipped on later campaign launches', () => { assert.equal(r.body.sent, 0); assert.ok(r.body.results.every(r => r.status === 'already_paid')) })
}
