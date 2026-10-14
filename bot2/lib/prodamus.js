// Ссылки на оплату подписок и проверка уведомлений Prodamus для второго бота.
// Подпись считается общей библиотекой server/lib/hmac.js (официальный алгоритм Prodamus, проверен на боевых ссылках).
import { HmacHelper } from '../../server/lib/hmac.js'
import { TARIFFS } from './tariffs.js'

const cleanDomain = (v) => String(v ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')

/**
 * Настройки платёжной страницы читаются при каждом вызове, а не при загрузке модуля: так .env можно подгрузить позже,
 * а в тестах подменять значения.
 * PRODAMUS_DOMAIN / PRODAMUS_SECRET_KEY — платёжная страница, на которой заведены подписки (та же, что у основного сайта).
 * BOT2_PUBLIC_URL — публичный адрес второго бота: на него Prodamus присылает уведомления об оплатах.
 */
export function settings(env = process.env) {
  const site = String(env.SITE_URL || 'https://legalcareerist.ru').replace(/\/$/, '')
  const publicUrl = String(env.BOT2_PUBLIC_URL || `${site}/bot2`).replace(/\/$/, '')
  return {
    domain: cleanDomain(env.PRODAMUS_DOMAIN) || 'legalcareerist.payform.ru',
    key: env.PRODAMUS_SECRET_KEY || '',
    publicUrl,
    notificationUrl: `${publicUrl}/api/prodamus/webhook`,
  }
}

/**
 * Подписанная ссылка на оплату подписки (do=link). Человека опознаём по Telegram id (tg_user_id), телефону или почте;
 * имя и ник уходят в customer_extra — Prodamus вернёт их в уведомлении, и по ним оплату можно найти, даже если человек
 * изменил контакты на странице оплаты.
 */
export function buildSubscriptionLink({ tariffId, tgUserId, phone, email, urlSuccess, name, telegram }, env = process.env) {
  const tariff = TARIFFS[tariffId]
  if (!tariff) throw new Error(`unknown tariff: ${tariffId}`)
  const { domain, key, notificationUrl } = settings(env)
  if (!key) throw new Error('PRODAMUS_SECRET_KEY не задан')
  if (!tgUserId && !phone && !email) throw new Error('нужен tg_user_id, телефон или почта плательщика')

  const data = {
    do: 'link',
    subscription: tariff.subscription,
    customer_extra: [tariff.label, name, telegram].filter(Boolean).join(' | '),
    urlNotification: notificationUrl,
  }
  if (tgUserId) data.tg_user_id = String(tgUserId)
  if (phone) data.customer_phone = phone
  if (email) data.customer_email = email
  if (urlSuccess) data.urlSuccess = urlSuccess
  data.signature = HmacHelper.create(data, key)
  return `https://${domain}/?${new URLSearchParams(data).toString()}`
}

/** Короткая ссылка на страницу оплаты: do=link отвечает ею простым текстом, поэтому ходим по ссылке с сервера. */
export async function createPaymentLink(params, env = process.env, fetchImpl = fetch) {
  const res = await fetchImpl(buildSubscriptionLink(params, env), { signal: AbortSignal.timeout(20000) })
  const text = (await res.text()).trim()
  if (!res.ok || !text.startsWith('http')) throw new Error(`Prodamus do=link ответил неожиданно: ${res.status} ${text.slice(0, 200)}`)
  return text
}

/** Подпись уведомления верна? sign — заголовок Sign (или поле signature в теле). */
export function verifyWebhook(body, sign, env = process.env) {
  const { key } = settings(env)
  return Boolean(key && sign && HmacHelper.verify(body, key, sign))
}
