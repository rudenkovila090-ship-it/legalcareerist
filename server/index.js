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
import { createPaymentLink, TARIFFS, tariffIdBySubscriptionId, createProductPaymentLink, MATERIALS, setSubscriptionActivity, createEventPaymentLink } from './lib/prodamus.js'
import { HmacHelper } from './lib/hmac.js'
import { createPendingJoin, createOrphanJoin, listJoins, setTgUserId, findJoinForPayment, recordPayment, setSubscriptionActive, markReminded, getJoin, setCancelReason, setJoinField, extendSubscription, createLifetimeJoin } from './lib/store.js'
import { normalizePhone } from './lib/jsonStore.js'
import { createPendingPurchase, getPurchase, markPurchasePaidByPhone, markPurchasePaidByTg, findPaidPurchase, recordPurchasePayment, listPurchases } from './lib/materialsStore.js'
import { incrementView, incrementApplication, allVacancyStats } from './lib/vacancyStats.js'
import { utmLabel } from './lib/utm.js'
import { createApplication, listApplications } from './lib/candidateApplications.js'
import { createConsultation, listConsultations, getConsultation, setConsultationStatus } from './lib/consultations.js'
import { createAmbassador, listAmbassadors, getAmbassador, addReferral, deleteAmbassador } from './lib/ambassadors.js'
import { createExpense, listExpenses, deleteExpense } from './lib/expenses.js'
import { createEventLead, listEventLeads, getEventLead, setEventLeadStatus, markEventLeadPaid, setEventLeadField } from './lib/eventLeads.js'
import { sendMail, mailConfigured } from './lib/mailer.js'
import { getMaterialFile, setMaterialFile } from './lib/materialFiles.js'
import { touchBotUser, giveConsent, setMailingConsent, addTag, getBotUser, listBotUsers, countConversation, updateBotUser, setGender } from './lib/botUsers.js'
import { isStartKeyword, welcomeScreen, noConsentScreen, mailingScreen, mainMenuScreen, supportPrompt, consultPrompt, genderScreen, reviewThanks, legalScreen, aboutScreen, consultScreen, consultBookedScreen, marketScreen, materialsListScreen, materialCard, payLinkScreen, PAID_TEXT, PAID_TEXTS, PAID_TAGS, paidKeyboard, paymentNotFoundScreen, reviewScreen, CONTACT_PROMPTS, contactCancelKeyboard, unsubscribedScreen, communityScreen, communityResidentScreen, periodsScreen, subLinkScreen, aboutClubScreen, careerScreen, achievementsScreen } from './lib/botFlow.js'
import { buildMonthCsv } from './lib/exportCsv.js'
import { vacancyOverrides, setVacancyStatus } from './lib/vacancyOverrides.js'
import { residentMenu, subscriptionScreen, linkScreen, settingsScreen, cancelConfirmScreen, cancelReasonPrompt, cancelDoneScreen, hasAccess } from './lib/residentCabinet.js'
import { logAction, recentActions } from './lib/auditLog.js'
import { healthLines, makeBackup, readBackupState, writeBackupState } from './lib/healthBackup.js'
import { listTodos, addTodo, setTodoDone } from './lib/todos.js'
import { todosScreen, TODO_PROMPT, chatCheckScreen, userCard, botUsersScreen, ambassadorsScreen, ambassadorCard, AMBASSADOR_PROMPT, overdueScreen, retentionScreen, cancelCard, financeSummary, forecastScreen, expensesScreen, EXPENSE_PROMPT, parseExpense, eventRegistrationsScreen, eventScreen, eventLeadCard, eventRequestsScreen, eventsMonthSummary, FIND_PROMPT, searchScreen, digestScreen, systemScreen, auditScreen, monthKeyFor as extraMonthKey } from './lib/extraCabinet.js'
import { createInterest, getInterest, listInterests, markInterestDone, closeInterest, snoozeInterest, interestsDueForReminder, markInterestReminded, REMIND_AFTER_DAYS } from './lib/interests.js'
import { createReserveCandidate, listReserve, getReserveCandidate, setReserveField, deleteReserveCandidate } from './lib/reserve.js'
import { reserveListScreen, reserveCard, reserveFieldPrompt, reserveDeleteConfirm, RESERVE_NEW_PROMPT, INTEREST_KIND_KEYBOARD, interestPrompt, interestsScreen, interestCard, SEEKERS_KEYBOARD, buildVacancyViews, vacanciesScreen, vacancyCard, vacancyApplicationsScreen, recentApplicationsScreen, consultationsScreen, consultationCard, seekersMonthSummary } from './lib/seekersCabinet.js'
import { incrementArticleView, getArticleViews } from './lib/articleStats.js'
import { incrementNewsView, getNewsViews } from './lib/newsStats.js'
import { incrementEventView, incrementEventRegistration, getEventStats } from './lib/eventStats.js'
import { isValidKey, writeCollection, readAllCollections } from './lib/collectionStore.js'
import { nextTicketNumber } from './lib/ticketCounter.js'
import { buildDailyReport, mskDayKey, parseReportPeriod } from './lib/dailyReport.js'
import { logWebhook, lastWebhook } from './lib/webhookLog.js'
import { FINANCE_KEYBOARD, COMMUNITY_KEYBOARD, sectionScreen, menuScreen, subscribersScreen, planScreen, dueScreen, cancelledScreen, reminderMenuScreen, reminderPreviewScreen, reminderTargets, reminderMessage } from './lib/adminCabinet.js'
import fs from 'node:fs'
import path from 'node:path'
import { createDeal, listDeals as listAllDeals, getDeal, moveDeal, setQualified, closeDeal, setRevenue, addDealPayment, prepayAmount, dealReceived, scheduleReminder, reopenDeal, dealsDueForReminder, stageOf, LAST_STAGE } from './lib/deals.js'
import { dealCard, activeDealsScreen, funnelScreen, stageScreen, closedScreen, monthSummary, monthKeyFor, dealReminder, dealTemplate, TEMPLATE_INTRO, NEW_DEAL_PROMPT, KADRY_KEYBOARD } from './lib/kadryCabinet.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const PRODAMUS_SECRET_KEY = process.env.PRODAMUS_SECRET_KEY
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'
const COMMUNITY_INVITE_LINK = process.env.COMMUNITY_INVITE_LINK
// Секретная команда открытия кабинета разработчика (можно поменять в server/.env: ADMIN_COMMAND=...).
const ADMIN_COMMAND = process.env.ADMIN_COMMAND || 'KQ21022025RD'
const SUPPORT_HANDLE = process.env.SUPPORT_HANDLE || '@legalcareerist_support'
// Chat id помощников (через запятую): видят кабинет, но не могут ничего менять. По умолчанию — никого.
const VIEWER_IDS = new Set(String(process.env.TELEGRAM_VIEWER_CHAT_IDS ?? '').split(',').map((v) => v.trim()).filter(Boolean))

// Последние ошибки сервера для проверки состояния в боте («ошибок за сутки»).
const recentErrors = []
const originalConsoleError = console.error.bind(console)
console.error = (...args) => {
  let msg = ''
  try {
    msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 160)
  } catch {
    msg = 'ошибка'
  }
  recentErrors.push({ at: Date.now(), msg })
  if (recentErrors.length > 100) recentErrors.shift()
  originalConsoleError(...args)
}
let lastPollAt = 0

// Сервер стоит в РФ, и соединение с api.telegram.org время от времени
// обрывается по таймауту — поэтому до трёх попыток с паузой, а не одна.
// Длительность последних запросов к Telegram — для диагностики «долгой загрузки» в «Система».
const telegramLatencies = []
// Повторяем запрос только если соединение с Telegram даже не установилось: тогда сообщение точно не доставлено.
// При таймауте ответа (сообщение могло уже уйти) повтор создавал бы дубли — их не делаем.
const SAFE_RETRY_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])

async function telegramFetch(method, init) {
  let lastError
  for (const delay of [0, 1500]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    const started = Date.now()
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, { ...init, signal: AbortSignal.timeout(25000) })
      telegramLatencies.push({ at: Date.now(), ms: Date.now() - started })
      if (telegramLatencies.length > 60) telegramLatencies.shift()
      return res
    } catch (err) {
      lastError = err
      telegramLatencies.push({ at: Date.now(), ms: Date.now() - started, failed: true })
      if (telegramLatencies.length > 60) telegramLatencies.shift()
      if (!SAFE_RETRY_CODES.has(err?.cause?.code)) break
      console.error(`[telegram] ${method}: соединение не установилось, повтор`)
    }
  }
  throw lastError
}

async function sendTelegramMessage(chatId, text, replyMarkup) {
  const res = await telegramFetch('sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: { inline_keyboard: replyMarkup } } : {}) }),
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

// Отправка уже загруженного в Telegram файла по file_id (материалы маркетплейса).
async function sendTelegramDocumentById(chatId, fileId, caption) {
  const res = await telegramFetch('sendDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, document: fileId, ...(caption ? { caption } : {}) }),
  })
  if (!res.ok) console.error('[telegram] sendDocument по file_id ошибка:', await res.text())
  return res.ok
}

// Скачивает файл, который админ загрузил боту (по Telegram file_id), — чтобы приложить его к письму или отдать на сайте.
async function downloadTelegramFile(fileId) {
  const info = await (await telegramFetch('getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }) })).json()
  if (!info.ok) throw new Error(`getFile: ${info.description ?? 'ошибка'}`)
  const res = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`скачивание файла: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Письмо покупателю с материалом: файл во вложении (если загружен), ссылка и личный кабинет. Возвращает { ok, error? }. */
async function emailMaterial({ to, name, materialSlug, cabinetUrl }) {
  const material = materialList().find((m) => m.slug === materialSlug)
  const file = getMaterialFile(materialSlug)
  let attachments
  if (file) {
    try {
      attachments = [{ filename: file.fileName || `${materialSlug}.pdf`, content: await downloadTelegramFile(file.fileId) }]
    } catch (err) {
      console.error('[mail] не удалось получить файл материала из Telegram:', err.message)
    }
  }
  const lines = [`${name ? `Здравствуйте, ${name}!` : 'Здравствуйте!'}`, '', `Спасибо за покупку! Материал «${material?.title ?? materialSlug}» — во вложении к этому письму.`]
  if (!attachments) lines.splice(3, 1, `Спасибо за покупку! Материал «${material?.title ?? materialSlug}» уже в вашем личном кабинете.`)
  if (material?.accessUrl) lines.push('', `Ссылка на материал: ${material.accessUrl}`)
  if (cabinetUrl) lines.push('', `Личный кабинет с покупкой: ${cabinetUrl}`)
  lines.push('', `Если что-то пошло не так — напишите в поддержку: ${SUPPORT_HANDLE}`, '', 'Карьерный юрист')
  return sendMail({ to, subject: `Ваш материал: ${material?.title ?? materialSlug}`, text: lines.join('\n'), attachments })
}

/** Каталог мероприятий сайта (выгружается при сборке): по нему сервер берёт название и цену билета. */
function readEventCatalog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'data', 'event-catalog.json'), 'utf8'))
  } catch {
    return []
  }
}

const EVENT_ORDER_RE = /\bev-(\d+)\b/i

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
function buildKadryRichNotification({ template, direction, service, date, name, phone, email, telegram, company, details, ticketNumber, origin = 'с сайта' }) {
  const contactLabel = 'фио'
  const header = template === 'support' ? [direction, service].filter(Boolean).join(' · ') : null
  const lines = [
    `🔔 Новая заявка ${origin}${ticketNumber ? `. Заявка №${ticketNumber}` : ''}`,
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
  const ts = parseProdamusDate(subscription?.date_next_payment ?? subscription?.next_payment)
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
/** Отчёт + строка о том, когда от Prodamus в последний раз приходил вебхук — чтобы «нет продаж» нельзя было спутать с «вебхуки не доходят». */
function reportText(period, now = Date.now()) {
  const last = lastWebhook()
  const footer = last
    ? `\n\n🔌 Последний вебхук Prodamus: ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date(last.at))} МСК (${last.status})`
    : '\n\n⚠️ От Prodamus ещё не приходило ни одного вебхука с оплатой — учёт может быть неполным, сверьте с кабинетом Prodamus.'
  return buildDailyReport(listJoins(), now, TARIFFS, period) + footer
}

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

  // Разовые скидочные подписки (350 и 500 ₽) — доступ на 30 дней без автопродления: по окончании бот напоминает и исключает из чата.
  const oneTime = !tariff && [350, 500].includes(Math.round(amount))
  const nextPaymentAt = pickNextPaymentDate(subscription, paidAt) ?? (tariff ? addMonths(paidAt, tariff.months) : oneTime ? paidAt + 30 * 24 * 3600 * 1000 : null)
  const result = recordPayment(match.join.token, { tariffId, amount, paidAt, orderKey, nextPaymentAt, profileId, tgUserId, paymentNum, subscriptionId: subscription.id, subscriptionName, oneTime })
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
    await sendInviteLink(rec.tgUserId)
  } else if (result.kind === 'renewal' && rec.tgUserId) {
    await sendTelegramMessage(rec.tgUserId, 'Подписка продлена, продолжай пользоваться всеми возможностями сообщества.', REMINDER_KEYBOARD).catch(() => false)
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
    // Подписчику, который общался с ботом, — вопрос о причине (отключается CANCEL_SURVEY=0).
    if (result.record.tgUserId && process.env.CANCEL_SURVEY !== '0') {
      await sendTelegramMessage(
        result.record.tgUserId,
        `Здравствуйте! Мы увидели, что вы отключили подписку на сообщество «Карьерный юрист». Нам важно понять, что можно улучшить — если не сложно, напишите причину: ${SUPPORT_HANDLE}. Спасибо, что были с нами!`,
      ).catch(() => false)
    }
  }
}

// Закрытый чат сообщества и вступление по заявке: после оплаты бот разблокирует человека, присылает кнопку «Подать заявку»
// (ссылка-приглашение COMMUNITY_INVITE_LINK должна быть со включённым «Одобрением заявок»), а заявку одобряет сам —
// см. chat_join_request в handleTelegramUpdate. Бот должен быть администратором чата.
const COMMUNITY_CHAT_ID = process.env.COMMUNITY_CHAT_ID || '-1002520943910'
const REMINDER_KEYBOARD = [[{ text: 'Главное меню', callback_data: 'u:menu' }]]

async function sendInviteLink(chatId) {
  // Если человека раньше исключали из чата, снимаем блокировку — иначе заявка не пройдёт.
  await telegramFetch('unbanChatMember', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID, user_id: chatId, only_if_banned: true }) }).catch(() => null)
  await sendTelegramMessage(
    chatId,
    'Отлично! Оплата получена ✅\n\nНажми кнопку «Подать заявку», и я сразу приму тебя в сообщество.\n\nЖду тебя внутри!',
    COMMUNITY_INVITE_LINK ? [[{ text: 'Подать заявку', url: COMMUNITY_INVITE_LINK }]] : undefined,
  )
  if (!COMMUNITY_INVITE_LINK) await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Оплата получена, но COMMUNITY_INVITE_LINK не задана: пришлите человеку (chat id ${chatId}) ссылку на сообщество вручную.`)
}

