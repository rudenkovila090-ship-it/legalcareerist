import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEventTicketDelivery, newTicketDelivery, ticketPaymentNumber, ticketBotLink } from '../lib/eventTicketDelivery.js'

function fixture(overrides = {}) {
  let at = 1000000
  const lead = { number: 1, kind: 'registration', status: 'paid', email: 'test@example.invalid', tgUserId: '1234567', ticketDelivery: newTicketDelivery(at), ...overrides }
  const calls = []
  let email = async () => ({ ok: true }), telegram = async () => ({ ok: true })
  const deps = { list: () => [lead], get: n => n === 1 ? structuredClone(lead) : null, patch: (_n, state) => { lead.ticketDelivery = structuredClone(state) }, now: () => at,
    email: async l => { calls.push('email'); return email(l) }, telegram: async l => { calls.push('telegram'); return telegram(l) } }
  return { lead, calls, deps, service: createEventTicketDelivery(deps), advance: () => { at += 3600001 }, email: f => { email = f }, telegram: f => { telegram = f } }
}
test('paid tickets acknowledge both channels independently and never repeat confirmed sends', async () => {
  const f = fixture();await f.service.deliver(1);await f.service.process();await f.service.deliver('1')
  assert.deepEqual(f.calls, ['email', 'telegram']);assert.equal(f.lead.ticketDelivery.email.state, 'sent');assert.equal(f.lead.ticketDelivery.telegram.state, 'sent')
})
test('a definite SMTP failure retries after restart without resending the Telegram ticket', async () => {
  const f = fixture();f.email(async () => ({ ok: false, definitelyNotSent: true, error: 'smtp_not_configured' }))
  await f.service.deliver(1);assert.equal(f.lead.ticketDelivery.email.state, 'retry');assert.equal(f.lead.ticketDelivery.telegram.state, 'sent')
  await f.service.process();assert.equal(f.calls.length, 2)
  f.advance();f.email(async () => ({ ok: true }));await createEventTicketDelivery(f.deps).process()
  assert.deepEqual(f.calls, ['email', 'telegram', 'email']);assert.equal(f.lead.ticketDelivery.email.state, 'sent')
})
test('an unknown SMTP outcome is retained for review instead of blindly sending duplicates', async () => {
  const f = fixture();f.email(async () => ({ ok: false, error: 'response_timeout' }));await f.service.process();f.advance();await f.service.process()
  assert.equal(f.lead.ticketDelivery.email.state, 'uncertain');assert.equal(f.calls.filter(c => c === 'email').length, 1)
})
test('a definitive bot rejection does not repeat email and retries the document independently', async () => {
  const f = fixture();f.telegram(async () => ({ ok: false, definitelyNotSent: true, error: 'telegram_403' }));await f.service.process()
  f.advance();f.telegram(async () => ({ ok: true }));await f.service.process()
  assert.deepEqual(f.calls, ['email', 'telegram', 'telegram'])
})
test('a username without a verified numeric binding is never used as a document recipient', async () => {
  const f = fixture({ tgUserId: undefined, telegram: '@known_name' });await f.service.process()
  assert.deepEqual(f.calls, ['email']);assert.equal(f.lead.ticketDelivery.telegram.state, 'waiting')
  f.lead.tgUserId = '1234567';await f.service.process();assert.deepEqual(f.calls, ['email', 'telegram'])
})
test('a buyer can receive the bot PDF while SMTP is still waiting for its response', async () => {
  const f = fixture({ tgUserId: undefined });let release
  f.email(() => new Promise(resolve => { release = resolve }))
  const pending = f.service.deliver(1)
  f.lead.tgUserId = '1234567';f.service.request(1, 'telegram')
  await f.service.deliver(1, 'telegram')
  assert.deepEqual(f.calls, ['email', 'telegram']);assert.equal(f.lead.ticketDelivery.telegram.state, 'sent')
  release({ ok: true });await pending;assert.equal(f.lead.ticketDelivery.email.state, 'sent')
})
test('simultaneous duplicate webhooks and worker cannot send the same ticket twice', async () => {
  const f = fixture();let release
  f.email(() => new Promise(resolve => { release = resolve }));const first = f.service.deliver(1)
  await f.service.deliver('1');await f.service.process();release({ ok: true });await first
  assert.deepEqual(f.calls, ['email', 'telegram'])
})
test('old paid registrations have unknown history and are not silently mass-resent', async () => {
  const f = fixture({ ticketDelivery: undefined });await f.service.process();assert.deepEqual(f.calls, [])
  f.service.request(1, 'telegram');await f.service.deliver(1, 'telegram')
  assert.deepEqual(f.calls, ['telegram']);assert.equal(f.lead.ticketDelivery.email.state, 'legacy_unknown')
})
test('manual email resend only resets the explicitly selected channel', async () => {
  const f = fixture();await f.service.process();f.service.request(1, 'email');await f.service.deliver(1, 'email')
  assert.deepEqual(f.calls, ['email', 'telegram', 'email'])
})
test('unpaid and cancelled registrations are never delivered or enabled by the queue', async () => {
  for (const status of ['registered', 'cancelled']) { const f = fixture({ status });await f.service.process();assert.equal(f.service.request(1, 'email'), false);assert.deepEqual(f.calls, []) }
})
test('a crash after starting delivery requires review while the other channel still succeeds', async () => {
  const f = fixture();f.lead.ticketDelivery.email = { state: 'sending', startedAt: 1 };await f.service.process()
  assert.equal(f.lead.ticketDelivery.email.state, 'uncertain');assert.deepEqual(f.calls, ['telegram'])
})
test('payment references support fixed pages and reject conflicting registration numbers', () => {
  for (const key of ['order_num', 'order_id', 'customer_extra']) assert.equal(ticketPaymentNumber({ [key]: 'Test | ev-42 |' }), 42)
  assert.equal(ticketPaymentNumber({ order_num: 'ev-42', customer_extra: 'ev-42' }), 42)
  assert.throws(() => ticketPaymentNumber({ order_num: 'ev-42', customer_extra: 'ev-43' }), /conflict/)
  assert.equal(ticketPaymentNumber({ order_num: 'whatever-42' }), null)
})
test('bot links only contain an unguessable token and the configured bot username', () => {
  assert.equal(ticketBotLink('legalcareerist_bot', 'a'.repeat(24)), 'https://t.me/legalcareerist_bot?start=ticket_' + 'a'.repeat(24))
  assert.equal(ticketBotLink('evil/path', 'a'.repeat(24)), '');assert.equal(ticketBotLink('legalcareerist_bot', '1'), '')
})
