import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

export async function runRetention({ root, request, hook, check, wait, pathToFileURL }) {
  const DAY = 86400000, start = Date.parse('2026-11-03T15:37:22+03:00'), end = Date.parse('2026-12-03T15:37:22+03:00')
  const id = '900000011', email = 'retention@example.invalid'
  const joins = await import(pathToFileURL(path.join(root, 'lib/store.js')))
  const bot = await import(pathToFileURL(path.join(root, 'lib/botUsers.js')))
  const users = await import(pathToFileURL(path.join(root, 'lib/accountUsers.js')))
  const auth = await import(pathToFileURL(path.join(root, 'lib/accountAuth.js')))
  const { HmacHelper } = await import(pathToFileURL(path.join(root, 'lib/hmac.js')))
  await hook('', { clock: start })
  fs.writeFileSync(path.join(root, 'telegram-ok'), '')
  const token = joins.createPendingJoin({ tariffId: '1m', name: 'Synthetic retention member', email, phone: '+79000000111' })
  joins.recordPayment(token, { tariffId: '1m', amount: 690, paidAt: start, nextPaymentAt: end, tgUserId: id, profileId: 'retention-initial', subscriptionId: '2854597', orderKey: 'retention-initial' })
  bot.touchBotUser({ id, first_name: 'Synthetic member', username: 'synthetic_retention' })
  bot.setMailingConsent(id, true)
  const account = users.consumeToken(users.startRegistration({ email, name: 'Synthetic member', consentAt: start }).token, 'Synthetic-Password-2026!').account
  const headers = { Authorization: 'Bearer ' + auth.startSession('u:' + account.id, end - DAY).token }
  const cancel = body => request('/api/account/subscription/cancel', body, headers)
  let r = await cancel({})
  check('empty cancellation reason is rejected before provider call or financial mutation', () => { assert.equal(r.status, 400); assert.equal(joins.getJoin(token).cancelRequest, undefined); assert.equal(joins.getJoin(token).status, 'active') })
  r = await cancel({ reasonCode: 'other', reason: ' ' })
  check('other reason requires text at the API boundary', () => assert.equal(r.status, 400))
  r = await cancel({ reasonCode: 'price' })
  check('selected reason survives provider failure without claiming cancellation', () => { assert.equal(r.body.confirmed, false); assert.equal(joins.getJoin(token).cancelReason, 'price'); assert.equal(joins.getJoin(token).cancelRequest.text, 'Дорого'); assert.equal(joins.getJoin(token).status, 'active') })
  fs.writeFileSync(path.join(root, 'prodamus-cancel-ok'), '')
  r = await cancel({ reasonCode: 'price' })
  check('confirmed voluntary cancellation keeps paid access without adding four days', () => { assert.equal(r.body.confirmed, true); assert.equal(r.body.endsAt, end); assert.equal(joins.getJoin(token).cancellation.accessUntil, end); assert.equal(joins.getJoin(token).retentionOffer.amountMinor, 50000) })
  r = await request('/api/account/subscription', undefined, headers)
  check('personal offer is not published before its 24-hour window', () => assert.equal(r.body.subscription.retentionOffer, null))
  await hook('', { clock: end - DAY })
  await hook('sendAccessEndingReminders'); await hook('sendAccessEndingReminders')
  const messages = fs.readFileSync(path.join(root, 'telegram-calls.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s)).filter(c => c.method === 'sendMessage' && String(c.body.chat_id) === id && c.body.text?.includes('Доступ к сообществу закончится'))
  check('ending notice includes exact time and verified permanent price once per Telegram channel', () => { assert.equal(messages.length, 1); assert.ok(messages[0].body.text.includes('15:37:22')); assert.ok(messages[0].body.text.includes('500')); assert.equal(messages[0].body.reply_markup.inline_keyboard[0][0].url, 'https://example.invalid/cabinet/resident') })
  r = await request('/api/account/subscription/retention', { action: 'claim', amount: 1 }, headers)
  check('claiming discount records choice without payment or renewed auto-billing', () => { assert.equal(r.status, 200); assert.equal(r.body.offer.amount, 500); assert.equal(r.body.offer.claimed, true); assert.equal(joins.getJoin(token).payments.length, 1); assert.equal(joins.getJoin(token).status, 'cancelled') })
  r = await request('/api/account/subscription/retention', { action: 'checkout' }, headers)
  check('checkout cannot charge for a period overlapping remaining access', () => { assert.equal(r.status, 409); assert.equal(fs.existsSync(path.join(root, 'checkout-plan')), false) })
  r = await request('/api/account/subscription/renew', {}, headers)
  check('regular renewal cannot bypass overlap protection after cancellation', () => { assert.equal(r.status, 409); assert.equal(r.body.error, 'paid_access_remaining') })
  r = await request('/api/account/subscription/retention', { action: 'claim' })
  check('personal retention endpoint requires authentication', () => assert.equal(r.status, 401))
  await hook('', { clock: end }); await hook('processAccessExpiry')
  check('saving offer does not prevent expiry at the actual paid boundary', () => { assert.equal(joins.getJoin(token).accessClosedFor, end); assert.equal(joins.getJoin(token).retentionOffer.amountMinor, 50000) })
  r = await request('/api/account/subscription/retention', { action: 'checkout', amount: 1, subscriptionId: '99999' }, headers)
  check('checkout after expiry uses configured personal provider plan and ignores client prices', () => { assert.equal(r.status, 200); assert.equal(fs.readFileSync(path.join(root, 'checkout-plan'), 'utf8'), '2611880') })
  const body = { payment_status: 'success', date: new Date(end + 1000).toISOString(), sum: '500', order_id: 'retention-return', customer_email: email, tg_user_id: id,
    subscription: { id: '2611880', profile_id: 'retention-returned', payment_num: '1', date_next_payment: '2027-01-03T15:37:22+03:00' } }
  await hook('', { clock: end + 1000 })
  r = await request('/api/prodamus/webhook', body, { sign: HmacHelper.create(body, 'test-no-real-provider') }); await wait(150)
  r = await request('/api/account/subscription', undefined, headers)
  check('real signed discounted payment activates permanent effective price while preserving original lock and history', () => { assert.equal(r.body.subscription.price, 500); assert.equal(r.body.subscription.lockedPrice, 500); assert.equal(joins.getJoin(token).priceLock.amount, 690); assert.equal(joins.getJoin(token).payments.length, 2); assert.equal(joins.getJoin(token).status, 'active') })
  r = await cancel({ reasonCode: 'time' })
  check('second voluntary cancellation never compounds the discount', () => { assert.equal(r.body.confirmed, true); assert.equal(joins.getJoin(token).retentionOffer.baseMinor, 69000); assert.equal(joins.getJoin(token).retentionOffer.amountMinor, 50000); assert.equal(joins.getJoin(token).cancelReason, 'time') })
  const paymentsBefore = joins.getJoin(token).payments.length
  const late = { ...body, order_id: 'retention-late-paid-after-cancel', date: new Date(end + 2000).toISOString(), subscription: { ...body.subscription, active_user: '1', active: '1', payment_num: '2', date_next_payment: '2027-02-03T15:37:22+03:00' } }
  await request('/api/prodamus/webhook', late, { sign: HmacHelper.create(late, 'test-no-real-provider') }); await wait(100)
  check('late payment after cancellation records money and access without reactivating auto-billing', () => { assert.equal(joins.getJoin(token).payments.length, paymentsBefore + 1); assert.equal(joins.getJoin(token).status, 'cancelled'); assert.equal(joins.getJoin(token).nextPaymentAt, Date.parse('2027-02-03T15:37:22+03:00')) })
  for (const tariffId of ['3m', '6m']) {
    r = await request('/api/community/subscribe', { tariffId })
    check(`retired public ${tariffId} cannot create a new checkout`, () => { assert.equal(r.status, 400); assert.equal(r.body.error, 'tariff_not_available') })
  }
  const legacy = { payment_status: 'success', date: new Date(start).toISOString(), sum: '1770', order_id: 'legacy-3m-existing', customer_email: 'legacy-three@example.invalid', subscription: { id: '3005286', profile_id: 'legacy-profile', payment_num: '2', date_next_payment: '2027-02-03T15:37:22+03:00' } }
  await request('/api/prodamus/webhook', legacy, { sign: HmacHelper.create(legacy, 'test-no-real-provider') }); await wait(100)
  check('existing three-month renewals still record their provider period and price', () => { const j = joins.listJoins().find(j => j.email === 'legacy-three@example.invalid'); assert.equal(j.tariffId, '3m'); assert.equal(j.priceLock.amount, 1770); assert.equal(j.nextPaymentAt, Date.parse('2027-02-03T15:37:22+03:00')) })
  const six = { ...legacy, order_id: 'legacy-6m-existing', customer_email: 'legacy-six@example.invalid', sum: '3180', subscription: { id: '3005289', profile_id: 'legacy-six-profile', payment_num: '2', date_next_payment: '2027-05-03T15:37:22+03:00' } }
  await request('/api/prodamus/webhook', six, { sign: HmacHelper.create(six, 'test-no-real-provider') }); await wait(100)
  check('existing six-month renewals retain all six months and the historical amount', () => { const j = joins.listJoins().find(j => j.email === 'legacy-six@example.invalid'); assert.equal(j.tariffId, '6m'); assert.equal(j.priceLock.amount, 3180); assert.equal(j.nextPaymentAt, Date.parse('2027-05-03T15:37:22+03:00')) })
  const old500 = { ...legacy, order_id: 'legacy-500-existing', customer_email: 'legacy-five@example.invalid', sum: '500', subscription: { id: '2611880', profile_id: 'legacy-five-profile', payment_num: '2', date_next_payment: '2026-12-03T15:37:22+03:00' } }
  await request('/api/prodamus/webhook', old500, { sign: HmacHelper.create(old500, 'test-no-real-provider') }); await wait(100)
  check('legacy 500 recurring customer retains historical classification and price without a new offer', () => { const j = joins.listJoins().find(j => j.email === 'legacy-five@example.invalid'); assert.equal(j.tariffId, null); assert.equal(j.priceLock.amount, 500); assert.equal(j.oneTime, undefined); assert.equal(j.retentionPrice, undefined) })
}