/** Заявка на вступление в чат сообщества: одобряем оплатившим резидентам и присылаем приветствие с чек-листом. */
async function handleJoinRequest(request) {
  if (String(request.chat?.id) !== String(COMMUNITY_CHAT_ID)) return
  const userId = request.from?.id
  const resident = residentByTelegramId(userId)
  const name = [request.from?.first_name, request.from?.last_name].filter(Boolean).join(' ')
  const dmChat = request.user_chat_id ?? userId
  if (!resident || resident.status !== 'active') {
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Заявка на вступление в сообщество без найденной оплаты: ${name || 'без имени'}${request.from?.username ? ` (@${request.from.username})` : ''}, id ${userId}.\nЗаявка не одобрена — проверьте оплату и, если всё в порядке, одобрите вручную в чате.`)
    await sendTelegramMessage(dmChat, 'Не вижу подтверждения твоей оплаты 🙂 Если оплата прошла, напиши в поддержку и приложи чек — мы быстро проверим и всё уладим.', [[{ text: 'Поддержка', url: `https://t.me/${SUPPORT_HANDLE.replace(/^@/, '')}` }]]).catch(() => false)
    return
  }
  const res = await telegramFetch('approveChatJoinRequest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID, user_id: userId }) })
  if (!res.ok) {
    console.error('[telegram] approveChatJoinRequest ошибка:', await res.text())
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Не удалось одобрить заявку ${name} (id ${userId}). Бот должен быть администратором чата сообщества с правом приглашать пользователей.`)
    return
  }
  const days = resident.nextPaymentAt ? Math.max(1, Math.round((resident.nextPaymentAt - Date.now()) / 86400000)) : (TARIFFS[resident.tariffId]?.months ?? 1) * 30
  setTimeout(async () => {
    await sendTelegramMessage(dmChat, `Поздравляю! 🎉\nТеперь ты — полноценная часть нашего сообщества! 💗\n\nУ тебя есть ${days} дней вместе с нами. Наслаждайся общением, пользой и крутыми ребятами ✨\n\nЕсли будут вопросы — всегда пиши мне.`, [[{ text: 'Поддержка', url: `https://t.me/${SUPPORT_HANDLE.replace(/^@/, '')}` }, { text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
    setTimeout(async () => {
      await sendTelegramMessage(dmChat, 'Хотим, чтобы твое включение в сообщество прошло легко и с пользой с самого старта. Прикладываем чек-лист — пройдись по нему в удобное время, это займет пару минут', REMINDER_KEYBOARD).catch(() => false)
      const file = getMaterialFile('checklist-novichka')
      if (file) await sendTelegramDocumentById(dmChat, file.fileId).catch(() => false)
    }, 10000)
  }, 10000)
}

