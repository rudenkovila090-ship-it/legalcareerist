const DAY = 86400000
/** Exact 24-hour eligibility, catch-up after downtime, separate channel acknowledgements. */
export function createSubscriptionReminders({ list, patch, send, now = Date.now }) {
  let running = false
  return async function deliver() {
    if (running) return
    running = true
    try {
      for (const join of list()) {
        const due = Number(join.nextPaymentAt), at = now()
        if (!join.paid || join.lifetime || join.oneTime || join.status !== 'active' || !due || at < due - DAY || at >= due) continue
        let state = join.reminder24?.dueAt === due ? join.reminder24 : { dueAt: due, botDone: false, mailDone: false }
        // Avoid a duplicate during migration from the old day-before notification.
        if (join.remindedFor === `${due}:1` && !join.reminder24) continue
        const channels = { bot: !state.botDone && Boolean(join.tgUserId), mail: !state.mailDone && Boolean(join.email) }
        if (!channels.bot && !channels.mail) {
          if (!join.tgUserId && !join.email && !join.reminder24) patch(join.token, { reminder24: { ...state, missingTelegram: true, missingEmail: true } })
          continue
        }
        let delivered
        try { delivered = await send(join, channels) } catch { continue }
        const current = list().find(j => j.token === join.token)
        if (!current || current.nextPaymentAt !== due) continue
        state = { ...state, botDone: state.botDone || delivered.bot === true, mailDone: state.mailDone || delivered.mail === true,
          attemptedAt: at, missingTelegram: !current.tgUserId }
        patch(join.token, { reminder24: state, ...(state.botDone ? { remindedFor: `${due}:1` } : {}) })
      }
    } finally { running = false }
  }
}
