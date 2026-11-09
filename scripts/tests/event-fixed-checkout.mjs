// Exercise the actual checkout handler with disposable storage and no outbound traffic.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const repo = fileURLToPath(new URL('../..', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'event-fixed-checkout-'))
try {
  fs.mkdirSync(path.join(root, 'lib'))
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
  for (const name of ['eventLeads.js', 'jsonStore.js', 'consentLog.js', 'eventPaymentTarget.js']) fs.copyFileSync(path.join(repo, 'server/lib', name), path.join(root, 'lib', name))
  const leads = await import(pathToFileURL(path.join(root, 'lib/eventLeads.js')))
  const { recordConsent } = await import(pathToFileURL(path.join(root, 'lib/consentLog.js')))
  const { fixedEventPaymentLink } = await import(pathToFileURL(path.join(root, 'lib/eventPaymentTarget.js')))
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'updates/resident-ui/manifest.json')))
  let source = execFileSync('git', ['show', 'b14a93b:server/index.js'], { cwd: repo, encoding: 'utf8' })
  for (const [before, after] of manifest.backend.find(f => f.path === 'index.js').edits) {
    assert.equal(source.split(before).length, 2, 'Legacy checkout patch must match exactly once')
    source = source.replace(before, after)
  }
  const priceCode = source.slice(source.indexOf('function priceTicket('), source.indexOf("app.post('/api/event/:slug/promo'"))
  const routeCode = source.slice(source.indexOf("app.post('/api/event/:slug/checkout'"), source.indexOf('// Апдейты от Telegram-бота'))
  const event = { slug: 'dzhazovyy-vecher-dlya-yuristov-2', title: 'Synthetic jazz', status: 'open', collectTicketLead: true, registrationLink: 'https://payform.ru/obcMOZJ/', tariffs: [{ id: 'light', name: 'Билет', price: 3990 }] }
  let handler, failStorage = false, dynamicCalls = 0
  const notices = []
  const env = {
    app: { post: (_url, fn) => { handler = fn } },
    findEvent: slug => slug === event.slug ? event : null,
    findPromo: () => null, applyPromo: () => { throw Error('unexpected promo') },
    consentGiven: b => b.consent?.policy === true && b.consent?.processing === true,
    consentChoice: b => b.consent, consentVersion: () => '2026-10-17',
    marketingFields: b => ({ marketing: b.consent.marketing, marketingVersion: '2026-10-17' }),
    normalizeTelegram: v => String(v || ''), normalizePhone: v => String(v).replace(/\D/g, ''),
    EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, incrementEventRegistration: () => {}, logLeadSource: () => {},
    utmLabel: () => 'test', cleanHowHeard: v => String(v || ''),
    createEventLead: payload => { if (failStorage) throw Error('synthetic_storage_failure'); return leads.createEventLead(payload) },
    setEventLeadField: leads.setEventLeadField, recordConsent, fixedEventPaymentLink,
    createEventPaymentLink: async () => { dynamicCalls++; return 'https://example.invalid/dynamic' },
    SITE_URL: 'https://example.invalid', BOT_TOKEN: 'synthetic', ADMIN_CHAT_ID: 'synthetic',
    getAdminSettings: () => ({ unpaidNotices: true }), buildLeadNotification: () => 'synthetic notice',
    formatRub: n => n + ' ₽', retitle: s => s, PENDING_MINUTES: 10,
    queuePending: n => notices.push(n), console: { error: () => {} },
  }
  Function(...Object.keys(env), priceCode + '\n' + routeCode)(...Object.values(env))
  async function request(overrides = {}, slug = event.slug) {
    const req = { params: { slug }, body: { tariffId: 'light', name: 'Synthetic Tester', email: 'tester@example.invalid', phone: '+70000000000', telegram: '@synthetic', howHeard: 'Test', consent: { policy: true, processing: true, marketing: false }, ...overrides } }
    const res = { code: 200, status(n) { this.code = n; return this }, json(body) { this.body = body; return this } }
    await handler(req, res)
    return res
  }
  const existing = leads.createEventLead({ kind: 'request', name: 'Existing synthetic partner', eventSlug: 'other-event' })
  const r = await request()
  assert.equal(r.code, 200)
  assert.equal(r.body.ok, true)
  const saved = leads.listEventLeads().find(e => e.kind === 'registration')
  assert.equal(saved.email, 'tester@example.invalid')
  assert.equal(saved.price, 3990)
  assert.equal(saved.status, 'registered')
  assert.equal(saved.amount, null)
  assert.equal(saved.paid, false)
  assert.ok(saved.consentAt)
  assert.equal(saved.marketingAt, undefined)
  const target = new URL(r.body.url)
  assert.equal(target.origin + target.pathname, 'https://payform.ru/obcMOZJ/')
  assert.equal(target.searchParams.get('order_id'), 'ev-' + saved.number)
  assert.ok(target.searchParams.get('customer_extra').includes('ev-' + saved.number))
  assert.equal(target.searchParams.get('customer_email'), saved.email)
  assert.ok(target.searchParams.get('urlSuccess').endsWith('paid=1&t=' + saved.token))
  assert.equal(dynamicCalls, 0, 'Fixed page must not call payment provider')
  assert.equal(notices[0].eventNumber, saved.number)
  assert.deepEqual(leads.getEventLead(existing.number), existing)
  assert.ok(fs.readFileSync(path.join(root, 'data/consent-log.jsonl'), 'utf8').includes('event_ticket'))
  for (const body of [{ consent: {} }, { name: '' }, { email: 'invalid' }, { tariffId: 'invalid' }, { promoCode: 'DISCOUNT' }]) assert.equal((await request(body)).code, 400)
  assert.equal((await request({}, 'unknown')).code, 404)
  event.status = 'closed'; assert.equal((await request()).code, 400); event.status = 'open'
  event.collectTicketLead = false; assert.equal((await request()).code, 400)
  event.registrationLink = ''; assert.equal((await request()).code, 200); assert.equal(dynamicCalls, 1)
  event.collectTicketLead = true; event.registrationLink = 'https://payform.ru/obcMOZJ/'
  const count = leads.listEventLeads().length
  failStorage = true
  const failed = await request()
  assert.equal(failed.code, 500)
  assert.equal(failed.body.url, undefined)
  assert.equal(leads.listEventLeads().length, count)
  assert.throws(() => fixedEventPaymentLink({ event: { ...event, registrationLink: 'https://evil.invalid' } }))
  // The established webhook mapping still changes the correct pending registration.
  const paid = leads.markEventLeadPaid(saved.number, 3990, 'synthetic-provider-payment')
  assert.equal(paid.status, 'paid'); assert.equal(paid.amount, 3990)
  assert.equal(leads.markEventLeadPaid(saved.number, 3990, 'synthetic-provider-payment').duplicate, true)
  console.log('PASS legacy checkout: durable pending lead, consent, exact fixed payment page/order mapping, unpaid notice, validation, storage failure, existing dynamic checkout and webhook mapping')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