// Открытие страницы вакансии → +1 к счётчику просмотров. Считаем реальные
// заходы (не демо-число), но не завязываем это на успех/провал остального
// стека — счётчик пишется сам по себе, до всех проверок ниже.
app.post('/api/vacancy/:slug/view', (req, res) => {
  const stats = incrementView(req.params.slug, utmLabel(req.body?.utm))
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

// Формы, которые считаются заказом услуги рекрутинга и становятся сделкой.
const DEAL_FORM_TYPES = new Set(['service_order', 'employer_request'])
// Формы раздела «Мероприятия», которые записываются в кабинет: регистрация на билет и заявки.
const EVENT_LEAD_TYPES = new Set(['event_registration', 'event_partner_application', 'event_order', 'partner_application', 'event_submission'])

app.post('/api/notify', async (req, res) => {
  const { direction, service, source, formType, name, contact, phone, email, telegram, company, template, interest, date, vacancySlug, eventSlug, ticketNumber, utm } = req.body ?? {}
  const utmSource = utmLabel(utm)

  // Отклик на вакансию — считаем реальный счётчик независимо от того,
  // настроен ли Telegram-бот ниже: заявка не должна "теряться" из
  // статистики только потому, что уведомление не смогло уйти.
  if (vacancySlug) {
    try {
      incrementApplication(vacancySlug, utmSource)
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

  // Заявка работодателя на рекрутинг — заводим сделку в разделе «Кадры»:
  // сквозной номер, этап «Формирование заказа», напоминания по этапам.
  let deal = null
  if (template === 'kadry-employer' && DEAL_FORM_TYPES.has(formType)) {
    try {
      const lines = Array.isArray(interest) ? interest : []
      const request = lines.map((l) => String(l).match(/^(?:Кого ищем|Ищем):\s*(.+)$/i)?.[1]).find(Boolean)
      const feeLine = lines.map((l) => String(l).match(/^Итого:\s*(.+)$/i)?.[1]).find(Boolean)
      const expectedFee = feeLine ? Number(feeLine.replace(/\D/g, '')) || null : null
      const created = createDeal({ company, name, phone, email, telegram, request: request === 'не указано' ? '' : request, details: lines, source: formType, expectedFee })
      if (created.duplicate) return res.json({ ok: true })
      deal = created.deal
    } catch (err) {
      console.error('[notify] не удалось завести сделку:', err)
    }
  }

  // Отклик на вакансию и заказ карьерной консультации — тоже записи со
  // сквозным номером: по ним строятся списки и итоги в разделе «Кадры → Соискатели».
  let record = null
  const lines = Array.isArray(interest) ? interest.map(String) : []
  try {
    if (vacancySlug) {
      const catalogTitle = readVacancyCatalog().find((v) => v.slug === vacancySlug)?.title
      const documents = lines.filter((l) => /приложен/i.test(l)).map((l) => l.split(' — ')[0])
      const app = createApplication({ vacancySlug, vacancyTitle: catalogTitle || String(service ?? '').match(/«(.+)»/)?.[1], name, phone, email, telegram, source: utmSource, documents })
      record = { text: `\n\n🗂 Отклик №${app.number}`, keyboard: [[{ text: '📥 Отклики на вакансию', callback_data: `a:s:vacs` }]] }
    } else if (formType === 'candidate_application' || formType === 'reserve_join_request') {
      const pick = (re) => lines.map((l) => l.match(re)?.[1]).find(Boolean)
      const requested = pick(/^(?:Должность|Запрос):\s*(.+)$/i)
      const candidate = createReserveCandidate({
        name,
        city: pick(/^Город:\s*(.+)$/i),
        university: pick(/^Университет:\s*(.+)$/i),
        position: requested && !/^Вступление в кадровый резерв$/i.test(requested) ? requested : pick(/^Должность:\s*(.+)$/i),
        telegram: normalizeTelegram(telegram),
        phone,
        email,
        source: formType,
        utm: utmSource,
      })
      record = {
        text: `\n\n🗃 Кадровый резерв: кандидат №${candidate.number} добавлен (всего в резерве: ${listReserve().length})\nПрикрепите ссылку на резюме в карточке.`,
        keyboard: [[{ text: `📂 Открыть кандидата №${candidate.number}`, callback_data: `a:s:rcard:${candidate.number}` }]],
      }
    } else if (EVENT_LEAD_TYPES.has(formType)) {
      const isRegistration = formType === 'event_registration'
      const e = createEventLead({
        kind: isRegistration ? 'registration' : 'request',
        formType,
        eventSlug: eventSlug || '',
        eventTitle: isRegistration || formType === 'event_partner_application' ? lines[0] : '',
        tariff: isRegistration ? lines[1] : '',
        name,
        phone,
        email,
        telegram,
        company: company || (formType === 'event_partner_application' ? lines[1] : formType === 'partner_application' ? lines[0] : ''),
        note: isRegistration ? '' : lines.join(' · '),
        source: utmSource,
      })
      record = {
        text: `\n\n🗂 ${isRegistration ? 'Регистрация' : 'Заявка по мероприятиям'} №${e.number}`,
        keyboard: [[{ text: `📂 Открыть №${e.number}`, callback_data: `a:x:evcard:${e.number}` }]],
      }
    } else if (formType === 'consultation_order' || formType === 'consultation_help_request') {
      const isOrder = formType === 'consultation_order'
      const total = isOrder ? Number((lines.find((l) => /^Итого:/i.test(l)) ?? '').replace(/\D/g, '')) || null : null
      const promo = lines.find((l) => /^Промокод:/i.test(l))?.replace(/^Промокод:\s*/i, '')
      const services = isOrder ? lines.filter((l) => !/^(Итого|Промокод):/i.test(l)) : lines
      const c = createConsultation({ kind: isOrder ? 'order' : 'question', services, promo, total, name, phone, email, telegram, source: utmSource })
      record = { text: `\n\n🗂 Консультация №${c.number} · ${isOrder ? 'заказ услуг' : 'вопрос'}`, keyboard: [[{ text: `📂 Открыть консультацию №${c.number}`, callback_data: `a:s:con:${c.number}` }]] }
    }
  } catch (err) {
    console.error('[notify] не удалось записать отклик/консультацию:', err)
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
        ticketNumber: deal ? String(deal.number) : ticketNumber,
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

  const dealNote = deal ? `\n\n🗂 Сделка №${deal.number} создана · этап 1: ${stageOf(1).name}` : ''
  const dealKeyboard = deal ? [[{ text: `📂 Открыть сделку №${deal.number}`, callback_data: `a:k:deal:${deal.number}` }]] : record?.keyboard
  const sourceNote = utm && utmSource !== 'без метки' ? `\n📣 Источник: ${utmSource}` : ''
  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, text + (record?.text ?? '') + sourceNote + dealNote, dealKeyboard).catch((err) => {
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
    fileUrl: purchase.paid && getMaterialFile(purchase.materialSlug) ? `/api/marketplace/purchase/${purchase.token}/file` : null,
  })
})

// Скачивание файла материала из личного кабинета — только для оплаченной покупки.
app.get('/api/marketplace/purchase/:token/file', async (req, res) => {
  const purchase = getPurchase(req.params.token)
  if (!purchase?.paid) return res.status(403).json({ ok: false, error: 'not_paid' })
  const file = getMaterialFile(purchase.materialSlug)
  if (!file) return res.status(404).json({ ok: false, error: 'no_file' })
  try {
    const buffer = await downloadTelegramFile(file.fileId)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName || `${purchase.materialSlug}.pdf`)}`)
    res.send(buffer)
  } catch (err) {
    console.error('[marketplace] не удалось отдать файл:', err.message)
    res.status(502).json({ ok: false, error: 'file_unavailable' })
  }
})

// Покупка билета на мероприятие → регистрация (ожидает оплаты) + ссылка на оплату Prodamus.
// Название и цену берём из каталога на сервере; оплата привязывается к регистрации по order_id «ev-N».
app.post('/api/event/:slug/checkout', async (req, res) => {
  const event = readEventCatalog().find((e) => e.slug === req.params.slug)
  if (!event) return res.status(404).json({ ok: false, error: 'unknown_event' })
  if (event.status !== 'open' || event.registrationLink) return res.status(400).json({ ok: false, error: 'not_for_sale' })
  const tariff = event.tariffs.find((t) => t.id === req.body?.tariffId)
  if (!tariff || !(tariff.price > 0)) return res.status(400).json({ ok: false, error: 'unknown_tariff' })

  const name = String(req.body.name ?? '').trim()
  const phone = String(req.body.phone ?? '').trim()
  const email = String(req.body.email ?? '').trim()
  const telegram = normalizeTelegram(req.body.telegram)
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' })
  if (normalizePhone(phone).length < 11 && !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'contact_required' })

  try {
    incrementEventRegistration(event.slug)
    const lead = createEventLead({ kind: 'registration', formType: 'event_registration', eventSlug: event.slug, eventTitle: event.title, tariff: tariff.name, name, phone, email, telegram, source: utmLabel(req.body.utm) })
    setEventLeadField(lead.number, 'price', tariff.price)
    const orderId = `ev-${lead.number}`
    const urlSuccess = `${SITE_URL}/events/${event.slug}?paid=1`
    const url = await createEventPaymentLink({ title: `${event.title} — ${tariff.name}`, price: tariff.price, orderId, phone, email: EMAIL_RE.test(email) ? email : '', urlSuccess, name })
    if (BOT_TOKEN && ADMIN_CHAT_ID) {
      const text = buildLeadNotification({ direction: 'Мероприятия', service: 'Покупка билета на мероприятие', date: new Date().toISOString(), name, phone, email, telegram, details: [`Мероприятие: ${event.title}`, `Билет: ${tariff.name} — ${tariff.price} ₽`, 'Статус: ждём оплату'], ticketNumber: String(lead.number) })
      await sendTelegramMessage(ADMIN_CHAT_ID, `${text}\n\n🗂 Регистрация №${lead.number}`, [[{ text: `📂 Открыть №${lead.number}`, callback_data: `a:x:evcard:${lead.number}` }]]).catch(() => false)
    }
    res.json({ ok: true, url })
  } catch (err) {
    console.error('[event-checkout] ошибка генерации ссылки на оплату:', err)
    res.status(500).json({ ok: false, error: 'link_generation_failed' })
  }
})

// Апдейты от Telegram-бота @LegalcareeristBot. Настраивается один раз
// командой setWebhook (см. README сервера).
// Ожидание текстового ответа от админа (сумма выручки, данные новой сделки):
// chatId → { type, number? }. Живёт в памяти — после перезапуска сервера просто нажмите кнопку ещё раз.
const adminInput = new Map()

const dealScreen = (number, now = Date.now()) => {
  const deal = getDeal(number)
  return deal ? dealCard(deal, now) : { text: `Сделка №${number} не найдена.`, keyboard: KADRY_KEYBOARD }
}

/** Каталог вакансий сайта (выгружается при сборке, см. scripts/export-vacancy-catalog.mjs). */
function readVacancyCatalog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'data', 'vacancy-catalog.json'), 'utf8'))
  } catch {
    return []
  }
}

/** «10.09» или «10.09.2026» → момент времени (полдень по Москве); пустая строка → undefined-дата = сегодня (null — не разобрал). */
function parseRuDate(text) {
  if (!text) return undefined
  const m = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
  if (!m) return null
  const nowY = Number(mskDayKey(Date.now()).slice(0, 4))
  let year = m[3] ? Number(m[3]) : nowY
  if (year < 100) year += 2000
  let ts = Date.parse(`${year}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}T12:00:00+03:00`)
  // «10.09» без года, введённое в январе про прошлый год: не уходим в будущее
  if (!m[3] && ts > Date.now() + 86400000) ts = Date.parse(`${year - 1}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}T12:00:00+03:00`)
  return Number.isNaN(ts) ? null : ts
}

/** Все данные кабинета одним объектом — для поиска, сводки дня и финансов. */
function allData() {
  return {
    joins: listJoins(),
    deals: listAllDeals(),
    applications: listApplications(),
    consultations: listConsultations(),
    interests: listInterests(),
    reserve: listReserve(),
    eventLeads: listEventLeads(),
    ambassadors: listAmbassadors(),
    expenses: listExpenses(),
    purchases: listPurchases(),
    botUsers: listBotUsers(),
    todos: listTodos(),
  }
}

function currentHealth() {
  const users = listBotUsers()
  return [`👤 Пользователей бота: ${users.length}, согласие на ПД: ${users.filter((u) => u.consentAt).length}, согласны на рассылку: ${users.filter((u) => u.mailingConsent === true).length}`, ...healthLines({
    lastWebhook: lastWebhook(),
    lastPollAt,
    pollingEnabled: Boolean(BOT_TOKEN && process.env.TELEGRAM_POLLING !== '0'),
    errors: recentErrors,
    lastBackupAt: readBackupState().lastAt,
    activeSubscribers: listJoins().filter((j) => j.status === 'active').length,
    latencies: telegramLatencies,
  })]
}

/** Резервная копия папки data админу в Telegram файлом. Возвращает true, если ушла. */
async function sendBackup(caption) {
  const buffer = await makeBackup()
  if (buffer.length > 45 * 1024 * 1024) {
    await sendTelegramMessage(ADMIN_CHAT_ID, '⚠️ Резервная копия больше 45 МБ — Telegram не принимает такой файл. Снимите копию папки server/data вручную.')
    return false
  }
  const ok = await sendTelegramDocument(ADMIN_CHAT_ID, buffer, `legalcareerist-data-${mskDayKey(Date.now())}.tar.gz`, caption)
  if (ok) writeBackupState({ ...readBackupState(), lastAt: Date.now() })
  return ok
}

const menuBack = (text, data) => [[{ text, callback_data: data }, { text: '🏠 Меню', callback_data: 'a:menu' }]]

/** Кнопки дополнительных разделов (callback «a:x:…»). */
async function extrasAction(parts, now, chatId) {
  const [action, arg, arg2] = parts
  const data = allData()
  const ambOr = (n) => {
    const a = getAmbassador(n)
    return a ? ambassadorCard(a) : ambassadorsScreen(listAmbassadors())
  }
  const eventCard = (n) => {
    const e = getEventLead(n)
    return e ? eventLeadCard(e) : { text: `Запись №${n} не найдена.`, keyboard: menuBack('⬅️ Мероприятия', 'a:sec:events') }
  }
  switch (action) {
    case 'amb':
      return ambassadorsScreen(data.ambassadors)
    case 'ambcard':
      return ambOr(arg)
    case 'ambnew':
      adminInput.set(String(chatId), { type: 'ambassador' })
      return { text: AMBASSADOR_PROMPT, keyboard: menuBack('⬅️ Амбассадоры', 'a:x:amb') }
    case 'ambplus':
      addReferral(arg, Number(arg2))
      return ambOr(arg)
    case 'ambdel':
      return { text: `🗑 Удалить амбассадора №${arg}?`, keyboard: [[{ text: '✅ Да, удалить', callback_data: `a:x:ambdelok:${arg}` }, { text: 'Отмена', callback_data: `a:x:ambcard:${arg}` }]] }
    case 'ambdelok':
      deleteAmbassador(arg)
      return ambassadorsScreen(listAmbassadors())
    case 'kick': {
      const j = getJoin(arg)
      if (!j) return { text: 'Подписчик не найден.', keyboard: menuBack('⬅️ Сообщество', 'a:sec:community') }
      return { text: `🚪 Исключить ${[j.name, j.telegram].filter(Boolean).join(' ')} из чата сообщества и написать ему, что подписка истекла?\n\nЧеловек сможет вернуться сам, оплатив подписку.`, keyboard: [[{ text: '✅ Да, исключить', callback_data: `a:x:kickok:${arg}` }, { text: 'Отмена', callback_data: 'a:x:over' }]] }
    }
    case 'kickok': {
      const j = getJoin(arg)
      const ok = j ? await kickAndNotify(j) : false
      return { text: ok ? '🚪 Готово: человек исключён из чата, ему отправлено сообщение.' : '⚠️ Не удалось исключить: нет Telegram id или бот не администратор чата. Подробности в логе.', keyboard: menuBack('⬅️ Сообщество', 'a:sec:community') }
    }
    case 'over':
      return overdueScreen(data.joins, TARIFFS, now)
    case 'ret':
      return retentionScreen(data.joins)
    case 'cxl': {
      const j = getJoin(arg)
      return j ? cancelCard(j) : cancelledScreen(data.joins, TARIFFS)
    }
    case 'cr': {
      setCancelReason(arg, arg2)
      const j = getJoin(arg)
      return j ? cancelCard(j) : cancelledScreen(listJoins(), TARIFFS)
    }
    case 'fsum':
      return financeSummary(data, extraMonthKey(arg, now))
    case 'csv': {
      const key = extraMonthKey(arg, now)
      const csv = buildMonthCsv(data, key)
      const ok = await sendTelegramDocument(chatId, Buffer.from(csv, 'utf8'), `finance-${key}.csv`, `📎 Доходы и расходы за ${key}`).catch(() => false)
      return { text: ok ? `📎 Выгрузка за ${key} отправлена файлом выше. Откроется в Excel и Google Таблицах.` : '⚠️ Не удалось отправить файл.', keyboard: menuBack('⬅️ Финансы', 'a:sec:finance') }
    }
    case 'fcast':
      return forecastScreen(data.joins, data.deals, TARIFFS, now)
    case 'fexp':
      return expensesScreen(data.expenses, extraMonthKey('cur', now))
    case 'fexpnew':
      adminInput.set(String(chatId), { type: 'expense' })
      return { text: EXPENSE_PROMPT, keyboard: menuBack('⬅️ Расходы', 'a:x:fexp') }
    case 'fexpdel':
      deleteExpense(arg)
      return expensesScreen(listExpenses(), extraMonthKey('cur', now))
    case 'evreg':
      return eventRegistrationsScreen(data.eventLeads)
    case 'evone':
      return eventScreen(data.eventLeads, arg)
    case 'evcard':
      return eventCard(arg)
    case 'evst':
      setEventLeadStatus(arg, arg2)
      return eventCard(arg)
    case 'evpaid':
      adminInput.set(String(chatId), { type: 'event-paid', number: Number(arg) })
      return { text: `💳 Регистрация №${arg}: отправьте сумму оплаты числом, например 3500. Отмена — /cancel.`, keyboard: menuBack('⬅️ К карточке', `a:x:evcard:${arg}`) }
    case 'evreq':
      return eventRequestsScreen(data.eventLeads)
    case 'evmonth':
      return eventsMonthSummary(data.eventLeads, arg, now)
    case 'find':
      adminInput.set(String(chatId), { type: 'find' })
      return { text: FIND_PROMPT, keyboard: [[{ text: '⬅️ Меню', callback_data: 'a:menu' }]] }
    case 'digest':
      return digestScreen(data, TARIFFS, now, currentHealth())
    case 'sys': {
      const lines = currentHealth()
      try {
        const w = await telegramWebhookInfo()
        lines.unshift(`🤖 Бот: @${w.username}${w.url ? ` · ⚠️ вебхук стоит на ${new URL(w.url).host} (сообщения могут уходить не сюда)` : ' · вебхука нет, сообщения приходят на этот сервер ✅'}`)
      } catch {
        lines.unshift('🤖 Не удалось проверить вебхук бота')
      }
      return systemScreen(lines)
    }
    case 'backup': {
      const ok = await sendBackup('💾 Резервная копия данных бота (по запросу)').catch(() => false)
      return { text: ok ? '💾 Резервная копия отправлена файлом выше.' : '⚠️ Не удалось отправить резервную копию — подробности в логе сервера.', keyboard: menuBack('⬅️ Система', 'a:x:sys') }
    }
    case 'audit':
      return auditScreen(recentActions())
    case 'grant': {
      const u = getBotUser(arg)
      if (u && !listJoins().some((j) => String(j.tgUserId ?? '') === String(u.id) && j.lifetime)) createLifetimeJoin({ tgUserId: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' '), telegram: u.username })
      return u ? userCard(u, listJoins().find((j) => String(j.tgUserId ?? '') === String(u.id) && j.lifetime), TARIFFS, now) : { text: 'Пользователь не найден.', keyboard: menuBack('⬅️ Меню', 'a:menu') }
    }
    case 'todo':
      return todosScreen(listTodos())
    case 'tdone':
      setTodoDone(arg)
      return todosScreen(listTodos())
    case 'tnew':
      adminInput.set(String(chatId), { type: 'todo' })
      return { text: TODO_PROMPT, keyboard: menuBack('⬅️ Доработки', 'a:x:todo') }
    case 'chatcheck':
      return chatCheckScreen(await checkCommunityChat())
    case 'bots':
      return botUsersScreen(listBotUsers())
    case 'pc': {
      const u = getBotUser(arg)
      if (!u) return { text: 'Пользователь не найден.', keyboard: menuBack('⬅️ Пользователи бота', 'a:x:bots') }
      const join = data.joins.filter((j) => String(j.tgUserId ?? '') === String(u.id)).sort((a, b) => (b.lastPaidAt ?? 0) - (a.lastPaidAt ?? 0))[0]
      return userCard(u, join, TARIFFS, now)
    }
    default:
      return { text: 'Раздел не найден.', keyboard: menuBack('⬅️ Меню', 'a:menu') }
  }
}

/** Кнопки «Кадры → Соискатели»: parts — callback_data без префикса «a:s:». */
const reserveScreen = (number) => {
  const c = getReserveCandidate(number)
  return c ? reserveCard(c) : { text: `Кандидат №${number} не найден.`, keyboard: SEEKERS_KEYBOARD }
}

const interestScreen = (number) => {
  const i = getInterest(number)
  return i ? interestCard(i) : { text: `Запись №${number} не найдена.`, keyboard: SEEKERS_KEYBOARD }
}

function seekersAction(parts, now, chatId) {
  const [action, arg, arg2] = parts
  const applications = listApplications()
  const vacancies = buildVacancyViews(readVacancyCatalog(), allVacancyStats(), applications, SITE_URL, vacancyOverrides())
  const findVacancy = (key) => vacancies.find((v) => v.key === key)
  const missing = { text: 'Не нашёл такую вакансию — возможно, она снята с сайта.', keyboard: SEEKERS_KEYBOARD }
  switch (action) {
    case 'vacs':
      return vacanciesScreen(vacancies)
    case 'vac': {
      const v = findVacancy(arg)
      return v ? vacancyCard(v) : missing
    }
    case 'vst': {
      setVacancyStatus(findVacancy(arg)?.slug ?? arg, arg2 === 'closed' ? 'closed' : 'open')
      const fresh = buildVacancyViews(readVacancyCatalog(), allVacancyStats(), applications, SITE_URL, vacancyOverrides()).find((v) => v.key === arg)
      return fresh ? vacancyCard(fresh) : missing
    }
    case 'vapps': {
      const v = findVacancy(arg)
      return v ? vacancyApplicationsScreen(v, applications) : missing
    }
    case 'apps':
      return recentApplicationsScreen(applications)
    case 'cons':
      return consultationsScreen(listConsultations())
    case 'con': {
      const c = getConsultation(arg)
      return c ? consultationCard(c) : { text: `Консультация №${arg} не найдена.`, keyboard: SEEKERS_KEYBOARD }
    }
    case 'cst': {
      const c = setConsultationStatus(arg, arg2)
      return c ? consultationCard(c) : { text: `Консультация №${arg} не найдена.`, keyboard: SEEKERS_KEYBOARD }
    }
    case 'rlist':
      return reserveListScreen(listReserve())
    case 'rcard':
      return reserveScreen(arg)
    case 'rnew':
      adminInput.set(String(chatId), { type: 'reserve-new' })
      return { text: RESERVE_NEW_PROMPT, keyboard: [[{ text: '⬅️ К резерву', callback_data: 'a:s:rlist' }]] }
    case 'redit': {
      const c = getReserveCandidate(arg)
      if (!c) return reserveScreen(arg)
      adminInput.set(String(chatId), { type: 'reserve-field', number: c.number, field: arg2 })
      return reserveFieldPrompt(c, arg2)
    }
    case 'rdel': {
      const c = getReserveCandidate(arg)
      return c ? reserveDeleteConfirm(c) : reserveScreen(arg)
    }
    case 'rdelok':
      deleteReserveCandidate(arg)
      return reserveListScreen(listReserve())
    case 'inew':
      return { text: '➕ Записать интерес\n\nЧем интересовался человек?', keyboard: INTEREST_KIND_KEYBOARD }
    case 'ikind':
      adminInput.set(String(chatId), { type: 'interest', kind: arg })
      return { text: interestPrompt(arg), keyboard: [[arg === 'community' ? { text: '⬅️ Сообщество', callback_data: 'a:sec:community' } : { text: '⬅️ Соискатели', callback_data: 'a:sec:seekers' }]] }
    case 'ilist':
      return interestsScreen(listInterests(), arg === 'community' ? 'community' : 'seekers')
    case 'icard':
      return interestScreen(arg)
    case 'idone':
      markInterestDone(arg)
      return interestScreen(arg)
    case 'iclose':
      closeInterest(arg)
      return interestScreen(arg)
    case 'isnooze':
      snoozeInterest(arg)
      return interestScreen(arg)
    case 'month':
      return seekersMonthSummary(applications, listConsultations(), arg, now, listReserve())
    default:
      return { text: '🎓 Соискатели', keyboard: SEEKERS_KEYBOARD }
  }
}

/** Кнопки «Кадры → сделки»: parts — callback_data без префикса «a:k:». */
function kadryAction(parts, now, chatId) {
  const [action, arg] = parts
  const number = Number(arg)
  const deals = listAllDeals()
  switch (action) {
    case 'list':
      return activeDealsScreen(deals)
    case 'funnel':
      return funnelScreen(deals)
    case 'stage':
      return stageScreen(deals, number)
    case 'closed':
      return closedScreen(deals)
    case 'month':
      return monthSummary(deals, monthKeyFor(arg, now), now)
    case 'deal':
      return dealScreen(number, now)
    case 'adv':
      moveDeal(number, 1)
      return dealScreen(number, now)
    case 'back':
      moveDeal(number, -1)
      return dealScreen(number, now)
    case 'q1':
      setQualified(number, true)
      return dealScreen(number, now)
    case 'q0':
      setQualified(number, false)
      return dealScreen(number, now)
    case 'lost':
      closeDeal(number, 'lost', 'закрыта вручную')
      return dealScreen(number, now)
    case 'reopen':
      reopenDeal(number)
      return dealScreen(number, now)
    case 'pp': {
      const deal = getDeal(number)
      if (deal && prepayAmount(deal)) addDealPayment(number, prepayAmount(deal), 'prepay')
      return dealScreen(number, now)
    }
    case 'pf': {
      const deal = getDeal(number)
      const left = deal?.expectedFee ? deal.expectedFee - dealReceived(deal) : 0
      if (left > 0) addDealPayment(number, left, 'final')
      return dealScreen(number, now)
    }
    case 'tpl': {
      const deal = getDeal(number)
      if (!deal) return dealScreen(number, now)
      return { text: `${TEMPLATE_INTRO(deal)}\n\n———\n${dealTemplate(deal)}\n———`, keyboard: [[{ text: '⬅️ К сделке', callback_data: `a:k:deal:${number}` }]] }
    }
    case 'revok': {
      const deal = getDeal(number)
      if (deal?.expectedFee) setRevenue(number, deal.expectedFee)
      return dealScreen(number, now)
    }
    case 'rev':
      adminInput.set(String(chatId), { type: 'revenue', number })
      return { text: `💰 Сделка №${number}: отправьте сумму выручки числом, например 120000.\nДля отмены — /cancel.`, keyboard: [[{ text: '⬅️ К сделке', callback_data: `a:k:deal:${number}` }]] }
    case 'new':
      adminInput.set(String(chatId), { type: 'newdeal' })
      return { text: NEW_DEAL_PROMPT, keyboard: [[{ text: '⬅️ Работодатели', callback_data: 'a:sec:employers' }]] }
    default:
      return { text: 'Раздел «Кадры»', keyboard: KADRY_KEYBOARD }
  }
}

/** Текстовый ответ админа на вопрос бота (выручка / новая сделка). */
async function handlePendingInput(chatId, pending, text) {
  if (pending.type !== 'find') logAction(chatId, `input:${pending.type}${pending.number ? `:${pending.number}` : ''}`)
  if (pending.type === 'revenue') {
    const amount = Number(text.replace(/[^\d.,]/g, '').replace(',', '.'))
    if (!(amount > 0)) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Не разобрал сумму. Отправьте число, например 120000, или /cancel.')
      return
    }
    setRevenue(pending.number, amount)
    const screen = dealScreen(pending.number)
    await sendLongMessage(chatId, `✅ Выручка записана: ${formatRub(amount)}\n\n${screen.text}`, screen.keyboard)
    return
  }
  if (pending.type === 'todo') {
    addTodo(text.trim())
    const screen = todosScreen(listTodos())
    await sendLongMessage(chatId, `✅ Добавлено.\n\n${screen.text}`, screen.keyboard)
    return
  }
  if (pending.type === 'find') {
    const screen = searchScreen(text, allData(), TARIFFS)
    await sendLongMessage(chatId, screen.text, screen.keyboard)
    return
  }
  if (pending.type === 'ambassador') {
    const [name, telegram, phone, promo, note] = text.split('\n').map((l) => (l.trim() === '-' ? '' : l.trim()))
    if (!name) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Нужно хотя бы имя (первая строка). Отправьте ещё раз или /cancel.')
      return
    }
    const a = createAmbassador({ name, telegram: normalizeTelegram(telegram), phone, promo, note })
    const card = ambassadorCard(a)
    await sendLongMessage(chatId, `✅ Амбассадор добавлен\n\n${card.text}`, card.keyboard)
    return
  }
  if (pending.type === 'expense') {
    const parsed = parseExpense(text)
    if (!parsed) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Не разобрал. Начните с суммы, например: 5000 реклама ВК. Или /cancel.')
      return
    }
    const e = createExpense(parsed)
    const screen = expensesScreen(listExpenses(), extraMonthKey('cur', Date.now()))
    await sendLongMessage(chatId, `✅ Расход записан: ${formatRub(e.amount)} · ${e.category}\n\n${screen.text}`, screen.keyboard)
    return
  }
  if (pending.type === 'event-paid') {
    const amount = Number(text.replace(/[^\d.,]/g, '').replace(',', '.'))
    if (!(amount > 0)) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Не разобрал сумму. Отправьте число, например 3500, или /cancel.')
      return
    }
    setEventLeadStatus(pending.number, 'paid', amount)
    const e = getEventLead(pending.number)
    const card = eventLeadCard(e)
    await sendLongMessage(chatId, `✅ Оплата отмечена: ${formatRub(amount)}\n\n${card.text}`, card.keyboard)
    return
  }
  if (pending.type === 'reserve-field') {
    const value = text.trim() === '-' ? '' : text.trim()
    if (pending.field === 'resumeUrl' && value && !/^https?:\/\//i.test(value)) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Нужна ссылка, начинающаяся с http. Отправьте ещё раз или /cancel.')
      return
    }
    setReserveField(pending.number, pending.field, value)
    const screen = reserveScreen(pending.number)
    await sendLongMessage(chatId, `✅ Сохранено.\n\n${screen.text}`, screen.keyboard)
    return
  }
  if (pending.type === 'reserve-new') {
    const [name, city, university, position, telegram, phone, resumeUrl] = text.split('\n').map((l) => (l.trim() === '-' ? '' : l.trim()))
    if (!name) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Нужно хотя бы ФИО (первая строка). Отправьте ещё раз или /cancel.')
      return
    }
    const created = createReserveCandidate({ name, city, university, position, telegram: normalizeTelegram(telegram), phone, resumeUrl: /^https?:\/\//i.test(resumeUrl ?? '') ? resumeUrl : '', source: 'manual' })
    const screen = reserveCard(created)
    await sendLongMessage(chatId, `✅ Кандидат №${created.number} добавлен\n\n${screen.text}`, screen.keyboard)
    return
  }
  if (pending.type === 'interest') {
    const rows = text.split('\n')
    const [name, telegram, phone, dateText] = rows.slice(0, 4).map((l) => (l.trim() === '-' ? '' : l.trim()))
    const note = rows.slice(4).join('\n').trim().replace(/^-$/, '')
    const contactedAt = parseRuDate(dateText)
    if (!name && !telegram && !phone) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Нужно хотя бы имя, Telegram или телефон. Отправьте ещё раз или /cancel.')
      return
    }
    if (dateText && contactedAt === null) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Не разобрал дату. Напишите ДД.ММ (например 10.09) или «-», если обращение сегодня. Отправьте всё сообщение ещё раз или /cancel.')
      return
    }
    const created = createInterest({ kind: pending.kind, name, telegram: normalizeTelegram(telegram), phone, note, contactedAt: contactedAt ?? undefined })
    const card = interestCard(created)
    await sendLongMessage(chatId, `✅ Записано. Напомню написать ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' }).format(new Date(created.remindAt))} (примерно через ${REMIND_AFTER_DAYS} дней после обращения).\n\n${card.text}`, card.keyboard)
    return
  }
  if (pending.type === 'newdeal') {
    const [company, name, phone, email, telegram, request] = text.split('\n').map((l) => (l.trim() === '-' ? '' : l.trim()))
    if (!company || (!phone && !email && !telegram)) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Нужны как минимум компания (1-я строка) и один контакт — телефон, почта или Telegram. Отправьте ещё раз или /cancel.')
      return
    }
    const { deal } = createDeal({ company, name, phone, email, telegram, request, details: [], source: 'manual' })
    const screen = dealCard(deal)
    await sendLongMessage(chatId, `✅ Сделка №${deal.number} создана\n\n${screen.text}`, screen.keyboard)
  }
}

