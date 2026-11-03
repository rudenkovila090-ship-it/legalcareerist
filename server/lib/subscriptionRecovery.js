import { HISTORICAL_PLANS } from './subscriptionPricing.js'
import { normalizePhone } from './jsonStore.js'
import crypto from 'node:crypto'

export function recoveryRecipient(value) {
  const telegramId = String(value.telegramId || ''), planId = String(value.planId || '')
  const plan = HISTORICAL_PLANS[planId], phone = normalizePhone(value.phone)
  const endedAt = Date.parse(value.endedAt)
  if (!/^\d{5,16}$/.test(telegramId) || !Number.isSafeInteger(Number(telegramId)) || !/^7\d{10}$/.test(phone) ||
      !plan || plan.price !== value.amount || plan.months !== value.months || !Number.isFinite(endedAt) || !/[Zz]|[+-]\d\d:\d\d$/.test(value.endedAt)) throw Error('Некорректные условия восстановления или Telegram ID.')
  const name = String(value.name || '').replace(/[|\r\n]/g, ' ').trim().slice(0, 100)
  if (!name) throw Error('Нужно имя получателя.')
  return { telegramId, phone, planId, name, amount: plan.price, months: plan.months, endedAt, providerCompleted: value.providerCompleted === true,
    tariffId: ({ 1: '1m', 3: '3m', 6: '6m', 12: null })[plan.months] || null }
}

export function recoveryMessage(recipient) {
  const term = recipient.months === 1 ? 'в месяц' : recipient.months === 3 ? 'за 3 месяца' : `за ${recipient.months} месяцев`
  return `${recipient.name}, здравствуйте!\n\nПосле неудачных попыток оплаты банк временно ограничил повторные списания, и автопродление вашей подписки остановилось.\n\nЧтобы продолжить участие в сообществе, оформите подписку заново. Ваша прежняя цена сохранена: ${recipient.amount} ₽ ${term}. Новый оплаченный период начнётся с момента успешной оплаты.\n\nНажмите «Восстановить подписку» и подтвердите оплату и условия автопродления на странице Prodamus. Если вы уже восстановили подписку, повторно платить не нужно — напишите в поддержку.`
}

export function recoveryRequestSignature(body, secret) {
  const key = crypto.createHmac('sha256', secret).update('community-subscription-recovery-admin-v1').digest()
  return crypto.createHmac('sha256', key).update(JSON.stringify(body)).digest('hex')
}

