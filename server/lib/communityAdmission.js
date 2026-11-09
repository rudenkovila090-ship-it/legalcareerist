import { hasAccess } from './subscriptionAccess.js'
import { decideJoinRequest } from './communityInvite.js'

// Durable requests are reconsidered after payment, independently of administrator notices.
export function createCommunityAdmission({ requests, saveRequest, deleteRequest, list, find, bind, membership, approve, joined, patch, sendInvite, sendMail, now = Date.now }) {
  let running = false
  function remember(request) {
    if (!/^\d{5,16}$/.test(String(request.from?.id || ''))) return
    saveRequest(String(request.from.id), { from: request.from, userChatId: request.user_chat_id, requestedAt: request.date ? Number(request.date) * 1000 : now() })
  }
  async function process() {
    if (running) return
    running = true
    try {
      for (const [key, request] of Object.entries(requests())) {
        if (request.retryAt > now()) continue
        const verdict = decideJoinRequest({ from: request.from, residentByTelegramId: find, joins: list(), hasAccess: j => hasAccess(j, now()) })
        if (verdict.action !== 'approve') continue
        try {
          const state = await membership(request.from.id)
          if (!['in','out'].includes(state)) continue
          if (verdict.bind) bind(verdict.join.token, String(request.from.id))
          if (state !== 'in' && !await approve(request.from.id)) {
            saveRequest(key, { ...request, retryAt: now() + 60000 })
            continue
          }
          joined(request.from, verdict.join, now())
          deleteRequest(key)
        } catch { saveRequest(key, { ...request, retryAt: now() + 60000 }) }
      }
      for (const join of list()) {
        const notice = join.inviteDelivery
        if ((!notice?.pending && !notice?.mailPending) || notice.retryAt > now() || !join.paid || !hasAccess(join, now())) continue
        if (notice.mailPending && sendMail) {
          let delivered = !join.email
          try { if (join.email) delivered = (await sendMail(join, notice))?.ok === true } catch { /* retry later */ }
          const saved = list().find(j => j.token === join.token)
          if (saved?.inviteDelivery?.key === notice.key) patch(join.token, { inviteDelivery: { ...saved.inviteDelivery, mailPending: !delivered } })
        }
        if (!notice.pending || !join.tgUserId) {
          const saved = list().find(j => j.token === join.token)
          if (saved?.inviteDelivery?.key === notice.key) patch(join.token, { inviteDelivery: { ...saved.inviteDelivery, retryAt: now() + 60000 } })
          continue
        }
        const current = list().find(j => j.token === join.token)
        if (!current || current.inviteDelivery?.key !== notice.key) continue
        let delivered = false
        try { delivered = await sendInvite(current.tgUserId, current) === true } catch { /* retry later */ }
        const latest = list().find(j => j.token === join.token)
        if (latest?.inviteDelivery?.key === notice.key) patch(join.token, { inviteDelivery: { ...latest.inviteDelivery, pending: !delivered, retryAt: now() + 60000, ...(delivered ? { deliveredAt: now() } : {}) } })
      }
    } finally { running = false }
  }
  return { remember, process }
}
