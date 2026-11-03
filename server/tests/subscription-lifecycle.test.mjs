import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasAccess, paidUntil, accessUntil, accessPeriodEnded, inGrace, graceDays } from '../lib/subscriptionAccess.js'
import { createAccessExpiryWorker } from '../lib/accessExpiry.js'
import { createSubscriptionReminders } from '../lib/subscriptionReminders.js'
import { priceEntitlement, lockedAmount } from '../lib/subscriptionPricing.js'
import { prepareSubscriptionPolicy } from '../lib/subscriptionPolicy.js'
import { subscriptionDemo } from '../lib/subscriptionDemo.js'

process.env.SUBSCRIPTION_GRACE_DAYS = '4'
const DAY = 86400000, due = Date.parse('2026-12-03T15:37:22+03:00')
const card = extra => ({ token: 'synthetic', paid: true, status: 'active', tgUserId: '900000010', nextPaymentAt: due, ...extra })

test('all paid recurring, cancelled and one-time cards get the same four-day grace boundary', () => {
  for (const status of ['active', 'cancelled']) for (const oneTime of [true, false]) {
    const j = card({ status, oneTime })
    assert.equal(paidUntil(j), due)
    assert.equal(hasAccess(j, due - 1), true)
    assert.equal(inGrace(j, due - 1), false)
    assert.equal(inGrace(j, due), true)
    assert.equal(hasAccess(j, due + 4 * DAY - 1), true)
    assert.equal(accessPeriodEnded(j, due + 4 * DAY - 1), false)
    assert.equal(hasAccess(j, due + 4 * DAY), false)
    assert.equal(accessPeriodEnded(j, due + 4 * DAY), true)
    assert.equal(j.nextPaymentAt, due)
  }
})

test('unknown dates require review; lifetime and unpaid cards are not expired by policy', () => {
  assert.equal(accessUntil(card({ nextPaymentAt: null })), null)
  assert.equal(accessPeriodEnded(card({ nextPaymentAt: null }), due + 100 * DAY), false)
  assert.equal(hasAccess(card({ lifetime: true }), due + 100 * DAY), true)
  assert.equal(accessPeriodEnded(card({ lifetime: true }), due + 100 * DAY), false)
  assert.equal(hasAccess(card({ paid: false }), due), false)
})

test('grace setting accepts one shared three/seven-day policy and rejects invalid values', () => {
  for (const n of [3, 7]) { process.env.SUBSCRIPTION_GRACE_DAYS = String(n); assert.equal(accessUntil(card()), due + n * DAY) }
  for (const n of ['', ' ', 'invalid', '-1', '100']) { process.env.SUBSCRIPTION_GRACE_DAYS = n; assert.equal(graceDays(), 4) }
  process.env.SUBSCRIPTION_GRACE_DAYS = '4'
})

test('expiry worker waits for grace and keeps payment and price entitlement intact', async () => {
  let at = due, removed = 0, j = card({ priceLock: { amount: 690 }, payments: [{ amount: 690 }] })
  const work = createAccessExpiryWorker({ list: () => [j], now: () => at, membership: async () => 'in', remove: async () => { removed++; return true }, patch: (_, fields) => { j = { ...j, ...fields } } })
  await work(); assert.equal(removed, 0)
  at = due + 4 * DAY - 1; await work(); assert.equal(removed, 0)
  at++; await work(); assert.equal(removed, 1)
  await work(); assert.equal(removed, 1)
  assert.equal(j.priceLock.amount, 690)
  assert.deepEqual(j.payments, [{ amount: 690 }])
  assert.equal(j.status, 'active') // Provider subscription is never cancelled by access expiry.
})

test('payment while membership check is in flight prevents removal', async () => {
  let j = card(), removed = 0
  const work = createAccessExpiryWorker({ list: () => [j], now: () => due + 4 * DAY,
    membership: async () => { j = { ...j, nextPaymentAt: due + 30 * DAY }; return 'in' }, remove: async () => { removed++; return true }, patch: () => {} })
  await work(); assert.equal(removed, 0)
})

test('transition deadline can protect existing overdue residents without inventing a payment', () => {
  const transition = due + 20 * DAY
  const j = card({ transitionAccessUntil: transition })
  assert.equal(hasAccess(j, transition - 1), true)
  assert.equal(hasAccess(j, transition), false)
  assert.equal(paidUntil(j), due)
})

test('first recorded price and historical plan survive price increases and cancellation', () => {
  const j = card({ status: 'cancelled', payments: [{ at: 1, amount: 690, subscriptionId: '2854597', tariffId: '1m' }, { at: 2, amount: 990, subscriptionId: '9999999', tariffId: '1m' }] })
  assert.equal(priceEntitlement(j).amount, 690)
  assert.equal(priceEntitlement(j).subscriptionId, '2854597')
  assert.equal(lockedAmount(j, 1990), 690)
  assert.equal(priceEntitlement(j).months, 1)
})

test('unknown legacy rate is retained but never silently assigned a new provider plan', () => {
  const j = card({ payments: [{ at: 1, amount: 530, estimated: true }] })
  assert.equal(priceEntitlement(j).amount, 530)
  assert.equal(priceEntitlement(j).subscriptionId, null)
  assert.equal(priceEntitlement(card({ payments: [{ at: 1, amount: 350, estimated: true }] })).subscriptionId, '2611878')
})

