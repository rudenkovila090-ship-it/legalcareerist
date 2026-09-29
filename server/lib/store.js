// Участники сообщества: token → { tariffId, name, phone, email, telegram,
// tgUserId, paid, status, payments[], firstPaidAt, lastPaidAt, nextPaymentAt,
// createdAt }. Запись появляется в момент "выбрал тариф на сайте", живёт
// дальше как карточка подписчика: сюда же пишется каждая оплата (первая и
// продления), от этого считаются отчёты, кабинеты и напоминания.
import { createJsonStore, normalizePhone } from './jsonStore.js'

const store = createJsonStore('pending-joins.json')

/** Ник в Telegram без "@" и в нижнем регистре — для сравнения. */
function normalizeTelegramKey(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase()
}

export function createPendingJoin({ tariffId, name, phone, email, telegram }) {
  return store.create({ tariffId, name, phone, email, telegram, tgUserId: null, status: 'pending' })
}

/**
 * Оплата, которая пришла от Prodamus, но для которой нет заявки с сайта
 * (человек оплатил по ссылке напрямую или сменил телефон на странице
 * оплаты) — заводим карточку по данным из вебхука, чтобы платёж не потерялся.
 */
export function createOrphanJoin({ tariffId, name, phone, email, telegram }) {
  return store.create({ tariffId, name: name || '—', phone, email, telegram: telegram || '', tgUserId: null, status: 'pending', orphan: true })
}

export function setTgUserId(token, tgUserId) {
  return store.setField(token, 'tgUserId', tgUserId)
}

export function getJoin(token) {
  const join = store.get(token)
  return join ? { token, ...join } : null
}

export function listJoins() {
  return store.all()
}

/**
 * Находит карточку, к которой относится платёж из вебхука. Порядок такой:
 * сначала неоплаченные (это первая оплата), потом уже оплаченные (это
 * продление); внутри — сначала по телефону, потом по почте, потом по нику
 * в Telegram (его мы передаём в customer_extra — спасает, когда на
 * странице оплаты человек изменил телефон и почту); среди совпадений
 * берётся самая свежая. Если тариф известен, он тоже должен совпасть —
 * иначе продление 1 месяца можно принять за оплату новой заявки на
 * 3 месяца с того же номера.
 */
export function findJoinForPayment({ phone, email, telegram, tgUserId, profileId, tariffId }) {
  // profile_id — постоянный номер подписчика в Prodamus, одинаков во всех его
  // платежах: самый надёжный ключ для продлений.
  if (profileId) {
    const byProfile = store.all().find((j) => String(j.prodamusProfileId ?? '') === String(profileId))
    if (byProfile) return { join: byProfile, isFirst: !byProfile.paid }
  }

  const phoneKey = normalizePhone(phone)
  const emailKey = String(email ?? '').trim().toLowerCase()
  const telegramKey = normalizeTelegramKey(telegram)
  const joins = store.all().sort((a, b) => b.createdAt - a.createdAt)
  const sameTariff = (j) => !tariffId || j.tariffId === tariffId
  const byPhone = (j) => phoneKey && normalizePhone(j.phone) === phoneKey
  const byEmail = (j) => emailKey && String(j.email ?? '').trim().toLowerCase() === emailKey
  const byTelegram = (j) => telegramKey && normalizeTelegramKey(j.telegram) === telegramKey
  const byTgUser = (j) => tgUserId && String(j.tgUserId ?? '') === String(tgUserId)

  for (const paid of [false, true]) {
    for (const matches of [byPhone, byEmail, byTelegram, byTgUser]) {
      const join = joins.find((j) => Boolean(j.paid) === paid && sameTariff(j) && matches(j))
      if (join) return { join, isFirst: !paid }
    }
  }
  return null
}

/**
 * Записывает оплату в карточку. Возвращает { duplicate, kind, number, record }:
 * kind — "first" (первая оплата) или "renewal" (продление), number — номер
 * платежа по счёту. Повторный вебхук с тем же orderKey (Prodamus может
 * прислать уведомление дважды) второй раз не учитывается.
 */
export function recordPayment(token, { tariffId, amount, paidAt, orderKey, nextPaymentAt, profileId, tgUserId, paymentNum }) {
  let result = null
  store.update(token, (join) => {
    const payments = Array.isArray(join.payments) ? [...join.payments] : []
    // Карточки, оплаченные до появления учёта платежей, не хранят историю —
    // считаем, что первая оплата была в момент создания заявки.
    if (!payments.length && join.paid) {
      payments.push({ kind: 'first', at: join.createdAt, amount: null, tariffId: join.tariffId, orderKey: null, estimated: true })
    }
    if (orderKey && payments.some((p) => p.orderKey === orderKey)) {
      result = { duplicate: true, record: { token, ...join } }
      return join
    }

    // payment_num из Prodamus — номер платежа по подписке (1 — первый); он
    // точнее нашего счёта, если подписка началась ещё до учёта на сайте.
    const kind = paymentNum ? (paymentNum > 1 ? 'renewal' : 'first') : payments.length === 0 ? 'first' : 'renewal'
    payments.push({ kind, at: paidAt, amount, tariffId, orderKey: orderKey ?? null, paymentNum: paymentNum ?? null })
    const next = {
      ...join,
      ...(profileId ? { prodamusProfileId: String(profileId) } : {}),
      ...(tgUserId && !join.tgUserId ? { tgUserId } : {}),
      paid: true,
      status: 'active',
      payments,
      firstPaidAt: join.firstPaidAt ?? paidAt,
      lastPaidAt: paidAt,
      nextPaymentAt,
    }
    result = { duplicate: false, kind, number: paymentNum || payments.length, record: { token, ...next } }
    return next
  })
  return result
}

/**
 * Отмечает подписку отключённой/включённой (по флагам active_user /
 * active_manager из блока subscription в вебхуках Prodamus). changed=true
 * только если статус реально поменялся — чтобы не слать админу одно и то
 * же уведомление на каждый вебхук.
 */
export function setSubscriptionActive(token, active, at) {
  let result = null
  store.update(token, (join) => {
    const status = active ? 'active' : 'cancelled'
    if (join.status === status || (!join.paid && !active)) {
      result = { changed: false, record: { token, ...join } }
      return join
    }
    const next = { ...join, status, ...(active ? {} : { cancelledAt: at }) }
    result = { changed: true, record: { token, ...next } }
    return next
  })
  return result
}
