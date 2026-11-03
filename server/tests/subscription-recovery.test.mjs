import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recoveryRecipient, recoveryMessage, recoveryRequestSignature, validRecoveryRequest, resolveRecoveryPayment, createRecoveryService } from '../lib/subscriptionRecovery.js'
import { hasAccess, accessUntil } from '../lib/subscriptionAccess.js'
import { composeSubscriptionMail } from '../lib/subscriptionMail.js'

const now = Date.parse('2026-11-03T15:00:00+03:00'), DAY = 86400000
const recipient = { telegramId: '900000021', phone: '+79000000221', name: 'Synthetic member', planId: '2611880', amount: 500, months: 1, endedAt: '2026-11-01T15:00:00+03:00' }
test('approved recovery terms must match a real historical plan and an unambiguous numeric recipient', () => {
  assert.equal(recoveryRecipient(recipient).amount, 500)
  for (const change of [{ amount: 350 }, { months: 3 }, { planId: '9999' }, { telegramId: '@alias' }, { endedAt: '2026-11-01 15:00' }]) assert.throws(() => recoveryRecipient({ ...recipient, ...change }))
  const quarterly = recoveryRecipient({ ...recipient, amount: 1350, months: 3, planId: '2854589' })
  assert.ok(recoveryMessage(quarterly).includes('1350 ₽ за 3 месяца'))
})
test('internal recovery authentication is purpose-specific, expires and rejects modified recipients', () => {
  const body = { purpose: 'community-subscription-recovery', issuedAt: now, nonce: 'a'.repeat(24), input: { campaignId: 'synthetic', recipients: [recipient] } }
  const sign = recoveryRequestSignature(body, 'SYNTHETIC-KEY')
  assert.equal(validRecoveryRequest(body, sign, 'SYNTHETIC-KEY', now), true)
  assert.equal(validRecoveryRequest(body, sign, 'SYNTHETIC-KEY', now + 6 * 60000), false)
  assert.equal(validRecoveryRequest({ ...body, send: true }, sign, 'SYNTHETIC-KEY', now), false)
  assert.equal(validRecoveryRequest({ ...body, purpose: 'payment' }, sign, 'SYNTHETIC-KEY', now), false)
})
test('checkout correlation checks recipient, plan, price and creation time instead of trusting a reused profile', () => {
  const token = 'a'.repeat(24), join = { token, phone: recipient.phone, tgUserId: recipient.telegramId, recovery: { planId: '2611880', amount: 500, createdAt: now, linkReadyAt: now } }
  const body = { customer_extra: 'Plan | Name | @alias | KY_RESTART:' + token, tg_user_id: recipient.telegramId, sum: '500', subscription: { id: '2611880' } }
  assert.equal(resolveRecoveryPayment(body, [join], now).join.token, token)
  for (const change of [{ sum: '0' }, { tg_user_id: '900000099' }, { subscription: { id: '2854589' } }]) assert.equal(resolveRecoveryPayment({ ...body, ...change }, [join], now), null)
  assert.equal(resolveRecoveryPayment({ ...body, sum: '350' }, [join], now).amountNeedsReview, true)
  assert.equal(resolveRecoveryPayment(body, [join], now - DAY), null)
  assert.equal(resolveRecoveryPayment({ ...body, customer_extra: '' }, [join], now).join.token, token)
})

