// One resident login backed by an isolated API and data directory. The live API
// forwards only this login and demo-prefixed sessions; normal residents are unchanged.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import http from 'node:http'
import { getAccount } from './accountUsers.js'
import { sessionFor } from './accountAuth.js'
import { residentJoin } from './accountProfile.js'
import { patchJoin, recordPayment } from './store.js'
import { cancellationReason } from './subscriptionCancellation.js'
import { prepareRetentionOffer, retentionOfferView } from './subscriptionRetention.js'
import { priceEntitlement } from './subscriptionPricing.js'

const DATA = path.join(import.meta.dirname, '..', 'data')
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex')
const equal = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)))
const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
const read = file => JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'))
const demoMode = process.env.RESIDENT_DEMO_MODE === '1'

if (demoMode) globalThis.fetch = async () => { throw Error('resident_demo_outbound_disabled') }

export function registerResidentDemo(app) {
  if (demoMode) return sandbox(app)
  app.use((req, res, next) => {
    const demoBrowser = /(?:^|;\s*)lc_resident_demo=1(?:;|$)/.test(req.headers.cookie || '')
    if ((demoBrowser || bearer(req).startsWith('demo.')) && req.path.startsWith('/api/') && !req.path.startsWith('/api/account/') && !['GET','HEAD','OPTIONS'].includes(req.method)) return res.status(403).json({ ok: false, error: 'demo_only' })
    next()
  })
  app.use('/api/account', (req, res, next) => {
    let config
    try { config = read('resident-demo-gateway.json') } catch { return next() }
    const token = bearer(req), demoToken = token.startsWith('demo.'), checkout = req.path === '/demo/checkout'
    const demoLogin = req.path === '/login' && String(req.body?.login || '').trim().toLowerCase() === config.email
    const cookie = {httpOnly: true, sameSite: 'lax', secure: process.env.SITE_URL?.startsWith('https://') === true, path: '/'}
    if (!demoToken && !demoLogin && !checkout) {
      if (req.path === '/login') {
        const json = res.json.bind(res)
        res.json = result => { if (result.ok && result.token) res.clearCookie('lc_resident_demo', cookie); return json(result) }
      }
      return next()
    }
    res.set('Cache-Control', 'no-store')
    if (config.enabled !== true || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || !/^[a-f0-9]{64}$/.test(config.key || '')) return res.status(503).json({ ok: false, error: 'demo_unavailable' })
    if (demoToken && !/^demo\.[a-f0-9]{64}$/.test(token)) return res.status(401).json({ ok: false, error: 'unauthorized' })
    const headers = { 'x-resident-demo-key': config.key }
    if (demoToken) headers.authorization = 'Bearer ' + token.slice(5)
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
    let body
    if (req.is('application/json') || req.is('application/x-www-form-urlencoded')) {
      body = req.is('application/json') ? JSON.stringify(req.body || {}) : new URLSearchParams(req.body || {}).toString()
      headers['content-length'] = Buffer.byteLength(body)
    } else if (req.headers['content-length']) headers['content-length'] = req.headers['content-length']
    const upstream = http.request({ hostname: '127.0.0.1', port: config.port, method: req.method, path: '/api/account' + req.url, headers }, incoming => {
      res.status(incoming.statusCode || 502)
      if (incoming.statusCode < 400) {
        if (req.path === '/logout') res.clearCookie('lc_resident_demo', cookie)
        else if (demoLogin || req.path === '/me') res.cookie('lc_resident_demo', '1', {...cookie, maxAge: 30*86400000})
      }
      for (const key of ['content-type', 'content-disposition', 'location', 'content-security-policy', 'x-content-type-options']) if (incoming.headers[key]) res.set(key, incoming.headers[key])
      if (!demoLogin) return incoming.pipe(res)
      const chunks = []; let size = 0
      incoming.on('data', chunk => { size += chunk.length; if (size > 65536) upstream.destroy(); else chunks.push(chunk) })
      incoming.on('end', () => {
        try { const result = JSON.parse(Buffer.concat(chunks)); if (result.ok && /^[a-f0-9]{64}$/.test(result.token)) result.token = 'demo.' + result.token; res.json(result) }
        catch { if (!res.headersSent) res.status(502).json({ ok: false, error: 'demo_unavailable' }); else res.destroy() }
      })
      incoming.on('error', () => res.destroy())
    })
    upstream.setTimeout(30000, () => upstream.destroy())
    upstream.on('error', () => { if (!res.headersSent) res.status(503).json({ ok: false, error: 'demo_unavailable' }); else res.destroy() })
    res.on('close', () => { if (!res.writableEnded) upstream.destroy() })
    if (body !== undefined) upstream.end(body)
    else req.pipe(upstream)
  })
}