/** Напоминания по сделкам: раз в день после 10:00 по Москве, по каждой сделке — когда подошёл срок этапа. */
let dealRemindersRunning = false
async function sendDealRemindersIfDue() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID || dealRemindersRunning) return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  if (hour < 10) return
  dealRemindersRunning = true
  try {
    for (const deal of dealsDueForReminder(now)) {
      const screen = dealReminder(deal)
      const ok = await sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard).catch(() => false)
      if (!ok) continue
      // На испытательном сроке первое напоминание — на 30-й день, дальше каждые 3 дня, пока сделку не закроют.
      const everyDays = deal.stage === LAST_STAGE ? 3 : stageOf(deal.stage).remindDays
      scheduleReminder(deal.number, now + everyDays * 24 * 3600 * 1000)
    }
  } finally {
    dealRemindersRunning = false
  }
}

/** Напоминания «напишите тем, кто интересовался»: раз в сутки после 10:00 МСК, потом каждую неделю, пока не отметите. */
let interestRemindersRunning = false
async function sendInterestRemindersIfDue() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID || interestRemindersRunning) return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  if (hour < 10) return
  interestRemindersRunning = true
  try {
    for (const item of interestsDueForReminder(now)) {
      const card = interestCard(item, { reminder: true })
      const ok = await sendTelegramMessage(ADMIN_CHAT_ID, card.text, card.keyboard).catch(() => false)
      if (ok) markInterestReminded(item.number, now + REMIND_AFTER_DAYS * 24 * 3600 * 1000)
    }
  } finally {
    interestRemindersRunning = false
  }
}

// Итоги месяца по кадровому агентству — автоматически в начале следующего месяца (после 10:00 МСК).
const KADRY_MONTHLY_FILE = path.join(import.meta.dirname, 'data', 'kadry-monthly.json')
async function sendKadryMonthlyIfDue() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  const prev = monthKeyFor('prev', now)
  let lastSent = null
  try {
    lastSent = JSON.parse(fs.readFileSync(KADRY_MONTHLY_FILE, 'utf8')).lastSent
  } catch {
    // первый запуск: не шлём итоги за месяц, когда учёта ещё не было
    fs.mkdirSync(path.dirname(KADRY_MONTHLY_FILE), { recursive: true })
    fs.writeFileSync(KADRY_MONTHLY_FILE, JSON.stringify({ lastSent: prev }))
    return
  }
  if (lastSent === prev || hour < 10) return
  fs.writeFileSync(KADRY_MONTHLY_FILE, JSON.stringify({ lastSent: prev }))
  const screen = monthSummary(listAllDeals(), prev, now)
  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard).catch(() => false)
  if (!ok) fs.writeFileSync(KADRY_MONTHLY_FILE, JSON.stringify({ lastSent }))
}

