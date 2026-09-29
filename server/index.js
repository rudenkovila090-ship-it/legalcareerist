// Бэкенд-эндпоинт сайта «Карьерный Юрист».
// 1. POST /api/notify — заявка с сайта → уведомление админу в Telegram.
// 2. POST /api/community/subscribe — выбор тарифа на сайте → подписанная
//    ссылка на оплату в Prodamus (идентификация клиента по телефону, без
//    tg_user_id — на этом шаге человек ещё не открывал бота).
// 3. POST /api/telegram/webhook — апдейты бота @LegalcareeristBot: по
//    /start access_<token> проверяет, оплачена ли заявка, и присылает
//    ссылку на вступление в сообщество (сразу либо как только придёт
//    вебхук об оплате).
// 4. POST /api/marketplace/purchase — покупка материала маркетплейса →
//    подписанная ссылка на разовую оплату (не подписка).
// 5. GET /api/marketplace/purchase/:token — данные для личного кабинета
//    (что купили, оплачено ли, ссылка на материал).
// 6. POST /api/prodamus/webhook — уведомления Prodamus об оплате: и для
//    подписок сообщества (находит карточку подписчика по телефону/почте/
//    нику, записывает оплату как первую или как продление, пишет админу,
//    при первой оплате шлёт ссылку в бота), и для разовых покупок
//    материалов (шлёт админу уведомление о покупке).
// 7. POST /api/vacancy/:slug/view — реальный счётчик просмотров вакансии
//    (+1 при каждом открытии страницы).
// 8. POST /api/article/:slug/view — реальный счётчик просмотров статьи
//    базы знаний (+1 при каждом открытии).
// 9. POST /api/news/:slug/view — реальный счётчик просмотров новости
//    (+1 при каждом открытии).
// 10. POST /api/event/:slug/view — реальный счётчик просмотров мероприятия
//     (+1 при каждом открытии).
// 11. POST /api/event/:slug/register — реальный счётчик переходов к
//     регистрации на мероприятие (внешняя ссылка или внутренняя форма).
// 12. GET /api/store/sync, PUT /api/store/:key — синхронизация демо-данных
//     кабинетов между localStorage браузера и сервером (см.
//     src/lib/serverSync.ts) — раньше данные кабинета были видны только в
//     том браузере, где их создали.
// Токены и секретные ключи — только в server/.env, в репозиторий не попадают.
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createPaymentLink, TARIFFS, tariffIdBySubscriptionId, createProductPaymentLink, MATERIALS } from './lib/prodamus.js'
import { HmacHelper } from './lib/hmac.js'
import { createPendingJoin, createOrphanJoin, listJoins, setTgUserId, findJoinForPayment, recordPayment, setSubscriptionActive } from './lib/store.js'
import { normalizePhone } from './lib/jsonStore.js'
import { createPendingPurchase, getPurchase, markPurchasePaidByPhone } from './lib/materialsStore.js'
import { incrementView, incrementApplication } from './lib/vacancyStats.js'
import { incrementArticleView, getArticleViews } from './lib/articleStats.js'
import { incrementNewsView, getNewsViews } from './lib/newsStats.js'
import { incrementEventView, incrementEventRegistration, getEventStats } from './lib/eventStats.js'
import { isValidKey, writeCollection, readAllCollections } from './lib/collectionStore.js'
import { nextTicketNumber } from './lib/ticketCounter.js'
import { buildDailyReport, mskDayKey } from './lib/dailyReport.js'
import fs from 'node:fs'
import path from 'node:path'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const PRODAMUS_SECRET_KEY = process.env.PRODAMUS_SECRET_KEY
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'
const COMMUNITY_INVITE_LINK = process.env.COMMUNITY_INVITE_LINK

// Сервер стоит в РФ, и соединение с api.telegram.org время от времени
// обрывается по таймауту — поэтому до трёх попыток с паузой, а не одна.
async function telegramFetch(method, init) {
  let lastError
  for (const delay of [0, 2000, 5000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    try {
      return await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { ...init, signal: AbortSignal.timeout(10000) })
    } catch (err) {
      lastError = err
      console.error(`[telegram] ${method}: сеть недоступна, повтор через несколько секунд`)
    }
  }
  throw lastError
}

