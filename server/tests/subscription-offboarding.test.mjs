import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOffboardingService, resolveOffboardingRecipient, offboardingRecipient } from '../lib/subscriptionOffboarding.js'
import { hasAccess, accessUntil } from '../lib/subscriptionAccess.js'
import { createAccessExpiryWorker } from '../lib/accessExpiry.js'

const now = Date.parse('2026-11-04T12:00:00Z'), DAY = 86400000
const recipient = { phone: '+79000000301', username: 'synthetic_member', name: 'Synthetic' }
const id = '900000031'
function fixture(options = {}) {
  let sequence = 0, member = { status: 'member', user: { id: Number(id), username: recipient.username } }, closed = 0, restored = 0
  const cards = { old: { token: 'old', paid: true, status: 'active', nextPaymentAt: now - DAY, tgUserId: id, phone: recipient.phone,
    firstPaidAt: now - 32 * DAY, payments: [{ at: now - 32 * DAY, amount: 690, subscriptionId: '2854597' }], ...options.old } }
  const calls = []
  const work = createOffboardingService({ list: () => Object.values(cards), users: () => [{ id, username: '@' + recipient.username }], get: t => cards[t],
    create: fields => { const token = (++sequence).toString(16).padStart(24, '0'); cards[token] = { token, ...fields, paid: false }; return token },
    patch: (t, fields) => { cards[t] = { ...cards[t], ...fields }; return cards[t] }, now: () => now, chatId: '-100900000001',
    closeUser: () => { closed++ }, restoreAccess: async () => { restored++ },
    stopProvider: async () => { calls.push('provider'); await options.onStop?.(cards); if (options.stopError) throw options.stopError; return options.stop !== false },
    checkout: async () => { calls.push('checkout'); return 'https://example.invalid/PERSONAL' },
    telegram: async (method, body) => {
      calls.push(method)
      if (method === 'getChatMember') return options.member || member
      if (method === 'banChatMember') { if (options.banFails) throw Error('telegram_failure'); member = { ...member, status: 'kicked' }; await options.onBan?.(cards); return true }
      if (method === 'unbanChatMember') { if (options.unbanFails) throw Error('telegram_failure'); member = { ...member, status: 'left' }; return true }
      if (method === 'sendMessage') { if (options.sendFails) throw options.sendFails; assert.equal(body.chat_id, Number(id)); options.onSend?.(body); return { message_id: 1 } }
    },
  })
  return { cards, calls, work, options, closed: () => closed, restored: () => restored, input: { campaignId: 'synthetic-offboard', recipients: [recipient] }, fresh: () => Object.values(cards).find(j => j.recovery) }
}
test('recipient resolution accepts a unique nickname when phone is missing, and rejects conflicting identities', () => {
  const r = offboardingRecipient(recipient)
  assert.equal(resolveOffboardingRecipient(r, [{ phone: recipient.phone }], [{ id, username: '@' + recipient.username }]), id)
  assert.equal(resolveOffboardingRecipient(r, [], [{ id, username: recipient.username }]), id)
  assert.throws(() => resolveOffboardingRecipient(r, [], [{ id, username: 'unrelated_member' }]), /phone_not_found/)
  assert.throws(() => resolveOffboardingRecipient(r, [{ phone: recipient.phone, tgUserId: '900000099' }], [{ id, username: recipient.username }]), /identity_ambiguous/)
})
test('an explicit operator Telegram ID still cannot override conflicting saved identity', () => {
  const r = offboardingRecipient({ ...recipient, telegramId: id })
  assert.equal(resolveOffboardingRecipient(r, [], []), id)
  assert.throws(() => resolveOffboardingRecipient(r, [], [{ id: '900000099', username: recipient.username }]), /identity_ambiguous/)
  assert.throws(() => offboardingRecipient({ ...recipient, telegramId: '@synthetic' }), /invalid_telegram_id/)
})
test('operator provider IDs describe old contracts and never replace the offered monthly 500 plan', async () => {
  assert.deepEqual(offboardingRecipient({ ...recipient, providerPlanIds: ['2854597', '2854597'] }).providerPlanIds, ['2854597'])
  assert.throws(() => offboardingRecipient({ ...recipient, providerPlanIds: ['999999'] }), /invalid_provider_plans/)
  assert.throws(() => offboardingRecipient({ ...recipient, providerPlanIds: ['__proto__'] }), /invalid_provider_plans/)
  assert.throws(() => offboardingRecipient({ ...recipient, providerPlanIds: '2854597' }), /invalid_provider_plans/)
  const f = fixture(); f.input.recipients[0] = { ...recipient, providerPlanIds: ['2854597'] }
  assert.equal((await f.work(f.input, true)).results[0].status, 'removed_and_sent')
  assert.deepEqual(f.fresh().recovery.previousProviderPlanIds, ['2854597'])
  assert.equal(f.fresh().recovery.planId, '2611880'); assert.equal(f.fresh().recovery.amount, 500)
})
test('a missing imported phone still requires a live matching Telegram username', async () => {
  const f = fixture({ old: { phone: '' } })
  assert.equal((await f.work(f.input, true)).results[0].status, 'removed_and_sent')
  const changed = fixture({ old: { phone: '' }, member: { status: 'member', user: { id: Number(id), username: 'another_member' } } })
  assert.equal((await changed.work(changed.input, true)).results[0].reason, 'live_identity_mismatch')
  assert.equal(changed.calls.includes('provider'), false)
})
test('unknown provider plan leaves no technical-stop intent that could mask voluntary cancellation', async () => {
  const f = fixture({ stopError: Error('provider_plan_unknown') })
  assert.equal((await f.work(f.input, true)).results[0].reason, 'provider_plan_unknown')
  assert.equal(f.cards.old.recoveryStopIntent, undefined)
  assert.equal(f.cards.old.status, 'active')
  assert.equal(f.calls.includes('banChatMember'), false)
})
test('an already absent imported contact can receive a permanent offer without inventing payments or claiming cancellation', async () => {
  const f = fixture({ member: { status: 'left', user: { id: Number(id), username: recipient.username } } })
  delete f.cards.old
  f.input.recipients[0] = { ...recipient, telegramId: id, reconcileAbsent: true }
  const result = await f.work(f.input, true)
  assert.equal(result.sent, 1)
  assert.equal(result.results[0].status, 'already_absent_offer_sent')
  assert.equal(result.results[0].providerCancellation, 'not_verified')
  assert.deepEqual(f.calls, ['getChatMember', 'sendMessage'])
  assert.equal(f.closed(), 1)
  assert.equal(f.fresh().paid, false)
  assert.equal(f.fresh().recovery.billingUnverified, true)
  assert.equal(f.fresh().recovery.providerStoppedAt, undefined)
  assert.equal(f.fresh().recovery.url, undefined)
  assert.deepEqual(f.fresh().recovery.supersedes, [])
  assert.equal(f.fresh().payments, undefined)
  assert.equal((await f.work(f.input, true)).results[0].status, 'already_absent_already_sent')
  assert.equal(f.calls.filter(c => c === 'sendMessage').length, 1)
})
test('missing payment history never permits removing a current member or claiming an old billing contract is stopped', async () => {
  for (const status of ['member', 'restricted', 'kicked']) {
    const f = fixture({ member: { status, user: { id: Number(id), username: recipient.username } } })
    delete f.cards.old
    f.input.recipients[0] = { ...recipient, reconcileAbsent: true, providerCompleted: true }
    assert.equal((await f.work(f.input, true)).results[0].reason, 'paid_history_not_found')
    assert.deepEqual(f.calls, ['getChatMember'])
    assert.equal(f.fresh(), undefined)
    assert.equal(f.closed(), 0)
  }
})
test('owner-confirmed completion lets an absent contact receive a 500 checkout without inventing a provider API confirmation', async () => {
  const messages = []
  const f = fixture({ member: { status: 'left', user: { id: Number(id), username: recipient.username } }, onSend: body => messages.push(body) })
  delete f.cards.old
  f.input.recipients[0] = { ...recipient, telegramId: id, reconcileAbsent: true }
  assert.equal((await f.work(f.input, true)).results[0].status, 'already_absent_offer_sent')
  const notice = structuredClone(f.fresh())
  f.input = { campaignId: 'synthetic-confirmed-return', recipients: [{ ...recipient, telegramId: id, reconcileAbsent: true, providerCompleted: true }] }
  const report = await f.work(f.input, true)
  assert.equal(report.sent, 1)
  assert.equal(report.results[0].status, 'already_absent_link_sent')
  assert.equal(report.results[0].providerCancellation, 'owner_confirmed_completed')
  const linked = Object.values(f.cards).find(j => j.recovery?.campaignId === f.input.campaignId)
  assert.equal(linked.paid, false); assert.equal(linked.payments, undefined)
  assert.equal(linked.recovery.providerStoppedAt, undefined)
  assert.equal(linked.recovery.providerCompletionSource, 'owner')
  assert.equal(linked.recovery.providerCompletionConfirmedAt, now)
  assert.equal(linked.recovery.url, 'https://example.invalid/PERSONAL')
  assert.deepEqual(f.cards[notice.token], notice)
  assert.equal(messages.length, 2)
  assert.ok(!messages[0].reply_markup.inline_keyboard.flat().some(b => b.url))
  assert.equal(messages[1].reply_markup.inline_keyboard[0][0].url, linked.recovery.url)
  assert.ok(messages[1].text.includes('Прежнее автопродление завершено'))
  assert.equal(f.calls.filter(c => c === 'provider').length, 0)
  assert.equal(f.calls.filter(c => c === 'banChatMember').length, 0)
  assert.equal((await f.work(f.input, true)).results[0].status, 'already_sent')
  assert.equal(messages.length, 2)
})
test('completion confirmation cannot skip provider cancellation for actual old paid cards', async () => {
  const f = fixture({ stop: false })
  f.input.recipients[0] = { ...recipient, reconcileAbsent: true, providerCompleted: true }
  assert.equal((await f.work(f.input, true)).results[0].reason, 'provider_stop_unconfirmed')
  assert.equal(f.calls.includes('banChatMember'), false)
})
test('owner-confirmed completion of a specified historical contract closes access without pretending another provider request succeeded', async () => {
  const f = fixture({ stop: false, old: { importedFromBotHelp: true, status: 'cancelled', payments: [{ at: now - 32 * DAY, amount: 690, estimated: true }] } })
  const history = structuredClone(f.cards.old.payments)
  f.input.recipients[0] = { ...recipient, telegramId: id, providerCompleted: true, providerPlanIds: ['2854597'] }
  const report = await f.work(f.input, true)
  assert.equal(report.results[0].status, 'removed_and_sent')
  assert.equal(report.results[0].providerCancellation, 'owner_confirmed_completed')
  assert.equal(f.calls.includes('provider'), false)
  assert.equal(f.cards.old.recoveryProviderStopSource, 'owner_confirmed_completion')
  assert.deepEqual(f.cards.old.payments, history)
  assert.equal(f.fresh().recovery.providerCompletionSource, 'owner')
  assert.deepEqual(f.fresh().recovery.providerCompletionPlanIds, ['2854597'])
  assert.equal(f.fresh().recovery.planId, '2611880')
})
test('a completion declaration cannot cover another recorded contract or several unidentified cards', async () => {
  const mismatch = fixture({ stop: false })
  mismatch.input.recipients[0] = { ...recipient, providerCompleted: true, providerPlanIds: ['2611880'] }
  assert.equal((await mismatch.work(mismatch.input, true)).results[0].reason, 'provider_stop_unconfirmed')
  assert.equal(mismatch.calls.includes('banChatMember'), false)
  const multiple = fixture({ stop: false, old: { payments: [{ at: now - 32 * DAY, amount: 690, estimated: true }] } })
  multiple.cards.another = { ...multiple.cards.old, token: 'another' }
  multiple.input.recipients[0] = { ...recipient, providerCompleted: true, providerPlanIds: ['2854597'] }
  assert.equal((await multiple.work(multiple.input, true)).results[0].reason, 'provider_stop_unconfirmed')
  assert.equal(multiple.calls.includes('banChatMember'), false)
})
test('absence reconciliation remains opt-in and cannot bypass live identity or paid rights', async () => {
  const noOptIn = fixture({ member: { status: 'left', user: { id: Number(id), username: recipient.username } } })
  delete noOptIn.cards.old
  assert.equal((await noOptIn.work(noOptIn.input, true)).results[0].reason, 'paid_history_not_found')
  const paid = fixture({ old: { nextPaymentAt: now + DAY }, member: { status: 'left', user: { id: Number(id), username: recipient.username } } })
  paid.input.recipients[0] = { ...recipient, reconcileAbsent: true }
  assert.equal((await paid.work(paid.input, true)).results[0].reason, 'paid_access_remaining')
  assert.deepEqual(paid.calls, [])
  const changed = fixture({ member: { status: 'left', user: { id: Number(id), username: 'changed_alias' } } })
  delete changed.cards.old
  changed.input.recipients[0] = { ...recipient, reconcileAbsent: true }
  assert.equal((await changed.work(changed.input, true)).results[0].reason, 'live_identity_mismatch')
  assert.equal(changed.fresh(), undefined)
})
for (const [reason, old] of Object.entries({ paid_access_remaining: { nextPaymentAt: now + DAY }, paid_date_unknown: { nextPaymentAt: null }, lifetime_access: { lifetime: true } })) {
  test(reason + ' blocks both provider stop and removal', async () => {
    const f = fixture({ old }), r = await f.work(f.input, true)
    assert.equal(r.results[0].reason, reason); assert.deepEqual(f.calls, []); assert.equal(f.fresh(), undefined)
  })
}
test('administrator and changed live username are protected', async () => {
  const admin = fixture({ member: { status: 'administrator', user: { id: Number(id), username: recipient.username } } })
  assert.equal((await admin.work(admin.input, true)).results[0].reason, 'chat_administrator')
  const changed = fixture({ member: { status: 'member', user: { id: Number(id), username: 'another_user' } } })
  assert.equal((await changed.work(changed.input, true)).results[0].reason, 'live_identity_mismatch')
  assert.equal(changed.calls.includes('provider'), false)
})
test('preview performs no mutations or outgoing message', async () => {
  const f = fixture(); assert.equal((await f.work(f.input)).results[0].status, 'preview')
  assert.deepEqual(f.calls, ['getChatMember']); assert.equal(f.fresh(), undefined)
})
test('provider rejection prevents removal, tags and invitation', async () => {
  const f = fixture({ stop: false }), r = await f.work(f.input, true)
  assert.equal(r.results[0].stage, 'provider_stop'); assert.equal(f.closed(), 0); assert.equal(f.calls.includes('banChatMember'), false)
  assert.equal(hasAccess(f.cards.old, now), true); assert.equal(f.cards.old.offboardingHoldUntil, undefined)
})
test('successful exclusion closes free grace, preserves all money history and sends one 500 offer', async () => {
  const f = fixture(), old = structuredClone(f.cards.old)
  assert.equal(hasAccess(old, now), true)
  assert.equal((await f.work(f.input, true)).results[0].status, 'removed_and_sent')
  assert.deepEqual(f.calls, ['getChatMember', 'provider', 'checkout', 'banChatMember', 'unbanChatMember', 'sendMessage'])
  assert.deepEqual(f.cards.old.payments, old.payments); assert.equal(f.cards.old.firstPaidAt, old.firstPaidAt); assert.equal(f.cards.old.nextPaymentAt, old.nextPaymentAt)
  assert.equal(hasAccess(f.cards.old, now), false); assert.equal(f.cards.old.accessClosedFor, old.nextPaymentAt)
  assert.equal(f.fresh().recovery.graceUntil, now); assert.equal(f.fresh().paid, false); assert.equal(f.closed(), 1)
  assert.equal((await f.work(f.input, true)).results[0].status, 'already_sent')
  assert.equal(f.calls.filter(c => c === 'sendMessage').length, 1)
})
test('a later actual payment period makes the old manual closure inapplicable', () => {
  const old = { paid: true, status: 'active', nextPaymentAt: now - DAY, manualAccessClosedFor: now - DAY, recoveryAccessUntil: now + 4 * DAY }
  assert.equal(accessUntil(old), now - DAY); assert.equal(hasAccess(old, now), false)
  assert.equal(hasAccess({ ...old, nextPaymentAt: now + 30 * DAY }, now), true)
})
test('uncertain removal does not claim success and persists unban repair', async () => {
  const f = fixture({ banFails: true }), r = await f.work(f.input, true)
  assert.equal(r.results[0].stage, 'telegram_remove'); assert.equal(f.closed(), 0); assert.equal(f.fresh().accessUnbanPending, true)
  f.options.banFails = false
  assert.equal((await f.work(f.input, true)).results[0].status, 'removed_and_sent')
  assert.equal(f.fresh().accessUnbanPending, undefined)
})
test('failed unban retries without a second successful removal', async () => {
  const f = fixture({ unbanFails: true }), r = await f.work(f.input, true)
  assert.equal(r.results[0].stage, 'telegram_unban'); assert.equal(f.closed(), 0)
  f.options.unbanFails = false
  assert.equal((await f.work(f.input, true)).results[0].status, 'removed_and_sent')
  assert.equal(f.calls.filter(c => c === 'banChatMember').length, 1)
})
test('payment while stopping old renewal keeps the paid member in chat', async () => {
  const f = fixture({ onStop: cards => { cards.old.nextPaymentAt = now + 30 * DAY } })
  assert.equal((await f.work(f.input, true)).results[0].reason, 'paid_access_remaining')
  assert.equal(f.calls.includes('banChatMember'), false); assert.equal(f.closed(), 0)
})
test('payment during Telegram removal sends a paid return invitation and preserves resident tags', async () => {
  const f = fixture({ onBan: cards => { cards.old.nextPaymentAt = now + 30 * DAY } })
  assert.equal((await f.work(f.input, true)).results[0].status, 'paid_during_removal')
  assert.equal(f.restored(), 1); assert.equal(f.closed(), 0); assert.equal(f.calls.includes('sendMessage'), false)
  assert.equal(hasAccess(f.cards.old, now), true)
})
test('ambiguous DM delivery does not automatically send a duplicate', async () => {
  const f = fixture({ sendFails: Error('timeout') })
  assert.equal((await f.work(f.input, true)).results[0].status, 'delivery_unknown')
  assert.equal((await f.work(f.input, true)).results[0].status, 'delivery_unknown')
  assert.equal(f.calls.filter(c => c === 'sendMessage').length, 1); assert.equal(f.closed(), 1)
})
test('a definite rejection can be retried after the recipient unblocks the bot', async () => {
  const f = fixture({ sendFails: Object.assign(Error('blocked'), { definitelyNotSent: true }) })
  assert.equal((await f.work(f.input, true)).results[0].status, 'send_failed')
  f.options.sendFails = null
  assert.equal((await f.work(f.input, true)).results[0].status, 'removed_and_sent')
  assert.equal(f.calls.filter(c => c === 'banChatMember').length, 1)
})
test('automatic expiry and unban repair leave an in-flight manual operation alone', async () => {
  const f = fixture(), calls = []
  f.cards.old = { ...f.cards.old, nextPaymentAt: now - 10 * DAY, accessUnbanPending: true, offboardingHoldUntil: now + 60000 }
  const worker = createAccessExpiryWorker({ list: () => Object.values(f.cards), now: () => now, membership: async () => 'in',
    remove: async () => { calls.push('remove'); return true }, releaseBan: async () => { calls.push('unban'); return true }, patch: () => {} })
  assert.deepEqual(await worker(), []); assert.deepEqual(calls, [])
})