/** Длинный текст режет по строкам на части до лимита Telegram (4096 символов); кнопки — под последней. */
async function sendLongMessage(chatId, text, keyboard) {
  const chunks = []
  let current = ''
  for (const line of text.split('\n')) {
    if (current && current.length + line.length + 1 > 3800) {
      chunks.push(current)
      current = ''
    }
    current += (current ? '\n' : '') + line
  }
  if (current) chunks.push(current)
  for (let i = 0; i < chunks.length; i++) await sendTelegramMessage(chatId, chunks[i], i === chunks.length - 1 ? keyboard : undefined)
}

/** Экран кабинета по callback_data кнопки. Возвращает { text, keyboard }. */
async function adminScreen(data, now, chatId) {
  if (data.startsWith('a:k:')) return kadryAction(data.split(':').slice(2), now, chatId)
  if (data.startsWith('a:s:')) return seekersAction(data.split(':').slice(2), now, chatId)
  if (data.startsWith('a:x:')) return extrasAction(data.split(':').slice(2), now, chatId)
  const joins = listJoins()
  const [, action, arg] = data.split(':')
  if (action === 'sec') return sectionScreen(arg)
  if (action === 'rep') return { text: reportText(arg, now), keyboard: FINANCE_KEYBOARD }
  if (action === 'subs') return subscribersScreen(joins, TARIFFS)
  if (action === 'plan') return planScreen(joins, TARIFFS, arg)
  if (action === 'due') return dueScreen(joins, now, TARIFFS)
  if (action === 'due14') return dueScreen(joins, now, TARIFFS, 14)
  if (action === 'cancelled') return cancelledScreen(joins, TARIFFS)
  if (action === 'rem') return arg ? reminderPreviewScreen(joins, now, Number(arg)) : reminderMenuScreen()
  if (action === 'remgo') {
    const days = Number(arg)
    const { reachable } = reminderTargets(joins, now, days)
    let sent = 0
    const failed = []
    for (const join of reachable) {
      const ok = await sendTelegramMessage(join.tgUserId, reminderMessage(join, SUPPORT_HANDLE, days), REMINDER_KEYBOARD).catch(() => false)
      if (ok) {
        markReminded(join.token, `${join.nextPaymentAt}:${days}`)
        sent += 1
      } else failed.push(join)
    }
    const lines = [`✅ Напоминаний отправлено: ${sent}`]
    if (failed.length) lines.push('', 'Не дошло (человек не начинал диалог с ботом или заблокировал его):', ...failed.map((j) => `• ${[j.name, j.telegram, j.phone].filter(Boolean).join(', ')}`))
    return { text: lines.join('\n'), keyboard: COMMUNITY_KEYBOARD }
  }
  if (action === 'status') {
    const last = lastWebhook()
    const active = joins.filter((j) => j.status === 'active').length
    const lines = [
      '🔌 Состояние системы',
      '',
      `Карточек подписчиков: ${joins.length}, активных: ${active}`,
      last
        ? `Последний вебхук Prodamus: ${new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' }).format(new Date(last.at))} МСК (${last.status})`
        : '⚠️ Вебхуков Prodamus с оплатой ещё не было',
      `Ежедневный отчёт: в ${REPORT_HOUR_MSK}:00 МСК`,
    ]
    return { text: lines.join('\n'), keyboard: COMMUNITY_KEYBOARD }
  }
  return menuScreen()
}

// Кнопки, которые что-то меняют или отправляют данные: помощникам (только просмотр) они недоступны, в журнал попадают только они.
// Кнопки, которые только открывают ввод текста или подтверждение — в журнал не пишем (запишется само действие).
const PROMPT_ONLY = /^a:(k:(rev|new)|s:(ikind|inew|rnew|redit|rdel)|x:(tnew|ambnew|ambdel|fexpnew|evpaid))\b/
const MUTATING = /^a:(k:(adv|back|q1|q0|lost|reopen|revok|rev|new|pp|pf)|s:(vst|cst|idone|iclose|isnooze|ikind|inew|rnew|redit|rdel|rdelok)|x:(grant|tnew|tdone|ambnew|ambplus|ambdel|ambdelok|kickok|cr|fexpnew|fexpdel|evst|evpaid|backup)|remgo)\b/

/** Нажатие кнопки кабинета — от админа (все кнопки) или помощника (только просмотр); остальным молча отвечаем. */
async function handleAdminCallback(query) {
  const chatId = query.message?.chat?.id
  const answer = (text) => ackCallback(query, text, true)
  const fromId = String(query.from?.id)
  const isAdmin = fromId === String(ADMIN_CHAT_ID)
  const isViewer = VIEWER_IDS.has(fromId)
  if (!chatId || !(isAdmin || isViewer) || !String(query.data ?? '').startsWith('a:')) {
    void answer()
    return
  }
  const mutating = MUTATING.test(query.data)
  if (!isAdmin && mutating) {
    await answer('Этот аккаунт — только для просмотра.')
    return
  }
  void answer()
  if (isDuplicateTap(query, 1200)) return
  if (mutating && !PROMPT_ONLY.test(query.data)) logAction(fromId, query.data)
  const screen = await adminScreen(query.data, Date.now(), chatId)
  await sendLongMessage(chatId, screen.text, screen.keyboard)
}

/** Один апдейт от Telegram — общий для вебхука и для опроса (getUpdates). */
/** Подписчик, чей Telegram уже привязан к оплаченной подписке (иначе кабинет не открывается). */
// Если у человека несколько карточек (старые тестовые, бессрочная, действующая), выбираем самую «сильную»:
// бессрочная, затем активная, затем остальные по дате последней оплаты.
function residentByTelegramId(tgId) {
  const rank = (j) => (j.lifetime ? 2 : j.status === 'active' ? 1 : 0)
  return listJoins()
    .filter((j) => j.paid && String(j.tgUserId ?? '') === String(tgId))
    .sort((a, b) => rank(b) - rank(a) || (b.lastPaidAt ?? 0) - (a.lastPaidAt ?? 0))[0] ?? null
}

// Основатель и другие «вечные» резиденты: доступ без оплаты и без срока (env LIFETIME_USERNAMES=ник1,ник2).
const LIFETIME_USERNAMES = new Set(String(process.env.LIFETIME_USERNAMES ?? 'rudenkovrd').split(',').map((v) => v.trim().replace(/^@/, '').toLowerCase()).filter(Boolean))

// Условные даты бессрочной подписки (для отображения в «Моя подписка»): начало 21.02.2025, конец 31.12.2045.
const LIFETIME_START = Date.parse('2025-02-21T12:00:00+03:00')
const LIFETIME_END = Date.parse('2045-12-31T12:00:00+03:00')
const LIFETIME_IDS = new Set(String(process.env.LIFETIME_IDS ?? '').split(',').map((v) => v.trim()).filter(Boolean))

/** Если ник в списке «вечных» и карточки резидента ещё нет — заводит её (бессрочная подписка). */
function ensureLifetimeResident(user) {
  const nick = String(user.username ?? '').replace(/^@/, '').toLowerCase()
  // Бессрочный доступ: по нику из LIFETIME_USERNAMES, по id из LIFETIME_IDS и всегда для админского аккаунта.
  const isLifetime = (nick && LIFETIME_USERNAMES.has(nick)) || LIFETIME_IDS.has(String(user.id)) || String(user.id) === String(ADMIN_CHAT_ID)
  if (!isLifetime) return
  const existing = listJoins().find((j) => String(j.tgUserId ?? '') === String(user.id) && j.lifetime)
  if (!existing) createLifetimeJoin({ tgUserId: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' '), telegram: user.username, startAt: LIFETIME_START, endsAt: LIFETIME_END })
  else if (!existing.startAt) {
    // карточки, заведённые раньше без дат
    setJoinField(existing.token, 'startAt', LIFETIME_START)
    setJoinField(existing.token, 'firstPaidAt', LIFETIME_START)
    setJoinField(existing.token, 'endsAt', LIFETIME_END)
  }
}

/** Старт воронки: метка «пользователь»; дальше согласие на обработку ПД → пол (если не определён) → согласие на рассылку → главное меню. */
async function startFlow(chatId, from, startParam) {
  userFlows.delete(String(chatId))
  const user = touchBotUser({ ...from, id: from?.id ?? chatId }, startParam)
  ensureLifetimeResident(user)
  if (startParam !== undefined) countConversation(user.id)
  await sendFlowStep(chatId, user)
}

/** Экран следующего незавершённого шага воронки. */
function flowScreen(user) {
  if (!user.consentAt) return welcomeScreen(user, SITE_URL)
  if (!user.gender) return genderScreen(user)
  if (user.mailingConsent === undefined) return mailingScreen(SITE_URL, user)
  return mainMenuScreen(SITE_URL, user)
}

async function sendFlowStep(chatId, user) {
  const screen = flowScreen(user)
  await sendTelegramMessage(chatId, screen.text, screen.keyboard)
}

/** Ответ на нажатие кнопки: правим то же сообщение (без новых сообщений и дублей при повторных нажатиях); если не вышло — отправляем новое. */
async function editOrSend(query, screen) {
  const chatId = query.message?.chat?.id
  const messageId = query.message?.message_id
  if (chatId && messageId) {
    try {
      const res = await telegramFetch('editMessageText', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: screen.text, reply_markup: { inline_keyboard: screen.keyboard ?? [] }, disable_web_page_preview: true }) })
      if (res.ok) return true
      const body = await res.text()
      if (body.includes('message is not modified')) return true
    } catch {
      // упали на сети — ниже пробуем отправить новым сообщением
    }
  }
  return sendTelegramMessage(chatId, screen.text, screen.keyboard)
}

// Защита от «дребезга»: повторное нажатие той же кнопки в течение 2 секунд игнорируется.
const recentTaps = new Map()
function isDuplicateTap(query, windowMs = 2000) {
  const key = `${query.from?.id}:${query.data}`
  const now = Date.now()
  if (now - (recentTaps.get(key) ?? 0) < windowMs) return true
  recentTaps.set(key, now)
  if (recentTaps.size > 500) for (const [k, t] of recentTaps) if (now - t > 60000) recentTaps.delete(k)
  return false
}

/** Мгновенно подтверждает нажатие (крутилка на кнопке пропадает), не дожидаясь остальной работы. */
function ackCallback(query, text, alert = false) {
  return telegramFetch('answerCallbackQuery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: query.id, ...(text ? { text, show_alert: alert } : {}) }) }).catch(() => null)
}

/** «Печатает…» на время долгих действий (создание ссылки на оплату и т. п.). */
function typing(chatId) {
  telegramFetch('sendChatAction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }) }).catch(() => null)
}

/** Материалы для бота: цена и название — из серверного списка (источник истины), описание — из каталога сайта. */
function materialList() {
  let catalog = []
  try {
    catalog = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'data', 'material-catalog.json'), 'utf8'))
  } catch {
    // каталог ещё не выгружен — карточки будут без описания
  }
  return Object.entries(MATERIALS).map(([slug, m]) => {
    const c = catalog.find((x) => x.slug === slug)
    return { slug, title: m.title, price: m.price, accessUrl: m.accessUrl, description: c?.description ?? '', forWhom: c?.forWhom ?? '' }
  })
}

