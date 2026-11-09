import { normalizePhone } from './jsonStore.js'
import { paidUntil } from './subscriptionAccess.js'
import { sameSubscriber } from './accessExpiry.js'
import { HISTORICAL_PLANS } from './subscriptionPricing.js'

const username = value => String(value || '').trim().replace(/^@/, '').toLowerCase()
export function offboardingRecipient(value) {
  const phone = normalizePhone(value.phone), handle = username(value.username)
  if (!/^7\d{10}$/.test(phone) || !/^[a-z][a-z0-9_]{4,31}$/.test(handle)) throw Error('invalid_recipient')
  const telegramId = String(value.telegramId ?? '')
  if (telegramId && (!/^\d{5,16}$/.test(telegramId) || !Number.isSafeInteger(Number(telegramId)))) throw Error('invalid_telegram_id')
  if (value.providerPlanIds !== undefined && !Array.isArray(value.providerPlanIds)) throw Error('invalid_provider_plans')
  const providerPlanIds = [...new Set((value.providerPlanIds || []).map(String))]
  if (providerPlanIds.length > 8 || providerPlanIds.some(id => !Object.hasOwn(HISTORICAL_PLANS, id))) throw Error('invalid_provider_plans')
  return { phone, username: handle, telegramId, providerPlanIds, reconcileAbsent: value.reconcileAbsent === true, providerCompleted: value.providerCompleted === true, name: String(value.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 100) }
}

export function resolveOffboardingRecipient(recipient, joins, users) {
  const phoneRecords = [...joins, ...users].filter(j => normalizePhone(j.phone) === recipient.phone)
  const id = j => String(j.tgUserId || j.id || '')
  const phoneIds = new Set(phoneRecords.map(id).filter(Boolean))
  const aliasIds = new Set([...joins, ...users].filter(j => username(j.username || j.telegram) === recipient.username).map(id).filter(Boolean))
  // An imported user may lack a phone; the service still verifies the current username in Telegram.
  if (!phoneRecords.length && !aliasIds.size && !recipient.telegramId) throw Error('phone_not_found')
  const candidates = new Set([...phoneIds, ...aliasIds, ...(recipient.telegramId ? [recipient.telegramId] : [])])
  if (candidates.size !== 1 || !/^\d{5,16}$/.test([...candidates][0]) || !Number.isSafeInteger(Number([...candidates][0]))) throw Error('identity_ambiguous')
  return [...candidates][0]
}

export function offboardingMessage(r) {
  if (r.billingUnverified) return (r.name ? r.name + ', здравствуйте!' : 'Здравствуйте!') + '\n\nСейчас вас нет в закрытом чате сообщества. Будем рады видеть вас снова!\n\nДля вас закрепили предложение: 500 ₽ в месяц для последующих продлений, в том числе после перерыва.\n\nПеред новой оплатой нам нужно проверить статус прежнего автопродления. Напишите в поддержку по кнопке ниже — мы сверим подписку и поможем вернуться по этой цене. Если вы уже оплатили, повторно платить не нужно.'
  if (r.alreadyAbsent) return (r.name ? r.name + ', здравствуйте!' : 'Здравствуйте!') + '\n\nПрежнее автопродление завершено. Будем рады видеть вас снова в сообществе!\n\nДля вас доступна персональная подписка за 500 ₽ в месяц. Эта цена сохраняется для последующих продлений, в том числе после перерыва.\n\nНажмите кнопку ниже, чтобы оформить подписку. Новый оплаченный период начнётся с момента успешной оплаты. На странице Prodamus проверьте условия ежемесячного автопродления. После подтверждения оплаты бот пришлёт ссылку для вступления в чат.\n\nЕсли вы уже оплатили, повторно платить не нужно — напишите в поддержку.'
  return `${r.name ? r.name + ', здравствуйте!' : 'Здравствуйте!'}\n\nСрок доступа к сообществу закончился, поэтому доступ к закрытому чату сейчас закрыт.\n\nБудем рады видеть вас снова! Для вас доступна подписка за 500 ₽ в месяц. Эта цена закрепляется за вами для последующих продлений, в том числе при возвращении после перерыва.\n\nНовый оплаченный период начнётся с момента успешной оплаты. На странице Prodamus вы сможете проверить условия и подтвердить ежемесячное автопродление. После подтверждения оплаты бот восстановит доступ и пришлёт ссылку для вступления.\n\nЕсли вы уже оплатили, повторно платить не нужно — напишите в поддержку.`
}

