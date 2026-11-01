// Retriable payment confirmations. Each channel is acknowledged separately.
export function createRenewalDelivery({ list, patch, send }) {
  let running = false
  return async function deliver() {
    if (running) return
    running = true
    try {
      for (const join of list()) for (const notice of join.renewalNotices ?? []) {
        let result
        try { result = await send(join, notice, { bot: !notice.botDone, mail: !notice.mailDone }) }
        catch { continue }
        const current = list().find(j => j.token === join.token)
        if (!current) continue
        const notices = (current.renewalNotices ?? []).map(n => n.id === notice.id ? {
          ...n, botDone: n.botDone || result.bot === true || !current.tgUserId,
          mailDone: n.mailDone || result.mail === true || !current.email,
        } : n).filter(n => !n.botDone || !n.mailDone)
        patch(join.token, { renewalNotices: notices })
      }
    } finally { running = false }
  }
}
