// Запуск: node --test bot2/test
import test from 'node:test'
import assert from 'node:assert/strict'
import { TARIFFS, tariffsForSale, tariffIdBySubscriptionId, periodEnd } from '../lib/tariffs.js'
import { buildSubscriptionLink, createPaymentLink, verifyWebhook, settings } from '../lib/prodamus.js'
import { HmacHelper } from '../../server/lib/hmac.js'

const env = { PRODAMUS_SECRET_KEY: 'test-key', PRODAMUS_DOMAIN: 'https://shop.payform.ru/', SITE_URL: 'https://example.test' }

test('каталог: все восемь подписок из кабинета Prodamus с верными ценами и сроками', () => {
  const expected = [[2611878, 350, 30], [2611880, 500, 30], [2854589, 1350, 90], [2854592, 2520, 180], [2854597, 690, 30], [2854598, 4200, 360], [3005286, 1770, 90], [3005289, 3180, 180]]
  for (const [id, price, days] of expected) {
    const t = TARIFFS[tariffIdBySubscriptionId(id)]
    assert.ok(t, `подписка ${id} не найдена`)
    assert.equal(t.price, price)
    assert.equal(t.days, days)
  }
  assert.equal(Object.keys(TARIFFS).length, 8)
  assert.equal(new Set(Object.values(TARIFFS).map((t) => t.subscription)).size, 8, 'ID не повторяются')
})

test('покупателям показываем только актуальные тарифы сайта', () => {
  assert.deepEqual(tariffsForSale().map((t) => t.id), ['1m', '3m', '6m'])
  assert.equal(tariffIdBySubscriptionId('9999999'), null)
  assert.equal(tariffIdBySubscriptionId('3005286'), '3m')
})

test('конец периода — оплата плюс срок подписки в днях', () => {
  assert.equal(periodEnd(0, TARIFFS['3m']), 90 * 24 * 3600 * 1000)
})

test('ссылка: нужный ID подписки, адрес уведомлений второго бота, верная подпись', () => {
  const url = new URL(buildSubscriptionLink({ tariffId: '3m', tgUserId: 555, name: 'Анна', telegram: '@anna' }, env))
  assert.equal(url.host, 'shop.payform.ru')
  const q = Object.fromEntries(url.searchParams)
  assert.equal(q.do, 'link')
  assert.equal(q.subscription, '3005286')
  assert.equal(q.tg_user_id, '555')
  assert.equal(q.urlNotification, 'https://example.test/bot2/api/prodamus/webhook')
  assert.match(q.customer_extra, /Анна \| @anna/)
  assert.ok(HmacHelper.verify(q, 'test-key', q.signature), 'подпись сходится')
})

test('ссылка: старая подписка тоже строится (для продления прежних резидентов)', () => {
  const q = Object.fromEntries(new URL(buildSubscriptionLink({ tariffId: 'old350', email: 'a@b.ru' }, env)).searchParams)
  assert.equal(q.subscription, '2611878')
  assert.equal(q.customer_email, 'a@b.ru')
})

test('адрес уведомлений можно переопределить', () => {
  assert.equal(settings({ ...env, BOT2_PUBLIC_URL: 'https://bot.example.test/' }).notificationUrl, 'https://bot.example.test/api/prodamus/webhook')
})

test('ошибки: неизвестный тариф, нет ключа, нет способа опознать плательщика', () => {
  assert.throws(() => buildSubscriptionLink({ tariffId: 'xx', tgUserId: 1 }, env), /unknown tariff/)
  assert.throws(() => buildSubscriptionLink({ tariffId: '1m', tgUserId: 1 }, {}), /PRODAMUS_SECRET_KEY/)
  assert.throws(() => buildSubscriptionLink({ tariffId: '1m' }, env), /нужен tg_user_id/)
})

test('короткая ссылка: берём ответ Prodamus; странный ответ — ошибка', async () => {
  const ok = await createPaymentLink({ tariffId: '1m', tgUserId: 1 }, env, async () => new Response('https://payform.ru/abc123/'))
  assert.equal(ok, 'https://payform.ru/abc123/')
  await assert.rejects(createPaymentLink({ tariffId: '1m', tgUserId: 1 }, env, async () => new Response('error', { status: 500 })), /неожиданно/)
})

test('уведомление: верная подпись принимается, подделка и отсутствие подписи — нет', () => {
  const body = { payment_status: 'success', order_num: '1', sum: '1770.00', subscription: { id: '3005286' } }
  const sign = HmacHelper.create(body, 'test-key')
  assert.equal(verifyWebhook(body, sign, env), true)
  assert.equal(verifyWebhook({ ...body, sum: '1.00' }, sign, env), false)
  assert.equal(verifyWebhook(body, '', env), false)
  assert.equal(verifyWebhook(body, sign, {}), false)
})