/** Выдача материала после оплаты: файл (если админ его загрузил), иначе ссылка, иначе — передаём поддержке. Затем просьба об отзыве. */
async function deliverMaterial(chatId, slug) {
  const material = materialList().find((m) => m.slug === slug)
  await sendTelegramMessage(chatId, PAID_TEXTS[slug] ?? PAID_TEXT, paidKeyboard())
  const file = getMaterialFile(slug)
  if (file) {
    await sendTelegramDocumentById(chatId, file.fileId, material?.title)
  } else if (material?.accessUrl) {
    await sendTelegramMessage(chatId, `${material.title}\n${material.accessUrl}`)
  } else {
    await sendTelegramMessage(chatId, `Файл материала пришлёт поддержка — ${SUPPORT_HANDLE}.`)
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Оплачен материал «${material?.title ?? slug}», но файл не загружен в бота. Отправьте боту PDF с подписью /material ${slug} и перешлите файл покупателю (chat id ${chatId}).`)
  }
  if (getBotUser(chatId)?.mailingConsent === true) {
    const screen = reviewScreen(`${SITE_URL}/materials/${slug}`)
    await sendTelegramMessage(chatId, screen.text, screen.keyboard)
  }
}

/** Проверка доступа бота к чату сообщества (getMe + getChat + getChatMember). */
async function checkCommunityChat() {
  try {
    const call = async (method, body) => (await (await telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json())
    const me = await call('getMe')
    if (!me.ok) return { error: 'Не удалось получить данные бота (getMe). Проверьте токен.' }
    const chat = await call('getChat', { chat_id: COMMUNITY_CHAT_ID })
    if (!chat.ok) return { error: `Бот не видит чат ${COMMUNITY_CHAT_ID}: ${chat.description ?? 'нет доступа'}. Проверьте, что бот добавлен в чат.` }
    const member = await call('getChatMember', { chat_id: COMMUNITY_CHAT_ID, user_id: me.result.id })
    const m = member.result ?? {}
    return { chatId: COMMUNITY_CHAT_ID, title: chat.result.title, type: chat.result.type, botUsername: me.result.username, status: m.status ?? 'не найден', canInvite: Boolean(m.can_invite_users), canRestrict: Boolean(m.can_restrict_members), canManage: Boolean(m.can_manage_chat) }
  } catch (err) {
    return { error: `Ошибка запроса к Telegram: ${err.message}` }
  }
}

// Диалог «Связаться с поддержкой» в боте: по шагам собираем недостающие контакты и вопрос, админу уходит обращение с номером.
const userFlows = new Map()

// Порядок: сначала сам вопрос. Контакты просим только если человека нельзя найти (нет ника в Telegram, телефона и почты).
function nextContactStep(user, data) {
  if (!data.question) return 'question'
  const reachable = user.username || user.phone || user.email || data.phone || data.email
  if (!reachable && !data.contactAsked) return 'contact'
  return null
}

async function askNextContactStep(chatId, user, flow, query) {
  const step = nextContactStep(user, flow.data)
  flow.step = step
  if (!step) return finishContactFlow(chatId, user, flow)
  userFlows.set(String(chatId), flow)
  const screen = step === 'question' ? (flow.kind === 'consult' ? consultPrompt(user) : supportPrompt(user)) : { text: CONTACT_PROMPTS.contact, keyboard: contactCancelKeyboard() }
  if (query) await editOrSend(query, screen)
  else await sendTelegramMessage(chatId, screen.text, screen.keyboard)
}

async function handleContactFlowInput(chatId, text) {
  const flow = userFlows.get(String(chatId))
  const user = getBotUser(chatId) ?? {}
  if (flow.step === 'question') flow.data.question = text.trim()
  else if (flow.step === 'contact') {
    flow.data.contactAsked = true
    const v = text.trim()
    if (/^\S+@\S+\.\S+$/.test(v)) flow.data.email = v
    else if (v.replace(/\D/g, '').length >= 10) flow.data.phone = v
  }
  await askNextContactStep(chatId, user, flow)
}

/** Завершение диалога: обращение в поддержку или заявка на консультацию — админу приходит уведомление в том же оформлении, что с сайта, с номером заявки. */
async function finishContactFlow(chatId, user, flow) {
  userFlows.delete(String(chatId))
  const d = flow.data
  const name = user.contactName || [user.firstName, user.lastName].filter(Boolean).join(' ')
  const phone = d.phone || user.phone
  const email = d.email || user.email
  updateBotUser(chatId, { phone: d.phone, email: d.email })
  const isConsult = flow.kind === 'consult'
  const consultation = isConsult ? createConsultation({ kind: 'question', services: [`Запрос: ${d.question}`], name, phone, email, telegram: user.username, source: 'бот' }) : null
  const number = consultation ? consultation.number : nextTicketNumber()
  const text = buildKadryRichNotification({
    template: isConsult ? 'kadry-candidate' : 'support',
    direction: isConsult ? 'Кадры → Соискатель' : 'Бот → Поддержка',
    service: isConsult ? 'Карьерная консультация — заявка из бота' : 'Обращение в поддержку',
    date: new Date().toISOString(),
    name,
    phone,
    email,
    telegram: user.username,
    details: [`${isConsult ? 'Запрос' : 'Вопрос'}: ${d.question}`],
    ticketNumber: String(number),
    origin: 'из бота',
  })
  await sendTelegramMessage(ADMIN_CHAT_ID, text, [
    ...(consultation ? [[{ text: `📂 Открыть консультацию №${consultation.number}`, callback_data: `a:s:con:${consultation.number}` }]] : []),
    [{ text: '👤 Карточка человека', callback_data: `a:x:pc:${chatId}` }, { text: '✉️ Написать', url: user.username ? `https://t.me/${user.username.replace(/^@/, '')}` : `tg://user?id=${chatId}` }],
  ])
  if (isConsult) {
    const screen = consultBookedScreen(number)
    await sendTelegramMessage(chatId, screen.text, screen.keyboard)
  } else {
    await sendTelegramMessage(chatId, `${user.firstName ? `${user.firstName}, спасибо` : 'Спасибо'}! Вопрос принят, номер обращения №${number}. Мы свяжемся с тобой в ближайшее время.`, [[{ text: 'Главное меню', callback_data: 'u:menu' }]])
  }
}

async function handleUserCallback(query) {
  const chatId = query.message?.chat?.id
  void ackCallback(query)
  if (!chatId || String(query.from?.id) !== String(chatId)) return
  if (isDuplicateTap(query)) return
  const [, action, arg] = String(query.data).split(':')
  let user = touchBotUser(query.from)
  ensureLifetimeResident(user)
  const reply = (screen) => editOrSend(query, screen)
  if (action !== 'support' && action !== 'contact' && action !== 'book') userFlows.delete(String(chatId))
  if (action === 'nc') return reply(noConsentScreen(user))
  if (action === 'consent') user = giveConsent(query.from.id) ?? user
  if (action === 'g') user = setGender(query.from.id, arg) ?? user
  if (action === 'mail1') user = setMailingConsent(query.from.id, true) ?? user
  if (action === 'mail0') user = setMailingConsent(query.from.id, false) ?? user
  // Без согласия на обработку ПД остальные кнопки воронки недоступны — показываем нужный шаг.
  if (!user.consentAt) return reply(flowScreen(user))
  if (action === 'consent' || action === 'g' || action === 'mail1' || action === 'mail0') return reply(flowScreen(user))

  const materials = materialList()
  const material = materials.find((m) => m.slug === arg)
  switch (action) {
    case 'support':
    case 'contact':
      // «Поддержка» сразу просит написать вопрос: следующее сообщение человека уходит админу.
      return askNextContactStep(chatId, user, { data: {} }, query)
    case 'legal':
      return reply(legalScreen(SITE_URL))
    case 'about':
      return reply(aboutScreen(SITE_URL, SUPPORT_HANDLE))
    case 'consult':
      return reply(consultScreen(SUPPORT_HANDLE))
    case 'cancelflow':
      return reply(mainMenuScreen(SITE_URL, user))
    case 'unsub': {
      setMailingConsent(query.from.id, false)
      return reply(unsubscribedScreen({ ...user, mailingConsent: false }))
    }
    case 'book':
      return askNextContactStep(chatId, user, { kind: 'consult', data: {} }, query)
    case 'community': {
      const resident = residentByTelegramId(chatId)
      return reply(hasAccess(resident) ? communityResidentScreen() : communityScreen(Boolean(resident)))
    }
    case 'join':
      return reply(periodsScreen())
    case 'sub': {
      const tariff = TARIFFS[arg]
      if (!tariff) return reply(periodsScreen())
      typing(chatId)
      try {
        // Заявка привязывается к Telegram-аккаунту: по tg_user_id из вебхука оплата найдёт её, а бот сам пришлёт ссылку на вступление.
        // Повторные нажатия не плодят карточки: берём уже созданную неоплаченную заявку этого человека на этот тариф.
        const existing = listJoins().find((j) => !j.paid && j.tariffId === arg && String(j.tgUserId ?? '') === String(chatId))
        const token = existing?.token ?? createPendingJoin({ tariffId: arg, name: [user.firstName, user.lastName].filter(Boolean).join(' '), phone: '', email: '', telegram: user.username })
        if (!existing) setTgUserId(token, String(chatId))
        const url = await createPaymentLink({ tariffId: arg, tgUserId: String(chatId), name: user.firstName, telegram: user.username, urlSuccess: `${SITE_URL}/community/success?token=${token}` })
        return reply(subLinkScreen(tariff.period, tariff.price, url))
      } catch (err) {
        console.error('[bot] ошибка ссылки на оплату подписки:', err)
        return sendTelegramMessage(chatId, `Не получилось создать ссылку на оплату. Напиши в поддержку — ${SUPPORT_HANDLE}, поможем.`)
      }
    }
    case 'aboutclub':
      return reply(aboutClubScreen(SITE_URL))
    case 'career':
      return reply(careerScreen())
    case 'ach':
      return reply(achievementsScreen('u:aboutclub'))
    case 'achabout':
      return reply(achievementsScreen('u:about'))
    case 'market':
      return reply(marketScreen())
    case 'mats':
      return reply(materialsListScreen(materials))
    case 'mat':
      return material ? reply(materialCard(material, user)) : reply(marketScreen())
    case 'buy': {
      if (!material) return reply(marketScreen())
      typing(chatId)
      try {
        const token = createPendingPurchase({ materialSlug: material.slug, name: user.firstName, tgUserId: chatId })
        const url = await createProductPaymentLink({ materialSlug: material.slug, tgUserId: String(chatId), urlSuccess: `${SITE_URL}/materials/cabinet?token=${token}` })
        return reply(payLinkScreen(material, url, user))
      } catch (err) {
        console.error('[bot] ошибка ссылки на оплату материала:', err)
        return sendTelegramMessage(chatId, `Не получилось создать ссылку на оплату. Напиши в поддержку — ${SUPPORT_HANDLE}, поможем.`)
      }
    }
    case 'paid': {
      if (!material) return reply(marketScreen())
      if (findPaidPurchase(chatId, material.slug)) return deliverMaterial(chatId, material.slug)
      return reply(paymentNotFoundScreen(material.slug, SUPPORT_HANDLE))
    }
    default:
      return reply(flowScreen(user))
  }
}

/** Отключение подписки по просьбе самого резидента: пробуем отключить в Prodamus, отмечаем в учёте, сообщаем админу. */
async function cancelSubscription(join, reason) {
  const ids = new Set((join.payments ?? []).map((p) => p.subscriptionId).filter(Boolean).map(String))
  if (TARIFFS[join.tariffId]) ids.add(String(TARIFFS[join.tariffId].subscription))
  if (join.importedFromBotHelp) ['2611878', '2611880'].forEach((id) => ids.add(id)) // номера подписок из сценария BotHelp
  const results = []
  // Разовые подписки (350/500 ₽) без автопродления в Prodamus не отключаем — доступ просто закончится в срок.
  if (!join.oneTime && join.tgUserId) {
    for (const id of ids) {
      try {
        results.push({ id, ...(await setSubscriptionActivity({ subscriptionId: id, tgUserId: join.tgUserId, active: false })) })
      } catch (err) {
        results.push({ id, ok: false, raw: err.message })
      }
    }
  }
  const confirmed = join.oneTime || results.some((r) => r.ok)
  setSubscriptionActive(join.token, false, Date.now())
  setCancelReason(join.token, 'other')
  setJoinField(join.token, 'cancelReasonText', reason)
  return { confirmed, results }
}

