// Payment and delivery are separate: a paid registration is never a delivery receipt.
export const newTicketDelivery = (at = Date.now()) => ({ version: 1, createdAt: at, email: { state: 'pending' }, telegram: { state: 'pending' } })
export const ticketBotLink = (username, token) => /^[a-z0-9_]{5,32}$/i.test(String(username)) && /^[a-f0-9]{24}$/i.test(String(token)) ? `https://t.me/${username}?start=ticket_${token}` : ''
export const ticketPaymentNumber = body => {
  const values = [body.order_num, body.order_id, body.customer_extra].flatMap(v => [...String(v ?? '').matchAll(/(?<![a-z0-9_-])ev-(\d+)(?![a-z0-9_-])/gi)].map(m => Number(m[1])))
  const unique = [...new Set(values)]
  if (unique.length > 1) throw Error('event_order_conflict')
  return unique[0] ?? null
}

export function createEventTicketDelivery({ list, get, patch, email, telegram, now = Date.now }) {
  const active = new Set()
  const paid = lead => lead?.kind === 'registration' && ['paid', 'attended'].includes(lead.status)

  function request(number, channel) {
    number = Number(number)
    const lead = get(number)
    if (!paid(lead) || !['email', 'telegram'].includes(channel)) return false
    // Old paid registrations have unknown mail history: never mass-resend them.
    const delivery = lead.ticketDelivery?.version === 1 ? lead.ticketDelivery : { ...newTicketDelivery(now()), email: { state: 'legacy_unknown' }, telegram: { state: 'legacy_unknown' } }
    patch(number, { ...delivery, [channel]: { state: 'pending', requestedAt: now(), attempts: delivery[channel]?.attempts ?? 0 } })
    return true
  }

  async function deliverChannel(number, channel) {
    const key = `${number}:${channel}`
    if (active.has(key)) return null
    active.add(key)
    try {
      const lead = get(number), delivery = lead?.ticketDelivery, state = delivery?.[channel]
      if (!paid(lead) || delivery?.version !== 1 || !state) return null
      if (state.state === 'sending') {
        if (now() - state.startedAt > 120000) patch(number, { ...delivery, [channel]: { ...state, state: 'uncertain', lastError: 'interrupted_delivery' } })
        return null
      }
      if (!['pending', 'retry', 'waiting'].includes(state.state) || state.nextAt > now()) return null
      if (channel === 'telegram' && !/^\d{5,16}$/.test(String(lead.tgUserId ?? ''))) {
        if (state.state !== 'waiting') patch(number, { ...delivery, [channel]: { ...state, state: 'waiting', lastError: 'telegram_not_linked' } })
        return null
      }
      const attempt = { ...state, state: 'sending', attempts: (state.attempts ?? 0) + 1, startedAt: now() }
      patch(number, { ...delivery, [channel]: attempt })
      let sent
      try { sent = await (channel === 'email' ? email : telegram)(lead) }
      catch (error) { sent = { ok: false, error: 'transport_exception', definitelyNotSent: error?.definitelyNotSent === true } }
      const current = get(number)
      if (!current?.ticketDelivery) return sent
      const next = sent?.ok === true
        ? { ...attempt, state: 'sent', sentAt: now(), lastError: null, nextAt: null }
        : { ...attempt, state: sent?.definitelyNotSent === true ? 'retry' : 'uncertain', lastError: String(sent?.error ?? 'delivery_not_confirmed').slice(0, 200), nextAt: now() + Math.min(3600000, 30000 * 2 ** Math.min(attempt.attempts - 1, 7)) }
      patch(number, { ...current.ticketDelivery, [channel]: next })
      return sent
    } finally { active.delete(key) }
  }

  async function deliver(number, only = null) {
    const channels = only ? [only] : ['email', 'telegram']
    const results = await Promise.all(channels.map(async channel => [channel, await deliverChannel(Number(number), channel)]))
    return Object.fromEntries(results.filter(([, result]) => result !== null))
  }

  let processing = false
  async function process() {
    if (processing) return
    processing = true
    try {
      let attempts = 0
      for (const lead of list()) {
        if (!paid(lead) || lead.ticketDelivery?.version !== 1) continue
        const result = await deliver(lead.number)
        if (Object.keys(result).length && ++attempts >= 10) break
      }
    } finally { processing = false }
  }
  return { request, deliver, process }
}