test('individual discount on a more expensive plan is never renewed at the higher plan price', () => {
  const j = card({ payments: [{ at: 1, amount: 530, subscriptionId: '2854597' }] })
  assert.equal(priceEntitlement(j).amount, 530)
  assert.equal(priceEntitlement(j).subscriptionId, null)
  assert.equal(priceEntitlement(j).needsProviderPlanReview, true)
})

function reminders({ send, extra = {} }) {
  let j = card({ email: 'synthetic@example.invalid', ...extra }), at = due - DAY - 1
  const work = createSubscriptionReminders({ list: () => [j], now: () => at, patch: (_, fields) => { j = { ...j, ...fields } }, send: (join, channels) => send(join, channels) })
  return { work, get: () => j, set: fields => { j = { ...j, ...fields } }, time: n => { at = n } }
}

test('24-hour reminder is millisecond based, not morning/calendar based; no repeats', async () => {
  let calls = 0
  const r = reminders({ send: async () => { calls++; return { bot: true, mail: true } } })
  await r.work(); assert.equal(calls, 0)
  r.time(due - DAY); await r.work(); assert.equal(calls, 1)
  r.time(due - 1); await r.work(); assert.equal(calls, 1)
  assert.equal(r.get().reminder24.botDone, true)
  assert.equal(r.get().reminder24.mailDone, true)
})

test('channel retry sends Telegram again without duplicating delivered email', async () => {
  const calls = []
  const r = reminders({ send: async (_, channels) => { calls.push(channels); return { bot: calls.length > 1, mail: true } } })
  r.time(due - DAY); await r.work()
  r.time(due - DAY + 60000); await r.work()
  assert.deepEqual(calls, [{ bot: true, mail: true }, { bot: true, mail: false }])
  assert.equal(r.get().remindedFor, `${due}:1`)
})

test('downtime catch-up delivers during the 24-hour window but never after charge time', async () => {
  let calls = 0
  const r = reminders({ send: async () => { calls++; return { bot: true, mail: true } } })
  r.time(due - 6 * 3600000); await r.work(); assert.equal(calls, 1)
  const late = reminders({ send: async () => { calls++; return { bot: true } } })
  late.time(due); await late.work(); assert.equal(calls, 1)
})

test('cancelled, one-time and lifetime residents do not get false autocharge reminders', async () => {
  for (const extra of [{ status: 'cancelled' }, { oneTime: true }, { lifetime: true }]) {
    const r = reminders({ extra, send: async () => { throw Error('must not send') } })
    r.time(due - DAY); await r.work(); assert.equal(r.get().reminder24, undefined)
  }
})

test('missing Telegram route is explicit; adding the route lets the worker retry', async () => {
  let calls = 0
  const r = reminders({ extra: { tgUserId: null, email: null }, send: async () => { calls++; return { bot: true } } })
  r.time(due - DAY); await r.work(); assert.equal(calls, 0)
  assert.equal(r.get().reminder24.missingTelegram, true)
  assert.equal(r.get().reminder24.botDone, false)
  r.set({ tgUserId: '900000010' }); await r.work(); assert.equal(calls, 1)
})

test('renewal during reminder delivery cannot overwrite the new period notification state', async () => {
  let r
  r = reminders({ send: async () => { r.set({ nextPaymentAt: due + 30 * DAY }); return { bot: true, mail: true } } })
  r.time(due - DAY); await r.work(); assert.equal(r.get().reminder24, undefined)
})

test('first rollout gives the same fresh grace deadline without changing real payments', () => {
  const cards = { a: card({ nextPaymentAt: due - 30 * DAY, payments: [{ at: 1, amount: 690, subscriptionId: '2854597' }] }), b: card({ nextPaymentAt: due - DAY }), cancelled: card({ status: 'cancelled', nextPaymentAt: due - 30 * DAY }), unknown: card({ nextPaymentAt: null }), founder: card({ lifetime: true }) }
  const migrated = prepareSubscriptionPolicy(cards, null, due, 4)
  assert.equal(migrated.cards.a.transitionAccessUntil, due + 4 * DAY)
  assert.equal(migrated.cards.b.transitionAccessUntil, due + 4 * DAY)
  assert.equal(migrated.cards.cancelled.transitionAccessUntil, due + 4 * DAY)
  assert.equal(migrated.cards.unknown.transitionAccessUntil, undefined)
  assert.equal(migrated.cards.founder.transitionAccessUntil, undefined)
  assert.equal(migrated.cards.a.nextPaymentAt, cards.a.nextPaymentAt)
  assert.deepEqual(migrated.cards.a.payments, cards.a.payments)
  assert.equal(migrated.stats.unknownDate, 1)
})

test('reinstall does not restart grace indefinitely', () => {
  const original = prepareSubscriptionPolicy({ a: card({ nextPaymentAt: due - DAY }) }, null, due, 4)
  const repeated = prepareSubscriptionPolicy(original.cards, original.policy, due + 3 * DAY, 4)
  assert.equal(repeated.cards.a.transitionAccessUntil, due + 4 * DAY)
  assert.equal(repeated.policy.activatedAt, due)
})

test('personal demo exposes only demo callbacks and never real payment/membership actions', () => {
  for (const stage of ['paid', 'reminder', 'failed', 'expired', 'returned']) {
    const screen = subscriptionDemo(stage, due)
    assert.ok(screen.text.startsWith('ТЕСТ ПОДПИСКИ'))
    assert.ok(screen.text.length <= 4096)
    for (const button of screen.keyboard.flat()) {
      assert.ok(button.callback_data.startsWith('r:demo:') || button.callback_data === 'r:menu')
      assert.equal(button.url, undefined)
    }
  }
})