async function finishCancellation(chatId, flow, reason) {
  userFlows.delete(String(chatId))
  const join = getJoin(flow.token)
  const user = getBotUser(chatId) ?? {}
  if (!join || join.status !== 'active') {
    await sendTelegramMessage(chatId, 'Подписка уже отключена.', [[{ text: '⬅️ Кабинет', callback_data: 'r:menu' }]])
    return
  }
  // Основатель проходит путь клиента целиком, но подписка не меняется (иначе он потерял бы доступ).
  const test = Boolean(join.lifetime)
  const { confirmed, results } = test ? { confirmed: true, results: [] } : await cancelSubscription(join, reason)
  const endsAt = test ? join.endsAt : join.nextPaymentAt
  const screen = cancelDoneScreen(endsAt, confirmed, test)
  await sendTelegramMessage(chatId, screen.text, screen.keyboard)
  const ticket = nextTicketNumber()
  await sendTelegramMessage(ADMIN_CHAT_ID, buildKadryRichNotification({
    template: 'support',
    direction: 'Бот → Сообщество',
    service: 'Отмена подписки резидентом',
    date: new Date().toISOString(),
    name: user.contactName || [user.firstName, user.lastName].filter(Boolean).join(' ') || join.name,
    phone: user.phone || join.phone,
    email: user.email || join.email,
    telegram: user.username,
    details: [
      `Причина: ${reason}`,
      test ? 'ТЕСТ основателя: ничего не отключено, подписка осталась активной' : join.oneTime ? 'Разовая подписка — доступ закончится в срок, списаний нет' : confirmed ? 'Отключена в Prodamus автоматически' : '⚠️ Автоматически отключить в Prodamus не удалось — отключите вручную, иначе спишут деньги',
      ...results.map((r) => `Prodamus, подписка ${r.id}: ${r.ok ? 'OK' : 'ошибка'} (${r.raw ?? r.status})`),
      endsAt ? `Доступ до ${new Date(endsAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : 'Дата окончания неизвестна',
    ],
    ticketNumber: String(ticket),
    origin: 'из бота',
  }), [[{ text: '👤 Карточка человека', callback_data: `a:x:pc:${chatId}` }, { text: '✉️ Написать', url: user.username ? `https://t.me/${user.username.replace(/^@/, '')}` : `tg://user?id=${chatId}` }]])
}

async function handleResidentCallback(query) {
  const chatId = query.message?.chat?.id
  void ackCallback(query)
  if (isDuplicateTap(query)) return
  const fromUser = chatId && String(query.from?.id) === String(chatId) ? touchBotUser(query.from) : null
  if (fromUser) ensureLifetimeResident(fromUser)
  const join = fromUser ? residentByTelegramId(chatId) : null
  if (!join) {
    await editOrSend(query, { text: `Не нашли твою подписку. Если ты оплатил${fromUser?.gender === 'f' ? 'а' : '(а)'}, откройте бота по ссылке со страницы «Оплата прошла успешно» или напиши в поддержку.`, keyboard: [[{ text: '💬 Поддержка', callback_data: 'u:support' }, { text: 'Сообщество', callback_data: 'u:community' }]] })
    return
  }
  const [, action] = String(query.data).split(':')
  if (action !== 'cancelyes') userFlows.delete(String(chatId))
  const user = getBotUser(chatId) ?? fromUser ?? {}
  let screen
  if (action === 'sub') screen = subscriptionScreen(join, TARIFFS)
  else if (action === 'link') screen = linkScreen(join, COMMUNITY_INVITE_LINK)
  else if (action === 'set') screen = settingsScreen(join, user)
  else if (action === 'mail') {
    const updated = setMailingConsent(chatId, user.mailingConsent !== true) ?? user
    screen = settingsScreen(join, updated)
  } else if (action === 'cancel') screen = join.status === 'active' ? cancelConfirmScreen(user) : settingsScreen(join, user)
  else if (action === 'cancelyes') {
    if (join.status !== 'active') screen = settingsScreen(join, user)
    else {
      userFlows.set(String(chatId), { kind: 'cancel', token: join.token, data: {} })
      screen = cancelReasonPrompt()
    }
  } else screen = residentMenu(join, user)
  await editOrSend(query, screen)
}

// Обновления одного чата обрабатываются по очереди, разных чатов — параллельно: медленный ответ одному человеку
// не задерживает остальных, а быстрые повторные нажатия одного человека не обгоняют друг друга.
const chatQueues = new Map()
function dispatchUpdate(update) {
  // Журнал входящих обновлений (id чата и начало текста/кнопки) — чтобы по логу видеть, дошло ли сообщение до этого сервера.
  console.log('[tg]', update?.callback_query ? `кнопка ${update.callback_query.data} от ${update.callback_query.from?.id}` : update?.message ? `сообщение от ${update.message.chat?.id}: ${String(update.message.text ?? update.message.caption ?? '[не текст]').slice(0, 40)}` : Object.keys(update ?? {}).join(','))
  const key = String(update?.message?.chat?.id ?? update?.callback_query?.from?.id ?? update?.chat_join_request?.from?.id ?? 'other')
  const next = (chatQueues.get(key) ?? Promise.resolve()).then(() => afterResponse('telegram/update', () => handleTelegramUpdate(update)))
  chatQueues.set(key, next)
  next.finally(() => {
    if (chatQueues.get(key) === next) chatQueues.delete(key)
  })
}

async function handleTelegramUpdate(update) {
  if (update?.chat_join_request) {
    await handleJoinRequest(update.chat_join_request)
    return
  }
  if (update?.callback_query?.data?.startsWith('u:')) {
    await handleUserCallback(update.callback_query)
    return
  }
  if (update?.callback_query?.data?.startsWith('r:')) {
    await handleResidentCallback(update.callback_query)
    return
  }
  if (update?.callback_query) {
    await handleAdminCallback(update.callback_query)
    return
  }
  const message = update?.message
  const text = message?.text
  const chatId = message?.chat?.id
  const isAdmin = chatId && String(chatId) === String(ADMIN_CHAT_ID)
  const isViewer = chatId && VIEWER_IDS.has(String(chatId))
  // Диагностика: показывает номер чата и то, считает ли бот его админским.
  if (chatId && text === '/id') {
    const nick = String(message.from?.username ?? '').toLowerCase()
    const lifetimeRule = (nick && LIFETIME_USERNAMES.has(nick)) || LIFETIME_IDS.has(String(chatId)) || String(chatId) === String(ADMIN_CHAT_ID)
    const myJoins = listJoins().filter((j) => String(j.tgUserId ?? '') === String(chatId))
    const resident = residentByTelegramId(chatId)
    await sendTelegramMessage(chatId, `Ваш chat id: ${chatId}\nВаш ник: ${message.from?.username ? `@${message.from.username}` : 'не задан в Telegram'}${isAdmin ? '\n✅ Это админский чат' : isViewer ? '\n👁 Это чат помощника (только просмотр)' : ''}\nБессрочный доступ по правилам: ${lifetimeRule ? 'да' : 'нет'}\nКарточек подписки на вас: ${myJoins.length}${myJoins.length ? ` (${myJoins.map((j) => `${j.status}${j.lifetime ? ', бессрочная' : ''}${j.paid ? '' : ', не оплачена'}`).join('; ')})` : ''}\nКабинет резидента: ${resident?.status === 'active' ? 'откроется' : 'не откроется'}`)
    return
  }
  if ((isAdmin || isViewer) && text?.startsWith('/report')) {
    await sendTelegramMessage(chatId, reportText(parseReportPeriod(text.slice('/report'.length))), FINANCE_KEYBOARD)
    return
  }
  // Админ присылает PDF с подписью «/material <slug>» — бот запоминает файл для выдачи покупателям.
  if (isAdmin && message?.document && /^\/material\b/i.test(message.caption ?? '')) {
    const slug = message.caption.replace(/^\/material\s*/i, '').trim()
    if (!MATERIALS[slug] && slug !== 'checklist-novichka') {
      await sendTelegramMessage(chatId, `Не знаю такой материал. Подпись должна быть вида /material <slug>. Доступные:\n${[...Object.keys(MATERIALS), 'checklist-novichka'].map((k) => `/material ${k}`).join('\n')}`)
      return
    }
    setMaterialFile(slug, message.document.file_id, message.document.file_name)
    logAction(chatId, `input:material-file:${slug}`)
    await sendTelegramMessage(chatId, `✅ Файл «${message.document.file_name}» сохранён для «${MATERIALS[slug]?.title ?? 'чек-листа новичка сообщества'}» — теперь бот выдаёт его ${slug === 'checklist-novichka' ? 'новым резидентам после вступления' : 'после оплаты'}.`)
    return
  }
  if (isAdmin && text === '/cancel') {
    adminInput.delete(String(chatId))
    await sendTelegramMessage(chatId, 'Отменено.', KADRY_KEYBOARD)
    return
  }
  const pendingRaw = (isAdmin || isViewer) && text && !text.startsWith('/') ? adminInput.get(String(chatId)) : null
  const pendingInput = pendingRaw && (isAdmin || pendingRaw.type === 'find') ? pendingRaw : null
  if (pendingInput) {
    adminInput.delete(String(chatId))
    await handlePendingInput(chatId, pendingInput, text)
    return
  }
  if (chatId && text === '/cancel' && userFlows.has(String(chatId))) {
    userFlows.delete(String(chatId))
    await sendTelegramMessage(chatId, 'Отменено.', [[{ text: 'Главное меню', callback_data: 'u:menu' }]])
    return
  }
  if (chatId && text && !text.startsWith('/') && userFlows.has(String(chatId)) && !pendingInput) {
    const flow = userFlows.get(String(chatId))
    if (flow.kind === 'cancel') await finishCancellation(chatId, flow, text.trim())
    else await handleContactFlowInput(chatId, text)
    return
  }
  // Админу обычный /start (и /menu) открывает кабинет с кнопками; /start access_… работает как у всех.
  // Кабинет разработчика открывается только секретной командой и только с админского (или помощника) аккаунта;
  // остальным она не отвечает. Обычные /start и /menu у всех, включая админа, работают как у клиентов.
  if ((isAdmin || isViewer) && text && text.split(/[\s@]/)[0].toLowerCase() === `/${ADMIN_COMMAND}`.toLowerCase()) {
    const screen = menuScreen()
    await sendTelegramMessage(chatId, screen.text, screen.keyboard)
    return
  }
  if (chatId && (text === '/menu' || text === '/cabinet')) {
    await startFlow(chatId, message.from)
    return
  }
  if (chatId && text && !text.startsWith('/') && text.toLowerCase().includes('личный кабинет')) {
    const resident = residentByTelegramId(chatId)
    if (resident) {
      const screen = residentMenu(resident, getBotUser(chatId) ?? {})
      await sendTelegramMessage(chatId, screen.text, screen.keyboard)
    } else {
      await startFlow(chatId, message.from)
    }
    return
  }
  // Ключевые слова запуска из BotHelp («привет», «начать», «вступить в сообщество» и т. д.) работают как /start.
  if (chatId && text && !text.startsWith('/') && isStartKeyword(text)) {
    await startFlow(chatId, message.from)
    return
  }
  if (!chatId || !text || !text.startsWith('/start')) return

  const payload = text.slice('/start'.length).trim()
  const match = payload.match(/^access_(\w+)$/)
  const token = match?.[1]

  if (!token) {
    await startFlow(chatId, message.from, payload || '')
    return
  }

  if (message.from) touchBotUser({ ...message.from, id: message.from.id ?? chatId })
  const join = setTgUserId(token, chatId)
  if (!join) {
    await sendTelegramMessage(chatId, 'Не нашли вашу заявку — попробуйте оформить подписку заново на сайте.')
    return
  }

  if (join.paid) {
    await sendInviteLink(chatId)
  } else {
    await sendTelegramMessage(chatId, 'Ждём подтверждения оплаты от банка — обычно это занимает меньше минуты. Как только оплата пройдёт, здесь появится ссылка на вступление.')
  }
}

// Вебхук оставлен на случай, если Telegram сможет достучаться до сервера, но
// по умолчанию бот сам опрашивает Telegram (см. pollTelegramUpdates ниже).
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200) // Telegram ждёт быстрый ответ, обрабатываем после
  dispatchUpdate(req.body)
})

/** Успешная оплата билета: статус «Оплатил» и сумма в регистрации, письмо участнику, уведомление админу. */
async function handleEventPayment(number, body) {
  const amount = Number(body.sum) || null
  const lead = markEventLeadPaid(number, amount, String(body.order_id ?? ''))
  if (!lead) {
    console.error('[prodamus] оплата билета: регистрация не найдена №', number)
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Пришла оплата билета (${body.sum} ₽, order_num ${body.order_num ?? '—'}), но регистрация №${number} не найдена. Проверьте в Prodamus.`).catch(() => false)
    return
  }
  if (lead.duplicate) {
    console.log('[prodamus] повторный вебхук по оплате билета — пропускаю:', number)
    return
  }
  const event = readEventCatalog().find((e) => e.slug === lead.eventSlug)
  let mail = { ok: false, error: 'no_email' }
  if (lead.email) {
    const when = event ? new Date(event.dateTime).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow' }) : ''
    const lines = [`${lead.name ? `Здравствуйте, ${lead.name}!` : 'Здравствуйте!'}`, '', `Оплата получена — вы зарегистрированы на мероприятие «${lead.eventTitle}».`, `Билет: ${lead.tariff}${amount ? ` · ${amount} ₽` : ''}`]
    if (when) lines.push(`Когда: ${when} (по Москве)`)
    if (event?.location) lines.push(`Где: ${event.location}`)
    lines.push(`Номер регистрации: ${lead.number}`, '', `Мы напомним о мероприятии заранее. Вопросы — ${SUPPORT_HANDLE}`, '', 'Карьерный юрист')
    mail = await sendMail({ to: lead.email, subject: `Вы зарегистрированы: ${lead.eventTitle}`, text: lines.join('\n') })
  }
  const text = buildLeadNotification({
    direction: 'Мероприятия',
    service: 'Оплата билета на мероприятие',
    date: new Date().toISOString(),
    name: lead.name || '—',
    phone: lead.phone,
    email: lead.email,
    telegram: lead.telegram,
    details: [`Мероприятие: ${lead.eventTitle}`, `Билет: ${lead.tariff}`, `Сумма: ${body.sum} ₽`, `Письмо участнику: ${mail.ok ? 'отправлено ✅' : mail.error === 'no_email' ? 'почта не указана' : mail.error === 'smtp_not_configured' ? 'почта на сервере не настроена (SMTP)' : `не ушло (${mail.error})`}`],
    ticketNumber: String(lead.number),
  })
  await sendTelegramMessage(ADMIN_CHAT_ID, `💳 Билет оплачен\n\n${text}\n\n🗂 Регистрация №${lead.number} → «Оплатил»`, [[{ text: `📂 Открыть №${lead.number}`, callback_data: `a:x:evcard:${lead.number}` }]])
}

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
  logWebhook(body)
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

    // Билет на мероприятие: в order_num (наш order_id) или customer_extra лежит «ev-N».
    const eventMatch = String(body.order_num ?? '').match(EVENT_ORDER_RE) || String(body.customer_extra ?? '').match(EVENT_ORDER_RE)
    if (eventMatch) {
      await handleEventPayment(Number(eventMatch[1]), body)
      return
    }

    console.log('[prodamus] покупка материала — телефон:', phone)
    const purchase = (body.tg_user_id && markPurchasePaidByTg(body.tg_user_id)) || markPurchasePaidByPhone(phone)
    console.log('[prodamus] результат поиска покупки:', purchase ? `найдена ${purchase.token}` : 'не найдена')
    if (purchase) {
      recordPurchasePayment(purchase.token, Number(body.sum) || MATERIALS[purchase.materialSlug]?.price || 0)
      if (purchase.tgUserId) {
        addTag(purchase.tgUserId, PAID_TAGS[purchase.materialSlug] ?? `оплатил_${purchase.materialSlug}`)
        await deliverMaterial(purchase.tgUserId, purchase.materialSlug).catch((err) => console.error('[bot] не удалось выдать материал:', err))
      }
      const material = MATERIALS[purchase.materialSlug]
      const cabinetUrl = `${SITE_URL}/materials/cabinet?token=${purchase.token}`
      const mail = purchase.email ? await emailMaterial({ to: purchase.email, name: purchase.name, materialSlug: purchase.materialSlug, cabinetUrl }) : { ok: false, error: 'no_email' }
      console.log('[prodamus] письмо с материалом:', mail.ok ? 'отправлено' : mail.error)
      const text = buildLeadNotification({
        direction: 'Маркетплейс',
        service: 'Покупка полезного материала',
        date: new Date().toISOString(),
        name: purchase.name || '—',
        phone,
        email: purchase.email,
        details: [`Материал: ${material?.title ?? purchase.materialSlug}`, `Сумма: ${body.sum} ₽`, `Личный кабинет: ${cabinetUrl}`, `Письмо с материалом: ${mail.ok ? 'отправлено ✅' : mail.error === 'no_email' ? 'почта не указана' : mail.error === 'smtp_not_configured' ? 'почта на сервере не настроена (SMTP)' : `не ушло (${mail.error})`}`],
      })
      await sendTelegramMessage(ADMIN_CHAT_ID, text)
    }
  })
})

console.log(`[mail] почта для писем клиентам: ${mailConfigured() ? 'настроена' : 'не настроена (SMTP_HOST/SMTP_USER/SMTP_PASS в server/.env)'}`)

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
  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, reportText('today', now), FINANCE_KEYBOARD).catch(() => false)
  if (!ok) fs.writeFileSync(REPORT_STATE_FILE, JSON.stringify({ lastDay: null })) // не ушло — попробуем в следующую минуту
}

// Раз в сутки после указанного часа (МСК): дата последнего запуска хранится в файле, чтобы перезапуск не повторял и не пропускал задачу.
const DAILY_JOBS_FILE = path.join(import.meta.dirname, 'data', 'daily-jobs.json')
async function runDailyOnce(key, minHour, work) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  const today = mskDayKey(now)
  let state = {}
  try {
    state = JSON.parse(fs.readFileSync(DAILY_JOBS_FILE, 'utf8'))
  } catch {
    // файла ещё нет
  }
  if (hour < minHour || state[key] === today) return
  const save = (value) => {
    fs.mkdirSync(path.dirname(DAILY_JOBS_FILE), { recursive: true })
    fs.writeFileSync(DAILY_JOBS_FILE, JSON.stringify({ ...state, [key]: value }))
  }
  save(today)
  const ok = await work().catch((err) => {
    console.error(`[${key}] ошибка:`, err)
    return false
  })
  if (ok === false) save(state[key] ?? null) // не вышло — повторим в следующую минуту
}

/** Исключение из чата сообщества: сообщение подписчику, «кик» (блокировка и сразу разблокировка) и отметка в учёте. */
async function kickAndNotify(join) {
  if (!join.tgUserId) return false
  await sendTelegramMessage(join.tgUserId, 'Привет!\nК сожалению, твоя подписка истекла, а оплата не прошла вовремя, поэтому мне пришлось временно исключить тебя из сообщества 😔\n\nНо это легко исправить!\nТы в любой момент можешь продлить подписку и сразу вернуться назад. С радостью приму тебя обратно 💗\n\nЖдем тебя снова!', [[{ text: 'Продлить подписку', callback_data: 'u:join' }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
  const call = (method, extra = {}) => telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID, user_id: Number(join.tgUserId), ...extra }) })
  const banned = await call('banChatMember')
  await call('unbanChatMember', { only_if_banned: true }).catch(() => null)
  if (!banned.ok) {
    console.error('[telegram] banChatMember ошибка:', await banned.text())
    return false
  }
  setSubscriptionActive(join.token, false, Date.now())
  setCancelReason(join.token, 'expired')
  return true
}

const EXPIRY_TEXTS = {
  5: 'Привет! 👋\nТвоя подписка закончится через 5 дней.\n\nЧтобы не потерять доступ к материалам, встречам и общению в «Карьерном юристе» — продли подписку заранее, нажав кнопку «Продлить».\n\nСпасибо, что ты с нами 💗',
  3: 'Привет! 👋\nТвоя подписка закончится через 3 дня.\n\nЧтобы сохранить доступ ко всем материалам, встречам и общению в «Карьерном юристе» — продли подписку заранее, нажав кнопку «Продлить».\n\nСпасибо, что ты с нами 💗',
  2: 'Привет! 👋\nТвоя подписка закончится через 2 дня.\n\nЧтобы сохранить доступ ко всем материалам, встречам и общению в «Карьерном юристе» — продли подписку заранее, нажав кнопку «Продлить».\n\nСпасибо, что ты с нами 💗',
  1: 'Привет! 👋\nТвоя подписка закончится уже завтра (через 1 день).\n\nЧтобы сохранить доступ ко всем материалам, встречам и общению в «Карьерном юристе» — продли подписку заранее, нажав кнопку «Продлить».\n\nСпасибо, что ты с нами 💗',
}

/**
 * Разовые подписки (350/500 ₽, 30 дней): напоминания за 5, 3, 2 и 1 день до конца, а по окончании срока — исключение из чата.
 * По умолчанию исключение подтверждаете вы кнопкой (вам приходит уведомление); автоматически — если в server/.env AUTO_EXCLUDE=1.
 */
async function processExpiry() {
  const now = Date.now()
  for (const j of listJoins()) {
    if (j.status !== 'active' || !j.oneTime || !j.nextPaymentAt) continue
    const daysLeft = Math.ceil((j.nextPaymentAt - now) / 86400000)
    const key = `${j.nextPaymentAt}:${daysLeft}`
    if (EXPIRY_TEXTS[daysLeft] && j.tgUserId && j.expiryRemindedFor !== key && process.env.EXPIRY_NOTICES !== '0') {
      setJoinField(j.token, 'expiryRemindedFor', key)
      await sendTelegramMessage(j.tgUserId, EXPIRY_TEXTS[daysLeft], [[{ text: 'Продлить', callback_data: 'u:join' }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
    } else if (daysLeft <= 0 && j.expiryAlertedFor !== j.nextPaymentAt) {
      setJoinField(j.token, 'expiryAlertedFor', j.nextPaymentAt)
      if (process.env.AUTO_EXCLUDE === '1') {
        const ok = await kickAndNotify(j)
        await sendTelegramMessage(ADMIN_CHAT_ID, `${ok ? '🚪 Исключён из чата (срок разовой подписки истёк)' : '⚠️ Срок подписки истёк, но исключить не удалось'}: ${[j.name, j.telegram, j.phone].filter(Boolean).join(', ')}`)
      } else {
        await sendTelegramMessage(ADMIN_CHAT_ID, `⏰ Срок разовой подписки истёк: ${[j.name, j.telegram, j.phone].filter(Boolean).join(', ')}\nОплаты продления нет.`, [[{ text: '🚪 Исключить из чата', callback_data: `a:x:kick:${j.token}` }]])
      }
    }
  }
  return true
}

/** Просьба об отзыве через 30 дней после первой оплаты и бонус +4 дня через 5 часов (как в воронке BotHelp). */
let reviewFlowRunning = false
async function processReviewFlow() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID || reviewFlowRunning || process.env.REVIEW_FLOW === '0') return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  const DAY = 86400000
  reviewFlowRunning = true
  try {
    for (const j of listJoins()) {
      if (!j.paid || !j.tgUserId || j.status !== 'active' || !j.firstPaidAt) continue
      const age = now - j.firstPaidAt
      if (!j.reviewAskedAt && age >= 30 * DAY && age <= 60 * DAY && hour >= 10 && hour < 21) {
        setJoinField(j.token, 'reviewAskedAt', now)
        await sendTelegramMessage(j.tgUserId, 'Нам важно твое мнение о сообществе, оно помогает нам делать сервис лучше для тебя\n\nПожалуйста оставь отзыв о своем опыте 👇\n\nВ благодарность за обратную связь подарим тебе +4 дня подписки бесплатно', [[{ text: 'Оставить обратную связь', url: process.env.FEEDBACK_URL || `${SITE_URL}/community` }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
      } else if (j.reviewAskedAt && !j.reviewThankedAt && now - j.reviewAskedAt >= 5 * 3600 * 1000) {
        setJoinField(j.token, 'reviewThankedAt', now)
        extendSubscription(j.token, 4)
        await sendTelegramMessage(j.tgUserId, reviewThanks(getBotUser(j.tgUserId) ?? {}), [[{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
        await sendTelegramMessage(ADMIN_CHAT_ID, `🎁 ${[j.name, j.telegram].filter(Boolean).join(' ')}: начислено +4 дня подписки за отзыв (автоматически через 5 часов после просьбы, как в BotHelp). Проверьте, что отзыв действительно оставлен.`).catch(() => false)
      }
    }
  } finally {
    reviewFlowRunning = false
  }
}

/** Автонапоминания резидентам о списании: за 2 дня и за день, только тем, кто общался с ботом. Отключить: AUTO_RESIDENT_REMINDERS=0. */
async function sendAutoResidentReminders() {
  if (process.env.AUTO_RESIDENT_REMINDERS === '0') return true
  const now = Date.now()
  let sent = 0
  let failed = 0
  for (const days of [2, 1]) {
    for (const join of reminderTargets(listJoins(), now, days).reachable) {
      const ok = await sendTelegramMessage(join.tgUserId, reminderMessage(join, SUPPORT_HANDLE, days), REMINDER_KEYBOARD).catch(() => false)
      markReminded(join.token, `${join.nextPaymentAt}:${days}`) // отмечаем и при неудаче, чтобы не пытаться каждую минуту
      if (ok) sent += 1
      else failed += 1
    }
  }
  if (sent || failed) await sendTelegramMessage(ADMIN_CHAT_ID, `🔔 Автонапоминания резидентам о списании: отправлено ${sent}${failed ? `, не дошло ${failed}` : ''}.`)
  return true
}

// Приём сообщений боту через getUpdates (long polling): нужно только
// исходящее соединение с Telegram. С хостинга сервера входящие запросы от
// Telegram (вебхук) не доходили — в nginx не было ни одного, а Telegram
// писал «Connection timed out». Telegram не даёт использовать getUpdates
// при установленном вебхуке, поэтому при старте вебхук снимается; накопившиеся
// сообщения при этом не теряются. Отключить: TELEGRAM_POLLING=0 в server/.env.
let lastForeignWebhookAlert = 0

/** Информация о вебхуке бота: getMe + getWebhookInfo. */
async function telegramWebhookInfo() {
  const call = async (method) => (await telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()
  const [me, info] = await Promise.all([call('getMe'), call('getWebhookInfo')])
  return { username: me.result?.username, url: info.result?.url ?? '', lastError: info.result?.last_error_message, pending: info.result?.pending_update_count ?? 0 }
}

/**
 * Можно ли принимать сообщения опросом. Свой вебхук (на наш сайт) снимаем; чужой — например BotHelp, если он подключён
 * к тому же боту, — не трогаем: иначе мы отключили бы рабочую воронку BotHelp, а сообщения всё равно уходили бы ему.
 */
async function ensurePollingAllowed() {
  try {
    const info = await telegramWebhookInfo()
    if (!info.url) return true
    if (info.url.includes(new URL(SITE_URL).host)) {
      await telegramFetch('deleteWebhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drop_pending_updates: false }) })
      return true
    }
    console.error('[telegram] у бота установлен чужой вебхук — опрос не запускаем:', info.url)
    if (Date.now() - lastForeignWebhookAlert > 6 * 3600 * 1000 && ADMIN_CHAT_ID) {
      lastForeignWebhookAlert = Date.now()
      await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Бот @${info.username} подключён к другому сервису (вебхук: ${new URL(info.url).host}), поэтому сообщения приходят ему, а не этому серверу. Один токен нельзя использовать в двух местах. Нужен отдельный бот для этого сервера (создайте в @BotFather и поменяйте TELEGRAM_BOT_TOKEN в server/.env).`).catch(() => false)
    }
    return false
  } catch (err) {
    console.error('[telegram] не удалось проверить вебхук:', err.message)
    return true
  }
}