// All writes happen in the API process. Checkpoints survive retries and PM2 restarts.
export function createOffboardingService({ list, users, get, create, patch, telegram, chatId, stopProvider, checkout, closeUser, restoreAccess, now = Date.now }) {
  const busy = new Set()
  const update = (token, fields) => patch(token, { recovery: { ...get(token).recovery, ...fields } })
  return async function offboard(input, execute = false) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(input?.campaignId || '') || !Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > 10) throw Error('invalid_campaign')
    const recipients = input.recipients.map(offboardingRecipient)
    if (new Set(recipients.map(r => r.phone)).size !== recipients.length) throw Error('duplicate_recipient')
    const results = []
    for (const recipient of recipients) {
      let token, telegramId, stage = 'identity', locked = false
      const held = new Set()
      const summary = { name: recipient.name, username: '@' + recipient.username, amount: 500, months: 1 }
      if (recipient.providerPlanIds.length) summary.previousProviderPlans = recipient.providerPlanIds
      try {
        telegramId = resolveOffboardingRecipient(recipient, list(), users())
        summary.telegramId = telegramId
        if (busy.has(telegramId)) { results.push({ ...summary, status: 'busy' }); continue }
        busy.add(telegramId); locked = true
        const belongs = j => String(j.tgUserId || '') === telegramId || (!j.tgUserId && normalizePhone(j.phone) === recipient.phone)
        const owned = () => list().filter(belongs)
        // Also protect paid rights attached to a shared phone/email or another card.
        const protectedReason = () => {
          const related = list().filter(j => belongs(j) || owned().some(o => sameSubscriber(o, j)))
          if (related.some(j => j.lifetime)) return 'lifetime_access'
          if (related.some(j => j.paid && paidUntil(j) === null)) return 'paid_date_unknown'
          if (related.some(j => j.paid && paidUntil(j) > now())) return 'paid_access_remaining'
          return null
        }
        let reason = protectedReason()
        if (reason) { results.push({ ...summary, status: 'protected', reason }); continue }
        stage = 'membership'
        const member = await telegram('getChatMember', { chat_id: chatId, user_id: Number(telegramId) })
        if (String(member?.user?.id) !== telegramId || username(member.user.username) !== recipient.username) throw Error('live_identity_mismatch')
        if (['creator', 'administrator'].includes(member.status)) { results.push({ ...summary, status: 'protected', reason: 'chat_administrator' }); continue }
        if (!['member', 'restricted', 'left', 'kicked'].includes(member.status)) throw Error('membership_unknown')
        reason = protectedReason()
        if (reason) { results.push({ ...summary, status: 'protected', reason }); continue }
        const oldCards = owned().filter(j => j.paid)
        const alreadyAbsent = !oldCards.length && recipient.reconcileAbsent && member.status === 'left'
        const billingUnverified = alreadyAbsent && !recipient.providerCompleted
        if (!oldCards.length && !alreadyAbsent) throw Error('paid_history_not_found')
        if (alreadyAbsent) summary.providerCancellation = billingUnverified ? 'not_verified' : 'owner_confirmed_completed'
        const existing = owned().find(j => j.recovery?.campaignId === input.campaignId)
        if (existing) {
          token = existing.token
          if (existing.recovery.operation !== 'offboard' || existing.recovery.planId !== '2611880' || existing.recovery.amount !== 500) throw Error('campaign_conflict')
          if (Boolean(existing.recovery.billingUnverified) !== billingUnverified) throw Error('campaign_conflict')
          const state = existing.recovery.delivery?.state
          if (['delivered', 'sending', 'delivery_unknown'].includes(state)) {
            results.push({ ...summary, status: state === 'delivered' ? (billingUnverified ? 'already_absent_already_sent' : 'already_sent') : 'delivery_unknown' }); continue
          }
        }
        if (!execute) { results.push({ ...summary, status: 'preview', text: offboardingMessage({ ...recipient, billingUnverified, alreadyAbsent }) }); continue }
        const r = { ...recipient, billingUnverified, alreadyAbsent, telegramId, planId: '2611880', amount: 500, months: 1, tariffId: '1m' }
        if (!token) {
          token = create({ name: recipient.name || member.user.first_name || '', phone: recipient.phone, telegram: '@' + recipient.username, tariffId: '1m' })
          patch(token, { tgUserId: telegramId, recovery: { operation: 'offboard', campaignId: input.campaignId, planId: r.planId, amount: 500, months: 1,
            createdAt: now(), supersedes: oldCards.map(j => j.token), graceGrantedAt: now(), graceUntil: now(), ...(billingUnverified ? { billingUnverified: true } : {}),
            ...(alreadyAbsent && recipient.providerCompleted ? { providerCompletionConfirmedAt: now(), providerCompletionSource: 'owner' } : {}) } })
        }
        // Hold the generic expiry notice while the specific operation runs; this grants no access.
        for (const old of oldCards) {
          held.add(old.token)
          patch(old.token, { offboardingHoldUntil: now() + 5 * 60000,
            recoveryStopIntent: { campaignId: input.campaignId, token, requestedAt: now() } })
        }
        held.add(token)
        patch(token, { offboardingHoldUntil: now() + 5 * 60000 })
        if (r.providerPlanIds.length && !get(token).recovery.providerStoppedAt) update(token, { previousProviderPlanIds: r.providerPlanIds })
        stage = 'provider_stop'
        let ownerConfirmedOld = false
        for (const old of oldCards) {
          if (protectedReason()) break
          const current = get(old.token)
          if (current.status === 'cancelled' && (current.cancellation?.confirmed || current.recoveryProviderStoppedAt)) continue
          const recordedIds = new Set((current.payments || []).filter(p => !p.estimated).map(p => p.subscriptionId).filter(Boolean).map(String))
          if (current.retentionPrice?.confirmedAt && current.retentionPrice.subscriptionId) recordedIds.add(String(current.retentionPrice.subscriptionId))
          if (current.priceLock?.source === 'owner_approved_recovery_terms' && current.priceLock.subscriptionId) recordedIds.add(String(current.priceLock.subscriptionId))
          const completedByOwner = r.providerCompleted && r.providerPlanIds.length > 0 && (recordedIds.size ? [...recordedIds].every(id => r.providerPlanIds.includes(id)) : oldCards.length === 1)
          if (!completedByOwner && !await stopProvider(current, r)) throw Error('provider_stop_unconfirmed')
          if (completedByOwner) ownerConfirmedOld = true
          // A payment during the API call still retains its paid rights.
          patch(old.token, { status: 'cancelled', recoveryProviderStoppedAt: now(), recoveryProviderStopSource: completedByOwner ? 'owner_confirmed_completion' : 'provider_check' })
        }
        reason = protectedReason()
        if (reason) { results.push({ ...summary, status: 'protected', reason }); continue }
        if (ownerConfirmedOld) {
          update(token, { providerCompletionConfirmedAt: now(), providerCompletionSource: 'owner', providerCompletionPlanIds: r.providerPlanIds })
          summary.providerCancellation = 'owner_confirmed_completed'
        }
        if (oldCards.length) update(token, { providerStoppedAt: now() })
        stage = 'payment_link'
        if (!billingUnverified && !get(token).recovery.url) {
          const url = await checkout(r, get(token))
          if (!/^https:\/\//.test(url)) throw Error('invalid_payment_url')
          update(token, { url, linkReadyAt: now() })
        }
        reason = protectedReason()
        if (reason) { results.push({ ...summary, status: 'protected', reason }); continue }
        // Close complimentary time for this old paid interval only; never rewrite paid dates.
        for (const old of oldCards) patch(old.token, { manualAccessClosedFor: paidUntil(get(old.token)) })
        stage = 'telegram_remove'
        const inChat = member.status === 'member' || (member.status === 'restricted' && member.is_member !== false)
        if (inChat) {
          patch(token, { accessUnbanPending: true }) // repair even after an ambiguous network response
          const removed = await telegram('banChatMember', { chat_id: chatId, user_id: Number(telegramId) })
          if (removed !== true) throw Error('removal_unconfirmed')
          update(token, { removedAt: now() })
        }
        stage = 'telegram_unban'
        if (member.status === 'kicked' || get(token).accessUnbanPending) {
          const unbanned = await telegram('unbanChatMember', { chat_id: chatId, user_id: Number(telegramId), only_if_banned: true })
          if (unbanned !== true) throw Error('unban_unconfirmed')
          patch(token, { accessUnbanPending: undefined })
        }
        // A webhook can arrive while Telegram is removing a user. Restore the paid invite.
        reason = protectedReason()
        if (reason) {
          for (const card of owned()) patch(card.token, { inChat: false })
          await restoreAccess(telegramId)
          results.push({ ...summary, status: 'paid_during_removal', reason }); continue
        }
        for (const card of owned()) patch(card.token, { inChat: false, ...(card.paid ? { accessClosedFor: paidUntil(card), accessClosedAt: now(), leftAt: now() } : {}) })
        closeUser(telegramId, now())
        update(token, { closedAt: now() })
        stage = 'telegram_send'
        update(token, { delivery: { state: 'sending', attemptedAt: now() } })
        try {
          const sent = await telegram('sendMessage', { chat_id: Number(telegramId), text: offboardingMessage(r), reply_markup: { inline_keyboard: [
            ...(!billingUnverified ? [[{ text: 'Вернуться за 500 ₽ в месяц', url: get(token).recovery.url }]] : []), [{ text: 'Поддержка', callback_data: 'u:support' }],
          ] } })
          if (!sent?.message_id) throw Error('message_not_confirmed')
          update(token, { delivery: { state: 'delivered', sentAt: now(), messageId: sent.message_id } })
          results.push({ ...summary, status: alreadyAbsent ? (billingUnverified ? 'already_absent_offer_sent' : 'already_absent_link_sent') : 'removed_and_sent', accessClosed: true })
        } catch (error) {
          const state = error.definitelyNotSent ? 'send_failed' : 'delivery_unknown'
          update(token, { delivery: { state, attemptedAt: now() } })
          results.push({ ...summary, status: state, accessClosed: true })
        }
      } catch (error) {
        if (error.message === 'provider_plan_unknown') {
          for (const oldToken of held) {
            const old = get(oldToken)
            if (old?.paid && !old.recoveryProviderStoppedAt && old.recoveryStopIntent?.token === token) patch(oldToken, { recoveryStopIntent: undefined })
          }
        }
        if (token) update(token, { lastFailureStage: stage })
        results.push({ ...summary, status: 'blocked', stage, reason: /^[a-z_]+$/.test(error.message) ? error.message : 'external_operation_failed' })
      } finally {
        if (locked) {
          for (const heldToken of held) patch(heldToken, { offboardingHoldUntil: undefined })
          busy.delete(telegramId)
        }
      }
    }
    return { campaignId: input.campaignId, sent: results.filter(r => ['removed_and_sent', 'already_absent_offer_sent', 'already_absent_link_sent'].includes(r.status)).length, results }
  }
}
