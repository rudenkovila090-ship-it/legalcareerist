// Данные личного кабинета: кто вошёл и статус подписки резидента (по карточкам подписчиков, привязанным к Telegram id).
import { listJoins } from './store.js'
import { getBotUser } from './botUsers.js'
import { TARIFFS } from './prodamus.js'
import { getProfile } from './accountStore.js'

const DAY = 24 * 3600 * 1000

/**
 * Статус резидента для Telegram id:
 *   lifetime — бессрочный; active — действует (в т. ч. отключено автопродление, но срок не вышел);
 *   ended — срок закончился; none — подписки не было.
 * until — конец оплаченного периода (для бессрочного — условная дата 2045).
 */
/** Карточки подписки человека: по Telegram id (карточка привязана к боту) и по подтверждённой почте аккаунта. */
function myJoins(tgId, email) {
  const mail = String(email ?? '').trim().toLowerCase()
  return listJoins().filter((j) => j.paid && ((tgId && String(j.tgUserId ?? '') === String(tgId)) || (mail && String(j.email ?? '').trim().toLowerCase() === mail)))
}
const endOf = (j) => Math.max(Number(j.nextPaymentAt) || 0, Number(j.endsAt) || 0)

/** Главная карточка подписки человека: бессрочная, иначе та, что заканчивается позже всех. null — подписки не было. */
export function residentJoin(tgId, email = '') {
  const mine = myJoins(tgId, email)
  if (!mine.length) return null
  return mine.find((j) => j.lifetime) ?? [...mine].sort((a, b) => endOf(b) - endOf(a))[0]
}

export function residentStatus(tgId, now = Date.now(), email = '') {
  const best = residentJoin(tgId, email)
  if (!best) return { status: 'none' }
  if (best.lifetime) {
    return { status: 'lifetime', tariff: 'Основатель — бессрочно', until: best.endsAt ?? null, since: best.startAt ?? best.firstPaidAt ?? best.createdAt, autoRenew: false, cancelled: false, daysLeft: null }
  }
  const until = endOf(best) || null
  const active = Boolean(until && until > now)
  const cancelled = best.status === 'cancelled'
  const tariff = TARIFFS[best.tariffId]?.label ?? best.subscriptionName ?? (best.oneTime ? 'Разовая подписка на 30 дней' : 'Подписка на сообщество')
  return {
    status: active ? 'active' : 'ended',
    tariff,
    until,
    since: best.firstPaidAt ?? best.createdAt ?? null,
    autoRenew: active && !best.oneTime && !cancelled,
    cancelled,
    oneTime: Boolean(best.oneTime),
    daysLeft: active ? Math.ceil((until - now) / DAY) : 0,
  }
}

/**
 * Подписка для раздела «Статус»: то же, что в residentStatus, плюс цена, дата следующего списания и история оплат (новые сверху).
 * Внутренний токен карточки не отдаётся.
 */
export function subscriptionDetails(tgId, email = '', now = Date.now()) {
  const status = residentStatus(tgId, now, email)
  const join = residentJoin(tgId, email)
  if (!join) return { ...status, payments: [] }
  const tariff = TARIFFS[join.tariffId]
  const payments = (join.payments ?? [])
    .filter((p) => Number(p.amount) > 0 || p.estimated)
    .map((p) => ({ amount: Number(p.amount) || null, paidAt: Number(p.at ?? p.paidAt) || null, estimated: Boolean(p.estimated) }))
    .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))
    .slice(0, 50)
  const renews = status.status === 'active' && status.autoRenew
  return {
    ...status,
    price: tariff?.price ?? payments.find((p) => p.amount)?.amount ?? null,
    period: tariff?.period ?? null,
    nextPayment: renews ? Number(join.nextPaymentAt) || null : null,
    canCancel: renews && !join.lifetime,
    payments,
  }
}

/** Что показываем вошедшему: имя, роль «клиент сервиса» и подписку. */
export function accountProfile(cfg, now = Date.now()) {
  const bot = cfg.tgId ? getBotUser(cfg.tgId) : null
  const botName = [bot?.firstName, bot?.lastName].filter(Boolean).join(' ')
  return {
    login: cfg.login,
    name: cfg.name || botName || cfg.login,
    role: 'client',
    telegramLinked: Boolean(bot),
    // Привязка Telegram к кабинету (код из бота): у аккаунта резидента её можно сделать и снять, у администратора Telegram задан в настройках сервера.
    telegram: {
      linked: Boolean(cfg.tgId),
      linkedAt: cfg.tgLinkedAt ?? null,
      name: bot ? [bot.firstName, bot.username].filter(Boolean).join(' ') || undefined : undefined,
      canLink: String(cfg.login).startsWith('u:'),
    },
    email: cfg.email || undefined,
    // Личные данные и контакты для раздела «Профиль и контакты» и обзора: почта подтверждена (в кабинет без этого не войти).
    contact: { name: cfg.contactName ?? cfg.name ?? '', email: cfg.email || '', phone: cfg.contactPhone ?? cfg.phone ?? '' },
    memberSince: cfg.createdAt ?? null,
    resident: residentStatus(cfg.tgId, now, cfg.email),
    privacy: { hidden: getProfile(cfg.login).privacy.hidden },
    // Согласия: на обработку и рассылку — из карточки в боте, на профиль кабинета — из самого профиля.
    consents: {
      processingAt: bot?.consentAt ?? cfg.consentAt ?? null,
      profileAt: getProfile(cfg.login).consentAt,
      marketing: typeof bot?.mailingConsent === 'boolean' ? bot.mailingConsent : typeof cfg.marketing === 'boolean' ? cfg.marketing : null,
      marketingAt: bot?.mailingAnsweredAt ?? cfg.marketingAt ?? null,
    },
  }
}
