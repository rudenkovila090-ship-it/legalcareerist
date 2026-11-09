import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { recoveryRequestSignature } from '../lib/subscriptionRecovery.js'
import { HmacHelper } from '../lib/hmac.js'

export async function runOffboarding({ root, request, hook, read, check, wait, pathToFileURL }) {
  const joins = await import(pathToFileURL(path.join(root, 'lib/store.js')))
  const bot = await import(pathToFileURL(path.join(root, 'lib/botUsers.js')))
  const access = await import(pathToFileURL(path.join(root, 'lib/subscriptionAccess.js')))
  const now = Date.parse('2026-11-04T12:00:00Z'), DAY = 86400000
  const recipients = [
    { name: 'Synthetic One', phone: '+79000000301', username: 'synthetic_one', telegramId: '900000031' },
    { phone: '+79000000302', username: 'synthetic_two', telegramId: '900000032' },
  ]
  const members = {}, originals = []
  for (const r of recipients) {
    const token = joins.createPendingJoin({ name: r.name || '', phone: r === recipients[1] ? '' : r.phone, telegram: '@' + r.username, tariffId: '1m' })
    joins.setTgUserId(token, r.telegramId)
    joins.recordPayment(token, { amount: 690, paidAt: now - 32 * DAY, nextPaymentAt: now - 2 * DAY, subscriptionId: '2854597', profileId: 'old-profile-' + r.telegramId, orderKey: 'old-payment-' + r.telegramId })
    joins.patchJoin(token, { inChat: true, recoveryAccessUntil: now + 4 * DAY })
    if (r === recipients[0]) {
      const current = joins.getJoin(token)
      joins.patchJoin(token, { importedFromBotHelp: true,
        payments: current.payments.map(p => ({ ...p, subscriptionId: null, estimated: true })),
        priceLock: { ...current.priceLock, source: 'imported_record' } })
    }
    bot.touchBotUser({ id: r.telegramId, username: r.username })
    for (const tag of ['резидент_сообщества', 'оплатил_подписку', 'тариф_1m', 'цена_690', 'контроль_списания']) bot.addTag(r.telegramId, tag)
    originals.push(joins.getJoin(token)); members[r.telegramId] = { status: 'member', user: { id: Number(r.telegramId), username: r.username } }
  }
  fs.writeFileSync(path.join(root, 'telegram-members.json'), JSON.stringify(members))
  fs.writeFileSync(path.join(root, 'telegram-ok'), '')
  await hook('', { clock: now })
  const input = { campaignId: 'synthetic-offboarding-20261104', recipients }
  const body = () => ({ purpose: 'community-subscription-recovery', operation: 'offboard', issuedAt: now, nonce: 'b'.repeat(24), send: true, input })
  const post = () => { const data = body(); return request('/api/internal/subscription-recovery', data, { 'X-Recovery-Signature': recoveryRequestSignature(data, 'test-no-real-provider') }) }
  let response = await request('/api/internal/subscription-recovery', body())
  check('manual removal endpoint requires purpose-bound authentication', () => assert.equal(response.status, 403))
  const site = path.join(root, 'site'), bin = path.join(root, 'bin')
  fs.mkdirSync(site); fs.mkdirSync(bin); fs.symlinkSync(root, path.join(site, 'server'))
  fs.writeFileSync(path.join(bin, 'pm2'), '#!/usr/bin/env node\nprocess.stdout.write(' + JSON.stringify(JSON.stringify([{ name: 'legalcareerist-api', pm2_env: { status: 'online', exec_mode: 'fork_mode', pm_exec_path: path.join(site, 'server/index.js'), PORT: process.env.RELIABILITY_TEST_PORT || '3036', PRODAMUS_SECRET_KEY: 'test-no-real-provider' } }])) + ')\n', { mode: 0o700 })
  const clock = path.join(root, 'client-clock.mjs'); fs.writeFileSync(clock, 'Date.now=()=>'+now)
  const client = spawn(process.execPath, ['--import', clock, fileURLToPath(new URL('../../scripts/recover-community-subscriptions.mjs', import.meta.url)), '--offboard'], { cwd: site, env: { ...process.env, PATH: bin + ':' + process.env.PATH }, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', errors = ''; client.stdout.on('data', b => { output += b }); client.stderr.on('data', b => { errors += b }); client.stdin.end(JSON.stringify(input))
  const exit = await new Promise(resolve => client.once('exit', resolve))
  check('exact operator command resolves phone + username in preview without actual cancellation', () => { assert.equal(exit, 0, errors); assert.equal(JSON.parse(output).results[0].status, 'preview') })
  joins.patchJoin(originals[0].token, { payments: originals[0].payments.map(p => ({ ...p, subscriptionId: null })) })
  response = await post()
  check('missing provider ID blocks exclusion and clears an unsubmitted technical-stop intent', () => {
    assert.equal(response.body.results[0].reason, 'provider_plan_unknown'); assert.equal(response.body.sent, 0)
    assert.equal(joins.getJoin(originals[0].token).recoveryStopIntent, undefined); assert.equal(joins.getJoin(originals[0].token).inChat, true)
  })
  joins.patchJoin(originals[0].token, { payments: originals[0].payments })
  input.recipients[0].providerPlanIds = ['2854597']
  response = await post()
  check('provider refuses cancellation: both members stay and no offer is sent', () => { assert.equal(response.body.sent, 0); assert.ok(response.body.results.every(r => r.stage === 'provider_stop')); assert.ok(Object.values(JSON.parse(fs.readFileSync(path.join(root, 'telegram-members.json')))).every(m => m.status === 'member')) })
  fs.writeFileSync(path.join(root, 'prodamus-cancel-ok'), '')
  response = await post()
  check('confirmed provider stops are followed by two exclusions and two personal offers', () => { assert.equal(response.body.sent, 2); assert.ok(response.body.results.every(r => r.status === 'removed_and_sent')); assert.ok(Object.values(JSON.parse(fs.readFileSync(path.join(root, 'telegram-members.json')))).every(m => m.status === 'left')) })
  check('an imported contract without recorded provider IDs uses the supplied old 690 plan before offering 500', () => {
    const stops = fs.readFileSync(path.join(root, 'prodamus-stop-requests.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s))
    assert.ok(stops.some(s => s.plan === '2854597' && s.telegramId === recipients[0].telegramId && s.active === '0'))
    assert.ok(stops.every(s => s.plan !== '2611880'))
  })
  const pending = recipients.map(r => joins.listJoins().find(j => j.recovery?.operation === 'offboard' && String(j.tgUserId) === r.telegramId))
  check('closing access preserves money and paid dates and gives no extra recovery grace', () => {
    originals.forEach((old, i) => { const current = joins.getJoin(old.token); assert.deepEqual(current.payments, old.payments); assert.equal(current.nextPaymentAt, old.nextPaymentAt); assert.equal(access.hasAccess(current, now), false); assert.equal(pending[i].paid, false); assert.equal(pending[i].recovery.graceUntil, now) })
  })
  check('former-member tags replace resident and current tariff while keeping payment history', () => {
    for (const r of recipients) { const u = read('bot-users.json')[r.telegramId]; for (const tag of ['бывший_резидент', 'доступ_закрыт', 'предложение_500', 'оплатил_подписку']) assert.ok(u.tags.includes(tag)); assert.ok(!u.tags.includes('резидент_сообщества')); assert.ok(!u.tags.includes('цена_690')); assert.equal(u.communityPersonalOffer.permanent, true) }
  })
  response = await post()
  check('repeated command sends no second message and never removes twice', () => { assert.equal(response.body.sent, 0); assert.ok(response.body.results.every(r => r.status === 'already_sent')); const calls = fs.readFileSync(path.join(root, 'telegram-calls.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s)); assert.equal(calls.filter(c => c.method === 'banChatMember').length, 2) })
  // A direct unpaid join request cannot bypass the manually closed complimentary grace.
  await request('/api/telegram/webhook', { update_id: 99001, chat_join_request: { chat: { id: -100900000001 }, from: members[recipients[0].telegramId].user } }); await wait(80)
  check('unpaid return request is not approved', () => { const calls = fs.readFileSync(path.join(root, 'telegram-calls.jsonl'), 'utf8'); assert.ok(!calls.includes('approveChatJoinRequest')) })
  const checkout = fs.readFileSync(path.join(root, 'checkout-requests.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s))[0]
  const paidAt = now + 60000, r = recipients[0]
  await hook('', { clock: paidAt })
  const payment = { payment_status: 'success', date: new Date(paidAt).toISOString(), sum: '500', order_id: 'offboard-paid-first', customer_phone: r.phone, tg_user_id: r.telegramId,
    customer_extra: checkout.customer_extra, subscription: { id: '2611880', profile_id: 'old-profile-' + r.telegramId, payment_num: '7', date_next_payment: '2026-12-04T15:01:00+03:00' } }
  await request('/api/prodamus/webhook', payment, { sign: HmacHelper.create(payment, 'test-no-real-provider') }); await wait(100)
  check('a real signed payment starts the new 500 period despite a reused old provider profile', () => {
    const fresh = joins.getJoin(pending[0].token); assert.equal(fresh.firstPaidAt, paidAt); assert.equal(fresh.priceLock.amount, 500); assert.equal(fresh.priceLock.subscriptionId, '2611880'); assert.equal(fresh.payments[0].kind, 'first'); assert.equal(access.hasAccess(fresh, paidAt), true); assert.deepEqual(joins.getJoin(originals[0].token).payments, originals[0].payments)
    const u = read('bot-users.json')[r.telegramId]; assert.ok(u.tags.includes('резидент_сообщества')); assert.ok(u.tags.includes('цена_500')); for (const tag of ['бывший_резидент', 'доступ_закрыт', 'предложение_500']) assert.ok(!u.tags.includes(tag)); assert.equal(u.subscriptionStartedAt, paidAt)
  })
  const oldFinish = { tg_user_id: r.telegramId, subscription: { type: 'action', id: '2854597', profile_id: 'old-profile-' + r.telegramId, action_code: 'finish', active_user: '0' } }
  await request('/api/prodamus/webhook', oldFinish, { sign: HmacHelper.create(oldFinish, 'test-no-real-provider') }); await wait(100)
  check('late completion of the old 690 plan cannot cancel the restarted 500 subscription', () => {
    assert.equal(joins.getJoin(pending[0].token).status, 'active'); assert.ok(!joins.getJoin(pending[0].token).cancellation?.confirmed)
  })
  await request('/api/telegram/webhook', { update_id: 99002, chat_join_request: { chat: { id: -100900000001 }, from: members[r.telegramId].user } }); await wait(100)
  check('after payment the bot approves joining and records actual membership', () => { assert.equal(joins.getJoin(pending[0].token).inChat, true); assert.ok(fs.readFileSync(path.join(root, 'telegram-calls.jsonl'), 'utf8').includes('approveChatJoinRequest')) })
  const absent = { phone: '+79000000303', username: 'synthetic_absent', telegramId: '900000033', reconcileAbsent: true }
  bot.touchBotUser({ id: absent.telegramId }) // the imported contact has no saved phone or username
  bot.addTag(absent.telegramId, 'оплатил_подписку_1')
  const currentMembers = JSON.parse(fs.readFileSync(path.join(root, 'telegram-members.json')))
  currentMembers[absent.telegramId] = { status: 'left', user: { id: Number(absent.telegramId), username: absent.username } }
  fs.writeFileSync(path.join(root, 'telegram-members.json'), JSON.stringify(currentMembers))
  const stopsBefore = fs.readFileSync(path.join(root, 'prodamus-stop-requests.jsonl'), 'utf8')
  const checkoutsBefore = fs.readFileSync(path.join(root, 'checkout-requests.jsonl'), 'utf8')
  const absentBody = { ...body(), issuedAt: paidAt, input: { campaignId: input.campaignId, recipients: [absent] } }
  const absentPost = () => request('/api/internal/subscription-recovery', absentBody, { 'X-Recovery-Signature': recoveryRequestSignature(absentBody, 'test-no-real-provider') })
  response = await absentPost()
  check('an absent imported contact with no billing history gets corrected tags and a permanent offer without a new payment link', () => {
    assert.equal(response.body.sent, 1)
    assert.equal(response.body.results[0].status, 'already_absent_offer_sent')
    assert.equal(response.body.results[0].providerCancellation, 'not_verified')
    const u = read('bot-users.json')[absent.telegramId]
    for (const tag of ['оплатил_подписку_1', 'бывший_резидент', 'доступ_закрыт', 'предложение_500']) assert.ok(u.tags.includes(tag))
    assert.equal(u.communityPersonalOffer.permanent, true)
    const card = joins.listJoins().find(j => String(j.tgUserId) === absent.telegramId)
    assert.ok(!card.paid); assert.equal(card.payments, undefined)
    assert.equal(card.recovery.providerStoppedAt, undefined); assert.equal(card.recovery.url, undefined)
    const calls = fs.readFileSync(path.join(root, 'telegram-calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter(c => String(c.body.user_id || c.body.chat_id) === absent.telegramId)
    assert.deepEqual(calls.map(c => c.method), ['getChatMember', 'sendMessage'])
    assert.ok(calls[1].body.text.includes('проверить статус прежнего автопродления'))
    assert.ok(!calls[1].body.reply_markup.inline_keyboard.flat().some(b => b.url))
    assert.equal(fs.readFileSync(path.join(root, 'prodamus-stop-requests.jsonl'), 'utf8'), stopsBefore)
    assert.equal(fs.readFileSync(path.join(root, 'checkout-requests.jsonl'), 'utf8'), checkoutsBefore)
  })
  response = await absentPost()
  check('absence reconciliation is durable and sends no repeated offer', () => {
    assert.equal(response.body.sent, 0)
    assert.equal(response.body.results[0].status, 'already_absent_already_sent')
  })
  const confirmedBody = { ...absentBody, input: { campaignId: 'synthetic-confirmed-return-20261105', recipients: [{ ...absent, providerCompleted: true }] } }
  const confirmedPost = () => request('/api/internal/subscription-recovery', confirmedBody, { 'X-Recovery-Signature': recoveryRequestSignature(confirmedBody, 'test-no-real-provider') })
  response = await confirmedPost()
  const confirmed = joins.listJoins().find(j => j.recovery?.campaignId === confirmedBody.input.campaignId)
  check('owner-confirmed completion sends an absent contact a separate durable checkout without inventing an API cancellation or old payments', () => {
    assert.equal(response.body.sent, 1)
    assert.equal(response.body.results[0].status, 'already_absent_link_sent')
    assert.equal(response.body.results[0].providerCancellation, 'owner_confirmed_completed')
    assert.ok(!confirmed.paid); assert.equal(confirmed.payments, undefined)
    assert.equal(confirmed.recovery.providerStoppedAt, undefined)
    assert.equal(confirmed.recovery.providerCompletionSource, 'owner')
    assert.ok(confirmed.recovery.url.startsWith('https://'))
    const notices = joins.listJoins().filter(j => String(j.tgUserId) === absent.telegramId)
    assert.equal(notices.length, 2)
    assert.equal(notices.filter(j => j.recovery.delivery?.state === 'delivered').length, 2)
    assert.equal(fs.readFileSync(path.join(root, 'prodamus-stop-requests.jsonl'), 'utf8'), stopsBefore)
  })
  response = await confirmedPost()
  check('repeated confirmed return sends no duplicate checkout message', () => {
    assert.equal(response.body.sent, 0)
    assert.equal(response.body.results[0].status, 'already_sent')
  })
  const absentCheckout = fs.readFileSync(path.join(root, 'checkout-requests.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).at(-1)
  const absentPaidAt = paidAt + 60000
  await hook('', { clock: absentPaidAt })
  const absentPayment = { payment_status: 'success', date: new Date(absentPaidAt).toISOString(), sum: '500', order_id: 'confirmed-return-payment', customer_phone: absent.phone, tg_user_id: absent.telegramId,
    customer_extra: absentCheckout.customer_extra, subscription: { id: '2611880', profile_id: 'synthetic-absent-profile', payment_num: '1', date_next_payment: '2026-12-04T15:02:00+03:00' } }
  await request('/api/prodamus/webhook', absentPayment, { sign: HmacHelper.create(absentPayment, 'test-no-real-provider') }); await wait(100)
  check('only a signed payment restores the absent resident and starts a fresh month at the confirmed 500 price', () => {
    const paid = joins.getJoin(confirmed.token)
    assert.equal(paid.firstPaidAt, absentPaidAt); assert.equal(paid.priceLock.amount, 500)
    assert.equal(paid.payments.length, 1); assert.equal(paid.payments[0].amount, 500)
    assert.equal(access.hasAccess(paid, absentPaidAt), true)
    const u = read('bot-users.json')[absent.telegramId]
    assert.ok(u.tags.includes('резидент_сообщества')); assert.ok(u.tags.includes('цена_500'))
    assert.ok(!u.tags.includes('доступ_закрыт')); assert.ok(!u.tags.includes('бывший_резидент'))
    assert.equal(joins.listJoins().filter(j => String(j.tgUserId) === absent.telegramId && j.paid).length, 1)
  })
  const completed = { name: 'Synthetic Completed', phone: '+79000000304', username: 'synthetic_completed', telegramId: '900000034', providerPlanIds: ['2854597'] }
  const completedToken = joins.createPendingJoin({ name: completed.name, phone: completed.phone, telegram: '@' + completed.username, tariffId: '1m' })
  joins.setTgUserId(completedToken, completed.telegramId)
  joins.recordPayment(completedToken, { amount: 690, paidAt: now - 32 * DAY, nextPaymentAt: now - DAY, orderKey: 'synthetic-import-placeholder' })
  joins.patchJoin(completedToken, { importedFromBotHelp: true, status: 'cancelled', inChat: true,
    payments: joins.getJoin(completedToken).payments.map(p => ({ ...p, estimated: true, subscriptionId: null })) })
  const completedHistory = structuredClone(joins.getJoin(completedToken).payments)
  bot.touchBotUser({ id: completed.telegramId, username: completed.username })
  bot.addTag(completed.telegramId, 'резидент_сообщества')
  const completedMembers = JSON.parse(fs.readFileSync(path.join(root, 'telegram-members.json')))
  completedMembers[completed.telegramId] = { status: 'member', user: { id: Number(completed.telegramId), username: completed.username } }
  fs.writeFileSync(path.join(root, 'telegram-members.json'), JSON.stringify(completedMembers))
  fs.rmSync(path.join(root, 'prodamus-cancel-ok'))
  const completedBody = { ...confirmedBody, issuedAt: absentPaidAt, input: { campaignId: 'synthetic-completed-old-plan', recipients: [completed] } }
  const completedPost = () => request('/api/internal/subscription-recovery', completedBody, { 'X-Recovery-Signature': recoveryRequestSignature(completedBody, 'test-no-real-provider') })
  response = await completedPost()
  check('without owner confirmation a rejected old-plan cancellation still blocks exclusion', () => {
    assert.equal(response.body.results[0].reason, 'provider_stop_unconfirmed')
    assert.equal(joins.getJoin(completedToken).inChat, true)
  })
  const stopsAtFailure = fs.readFileSync(path.join(root, 'prodamus-stop-requests.jsonl'), 'utf8')
  completed.providerCompleted = true
  response = await completedPost()
  check('confirmed prior completion repairs a failed attempt, excludes the expired imported member and sends one 500 link', () => {
    assert.equal(response.body.results[0].status, 'removed_and_sent')
    assert.equal(response.body.results[0].providerCancellation, 'owner_confirmed_completed')
    assert.equal(joins.getJoin(completedToken).inChat, false)
    assert.equal(joins.getJoin(completedToken).recoveryProviderStopSource, 'owner_confirmed_completion')
    assert.deepEqual(joins.getJoin(completedToken).payments, completedHistory)
    const fresh = joins.listJoins().find(j => j.recovery?.campaignId === completedBody.input.campaignId)
    assert.equal(fresh.recovery.providerCompletionSource, 'owner')
    assert.equal(fresh.recovery.planId, '2611880'); assert.ok(!fresh.paid)
    assert.equal(read('bot-users.json')[completed.telegramId].communityAccessStatus, 'closed')
    assert.equal(fs.readFileSync(path.join(root, 'prodamus-stop-requests.jsonl'), 'utf8'), stopsAtFailure)
  })
}