async function sendTelegramMessage(chatId, text) {
  const res = await telegramFetch('sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) console.error('[telegram] sendMessage ошибка:', await res.text())
  return res.ok
}

// Пересылка настоящего файла (резюме, мотивационное письмо и т.п.) админу —
// документом в тот же чат, что и текстовые уведомления, с подписью, откуда он.
async function sendTelegramDocument(chatId, buffer, filename, caption) {
  const form = new FormData()
  form.append('chat_id', chatId)
  if (caption) form.append('caption', caption)
  form.append('document', new Blob([buffer]), filename)
  const res = await telegramFetch('sendDocument', { method: 'POST', body: form })
  if (!res.ok) console.error('[telegram] sendDocument ошибка:', await res.text())
  return res.ok
}

/**
 * Оборачивает работу, которая идёт уже после того, как клиенту отправлен
 * быстрый ответ (webhook'и Telegram/Prodamus этого ждут) — ошибку в такой
 * работе некому вернуть в ответ, поэтому просто логируем и не роняем процесс.
 */
async function afterResponse(tag, work) {
  try {
    await work()
  } catch (err) {
    console.error(`[${tag}] ошибка обработки:`, err)
  }
}

// Единый шаблон уведомления админу — используется и для обычных лид-форм
// (/api/notify), и для покупки материала маркетплейса (там своя ветка в
// вебхуке Prodamus, но формат сообщения должен быть тем же).
function formatMoscowDateTime(iso) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(iso ? new Date(iso) : new Date())
  } catch {
    return new Date().toLocaleString('ru-RU')
  }
}

function buildLeadNotification({ direction, service, date, name, phone, email, telegram, details, ticketNumber }) {
  const lines = [
    `🔔 Новая заявка с сайта${ticketNumber ? `. Заявка №${ticketNumber}` : ''}`,
    direction ? `Направление: ${direction}` : null,
    service ? `Услуга: ${service}` : null,
    `Дата и время заявки: ${formatMoscowDateTime(date)}`,
    name ? `Контакт: ${name}` : null,
    phone ? `Номер телефона: ${phone}` : null,
    email ? `Почта: ${email}` : null,
    telegram ? `Телеграм: ${telegram}` : null,
    ...(Array.isArray(details) && details.length ? details.map((i) => `• ${i}`) : []),
  ].filter(Boolean)
  return lines.join('\n')
}

// Иконка для строки доп. условий (interest[]) уведомления рекрутинга/консультации —
// по ключевому слову в начале строки, чтобы не заводить отдельное поле под каждую форму.
function richDetailIcon(line) {
  if (/^Итого/i.test(line)) return '💰'
  if (/^Скидка/i.test(line)) return '🏷️'
  if (/^Промокод/i.test(line)) return '🎟️'
  if (/^Кого ищем|^Ищем/i.test(line)) return '🔍'
  if (/^Цель поиска/i.test(line)) return '🎯'
  if (/^(Заработная плата|Зарплата)/i.test(line)) return '💵'
  if (/^Ставка/i.test(line)) return '📊'
  if (/приложен[оа]? документом/i.test(line)) return '📎'
  if (/^Кандидат/i.test(line)) return '👥'
  if (/^Вопрос/i.test(line)) return '💬'
  return '📋'
}

// Расширенный формат с иконками по полям — рекрутинг/карьерная консультация/
// отклик на вакансию/кадровый резерв/обращения в поддержку (Контакты и
// «Не знаете, с чего начать?»), по запросу заказчика. Остальные формы идут
// через обычный buildLeadNotification. support — направление и услуга в одну
// строку через «·» (короче, обращений много); остальные шаблоны — направление
// и услуга отдельными строками.
function buildKadryRichNotification({ template, direction, service, date, name, phone, email, telegram, company, details, ticketNumber }) {
  const contactLabel = template === 'kadry-employer' ? 'фио' : template === 'support' ? 'фио' : 'контакт'
  const header = template === 'support' ? [direction, service].filter(Boolean).join(' · ') : null
  const lines = [
    `🔔 Новая заявка с сайта${ticketNumber ? `. Заявка №${ticketNumber}` : ''}`,
    '',
    header ?? (direction || null),
    header ? null : (service || null),
    '',
    `📅 ${formatMoscowDateTime(date)}`,
    '',
    company ? `🏢 компания: ${company}` : null,
    name ? `👤 ${contactLabel}: ${name}` : null,
    phone ? `📞 телефон: ${phone}` : null,
    email ? `✉️ почта: ${email}` : null,
    telegram ? `💬 телеграм: ${telegram}` : null,
    Array.isArray(details) && details.length ? '' : null,
    ...(Array.isArray(details) ? details.map((d) => `${richDetailIcon(d)} ${d}`) : []),
  ].filter((l) => l !== null)
  return lines.join('\n')
}

