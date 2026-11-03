import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cancellationReason, voluntaryAccessEnd } from '../lib/subscriptionCancellation.js'
import { accessUntil, hasAccess } from '../lib/subscriptionAccess.js'
import { basePriceEntitlement, priceEntitlement, retentionPlans } from '../lib/subscriptionPricing.js'
import { prepareRetentionOffer, retentionOfferView, matchingRetentionPayment, createAccessEndingReminders } from '../lib/subscriptionRetention.js'

process.env.SUBSCRIPTION_GRACE_DAYS = '4'
const DAY = 86400000, end = Date.parse('2026-12-03T15:37:22+03:00')
const card = extra => ({ token: 'synthetic', paid: true, status: 'active', tariffId: '1m', nextPaymentAt: end, tgUserId: '1', email: 'synthetic@example.invalid',
  priceLock: { amount: 690, subscriptionId: '2854597', tariffId: '1m', months: 1 }, ...extra })
const cancelled = extra => { const j = card({ status: 'cancelled', cancellation: { confirmed: true, accessUntil: end }, ...extra }); return { ...j, retentionOffer: prepareRetentionOffer(j, end - 10 * DAY) } }

test('a reason is required on the server; selected categories and legacy bot text normalize safely', () => {
  for (const value of ['', ' ', null]) assert.equal(cancellationReason(value), null)
  assert.equal(cancellationReason('text', 'invented'), null)
  assert.equal(cancellationReason('', 'other'), null)
  assert.deepEqual(cancellationReason('', 'price'), { code: 'price', text: 'Дорого' })
  assert.deepEqual(cancellationReason('stale other text', 'price'), { code: 'price', text: 'Дорого' })
  assert.deepEqual(cancellationReason('  Своя   причина  '), { code: 'other', text: 'Своя причина' })
})
test('voluntary cancellation before paid end adds no four-day grace and keeps exact boundary', () => {
  const j = card()
  assert.equal(voluntaryAccessEnd(j, end - DAY), end)
  const off = cancelled()
  assert.equal(accessUntil(off), end); assert.equal(hasAccess(off, end - 1), true); assert.equal(hasAccess(off, end), false)
})
test('a retry window already in progress and an explicit bonus are not revoked by cancellation', () => {
  assert.equal(voluntaryAccessEnd(card(), end + DAY), end + 4 * DAY)
  assert.equal(voluntaryAccessEnd(card({ accessBonusUntil: end + 2 * DAY }), end - DAY), end + 2 * DAY)
})
test('monthly 690 receives fixed monthly 500 and never compounds on a second cancellation', () => {
  const j = cancelled(), first = j.retentionOffer
  assert.equal(first.amountMinor, 50000)
  const returned = { ...j, retentionPrice: { amount: 500, subscriptionId: '2611880', confirmedAt: 1 } }
  assert.equal(priceEntitlement(returned).amount, 500); assert.equal(basePriceEntitlement(returned).amount, 690)
  assert.deepEqual(prepareRetentionOffer(returned), first)
})
test('existing 500 plan is reused; other prices, legacy customers and retired periods do not receive another reduction', () => {
  assert.equal(retentionPlans()['2854597'].subscriptionId, '2611880')
  for (const lock of [{ amount: 500, subscriptionId: '2611880' }, { amount: 530, subscriptionId: null }, { amount: 1770, subscriptionId: '3005286' }, { amount: 3180, subscriptionId: '3005289' }]) assert.equal(prepareRetentionOffer(card({ priceLock: lock })), null)
})
test('offer appears at the 24-hour boundary and persists after access ends without restoring access', () => {
  const j = cancelled()
  assert.equal(retentionOfferView(j, end - DAY - 1), null)
  assert.equal(retentionOfferView(j, end - DAY).amount, 500)
  assert.equal(retentionOfferView(j, end - DAY).canCheckout, false)
  assert.equal(retentionOfferView(j, end + 365 * DAY).canCheckout, true)
  assert.equal(hasAccess(j, end + 365 * DAY), false)
})
test('only the approved provider plan with the exact paid amount activates the permanent price', () => {
  const j = { ...cancelled(), retentionCheckout: { subscriptionId: '2611880' } }
  assert.equal(matchingRetentionPayment(j, { subscriptionId: '2611880', amount: 690, paidAt: end }), null)
  assert.equal(matchingRetentionPayment(j, { subscriptionId: '999', amount: 500, paidAt: end }), null)
  assert.equal(matchingRetentionPayment(j, { subscriptionId: '2611880', amount: 500, paidAt: end }).amount, 500)
})
test('expiry reminder retries failed channels, catches late cancellation and never promises tomorrow after expiry', async () => {
  let j = cancelled(), at = end - DAY - 1, calls = []
  const work = createAccessEndingReminders({ list: () => [j], patch: (_, fields) => { j = { ...j, ...fields } }, now: () => at,
    send: async (_, offer, channels) => { calls.push({ offer, channels }); return { bot: true, mail: calls.length > 1 } } })
  await work(); assert.equal(calls.length, 0)
  at = end - 12 * 3600000; await work(); assert.equal(calls.length, 1); assert.equal(calls[0].offer.amount, 500)
  await work(); assert.deepEqual(calls[1].channels, { bot: false, mail: true })
  await work(); assert.equal(calls.length, 2)
  at = end; j = cancelled(); await work(); assert.equal(calls.length, 2)
})
test('payment received during notification delivery cannot overwrite renewed state', async () => {
  let j = cancelled()
  const work = createAccessEndingReminders({ list: () => [j], patch: () => assert.fail('must re-read'), now: () => end - DAY,
    send: async () => { j = { ...j, status: 'active', nextPaymentAt: end + 30 * DAY }; return { bot: true, mail: true } } })
  await work()
})