async function pollTelegramUpdates() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  while (!(await ensurePollingAllowed())) await sleep(60000)

  let offset = 0
  console.log('[telegram] приём сообщений боту: опрос getUpdates')
  for (;;) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=30&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query', 'chat_join_request']))}`, { signal: AbortSignal.timeout(45000) })
      const data = await res.json()
      if (!Array.isArray(data.result)) {
        console.error('[telegram] getUpdates ответил неожиданно:', JSON.stringify(data).slice(0, 200))
        // 409 — у бота появился вебхук (например, BotHelp переподключил бота): проверяем, чей он
        if (data.error_code === 409) while (!(await ensurePollingAllowed())) await sleep(60000)
        else await sleep(5000)
        continue
      }
      lastPollAt = Date.now()
      for (const update of data.result) {
        offset = update.update_id + 1
        dispatchUpdate(update)
      }
    } catch {
      await sleep(5000) // сеть моргнула — пробуем снова
    }
  }
}

if (BOT_TOKEN && process.env.TELEGRAM_POLLING !== '0') {
  pollTelegramUpdates()
}

if (process.env.DISABLE_DAILY_REPORT !== '1') {
  setInterval(() => afterResponse('daily-report', sendDailyReportIfDue), 60 * 1000)
  setInterval(() => afterResponse('deal-reminders', sendDealRemindersIfDue), 60 * 1000)
  setInterval(() => afterResponse('kadry-monthly', sendKadryMonthlyIfDue), 60 * 1000)
  setInterval(() => afterResponse('interest-reminders', sendInterestRemindersIfDue), 60 * 1000)
  setInterval(() => afterResponse('resident-reminders', () => runDailyOnce('residentReminders', 10, sendAutoResidentReminders)), 60 * 1000)
  setInterval(() => afterResponse('expiry', () => runDailyOnce('expiry', 10, processExpiry)), 60 * 1000)
  setInterval(() => afterResponse('review-flow', processReviewFlow), 60 * 1000)
  setInterval(() => afterResponse('morning-digest', () => runDailyOnce('digest', 9, async () => {
    const screen = digestScreen(allData(), TARIFFS, Date.now(), currentHealth())
    return sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard)
  })), 60 * 1000)
  if (process.env.DISABLE_BACKUP !== '1') {
    setInterval(() => afterResponse('backup', () => runDailyOnce('backup', 3, () => sendBackup('💾 Ежедневная резервная копия данных бота'))), 60 * 1000)
  }
}

// Страховка от падения процесса из-за необработанной ошибки где-то в фоне
// (например, сорвавшийся запрос к Telegram/Prodamus после ответа клиенту) —
// логируем и продолжаем работу вместо того, чтобы уронить сервер целиком.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))

// Для автотестов: доступ к фоновым задачам без ожидания расписания.
if (process.env.TEST_HOOKS === '1') globalThis.__hooks = { processExpiry, processReviewFlow, sendAutoResidentReminders }

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