function fixture({ sendFailure, stop = true, onSend } = {}) {
  let at = now, sent = 0, stopped = 0, counter = 0
  const cards = { old: { token: 'old', paid: true, status: 'cancelled', tgUserId: recipient.telegramId, phone: recipient.phone,
    cancellation: { confirmed: true, accessUntil: now - DAY }, nextPaymentAt: now - DAY, payments: [{ amount: 500, at: now - 40 * DAY }] } }
  const work = createRecoveryService({ now: () => at, graceDays: () => 4, list: () => Object.values(cards), get: t => cards[t],
    create: value => { const token = (++counter).toString(16).padStart(24, '0'); cards[token] = { ...value, token, paid: false, status: 'pending' }; return token },
    patch: (t, fields) => { cards[t] = { ...cards[t], ...fields }; return cards[t] }, addTag: () => {},
    stopProvider: async () => { stopped++; return stop }, checkout: async () => 'https://example.invalid/PERSONAL',
    telegram: async method => { if (method === 'getChat') return { id: Number(recipient.telegramId), type: 'private' }; sent++; if (onSend) onSend(cards); if (sendFailure) throw sendFailure; return { message_id: 1 } },
  })
  return { cards, work, setClock: value => { at = value }, sends: () => sent, stops: () => stopped, input: { campaignId: 'synthetic-recovery', recipients: [recipient] } }
}
test('preview never creates pending subscriptions, cancels a provider contract or sends a message', async () => {
  const f = fixture(), result = await f.work(f.input, false)
  assert.equal(result.results[0].status, 'preview'); assert.equal(f.sends(), 0); assert.equal(f.stops(), 0); assert.equal(Object.keys(f.cards).length, 1)
})
test('provider rejection blocks the payment invitation without creating a paid subscription', async () => {
  const f = fixture({ stop: false }), result = await f.work(f.input, true)
  assert.equal(result.results[0].stage, 'provider_stop'); assert.equal(f.sends(), 0); assert.equal(Object.values(f.cards).filter(j => j.paid).length, 1)
})
test('repeat launch sends once and never restarts the complimentary recovery window', async () => {
  const f = fixture()
  await f.work(f.input, true)
  assert.equal(f.sends(), 1); assert.equal(f.cards.old.recoveryAccessUntil, now + 4 * DAY)
  assert.equal(hasAccess(f.cards.old, now + 4 * DAY - 1), true)
  assert.equal(hasAccess(f.cards.old, now + 4 * DAY), false)
  assert.equal(f.cards.old.nextPaymentAt, now - DAY)
  f.setClock(now + DAY); const again = await f.work(f.input, true)
  assert.equal(again.results[0].status, 'already_sent'); assert.equal(f.sends(), 1); assert.equal(accessUntil(f.cards.old), now + 4 * DAY)
})
test('unknown delivery after a network interruption is not automatically resent', async () => {
  const f = fixture({ sendFailure: Error('network timeout') })
  assert.equal((await f.work(f.input, true)).results[0].status, 'delivery_unknown')
  assert.equal((await f.work(f.input, true)).results[0].status, 'delivery_unknown')
  assert.equal(f.sends(), 1)
})
test('confirmed newer payment skips cancellation and invitation from an outdated snapshot', async () => {
  const f = fixture(); f.cards.old.payments.push({ amount: 500, at: now - 1000 })
  assert.equal((await f.work(f.input, true)).results[0].status, 'already_paid_after_snapshot')
  assert.equal(f.sends(), 0); assert.equal(f.stops(), 0)
})
test('owner-reviewed completed subscription needs no repeated provider cancellation', async () => {
  const f = fixture({ stop: false }); f.input.recipients = [{ ...recipient, providerCompleted: true }]
  assert.equal((await f.work(f.input, true)).sent, 1); assert.equal(f.stops(), 0)
})
test('a single imported card without a provider ID can be reconciled with the owner completion evidence', async () => {
  const f = fixture({ stop: false }); f.cards.old.status = 'active'; f.cards.old.payments[0].estimated = true
  const before = JSON.stringify(f.cards.old.payments)
  f.input.recipients = [{ ...recipient, providerCompleted: true }]
  await f.work(f.input, true)
  assert.equal(f.cards.old.status, 'cancelled'); assert.equal(JSON.stringify(f.cards.old.payments), before); assert.equal(f.stops(), 0)
})
test('first-payment discount is recorded separately from the approved recurring amount', () => {
  const mail = composeSubscriptionMail({ name: 'Synthetic', tariff: 'Monthly', amount: 350, recurringAmount: 500,
    paidAt: now, nextPaymentAt: now + 30 * DAY, siteUrl: 'https://example.invalid', botUsername: 'synthetic', supportHandle: '@synthetic' })
  assert.ok(mail.text.includes('Оплачено: 350 ₽')); assert.ok(mail.text.includes('Следующее списание 500 ₽'))
})
test('payment received while Telegram acknowledges the message survives delivery bookkeeping', async () => {
  const f = fixture({ onSend: cards => {
    const fresh = Object.values(cards).find(j => j.recovery)
    fresh.paid = true; fresh.payments = [{ amount: 500, at: now + 1000 }]; fresh.recovery.paidAt = now + 1000
  } })
  await f.work(f.input, true)
  const fresh = Object.values(f.cards).find(j => j.recovery)
  assert.equal(fresh.paid, true); assert.equal(fresh.recovery.paidAt, now + 1000); assert.equal(fresh.recovery.delivery.state, 'delivered')
})