function sandbox(app) {
  const meta = read('resident-demo-sandbox.json')
  if (meta.kind !== 'resident-demo-v1' || fs.lstatSync(DATA).isSymbolicLink() || fs.realpathSync(DATA) === fs.realpathSync(meta.productionData)) throw Error('resident_demo_data_not_isolated')
  if (!/^[a-f0-9]{64}$/.test(process.env.RESIDENT_DEMO_PROXY_KEY || '')) throw Error('resident_demo_key_missing')
  const checkouts = new Map()
  const html = (res, content) => res.type('html').set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'").send('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Демо кабинета</title><style>body{font:18px system-ui;color:#283953;max-width:600px;margin:12vh auto;padding:24px}button,a{display:inline-block;padding:14px 20px;border-radius:12px;background:#283953;color:white;border:0;text-decoration:none;cursor:pointer}p{line-height:1.6}</style>' + content + '</html>')
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (req.path === '/api/health') return next()
    if (!req.path.startsWith('/api/account/') || !equal(req.headers['x-resident-demo-key'], process.env.RESIDENT_DEMO_PROXY_KEY)) return res.sendStatus(403)
    if (req.path === '/api/account/demo/checkout') {
      const key = String(req.query.ticket || ''), item = checkouts.get(key)
      if (!item || item.until <= Date.now()) return html(res.status(410), '<h1>Демоссылка закончилась</h1><p>Вернитесь в кабинет и откройте её заново.</p><a href="/cabinet/resident">Вернуться</a>')
      if (req.method === 'GET') return html(res, `<h1>Демонстрационная оплата</h1><p>Подписка на месяц: ${item.amount} ₽. Деньги не списываются, данные карты не запрашиваются.</p><form method="post"><button>Подтвердить тестовую оплату</button></form><p><a href="/cabinet/resident">Вернуться без оплаты</a></p>`)
      if (req.method !== 'POST') return res.sendStatus(405)
      checkouts.delete(key)
      const now = Date.now(), until = now + 30 * 86400000
      if (item.amount === 500) patchJoin(item.token, {retentionCheckout: {subscriptionId:'2611880',createdAt:now,url:'demo'}})
      recordPayment(item.token, { amount: item.amount, tariffId: '1m', paidAt: now, nextPaymentAt: until, orderKey: 'DEMO-' + crypto.randomBytes(12).toString('hex'), subscriptionId: item.amount === 500 ? '2611880' : '2854597' })
      patchJoin(item.token, { status: 'active', cancellation: undefined, demo: true })
      return res.redirect(303, '/cabinet/resident')
    }
    if (['/api/account/register', '/api/account/forgot', '/api/account/activate', '/api/account/activation'].includes(req.path)) return res.status(403).json({ ok: false, error: 'demo_shared_account' })
    if (req.path === '/api/account/login') return next()
    const session = sessionFor(bearer(req)), account = session?.login?.startsWith('u:') ? getAccount(session.login.slice(2)) : null
    if (!account || account.email !== meta.email) return res.status(401).json({ ok: false, error: 'unauthorized' })
    if (['/api/account/password', '/api/account/telegram/link', '/api/account/telegram', '/api/account/contact'].includes(req.path) && req.method !== 'GET') return res.status(403).json({ ok: false, error: 'demo_shared_account' })
    if (req.path.startsWith('/api/account/materials')) return res.status(403).json({ ok: false, error: 'admin_only' })
    const join = residentJoin('', account.email)
    if (req.path === '/api/account/subscription/cancel' && req.method === 'POST') {
      if (!join || join.status !== 'active') return res.status(409).json({ ok: false, error: 'already_cancelled' })
      const reason = cancellationReason(req.body?.reason, req.body?.reasonCode)
      if (!reason) return res.status(400).json({ ok: false, error: 'cancellation_reason_required' })
      patchJoin(join.token, { status: 'cancelled', cancelReason: reason.text, cancellation: { confirmed: true, source: 'demo', confirmedAt: Date.now(), accessUntil: join.nextPaymentAt }, retentionOffer: prepareRetentionOffer(join) })
      return res.json({ ok: true, confirmed: true, test: false, demo: true, endsAt: join.nextPaymentAt })
    }
    const payment = req.path === '/api/account/subscription/renew' || (req.path === '/api/account/subscription/retention' && req.body?.action === 'checkout')
    if (payment && req.method === 'POST') {
      if (!join) return res.status(404).json({ ok: false, error: 'no_subscription' })
      if (join.nextPaymentAt > Date.now()) return res.status(409).json({ ok: false, error: 'paid_access_remaining' })
      if (req.path.endsWith('/retention') && !retentionOfferView(join)) return res.status(404).json({ ok: false, error: 'no_retention_offer' })
      for (const [key, item] of checkouts) if (item.until <= Date.now()) checkouts.delete(key)
      if (checkouts.size >= 100) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
      const ticket = crypto.randomBytes(24).toString('hex'), amount = req.path.endsWith('/retention') ? 500 : Number(priceEntitlement(join)?.amount) || 690
      checkouts.set(ticket, { token: join.token, amount, until: Date.now() + 10 * 60000 })
      return res.json({ ok: true, url: (process.env.SITE_URL || 'https://legalcareerist.ru') + '/api/account/demo/checkout?ticket=' + ticket })
    }
    const json = res.json.bind(res)
    res.json = body => {
      if (req.path === '/api/account/me') return json({ ...body, name: '', contact: { ...body.contact, name: '', phone: '' }, demo: true, capabilities: { manageMaterials: false } })
      if (body.contact) body = {...body,contact:{...body.contact,name:''}}
      if (body.prefill) body = {...body,prefill:{...body.prefill,name:''}}
      return json(body)
    }
    next()
  })
}