export function validRecoveryRequest(body, supplied, secret, now = Date.now()) {
  if (!secret || body?.purpose !== 'community-subscription-recovery' || !Number.isFinite(body.issuedAt) || Math.abs(now - body.issuedAt) > 5 * 60000 || !/^[a-f0-9]{24}$/.test(body.nonce || '')) return false
  const expected = recoveryRequestSignature(body, secret), a = Buffer.from(String(supplied || '')), b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Runs inside the API process: never edit financial JSON concurrently from a shell process. */
export function createRecoveryService({ list, get, create, patch, telegram, stopProvider, checkout, graceDays, addTag, now = Date.now }) {
  const busy = new Set()
  const update = (token, fields) => patch(token, { recovery: { ...get(token).recovery, ...fields } })
  return async function recover(input, send = false) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(input?.campaignId || '') || !Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > 10) throw Error('invalid_campaign')
    const recipients = input.recipients.map(recoveryRecipient)
    if (recipients.some(r => r.endedAt > now() + 60000)) throw Error('future_completion_snapshot')
    if (new Set(recipients.map(r => r.telegramId)).size !== recipients.length) throw Error('duplicate_recipient')
    const results = []
    for (const r of recipients) {
      const summary = { name: r.name, telegramId: r.telegramId, amount: r.amount, months: r.months }
      if (busy.has(r.telegramId)) { results.push({ ...summary, status: 'busy' }); continue }
      busy.add(r.telegramId)
      let stage = 'preflight', token = null
      try {
        const cards = list()
        const belongs = j => String(j.tgUserId || '') === r.telegramId || (!j.tgUserId && normalizePhone(j.phone) === r.phone)
        const paymentExists = () => list().filter(belongs).some(j => j.paid && (j.payments || []).some(p => !p.estimated && Number(p.amount) > 0 && Number(p.at) > r.endedAt))
        const owned = cards.filter(belongs)
        const existing = owned.find(j => j.recovery?.campaignId === input.campaignId)
        if (existing) {
          token = existing.token
          if (existing.recovery.planId !== r.planId || existing.recovery.amount !== r.amount || normalizePhone(existing.phone) !== r.phone) throw Error('campaign_conflict')
          if (existing.paid) { results.push({ ...summary, status: 'already_paid' }); continue }
          const state = existing.recovery.delivery?.state
          if (['delivered', 'sending', 'delivery_unknown'].includes(state)) {
            results.push({ ...summary, status: state === 'delivered' ? 'already_sent' : 'delivery_unknown' }); continue
          }
        }
        const paidAgain = owned.some(j => j.paid && (j.payments || []).some(p => !p.estimated && Number(p.amount) > 0 && Number(p.at) > r.endedAt))
        if (paidAgain) { results.push({ ...summary, status: 'already_paid_after_snapshot' }); continue }
        const person = await telegram('getChat', { chat_id: Number(r.telegramId) })
        if (person?.type !== 'private' || String(person.id) !== r.telegramId) throw Error('recipient_not_verified')
        if (paymentExists()) { results.push({ ...summary, status: 'already_paid_after_snapshot' }); continue }
        if (!send) { results.push({ ...summary, status: 'preview', text: recoveryMessage(r) }); continue }
        if (!token) {
          token = create({ tariffId: r.tariffId, name: r.name, phone: r.phone, telegram: person.username ? '@' + person.username : '' })
          patch(token, { tgUserId: r.telegramId, recovery: { campaignId: input.campaignId, planId: r.planId,
            amount: r.amount, months: r.months, createdAt: now(), supersedes: owned.filter(j => j.paid && !j.lifetime).map(j => j.token) } })
        }
        if (!get(token).recovery.graceGrantedAt) {
          const at = now(), until = at + graceDays() * 86400000
          for (const oldToken of get(token).recovery.supersedes) {
            const old = get(oldToken)
            if (old?.paid && !old.lifetime) patch(oldToken, { recoveryAccessUntil: Math.max(Number(old.recoveryAccessUntil) || 0, until),
              recoveryStopIntent: { campaignId: input.campaignId, token, planId: r.planId, requestedAt: at }, accessClosedFor: undefined, accessClosedAt: undefined })
          }
          update(token, { graceGrantedAt: at, graceUntil: until })
          addTag(r.telegramId, 'восстановление_ожидается')
        }
        if (!get(token).recovery.providerStoppedAt) {
          stage = 'provider_stop'
          if (!r.providerCompleted && !await stopProvider(r)) throw Error('provider_stop_unconfirmed')
          update(token, { providerStoppedAt: r.providerCompleted ? r.endedAt : now(), providerStopSource: r.providerCompleted ? 'owner_reviewed_completion' : 'provider_api' })
          for (const oldToken of get(token).recovery.supersedes) {
            const old = get(oldToken)
            const oldPlan = old?.retentionPrice?.confirmedAt ? old.retentionPrice.subscriptionId
              : [...(old?.payments || [])].reverse().find(p => p.subscriptionId && !p.estimated)?.subscriptionId
            if (String(oldPlan) === r.planId || (!oldPlan && get(token).recovery.supersedes.length === 1)) patch(oldToken, { status: 'cancelled', recoveryProviderStoppedAt: now() })
          }
        }
        if (!get(token).recovery.url) {
          stage = 'payment_link'
          const url = await checkout(r, get(token))
          if (!/^https:\/\//.test(url)) throw Error('invalid_payment_url')
          update(token, { url, linkReadyAt: now() })
        }
        if (get(token).paid || paymentExists()) { results.push({ ...summary, status: 'already_paid' }); continue }
        stage = 'telegram_send'
        update(token, { delivery: { state: 'sending', attemptedAt: now() } })
        try {
          const sent = await telegram('sendMessage', { chat_id: Number(r.telegramId), text: recoveryMessage(r),
            reply_markup: { inline_keyboard: [[{ text: 'Восстановить подписку', url: get(token).recovery.url }], [{ text: 'Поддержка', callback_data: 'u:support' }]] } })
          if (!sent?.message_id) throw Error('message_not_confirmed')
          update(token, { delivery: { state: 'delivered', sentAt: now(), messageId: sent.message_id } })
          results.push({ ...summary, status: 'sent', temporaryAccessUntil: get(token).recovery.graceUntil })
        } catch (error) {
          const state = error.definitelyNotSent ? 'send_failed' : 'delivery_unknown'
          update(token, { delivery: { state, attemptedAt: now() } })
          results.push({ ...summary, status: state })
        }
      } catch {
        if (token && get(token)?.recovery) update(token, { lastFailureStage: stage })
        results.push({ ...summary, status: 'blocked', stage })
      } finally { busy.delete(r.telegramId) }
    }
    return { campaignId: input.campaignId, sent: results.filter(r => r.status === 'sent').length, results }
  }
}

/** Resolve the exact new card before matching a reused old provider profile. */
export function resolveRecoveryPayment(body, joins, paidAt) {
  const marker = String(body.customer_extra || '').match(/(?:^|\s\|\s)KY_RESTART:([a-f0-9]{24})(?:\s\||$)/)?.[1]
  const amount = Number(body.sum), planId = String(body.subscription?.id || '')
  const tg = String(body.tg_user_id || ''), phone = normalizePhone(body.customer_phone || body.phone)
  const matches = (join, exactAmount = true) => {
    const r = join.recovery
    return r && r.linkReadyAt && String(r.planId) === planId && amount > 0 && (!exactAmount || r.amount === amount) && paidAt >= r.createdAt - 60000 &&
      (tg ? tg === String(join.tgUserId) : phone && phone === normalizePhone(join.phone))
  }
  if (marker) {
    const join = joins.find(j => j.token === marker)
    return matches(join || {}, false) ? { join, isFirst: !join.paid, amountNeedsReview: amount !== join.recovery.amount } : null
  }
  const candidates = joins.filter(j => !j.paid && matches(j))
  return candidates.length === 1 ? { join: candidates[0], isFirst: true } : null
}
