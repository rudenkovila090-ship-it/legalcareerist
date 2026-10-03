// Генерация подписанных ссылок на оплату подписки сообщества (клубная
// система Prodamus). Формат ссылки и параметры — из официальной статьи
// «Создание ссылки с автоплатежом» (help.prodamus.ru), подпись — через
// hmac.js (проверено на реальных ссылках клубной системы, все совпали).
import { HmacHelper, flattenForm } from './hmac.js'

const PAYFORM_DOMAIN = process.env.PRODAMUS_DOMAIN || 'legalcareerist.payform.ru'
const SECRET_KEY = process.env.PRODAMUS_SECRET_KEY
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'

// Материалы маркетплейса с настоящей оплатой (не подпиской — разовая
// покупка). Цена и название задаются здесь, а не приходят от клиента —
// иначе можно было бы подделать сумму в запросе с фронтенда.
export const MATERIALS = {
  'longlist-studencheskie-yuridicheskie-meropriyatiya': {
    title: 'Лонглист «Студенческие юридические мероприятия»',
    price: 490,
    accessUrl: process.env.LONGLIST_EVENTS_ACCESS_URL || '',
  },
  'gaid-kariera-yurista-v-notariate': {
    title: 'Гайд «Карьера юриста в нотариате»',
    price: 490,
    accessUrl: process.env.GUIDE_NOTARIAT_ACCESS_URL || '',
  },
  'gaid-stipendii-i-granty': {
    title: 'Гайд «Стипендии и гранты»',
    price: 490,
    accessUrl: process.env.GUIDE_GRANTS_ACCESS_URL || '',
  },
}

// ID подписок в клубной системе Prodamus — заведены вручную в личном
// кабинете, совпадают с тарифами на странице /community.
// months — срок одного периода подписки (для расчёта даты следующего списания).
const TARIFFS = {
  '1m': { subscription: 2854597, price: 690, months: 1, period: '1 месяц', label: 'Подписка на сообщество 1 месяц' },
  '3m': { subscription: 3005286, price: 1770, months: 3, period: '3 месяца', label: 'Подписка на сообщество 3 месяца' },
  '6m': { subscription: 3005289, price: 3180, months: 6, period: '6 месяцев', label: 'Подписка на сообщество 6 месяцев' },
}

/**
 * Строит подписанную ссылку на оплату подписки.
 * tgUserId обязателен для идентификации клиента при последующем
 * управлении подпиской (setActivity и т.д.) — без него Prodamus не
 * свяжет оплату с конкретным Telegram-пользователем для наших целей.
 * name/telegram уходят в customer_extra — это свободное поле, которое
 * видно в кабинете Prodamus и приходит обратно в вебхуке, поэтому по нему
 * можно опознать плательщика, даже если на странице оплаты он изменил
 * телефон или почту.
 */
export function buildSubscriptionLink({ tariffId, tgUserId, phone, email, urlSuccess, name, telegram }) {
  const tariff = TARIFFS[tariffId]
  if (!tariff) throw new Error(`unknown tariff: ${tariffId}`)
  if (!SECRET_KEY) throw new Error('PRODAMUS_SECRET_KEY not set')
  if (!tgUserId && !phone && !email) throw new Error('need tg_user_id, phone or email to identify customer')

  const data = {
    do: 'link',
    subscription: tariff.subscription,
    customer_extra: [tariff.label, name, telegram].filter(Boolean).join(' | '),
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

/**
 * Ссылка на разовую оплату товара (не подписки) — например, материал
 * маркетплейса. Формат — do=link с массивом products, а не subscription;
 * products[N][...] в подписи и в ссылке передаются как вложенная
 * структура, поэтому используем flattenForm для сборки query-строки.
 */
export async function createProductPaymentLink({ materialSlug, phone, email, urlSuccess, tgUserId }) {
  const material = MATERIALS[materialSlug]
  if (!material) throw new Error(`unknown material: ${materialSlug}`)
  return createOneTimeLink({ title: material.title, price: material.price, phone, email, urlSuccess, tgUserId })
}

/**
 * Ссылка на разовую оплату билета на мероприятие. Название и цену задаёт сервер (по каталогу сайта), а не клиент.
 * orderId (наш номер регистрации, например «ev-12») уходит в order_id и customer_extra — Prodamus вернёт его в вебхуке,
 * по нему оплата привязывается к регистрации даже если человек изменил контакты на странице оплаты.
 */
export async function createEventPaymentLink({ title, price, orderId, phone, email, urlSuccess, name }) {
  return createOneTimeLink({ title, price, phone, email, urlSuccess, orderId, customerExtra: [`Мероприятие: ${title}`, name, orderId].filter(Boolean).join(' | ') })
}

async function createOneTimeLink({ title, price, phone, email, urlSuccess, tgUserId, orderId, customerExtra }) {
  if (!SECRET_KEY) throw new Error('PRODAMUS_SECRET_KEY not set')
  if (!phone && !email && !tgUserId) throw new Error('need phone, email or tg_user_id to identify customer')

  const data = {
    do: 'link',
    products: [{ name: title, price, quantity: 1 }],
    urlNotification: `${SITE_URL}/api/prodamus/webhook`,
  }
  if (orderId) data.order_id = orderId
  if (customerExtra) data.customer_extra = customerExtra
  if (tgUserId) data.tg_user_id = tgUserId
  if (phone) data.customer_phone = phone
  if (email) data.customer_email = email
  if (urlSuccess) data.urlSuccess = urlSuccess

  data.signature = HmacHelper.create(data, SECRET_KEY)

  const flat = flattenForm(data)
  const linkRequestUrl = `https://${PAYFORM_DOMAIN}/?${new URLSearchParams(flat).toString()}`

  const res = await fetch(linkRequestUrl)
  const text = (await res.text()).trim()
  if (!res.ok || !text.startsWith('http')) {
    throw new Error(`prodamus do=link (разовая оплата) ответил неожиданно: ${res.status} ${text.slice(0, 200)}`)
  }
  return text
}

/** Обратный поиск: по ID подписки Prodamus (из вебхука) — наш tariffId. */
export function tariffIdBySubscriptionId(subscriptionId) {
  const entry = Object.entries(TARIFFS).find(([, t]) => String(t.subscription) === String(subscriptionId))
  return entry?.[0] ?? null
}

export { TARIFFS }

/**
 * Включает/выключает подписку клиента в Prodamus (setActivity). subscription — ID подписки (тарифа), клиент
 * определяется по Telegram id (или телефону/почте). Возвращает { ok, status, raw }: формат ответа Prodamus мы
 * проверяем по факту, поэтому сырой ответ отдаём вызывающему — админу он показывается в уведомлении.
 */
export async function setSubscriptionActivity({ subscriptionId, tgUserId, phone, email, active }) {
  if (!SECRET_KEY) throw new Error('PRODAMUS_SECRET_KEY not set')
  const data = { subscription: String(subscriptionId), active_user: active ? '1' : '0' }
  if (tgUserId) data.tg_user_id = String(tgUserId)
  else if (phone) data.customer_phone = phone
  else if (email) data.customer_email = email
  data.signature = HmacHelper.create(data, SECRET_KEY)
  const res = await fetch(`https://${PAYFORM_DOMAIN}/rest/setActivity/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
    signal: AbortSignal.timeout(20000),
  })
  const text = (await res.text()).trim()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // ответ не JSON — смотрим по тексту
  }
  const ok = res.ok && (json ? json.success === true || json.success === 1 || json.status === 'success' : /success|ok/i.test(text) && !/error|ошиб/i.test(text))
  return { ok, status: res.status, raw: text.slice(0, 200) }
}