// ---- Подписка сообщества: проверка данных формы и учёт оплат ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Приводит ник в Telegram к виду @nick (принимает @nick, nick и ссылку t.me/nick). */
function normalizeTelegram(value) {
  const nick = String(value ?? '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '')
  return nick ? `@${nick}` : ''
}

/** Прибавляет календарные месяцы; 31 января + 1 месяц — последний день февраля, а не 3 марта. */
function addMonths(timestamp, months) {
  const d = new Date(timestamp)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() !== day) d.setDate(0)
  return d.getTime()
}

/**
 * Дата из вебхука Prodamus: верхний уровень приходит как
 * 2026-09-21T12:00:00+03:00, а даты внутри subscription — как
 * «2026-10-21 12:00:00» без часового пояса (по Москве) — его дописываем сами,
 * иначе время съедет на часовой пояс сервера.
 */
function parseProdamusDate(value) {
  if (!value) return NaN
  const text = String(value).trim()
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}+03:00` : text)
}

/** Дата платежа из вебхука (поле date); если её нет или она битая — текущий момент. */
function parsePaymentDate(value) {
  const ts = parseProdamusDate(value)
  return Number.isNaN(ts) ? Date.now() : ts
}

/**
 * Дата следующего списания, если Prodamus её прислал в блоке subscription
 * (date_next_payment) и она разумная (позже даты платежа); иначе null —
 * тогда считаем сами: дата платежа + срок тарифа.
 */
function pickNextPaymentDate(subscription, paidAt) {
  const ts = parseProdamusDate(subscription?.date_next_payment)
  return !Number.isNaN(ts) && ts > paidAt ? ts : null
}

/**
 * customer_extra мы формируем сами как «Подписка ... | ФИО | @ник» (см.
 * buildSubscriptionLink) — из него можно достать ФИО и Telegram, даже если
 * человек на странице оплаты поменял телефон и почту.
 */
function parseCustomerExtra(extra) {
  const [, name, telegram] = String(extra ?? '').split(' | ')
  return { name: name?.trim() || '', telegram: telegram?.trim() || '' }
}

function formatRub(amount) {
  return `${Number(amount).toLocaleString('ru-RU')} ₽`
}

/** Уведомление админу о каждой оплате подписки — первой и каждом продлении. */
function buildPaymentNotification({ kind, number, tariff, subscriptionName, amount, paidAt, nextPaymentAt, name, phone, email, telegram, orphan }) {
  const renewal = kind === 'renewal'
  const orphanNote = !orphan
    ? null
    : renewal
      ? '⚠️ Подписка оформлена не через форму на сайте (например, через бота) — карточка создана автоматически по данным Prodamus'
      : '⚠️ Оплата без заявки с сайта — контакты взяты из Prodamus, проверьте вручную'
  const lines = [
    '💳 Оплата получена',
    '',
    `Сообщество → Подписка · ${tariff?.period ?? subscriptionName ?? 'тариф не определён'}`,
    renewal ? `Продление подписки · оплата №${number}` : 'Первая оплата',
    orphanNote,
    '',
    `📅 ${formatMoscowDateTime(new Date(paidAt).toISOString())}`,
    '',
    name && name !== '—' ? `👤 фио: ${name}` : null,
    phone ? `📞 телефон: ${phone}` : null,
    email ? `✉️ почта: ${email}` : null,
    telegram ? `💬 телеграм: ${telegram}` : null,
    '',
    `💰 Сумма: ${formatRub(amount)}`,
    nextPaymentAt ? `⏭️ Следующее списание: ${formatMoscowDateTime(new Date(nextPaymentAt).toISOString()).split(',')[0]}` : null,
  ].filter((l) => l !== null)
  return lines.join('\n')
}

/** Уведомление админу об отключении подписки — чтобы написать человеку и узнать причину. */
function buildCancellationNotification({ record, tariff, at }) {
  const lines = [
    '🔕 Подписка отключена',
    '',
    `Сообщество → Подписка · ${tariff?.period ?? 'тариф не определён'}`,
    '',
    `📅 ${formatMoscowDateTime(new Date(at).toISOString())}`,
    '',
    record.name && record.name !== '—' ? `👤 фио: ${record.name}` : null,
    record.phone ? `📞 телефон: ${record.phone}` : null,
    record.email ? `✉️ почта: ${record.email}` : null,
    record.telegram ? `💬 телеграм: ${record.telegram}` : null,
    '',
    record.lastPaidAt ? `💰 Последняя оплата: ${formatMoscowDateTime(new Date(record.lastPaidAt).toISOString()).split(',')[0]}` : null,
    'Стоит написать человеку и узнать, что пошло не так.',
  ].filter((l) => l !== null)
  return lines.join('\n')
}

/**
 * Успешная оплата подписки от Prodamus: находит карточку подписчика (или
 * заводит новую, если заявки с сайта не нашлось), записывает платёж как
 * первый или как продление, пишет админу и — при первой оплате — присылает
 * ссылку на сообщество, если человек уже нажимал Start у бота.
 */
async function handleSubscriptionPayment(body, phone) {
  const subscription = body.subscription
  const tariffId = tariffIdBySubscriptionId(subscription.id)
  const tariff = TARIFFS[tariffId]
  const email = body.customer_email
  const extra = parseCustomerExtra(body.customer_extra)
  const paidAt = parsePaymentDate(body.date)
  const amount = Number(body.sum) || tariff?.price || 0
  const orderKey = String(body.order_id || '') || null
  const profileId = subscription.profile_id ? String(subscription.profile_id) : null
  const tgUserId = body.tg_user_id ? String(body.tg_user_id) : null
  const paymentNum = Number(subscription.payment_num) || null
  // Скидочные тарифы — отдельные подписки Prodamus, которых нет в TARIFFS: тогда называем по имени из вебхука.
  const subscriptionName = tariff ? null : [subscription.name, subscription.cost ? `${Number(subscription.cost)} ₽` : null].filter(Boolean).join(' · ') || null
  console.log('[prodamus] подписка сообщества — телефон:', phone, 'почта:', email, 'тариф:', tariffId, 'профиль:', profileId, 'платёж №', paymentNum)

  let match = findJoinForPayment({ phone, email, telegram: extra.telegram, tgUserId, profileId, tariffId })
  const orphan = !match
  if (!match) {
    const token = createOrphanJoin({ tariffId, name: extra.name, phone, email, telegram: extra.telegram })
    match = { join: { token }, isFirst: true }
  }

  const nextPaymentAt = pickNextPaymentDate(subscription, paidAt) ?? (tariff ? addMonths(paidAt, tariff.months) : null)
  const result = recordPayment(match.join.token, { tariffId, amount, paidAt, orderKey, nextPaymentAt, profileId, tgUserId, paymentNum, subscriptionId: subscription.id, subscriptionName })
  if (!result) {
    console.error('[prodamus] не удалось записать платёж — карточка не найдена:', match.join.token)
    return
  }
  if (result.duplicate) {
    console.log('[prodamus] повторный вебхук по уже учтённой оплате — пропускаю:', orderKey)
    return
  }

  const rec = result.record
  console.log(`[prodamus] оплата учтена: ${rec.token} (${result.kind}, платёж №${result.number}), следующее списание:`, nextPaymentAt ? new Date(nextPaymentAt).toISOString() : 'неизвестно')

  await sendTelegramMessage(
    ADMIN_CHAT_ID,
    buildPaymentNotification({
      kind: result.kind,
      number: result.number,
      tariff,
      subscriptionName,
      amount,
      paidAt,
      nextPaymentAt,
      name: rec.name,
      phone: rec.phone || phone,
      email: rec.email || email,
      telegram: rec.telegram,
      orphan,
    }),
  )

  if (result.kind === 'first' && rec.tgUserId) {
    await sendInviteLink(rec.tgUserId, rec)
  }
}

/**
 * Состояние подписки из любого вебхука с блоком subscription: если человек
 * или менеджер отключил подписку (active_user / active_manager = 0), а мы
 * знаем этого подписчика по profile_id — помечаем «отключена» и пишем админу.
 * Точный вид отдельных вебхуков об отписке пока не подтверждён реальными
 * данными, поэтому срабатывает только на явный "0" у известного профиля.
 */
async function handleSubscriptionState(body) {
  const sub = body.subscription
  const profileId = sub?.profile_id ? String(sub.profile_id) : null
  if (!profileId) return
  const match = findJoinForPayment({ profileId })
  if (!match) return

  const inactive = String(sub.active_user) === '0' || String(sub.active_manager) === '0'
  const at = Date.now()
  const result = setSubscriptionActive(match.join.token, !inactive, at)
  if (!result?.changed) return

  console.log(`[prodamus] статус подписки ${match.join.token} изменился →`, inactive ? 'отключена' : 'включена')
  if (inactive) {
    await sendTelegramMessage(
      ADMIN_CHAT_ID,
      buildCancellationNotification({ record: result.record, tariff: TARIFFS[result.record.tariffId], at }),
    )
  }
}

async function sendInviteLink(chatId, join) {
  const tariff = TARIFFS[join.tariffId]
  const label = tariff?.label ?? 'Сообщество'
  await sendTelegramMessage(
    chatId,
    `Оплата получена — добро пожаловать в «${label}»! 🎉\n\nСсылка на вступление в закрытое сообщество:\n${COMMUNITY_INVITE_LINK}`,
  )
}

// Открытие страницы вакансии → +1 к счётчику просмотров. Считаем реальные
// заходы (не демо-число), но не завязываем это на успех/провал остального
// стека — счётчик пишется сам по себе, до всех проверок ниже.
app.post('/api/vacancy/:slug/view', (req, res) => {
  const stats = incrementView(req.params.slug)
  res.json({ ok: true, ...stats })
})

// Открытие статьи базы знаний → +1 к счётчику просмотров (тот же принцип,
// что у вакансий: реальный счётчик, а не демо-число).
app.post('/api/article/:slug/view', (req, res) => {
  const stats = incrementArticleView(req.params.slug)
  res.json({ ok: true, ...stats })
})

// Только чтение — для карточек статьи в списке (не увеличивает счётчик,
// иначе каждый рендер списка накручивал бы просмотры).
app.get('/api/article/:slug/views', (req, res) => {
  res.json({ ok: true, views: getArticleViews(req.params.slug) })
})

// Открытие новости → +1 к счётчику просмотров, тот же принцип, что у статей.
app.post('/api/news/:slug/view', (req, res) => {
  const stats = incrementNewsView(req.params.slug)
  res.json({ ok: true, ...stats })
})

app.get('/api/news/:slug/views', (req, res) => {
  res.json({ ok: true, views: getNewsViews(req.params.slug) })
})

// Открытие страницы мероприятия → +1 к счётчику просмотров, тот же принцип,
// что у вакансий/статей/новостей — для личного кабинета организатора
// (раздел «Мероприятия» → статистика).
app.post('/api/event/:slug/view', (req, res) => {
  const stats = incrementEventView(req.params.slug)
  res.json({ ok: true, ...stats })
})

app.get('/api/event/:slug/views', (req, res) => {
  res.json({ ok: true, ...getEventStats(req.params.slug) })
})

// Переход к регистрации на мероприятие — клик по внешней ссылке
// организатора (без формы) или отправка внутренней формы (см. /api/notify
// ниже — eventSlug там ведет сюда же). Отдельный от просмотров счетчик:
// «сколько человек реально дошли до регистрации», не просто открыли карточку.
app.post('/api/event/:slug/register', (req, res) => {
  const stats = incrementEventRegistration(req.params.slug)
  res.json({ ok: true, ...stats })
})

// Синхронизация localStorage кабинетов ↔ сервер (см. src/lib/serverSync.ts):
// GET забирает все ky_*-ключи разом при загрузке приложения, PUT сохраняет
// один ключ при каждой локальной записи. Без этого демо-данные кабинета
// (вакансии, отклики, резюме, избранное, мероприятия организатора и т.п.)
// были видны только в том браузере, где их создали.
app.get('/api/store/sync', (req, res) => {
  res.json(readAllCollections())
})

app.put('/api/store/:key', (req, res) => {
  if (!isValidKey(req.params.key)) {
    return res.status(400).json({ ok: false, error: 'bad_key' })
  }
  writeCollection(req.params.key, req.body)
  res.json({ ok: true })
})

// Сквозной номер заявки — растёт с 1 (Контакты, Поддержка), а не случайное
// 6-значное число, чтобы админу было проще ориентироваться в переписке.
app.post('/api/ticket/next', (req, res) => {
  res.json({ number: nextTicketNumber() })
})

// Настоящая пересылка загруженного файла (резюме и т.п.) админу в Telegram —
// см. showResumeUpload/showMotivationUpload/... в LeadForm.tsx. label/name/vacancy
// формируют подпись к документу, чтобы было понятно, откуда он и от кого.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
app.post('/api/upload-document', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no_file' })
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('[upload-document] TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID не заданы в server/.env')
    return res.status(500).json({ ok: false, error: 'not_configured' })
  }
  const { label, name, vacancy } = req.body ?? {}
  const caption = [label || 'Документ', name, vacancy].filter(Boolean).join(' — ')
  const ok = await sendTelegramDocument(ADMIN_CHAT_ID, req.file.buffer, req.file.originalname, caption).catch((err) => {
    console.error('[upload-document] ошибка пересылки в Telegram:', err)
    return false
  })
  if (!ok) return res.status(502).json({ ok: false, error: 'telegram_error' })
  res.json({ ok: true })
})

app.post('/api/notify', async (req, res) => {
  const { direction, service, source, formType, name, contact, phone, email, telegram, company, template, interest, date, vacancySlug, eventSlug, ticketNumber } = req.body ?? {}

  // Отклик на вакансию — считаем реальный счётчик независимо от того,
  // настроен ли Telegram-бот ниже: заявка не должна "теряться" из
  // статистики только потому, что уведомление не смогло уйти.
  if (vacancySlug) {
    try {
      incrementApplication(vacancySlug)
    } catch (err) {
      console.error('[notify] ошибка счётчика откликов:', err)
    }
  }

  // Регистрация на мероприятие — тот же принцип: считаем независимо от
  // Telegram-уведомления.
  if (eventSlug) {
    try {
      incrementEventRegistration(eventSlug)
    } catch (err) {
      console.error('[notify] ошибка счётчика регистраций на мероприятие:', err)
    }
  }

  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('[notify] TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID не заданы в server/.env')
    return res.status(500).json({ ok: false, error: 'not_configured' })
  }

  // phone/email/telegram — отдельными полями с фронтенда (см.
  // src/lib/leads.ts); contact — старая склеенная строка, остаётся как
  // запасной вариант, если фронтенд почему-то не прислал разбивку.
  const isRich = template === 'kadry-employer' || template === 'kadry-candidate' || template === 'support'
  const text = isRich
    ? buildKadryRichNotification({
        template,
        direction: direction || source,
        service: service || formType,
        date,
        name,
        phone: phone || (!email && !telegram ? contact : undefined),
        email,
        telegram,
        company,
        details: interest,
        ticketNumber,
      })
    : buildLeadNotification({
        direction: direction || source,
        service: service || formType,
        date,
        name,
        phone: phone || (!email && !telegram ? contact : undefined),
        email,
        telegram,
        details: interest,
        ticketNumber,
      })

  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, text).catch((err) => {
    console.error('[notify] ошибка запроса к Telegram:', err)
    return false
  })
  if (!ok) return res.status(502).json({ ok: false, error: 'telegram_error' })
  res.json({ ok: true })
})

// Выбор тарифа на сайте → ссылка на оплату Prodamus. После оплаты Prodamus
// вернёт человека на urlSuccess (страница сайта), где предлагаем перейти в бота.
app.post('/api/community/subscribe', async (req, res) => {
  const { tariffId } = req.body ?? {}
  if (!TARIFFS[tariffId]) return res.status(400).json({ ok: false, error: 'unknown_tariff' })

  // Все четыре контакта обязательны и проверяются здесь, а не только на
  // форме: по ним мы потом опознаём плательщика в вебхуке и ведём CRM —
  // на странице оплаты Prodamus люди не всегда указывают свои данные.
  const name = String(req.body.name ?? '').trim()
  const phone = String(req.body.phone ?? '').trim()
  const email = String(req.body.email ?? '').trim()
  const telegram = normalizeTelegram(req.body.telegram)
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' })
  if (normalizePhone(phone).length < 11) return res.status(400).json({ ok: false, error: 'phone_required' })
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email_required' })
  if (!telegram) return res.status(400).json({ ok: false, error: 'telegram_required' })

  try {
    const token = createPendingJoin({ tariffId, name, phone, email, telegram })
    const urlSuccess = `${SITE_URL}/community/success?token=${token}`
    const url = await createPaymentLink({ tariffId, phone, email, urlSuccess, name, telegram })
    res.json({ ok: true, url })
  } catch (err) {
    console.error('[subscribe] ошибка генерации ссылки на оплату:', err)
    res.status(500).json({ ok: false, error: 'link_generation_failed' })
  }
})

// Покупка материала маркетплейса → ссылка на разовую оплату Prodamus.
app.post('/api/marketplace/purchase', async (req, res) => {
  const { materialSlug, name, phone, email } = req.body ?? {}
  if (!MATERIALS[materialSlug]) return res.status(400).json({ ok: false, error: 'unknown_material' })
  if (!phone) return res.status(400).json({ ok: false, error: 'phone_required' })

  try {
    const token = createPendingPurchase({ materialSlug, name, phone, email })
    const urlSuccess = `${SITE_URL}/materials/cabinet?token=${token}`
    const url = await createProductPaymentLink({ materialSlug, phone, email, urlSuccess })
    res.json({ ok: true, url })
  } catch (err) {
    console.error('[marketplace] ошибка генерации ссылки на оплату:', err)
    res.status(500).json({ ok: false, error: 'link_generation_failed' })
  }
})

// Данные для личного кабинета покупки — отдаём только безопасный минимум,
// ссылку на материал — только если заявка реально оплачена.
app.get('/api/marketplace/purchase/:token', (req, res) => {
  const purchase = getPurchase(req.params.token)
  if (!purchase) return res.status(404).json({ ok: false, error: 'not_found' })

  const material = MATERIALS[purchase.materialSlug]
  res.json({
    ok: true,
    name: purchase.name,
    materialTitle: material?.title ?? purchase.materialSlug,
    paid: purchase.paid,
    accessUrl: purchase.paid ? material?.accessUrl ?? '' : null,
  })
})

// Апдейты от Telegram-бота @LegalcareeristBot. Настраивается один раз
// командой setWebhook (см. README сервера).
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200) // Telegram ждёт быстрый ответ, обрабатываем после

  await afterResponse('telegram/webhook', async () => {
    const message = req.body?.message
    const text = message?.text
    const chatId = message?.chat?.id
    if (chatId && text?.startsWith('/report') && String(chatId) === String(ADMIN_CHAT_ID)) {
      await sendTelegramMessage(chatId, buildDailyReport(listJoins(), Date.now(), TARIFFS))
      return
    }
    if (!chatId || !text || !text.startsWith('/start')) return

    const payload = text.slice('/start'.length).trim()
    const match = payload.match(/^access_(\w+)$/)
    const token = match?.[1]

    if (!token) {
      await sendTelegramMessage(chatId, 'Привет! Это бот «Карьерного юриста». Чтобы вступить в сообщество, начните с сайта — раздел «Сообщество».')
      return
    }

    const join = setTgUserId(token, chatId)
    if (!join) {
      await sendTelegramMessage(chatId, 'Не нашли вашу заявку — попробуйте оформить подписку заново на сайте.')
      return
    }

    if (join.paid) {
      await sendInviteLink(chatId, join)
    } else {
      await sendTelegramMessage(chatId, 'Ждём подтверждения оплаты от банка — обычно это занимает меньше минуты. Как только оплата пройдёт, здесь появится ссылка на вступление.')
    }
  })
})

// Уведомления Prodamus об оплате подписки.
app.post('/api/prodamus/webhook', async (req, res) => {
  const body = req.body ?? {}
  const sign = req.headers['sign'] || body.signature

  if (PRODAMUS_SECRET_KEY && sign) {
    const valid = HmacHelper.verify(body, PRODAMUS_SECRET_KEY, sign)
    if (!valid) {
      console.error('[prodamus] неверная подпись вебхука')
      return res.sendStatus(400)
    }
  } else {
    console.error('[prodamus] PRODAMUS_SECRET_KEY не задан или подпись отсутствует в запросе — пропускаю проверку')
  }

  // Логируем полный payload — точные поля события уточнили по первым
  // реальным платежам: payment_status "success"/что-то ещё, customer_phone,
  // subscription.id и т.д.
  console.log('[prodamus] webhook:', JSON.stringify(body))
  res.sendStatus(200)

  await afterResponse('prodamus/webhook', async () => {
    if (body.subscription) await handleSubscriptionState(body)

    if (body.payment_status !== 'success') {
      console.log('[prodamus] статус не success — пропускаю:', body.payment_status)
      return
    }

    const phone = body.customer_phone || body.phone

    // Есть subscription — это оплата подписки сообщества; нет — разовая
    // покупка материала маркетплейса. Это единственное надёжное отличие,
    // которое приходит в вебхуке.
    if (body.subscription) {
      await handleSubscriptionPayment(body, phone)
      return
    }

    console.log('[prodamus] покупка материала — телефон:', phone)
    const purchase = markPurchasePaidByPhone(phone)
    console.log('[prodamus] результат поиска покупки:', purchase ? `найдена ${purchase.token}` : 'не найдена')
    if (purchase) {
      const material = MATERIALS[purchase.materialSlug]
      const cabinetUrl = `${SITE_URL}/materials/cabinet?token=${purchase.token}`
      const text = buildLeadNotification({
        direction: 'Маркетплейс',
        service: 'Покупка полезного материала',
        date: new Date().toISOString(),
        name: purchase.name || '—',
        phone,
        email: purchase.email,
        details: [`Материал: ${material?.title ?? purchase.materialSlug}`, `Сумма: ${body.sum} ₽`, `Личный кабинет: ${cabinetUrl}`],
      })
      await sendTelegramMessage(ADMIN_CHAT_ID, text)
    }
  })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Ежедневный отчёт админу в 21:00 по Москве. Раз в минуту проверяем время;
// дату последней отправки храним в файле, чтобы перезапуск процесса не
// приводил ни к повтору, ни к пропуску отчёта за день.
const REPORT_HOUR_MSK = 21
const REPORT_STATE_FILE = path.join(import.meta.dirname, 'data', 'daily-report.json')

function readLastReportDay() {
  try {
    return JSON.parse(fs.readFileSync(REPORT_STATE_FILE, 'utf8')).lastDay ?? null
  } catch {
    return null
  }
}

async function sendDailyReportIfDue() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  const today = mskDayKey(now)
  if (hour < REPORT_HOUR_MSK || readLastReportDay() === today) return

  fs.mkdirSync(path.dirname(REPORT_STATE_FILE), { recursive: true })
  fs.writeFileSync(REPORT_STATE_FILE, JSON.stringify({ lastDay: today }))
  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, buildDailyReport(listJoins(), now, TARIFFS)).catch(() => false)
  if (!ok) fs.writeFileSync(REPORT_STATE_FILE, JSON.stringify({ lastDay: null })) // не ушло — попробуем в следующую минуту
}

if (process.env.DISABLE_DAILY_REPORT !== '1') {
  setInterval(() => afterResponse('daily-report', sendDailyReportIfDue), 60 * 1000)
}

// Страховка от падения процесса из-за необработанной ошибки где-то в фоне
// (например, сорвавшийся запрос к Telegram/Prodamus после ответа клиенту) —
// логируем и продолжаем работу вместо того, чтобы уронить сервер целиком.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
