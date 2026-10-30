// Ссылка на вступление в закрытый чат сообщества: одна общая ссылка с одобрением заявок (COMMUNITY_INVITE_LINK в server/.env).
// Нажать её может кто угодно, но заявку одобряет бот и только оплатившим, поэтому ссылку не нужно прятать или выпускать каждому отдельно.
// Человека в заявке опознаём по Telegram id (подписка уже привязана к боту: Start, /start access_…, прошлое вступление) или, если бота он не
// запускал, по нику Telegram, который он указал при оплате на сайте. Здесь только чистая логика (проверяется без Telegram).

/** Общая ссылка на вступление или пустая строка, если не задана. Читается при каждом обращении: после правки .env хватит перезапуска. */
export const communityInviteUrl = () => String(process.env.COMMUNITY_INVITE_LINK ?? '').trim()

const nick = (v) => String(v ?? '').trim().replace(/^@/, '').toLowerCase()

/**
 * Что делать с заявкой на вступление. Вход: Telegram-аккаунт подавшего, поиск резидента по Telegram id, все карточки подписок и проверка
 * «подписка в силе». Результат: { action, join, bind }
 *   approve — одобрить; bind — сначала привязать Telegram к карточке (нашли по нику с сайта);
 *   unpaid — оплаты не нашли (заявку не трогаем, админу сообщение).
 */
export function decideJoinRequest({ from, residentByTelegramId, joins, hasAccess }) {
  const known = residentByTelegramId(String(from?.id ?? ''))
  if (known && hasAccess(known)) return { action: 'approve', join: known, bind: false }
  const username = nick(from?.username)
  if (username) {
    // Ник с сайта сверяем только с карточками, у которых Telegram ещё не привязан: чужой привязанный аккаунт так не перехватить.
    const byNick = joins
      .filter((j) => j.paid && !j.lifetime && !j.tgUserId && nick(j.telegram) === username && hasAccess(j))
      .sort((a, b) => (b.lastPaidAt ?? b.createdAt ?? 0) - (a.lastPaidAt ?? a.createdAt ?? 0))[0]
    if (byNick) return { action: 'approve', join: byNick, bind: true }
  }
  return { action: 'unpaid', join: known ?? null }
}
