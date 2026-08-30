// Генерация подписанных ссылок на оплату подписки сообщества (клубная
// система Prodamus). Формат ссылки и параметры — из официальной статьи
// «Создание ссылки с автоплатежом» (help.prodamus.ru), подпись — через
// hmac.js (проверено на реальных ссылках клубной системы, все совпали).
import { HmacHelper } from './hmac.js'

const PAYFORM_DOMAIN = process.env.PRODAMUS_DOMAIN || 'legalcareerist.payform.ru'
const SECRET_KEY = process.env.PRODAMUS_SECRET_KEY
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'

// ID подписок в клубной системе Prodamus — заведены вручную в личном
// кабинете, совпадают с тарифами на странице /community.
const TARIFFS = {
  '1m': { subscription: 2854597, price: 690, label: 'Подписка на сообщество 1 месяц' },
  '3m': { subscription: 3005286, price: 1770, label: 'Подписка на сообщество 3 месяца' },
  '6m': { subscription: 3005289, price: 3180, label: 'Подписка на сообщество 6 месяцев' },
}

/**
 * Строит подписанную ссылку на оплату подписки.
 * tgUserId обязателен для идентификации клиента при последующем
 * управлении подпиской (setActivity и т.д.) — без него Prodamus не
 * свяжет оплату с конкретным Telegram-пользователем для наших целей.
 */
export function buildSubscriptionLink({ tariffId, tgUserId, phone, email, urlSuccess }) {
  const tariff = TARIFFS[tariffId]
  if (!tariff) throw new Error(`unknown tariff: ${tariffId}`)
  if (!SECRET_KEY) throw new Error('PRODAMUS_SECRET_KEY not set')
  if (!tgUserId && !phone && !email) throw new Error('need tg_user_id, phone or email to identify customer')

  const data = {
    do: 'link',
    subscription: tariff.subscription,
    customer_extra: tariff.label,
    urlNotification: `${SITE_URL}/api/prodamus/webhook`,
  }
  if (tgUserId) data.tg_user_id = tgUserId
  if (phone) data.customer_phone = phone
  if (email) data.customer_email = email
  if (urlSuccess) data.urlSuccess = urlSuccess

  data.signature = HmacHelper.create(data, SECRET_KEY)

  const qs = new URLSearchParams(data).toString()
  return `https://${PAYFORM_DOMAIN}/?${qs}`
}

/**
 * do=link не отдаёт саму страницу оплаты, а возвращает короткую ссылку на
 * неё простым текстом (например, https://payform.ru/76cqQZ7/) — поэтому
 * ходим по сгенерированной ссылке на сервере и отдаём на сайт уже готовый
 * адрес, куда можно сразу редиректить браузер.
 */
export async function createPaymentLink(params) {
  const linkRequestUrl = buildSubscriptionLink(params)
  const res = await fetch(linkRequestUrl)
  const text = (await res.text()).trim()
  if (!res.ok || !text.startsWith('http')) {
    throw new Error(`prodamus do=link ответил неожиданно: ${res.status} ${text.slice(0, 200)}`)
  }
  return text
}

/** Обратный поиск: по ID подписки Prodamus (из вебхука) — наш tariffId. */
export function tariffIdBySubscriptionId(subscriptionId) {
  const entry = Object.entries(TARIFFS).find(([, t]) => String(t.subscription) === String(subscriptionId))
  return entry?.[0] ?? null
}

export { TARIFFS }
