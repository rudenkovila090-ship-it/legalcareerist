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
export function residentStatus(tgId, now = Date.now(), email = '') {
  const mail = String(email ?? '').trim().toLowerCase()
  // подписку находим по Telegram id (карточка привязана к боту) и по подтверждённой почте аккаунта
  const mine = listJoins().filter((j) => j.paid && ((tgId && String(j.tgUserId ?? '') === String(tgId)) || (mail && String(j.email ?? '').trim().toLowerCase() === mail)))
  if (!mine.length) return { status: 'none' }
  const lifetime = mine.find((j) => j.lifetime)
  const endOf = (j) => Math.max(Number(j.nextPaymentAt) || 0, Number(j.endsAt) || 0)
  if (lifetime) {
    return { status: 'lifetime', tariff: 'Основатель — бессрочно', until: lifetime.endsAt ?? null, since: lifetime.startAt ?? lifetime.firstPaidAt ?? lifetime.createdAt, autoRenew: false, cancelled: false, daysLeft: null }
  }
  const best = [...mine].sort((a, b) => endOf(b) - endOf(a))[0]
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
