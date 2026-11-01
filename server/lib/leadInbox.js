// Durable receipts and retriable admin notifications for public forms.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DIR, 'lead-inbox.json')
const busy = new Set()

export function normalizeLead(body) {
  if (body?.consent?.policy !== true || body?.consent?.processing !== true) return { error: 'consent_required' }
  const text = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : ''
  const normalized = Object.fromEntries([
    ['requestId', 100], ['direction', 200], ['service', 200], ['source', 100], ['formType', 64],
    ['name', 160], ['contact', 500], ['phone', 80], ['email', 200], ['telegram', 100], ['company', 300],
    ['template', 40], ['ticketNumber', 30], ['howHeard', 500], ['vacancySlug', 100], ['eventSlug', 100],
    ['consentVersion', 20], ['marketingVersion', 20],
  ].map(([key, max]) => [key, text(body[key], max)]))
  if (!normalized.name || !(normalized.contact || normalized.phone || normalized.email || normalized.telegram)) return { error: 'contact_required' }
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(normalized.formType)) return { error: 'bad_form' }
  if (body.interest !== undefined && (!Array.isArray(body.interest) || body.interest.some(v => typeof v !== 'string'))) return { error: 'bad_details' }
  normalized.interest = (body.interest ?? []).slice(0, 30).map(v => text(v, 5000))
  normalized.date = new Date().toISOString()
  normalized.consent = { policy: true, processing: true, marketing: body.consent.marketing === true }
  normalized.utm = body.utm && typeof body.utm === 'object' ? Object.fromEntries(
    Object.entries(body.utm).filter(([k, v]) => /^utm_[a-z]+$/.test(k) && typeof v === 'string').map(([k, v]) => [k, text(v, 200)]),
  ) : {}
  return { body: normalized }
}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.values(data).some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('invalid_lead_inbox')
    return data
  }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e }
}
function save(data) {
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = `${FILE}.${crypto.randomBytes(8).toString('hex')}.tmp`
  try {
    const fd = fs.openSync(tmp, 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    fs.renameSync(tmp, FILE)
    const directory = fs.openSync(DIR, 'r')
    try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
  } finally { fs.rmSync(tmp, { force: true }) }
}
const publicRecord = (token, r) => ({ token, ...r })
export const leadInboxStore = {
  all: () => Object.entries(load()).map(([token, r]) => publicRecord(token, r)),
  remove(token) { const data = load(); if (!data[token]) return false; delete data[token]; save(data); fs.rmSync(path.join(DIR, 'lead-files', token), { recursive: true, force: true }); return true },
  update(token, fn) { const data = load(); if (!data[token]) return null; data[token] = fn(data[token]) ?? data[token]; save(data); return publicRecord(token, data[token]) },
}

export function receiveLead(body, notification, now = Date.now()) {
  const requestId = /^[a-zA-Z0-9_-]{12,100}$/.test(String(body.requestId ?? '')) ? String(body.requestId) : crypto.randomUUID()
  const { requestId: _request, date: _date, ticketNumber: _ticket, ...stable } = body
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')
  const data = load()
  const previous = Object.entries(data).find(([, r]) => r.requestId === requestId)
  if (previous) {
    if (previous[1].fingerprint !== fingerprint) return { error: 'request_conflict' }
    return { receipt: publicRecord(...previous), duplicate: true }
  }
  const token = crypto.randomBytes(12).toString('hex')
  const record = {
    requestId, fingerprint, createdAt: now, body,
    name: body.name, phone: body.phone, email: body.email, telegram: body.telegram,
    notification, attempts: 0, nextAttemptAt: now + 15000, notifiedAt: null,
  }
  data[token] = record
  save(data)
  return { receipt: publicRecord(token, record), duplicate: false }
}

export function setLeadNotification(token, notification) {
  return leadInboxStore.update(token, r => ({ ...r, notification }))
}

export function attachLeadFile(token, file, label) {
  if (!/^[a-f0-9]{24}$/.test(String(token))) return { error: 'receipt_not_found' }
  const data = load()
  const record = data[token]
  if (!record) return { error: 'receipt_not_found' }
  const fingerprint = crypto.createHash('sha256').update(file.buffer).update(String(label)).digest('hex')
  if (record.attachments?.some(a => a.fingerprint === fingerprint)) return { ok: true }
  if ((record.attachments?.length ?? 0) >= 4) return { error: 'too_many_files' }
  const directory = path.join(DIR, 'lead-files', token)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const id = crypto.randomBytes(12).toString('hex')
  const target = path.join(directory, id)
  const fd = fs.openSync(target, 'wx', 0o600)
  try { fs.writeFileSync(fd, file.buffer); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  const filename = path.basename(String(file.originalname)).slice(0, 200)
  record.attachments = [...(record.attachments ?? []), { id, fingerprint, filename, label: String(label ?? 'Документ').slice(0, 100), notifiedAt: null }]
  record.nextAttemptAt = 0
  save(data)
  return { ok: true }
}

export async function deliverLead(token, send, now = Date.now(), sendFile) {
  if (busy.has(token)) return false
  busy.add(token)
  try {
    const r = load()[token]
    if (!r) return false
    if (!r.notifiedAt && r.notification) {
      // Long questions exceed Telegram's message limit. Checkpoint each part.
      const characters = Array.from(r.notification.text)
      const chunks = []
      for (let i = 0; i < characters.length; i += 1800) chunks.push(characters.slice(i, i + 1800).join(''))
      for (let i = r.notification.sentParts ?? 0; i < chunks.length; i++) {
        let ok = false
        try { ok = Boolean(await send(chunks[i], i === chunks.length - 1 ? r.notification.keyboard : undefined)) } catch { /* durable retry */ }
        leadInboxStore.update(token, current => ({
          ...current, attempts: current.attempts + 1,
          ...(ok ? { notification: { ...current.notification, sentParts: i + 1 }, ...(i === chunks.length - 1 ? { notifiedAt: now } : {}) }
            : { nextAttemptAt: now + Math.min(300000, 15000 * 2 ** Math.min(current.attempts, 5)) }),
        }))
        if (!ok) return false
      }
    }
    if (sendFile) for (const attachment of load()[token]?.attachments ?? []) {
      if (attachment.notifiedAt) continue
      let sent = false
      try { sent = await sendFile(fs.readFileSync(path.join(DIR, 'lead-files', token, attachment.id)), attachment.filename, `${r.name} — ${attachment.label}`) } catch { /* retry later */ }
      leadInboxStore.update(token, current => ({ ...current, nextAttemptAt: now + 60000,
        attachments: current.attachments.map(a => a.id === attachment.id && sent ? { ...a, notifiedAt: now } : a),
      }))
      if (!sent) return false
    }
    return true
  } finally { busy.delete(token) }
}

let retrying = false
export async function retryLeadNotifications(send, now = Date.now(), sendFile) {
  if (retrying) return
  retrying = true
  try {
    for (const r of leadInboxStore.all().filter(r => ((r.notification && !r.notifiedAt) || r.attachments?.some(a => !a.notifiedAt)) && r.nextAttemptAt <= now).slice(0, 10)) {
      await deliverLead(r.token, send, now, sendFile)
    }
  } finally { retrying = false }
}
