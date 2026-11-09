import { requestContactEmail, confirmContactEmail } from './accountUsers.js'

export function registerContactEmail(app, { requireAccount, mailConfigured, sendMail }) {
  const attempts = new Map()
  app.post('/api/account/contact-email/request', async (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    if (!String(cfg.login).startsWith('u:')) return res.status(400).json({ ok: false, error: 'not_supported' })
    if (!mailConfigured()) return res.status(503).json({ ok: false, error: 'mail_unavailable' })
    const now = Date.now(), key = cfg.login
    if (attempts.size > 10000) for (const [id, v] of attempts) if (now - v.at >= 3600000) attempts.delete(id)
    const bucket = attempts.get(key)
    if (bucket && now - bucket.at < 3600000 && bucket.n >= 5) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    attempts.set(key, bucket && now - bucket.at < 3600000 ? { ...bucket, n: bucket.n + 1 } : { at: now, n: 1 })
    const r = requestContactEmail(cfg.login.slice(2), req.body?.email, req.body?.password)
    if (r.error) return res.status(400).json({ ok: false, error: r.error })
    const sent = await sendMail({ to: r.email, subject: 'Подтвердите почту для связи — Карьерный юрист', text: `Код подтверждения: ${r.code}\n\nВведите его в профиле в течение 10 минут. Если вы не меняли почту, проигнорируйте письмо.` }).catch(() => ({ ok: false }))
    if (!sent.ok) return res.status(502).json({ ok: false, error: 'mail_failed' })
    res.json({ ok: true, email: r.email })
  })
  app.post('/api/account/contact-email/confirm', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    if (!String(cfg.login).startsWith('u:')) return res.status(400).json({ ok: false, error: 'not_supported' })
    const r = confirmContactEmail(cfg.login.slice(2), req.body?.code)
    res.status(r.error ? 400 : 200).json(r.error ? { ok: false, error: r.error } : { ok: true, email: r.email })
  })
}
