import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

export async function runLifecycle({ root, request, hook, read, check, wait, pathToFileURL }) {
  const DAY = 86400000, id = 900000010, email = 'full-cycle@example.invalid'
  const start = Date.parse('2026-11-03T15:37:22+03:00'), due = Date.parse('2026-12-03T15:37:22+03:00')
  const joins = await import(pathToFileURL(path.join(root, 'lib/store.js')))
  const { HmacHelper } = await import(pathToFileURL(path.join(root, 'lib/hmac.js')))
  const { hasAccess } = await import(pathToFileURL(path.join(root, 'lib/subscriptionAccess.js')))
  const calls = () => fs.existsSync(path.join(root, 'telegram-calls.jsonl')) ? fs.readFileSync(path.join(root, 'telegram-calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s)) : []
  const userCalls = method => calls().filter(c => c.method === method && String(c.body.user_id || c.body.chat_id) === String(id))
  const signed = async body => { const r = await request('/api/prodamus/webhook', body, { sign: HmacHelper.create(body, 'test-no-real-provider') }); await wait(150); return r }
  const update = async message => { const r = await request('/api/telegram/webhook', message); await wait(150); return r }
  await hook('', { clock: start })
  fs.writeFileSync(path.join(root, 'telegram-ok'), '')
  const forged = { update_id: 900000000, message: { from: { id }, chat: { id, type: 'private' }, text: '/start' } }
  const rejected = await request('/api/telegram/webhook', forged, { 'X-Telegram-Bot-Api-Secret-Token': '' })
  check('forged Telegram update without webhook secret is rejected before dispatch', () => { assert.equal(rejected.status, 403); assert.equal(userCalls('sendMessage').length, 0) })
  await update({ update_id: 900000001, message: { message_id: 1, date: Math.floor(start / 1000), from: { id, first_name: 'Synthetic member', username: 'synthetic_cycle' }, chat: { id, type: 'private' }, text: '/start' } })
  const form = { tariffId: '1m', name: 'Synthetic member', phone: '+79000000110', email, telegram: '@synthetic_cycle', consent: { policy: true, processing: true, marketing: false } }
  let r = await request('/api/community/subscribe', form)
  check('new customer receives checkout only after validated contacts and consent', () => { assert.equal(r.status, 200); assert.ok(r.body.url.includes('SYNTHETIC_CHECKOUT')) })
  const join = joins.listJoins().find(j => j.email === email)
  assert.ok(join)
  const token = join.token
  const payment = { payment_status: 'success', date: new Date(start).toISOString(), sum: '690', order_id: 'cycle-first', customer_phone: form.phone, customer_email: email, tg_user_id: String(id), subscription: { id: '2854597', payment_num: '1', profile_id: 'cycle-profile', date_next_payment: new Date(due).toISOString() } }
  r = await signed(payment)
  check('signed first payment stores exact provider period and immutable original price', () => {
    const j = joins.getJoin(token)
    assert.equal(r.status, 200); assert.equal(j.paid, true); assert.equal(j.firstPaidAt, start); assert.equal(j.nextPaymentAt, due); assert.equal(j.priceLock.amount, 690); assert.equal(j.priceLock.subscriptionId, '2854597')
  })
  check('resident and tariff tags include exact start, paid end and locked amount', () => {
    const user = read('bot-users.json')[String(id)]
    assert.ok(user.tags.includes('резидент_сообщества')); assert.ok(user.tags.includes('тариф_1m')); assert.ok(user.tags.includes('цена_690'))
    assert.equal(user.subscriptionStartedAt, start); assert.equal(user.subscriptionPaidUntil, due); assert.equal(user.subscriptionLockedAmount, 690)
  })
  await update({ update_id: 900000002, chat_join_request: { chat: { id: -100900000001, type: 'supergroup' }, from: { id, first_name: 'Synthetic member', username: 'synthetic_cycle' }, user_chat_id: id, date: Math.floor(start / 1000) } })
  check('paid join request invokes Telegram approval and records real membership', () => { assert.equal(userCalls('approveChatJoinRequest').length, 1); assert.equal(joins.getJoin(token).inChat, true); assert.equal(joins.getJoin(token).joinedAt, start) })
  const bot = await import(pathToFileURL(path.join(root, 'lib/botUsers.js')))
  const demo = (stage, n) => update({ update_id: n, callback_query: { id: String(n), from: { id, first_name: 'Synthetic member', username: 'synthetic_cycle' }, message: { message_id: 20, chat: { id, type: 'private' } }, data: 'r:demo:' + stage } })
  await demo('paid', 900000004)
  check('demo buttons cannot activate test access for an unapproved account', () => assert.ok(calls().some(c => c.method === 'editMessageText' && c.body.text?.includes('Тестовый режим не включён'))))
  bot.updateBotUser(id, { subscriptionDemoStartedAt: start, subscriptionDemoUntil: start + DAY })
  const beforeDemo = joins.getJoin(token), tagsBeforeDemo = bot.getBotUser(id).tags
  await demo('expired', 900000005)
  check('authorized demo shows expiry without changing real subscription, tags or membership', () => {
    assert.ok(calls().some(c => c.method === 'editMessageText' && c.body.text?.startsWith('ТЕСТ ПОДПИСКИ')))
    assert.deepEqual(joins.getJoin(token), beforeDemo); assert.deepEqual(bot.getBotUser(id).tags, tagsBeforeDemo); assert.equal(userCalls('banChatMember').length, 0)
  })
  await hook('', { clock: due - DAY - 1 }); await hook('sendAutoResidentReminders')
  check('no reminder earlier than 24 hours before exact charge time', () => assert.equal(joins.getJoin(token).reminder24, undefined))
  await hook('', { clock: due - DAY }); await hook('sendAutoResidentReminders')
  const reminders = () => userCalls('sendMessage').filter(c => c.body.text?.includes('Напоминание о подписке'))
  check('24-hour reminder is delivered with frozen price and exact Moscow timestamp', () => { assert.equal(reminders().length, 1); assert.ok(reminders()[0].body.text.includes('690 ₽')); assert.ok(reminders()[0].body.text.includes('15:37:22')); assert.equal(joins.getJoin(token).reminder24.botDone, true) })
  await hook('sendAutoResidentReminders')
  check('repeated scheduler tick does not repeat a delivered Telegram reminder', () => assert.equal(reminders().length, 1))
  await hook('', { clock: due + 1 })
  await signed({ ...payment, date: new Date(due + 1).toISOString(), payment_status: 'error', subscription: { ...payment.subscription, notification_code: 'auto_payment', current_attempt: '1', last_attempt: 'no', error: 'Synthetic declined card' } })
  check('failed charge retains paid end, records failure and allows four days of access', () => { const j = joins.getJoin(token); assert.equal(j.nextPaymentAt, due); assert.ok(j.lastChargeFailure); assert.equal(hasAccess(j, due + 1), true); assert.equal(j.payments.length, 1) })
  await hook('', { clock: due + 4 * DAY - 1 }); await hook('processAccessExpiry')
  check('resident is not removed one millisecond before grace expiry', () => assert.equal(userCalls('banChatMember').length, 0))
  await hook('', { clock: due + 4 * DAY }); await hook('processAccessExpiry')
  check('grace expiry closes access, releases ban for return and preserves original price', () => {
    const j = joins.getJoin(token)
    assert.equal(userCalls('banChatMember').length, 1); assert.ok(userCalls('unbanChatMember').length >= 1); assert.equal(j.inChat, false); assert.equal(j.accessClosedFor, due); assert.equal(j.priceLock.amount, 690); assert.equal(j.payments.length, 1)
    assert.ok(!read('bot-users.json')[String(id)].tags.includes('резидент_сообщества'))
  })
  const users = await import(pathToFileURL(path.join(root, 'lib/accountUsers.js')))
  const auth = await import(pathToFileURL(path.join(root, 'lib/accountAuth.js')))
  const registration = users.startRegistration({ email, name: 'Synthetic member', consentAt: start })
  const account = users.consumeToken(registration.token, 'Synthetic-Password-2026!').account
  const session = auth.startSession('u:' + account.id, due + 4 * DAY)
  const headers = { Authorization: 'Bearer ' + session.token }
  r = await request('/api/account/subscription/card', {}, headers)
  check('card-change request creates a support message without collecting payment-card data', () => { assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.deepEqual(joins.getJoin(token).payments, beforeDemo.payments) })
  await hook('', { raisePrice: true })
  r = await request('/api/account/subscription/renew', {}, headers)
  check('unconfirmed provider cancellation blocks a potentially duplicate new checkout', () => { assert.equal(r.status, 503); assert.equal(joins.getJoin(token).status, 'active') })
  fs.writeFileSync(path.join(root, 'prodamus-cancel-ok'), '')
  r = await request('/api/account/subscription/renew', { amount: 1, subscriptionId: 9999999 }, headers)
  check('return after public price increase uses stored old provider plan, never client-supplied prices', () => { assert.equal(r.status, 200); assert.equal(fs.readFileSync(path.join(root, 'checkout-plan'), 'utf8'), '2854597'); assert.equal(joins.getJoin(token).priceLock.amount, 690) })
  const paidAgain = due + 4 * DAY + 1000, next = paidAgain + 30 * DAY
  await hook('', { clock: paidAgain })
  await signed({ ...payment, date: new Date(paidAgain).toISOString(), order_id: 'cycle-return', subscription: { ...payment.subscription, profile_id: 'cycle-return-profile', date_next_payment: new Date(next).toISOString() } })
  check('successful return restores resident tags and keeps the original start and price', () => { const j = joins.getJoin(token); assert.equal(j.status, 'active'); assert.equal(j.firstPaidAt, start); assert.equal(j.nextPaymentAt, next); assert.equal(j.priceLock.amount, 690); assert.equal(j.payments.length, 2); assert.ok(read('bot-users.json')[String(id)].tags.includes('резидент_сообщества')) })
  check('historical joinedAt does not prevent a returning paid resident receiving the invite', () => assert.ok(userCalls('sendMessage').some(c => c.body.reply_markup?.inline_keyboard?.some(row => row.some(button => button.text === 'Вступить в сообщество')))))
  await update({ update_id: 900000003, chat_join_request: { chat: { id: -100900000001, type: 'supergroup' }, from: { id, first_name: 'Synthetic member', username: 'synthetic_cycle' }, user_chat_id: id, date: Math.floor(paidAgain / 1000) } })
  check('returning resident can rejoin through approval without a permanent ban', () => { assert.equal(userCalls('approveChatJoinRequest').length, 2); assert.equal(joins.getJoin(token).inChat, true) })
  await signed(payment)
  check('duplicate old payment never changes current expiry or creates another payment', () => { assert.equal(joins.getJoin(token).nextPaymentAt, next); assert.equal(joins.getJoin(token).payments.length, 2) })
}
