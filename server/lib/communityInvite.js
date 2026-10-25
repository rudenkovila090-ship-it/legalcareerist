// Персональная одноразовая ссылка на вступление в закрытый чат сообщества. Ссылку выдаём каждому оплатившему отдельно: в Telegram
// это ссылка с одобрением заявок (creates_join_request) и именем = токен карточки подписки. Когда человек подаёт заявку, в ней приходит
// это имя, и бот по нему привязывает Telegram к оплаченной подписке (даже если человек ни разу не нажимал Start), одобряет заявку
// и отзывает ссылку. Здесь только чистая логика (тестируется без Telegram); сами запросы к Telegram — в server/index.js.

export const INVITE_TTL_DAYS = 7
export const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 3600 * 1000
/** Если до конца срока ссылки осталось меньше, при следующем показе выдаём новую: человек не должен получить почти истёкшую. */
export const INVITE_MIN_LEFT_MS = 12 * 3600 * 1000

const TOKEN_RE = /^[0-9a-f]{24}$/

/** Выданная и ещё годная ссылка в карточке: { url, expiresAt } или null. */
export function currentInvite(join, now = Date.now()) {
  if (!join?.inviteUrl || !join.inviteExpiresAt) return null
  return join.inviteExpiresAt - now >= INVITE_MIN_LEFT_MS ? { url: join.inviteUrl, expiresAt: join.inviteExpiresAt } : null
}

const nick = (v) => String(v ?? '').trim().replace(/^@/, '').toLowerCase()

/**
 * Что делать с заявкой на вступление. Вход: имя ссылки (токен карточки или пусто — общая ссылка), Telegram-аккаунт подавшего,
 * поиск карточки по токену, поиск резидента по Telegram id и проверка «подписка в силе».
 * Результат: { action, join, bind, viaLink, nickMismatch }
 *   approve — одобрить; bind — сначала привязать Telegram к карточке;
 *   decline — отклонить (reason: unpaid | expired | foreign), join — чья это ссылка;
 *   unpaid — оплаты не нашли (заявку не трогаем, админу сообщение, как раньше).
 */
export function decideJoinRequest({ inviteName, from, getJoin, residentByTelegramId, hasAccess }) {
  const uid = String(from?.id ?? '')
  if (inviteName && TOKEN_RE.test(inviteName)) {
    const join = getJoin(inviteName)
    if (join) {
      if (!join.paid) return { action: 'decline', reason: 'unpaid', join }
      if (!hasAccess(join)) return { action: 'decline', reason: 'expired', join }
      if (join.tgUserId && String(join.tgUserId) !== uid) return { action: 'decline', reason: 'foreign', join }
      // Ник из заявки на сайте и в Telegram мог не совпасть из-за опечатки: заявку одобряем, но админу об этом скажем.
      const nickMismatch = Boolean(!join.tgUserId && nick(join.telegram) && nick(from?.username) && nick(join.telegram) !== nick(from.username))
      return { action: 'approve', join, bind: !join.tgUserId, viaLink: true, nickMismatch }
    }
  }
  const resident = residentByTelegramId(uid)
  if (resident && hasAccess(resident)) return { action: 'approve', join: resident, bind: false, viaLink: false, nickMismatch: false }
  return { action: 'unpaid', join: resident ?? null }
}
