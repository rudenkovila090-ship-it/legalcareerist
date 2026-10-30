// Бэкенд-эндпоинт сайта «Карьерный Юрист».
// 1. POST /api/notify — заявка с сайта → уведомление админу в Telegram.
// 2. POST /api/community/subscribe — выбор тарифа на сайте → подписанная
//    ссылка на оплату в Prodamus (идентификация клиента по телефону, без
//    tg_user_id — на этом шаге человек ещё не открывал бота).
// 3. POST /api/telegram/webhook — апдейты бота @legalcareerist_bot: по
//    /start access_<token> проверяет, оплачена ли заявка, и присылает
//    ссылку на вступление в сообщество (сразу либо как только придёт
//    вебхук об оплате).
// 4. POST /api/marketplace/purchase — покупка материала маркетплейса на сайте →
//    подписанная ссылка на разовую оплату (не подписка). После оплаты на почту
//    уходит личная ссылка на файл (7 дней): GET /api/materials/link — что за
//    ссылка и до какого она срока, GET /api/materials/download — сам PDF.
//    Файлы лежат на сервере (data/material-pdfs; бесплатные гайды ещё и в assets/materials), в боте материалов нет.
//    Бесплатные гайды: POST /api/marketplace/free — почта и согласия, на почту
//    уходит такая же личная ссылка на 7 дней (без оплаты и телефона).
// 5. GET /api/payment/status — оплачен ли заказ по токену из ссылки возврата
//    (подписка, билет, материал): страницы «спасибо» отправляют цель в
//    Метрику только после подтверждения оплаты. Данных покупателя не отдаёт.
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
// 12. /api/store/* — закрыто (410): прежнее зеркало данных кабинетов (localStorage ↔ сервер) отдавало их без
//     авторизации; теперь данные кабинетов хранятся только в браузере посетителя.
// 13. /api/account/* — вход в личный кабинет на сайте (логин и пароль в server/.env) и данные кабинета.
// Токены и секретные ключи — только в server/.env, в репозиторий не попадают.
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { createPaymentLink, TARIFFS, tariffIdBySubscriptionId, createProductPaymentLink, MATERIALS, setSubscriptionActivity, createEventPaymentLink, allSecretKeys, payformSummary } from './lib/prodamus.js'
import { HmacHelper } from './lib/hmac.js'
import { createPendingJoin, createOrphanJoin, listJoins, setTgUserId, findJoinForPayment, findPaidJoin, recordPayment, setSubscriptionActive, markReminded, getJoin, setCancelReason, setJoinField, patchJoin, extendSubscription, createLifetimeJoin } from './lib/store.js'
import { normalizePhone } from './lib/jsonStore.js'
import { createPendingPurchase, getPurchase, markPurchasePaidByPhone, recordPurchasePayment, listPurchases, grantFreeMaterial, hasMaterialAccess } from './lib/materialsStore.js'
import { materialInfo } from './lib/materialCatalog.js'
import { incrementView, incrementApplication, allVacancyStats } from './lib/vacancyStats.js'
import { utmLabel } from './lib/utm.js'
import { createApplication, listApplications } from './lib/candidateApplications.js'
import { createConsultation, listConsultations, getConsultation, setConsultationStatus, CONSULTATION_STATUSES } from './lib/consultations.js'
import { createAmbassador, listAmbassadors, getAmbassador, addReferral, deleteAmbassador } from './lib/ambassadors.js'
import { createEventLead, listEventLeads, getEventLead, setEventLeadStatus, markEventLeadPaid, setEventLeadField } from './lib/eventLeads.js'
import { sendMail, mailConfigured } from './lib/mailer.js'
import { listPromos, addPromo, removePromo, findPromo, applyPromo, markPromoUsed, parsePromoInput, promoLabel, ensureBuiltInPromos } from './lib/promoCodes.js'
import { cleanHowHeard, howHeardLine, howHeardScreen, logLeadSource } from './lib/howHeard.js'
import { getAdminSettings, toggleAdminSetting } from './lib/adminSettings.js'
import { queuePending, cancelPending, takeDuePending, PENDING_MINUTES } from './lib/pendingNotices.js'
import { getMaterialFile, setMaterialFile } from './lib/materialFiles.js'
import { getMaterialPdf } from './lib/materialPdfs.js'
import { issueMaterialLink, resolveMaterialLink, looksLikeLinkToken } from './lib/materialLinks.js'
import { composeMaterialMail, formatMoscowDateTime as formatMskDateTime, LINK_DAYS } from './lib/materialMail.js'
import { saveReview, getReviewByPurchase, ratingsSummary, publicReviews, listReviews, getReview, setReviewHidden, reviewText, reviewSignature } from './lib/materialReviews.js'
import { touchBotUser, ensureBotUser, addTag, giveConsent, setMailingConsent, getBotUser, listBotUsers, countConversation, updateBotUser, setGender } from './lib/botUsers.js'
import { communityInviteUrl, decideJoinRequest } from './lib/communityInvite.js'
import { composeSubscriptionMail, composeChargeReminderMail, composeChargeDoneMail, composeChargeFailedMail } from './lib/subscriptionMail.js'
import { CABINET_KEYBOARD, CHARGE_FAILED_KEYBOARD, chargeDoneText, chargeFailedText } from './lib/residentNotices.js'
import { isStartKeyword, welcomeScreen, noConsentScreen, mailingScreen, mainMenuScreen, supportPrompt, genderScreen, reviewThanks, legalScreen, aboutScreen, CONTACT_PROMPTS, contactCancelKeyboard, unsubscribedScreen, communityScreen, communityResidentScreen, aboutClubScreen, achievementsScreen, siteLink } from './lib/botFlow.js'
import { vacancyOverrides, setVacancyStatus } from './lib/vacancyOverrides.js'
import { residentMenu, subscriptionScreen, paymentsScreen, linkScreen, settingsScreen, cancelConfirmScreen, cancelReasonPrompt, cancelDoneScreen, hasAccess, reviewScreen, reviewSendPrompt } from './lib/residentCabinet.js'
import { REVIEW_BONUS_DAYS, REVIEW_MIN_LENGTH, reviewRequestDue, addCommunityReview, listCommunityReviews, decideCommunityReview, communityReviewsScreen, approvedReviewsScreen, reviewForAdmin } from './lib/communityReviews.js'
import { logAction, recentActions } from './lib/auditLog.js'
import { healthLines, makeBackup, readBackupState, writeBackupState } from './lib/healthBackup.js'
import { listTodos, addTodo, setTodoDone, ensureTodo } from './lib/todos.js'
import { todosScreen, TODO_PROMPT, chatCheckScreen, userCard, botUsersScreen, notificationsScreen, reviewsScreen, reviewCard, promosScreen, PROMO_PROMPT, ambassadorsScreen, ambassadorCard, AMBASSADOR_PROMPT, retentionScreen, cancelCard, eventRegistrationsScreen, eventScreen, eventLeadCard, eventRequestsScreen, eventsMonthSummary, FIND_PROMPT, searchScreen, systemScreen, auditScreen } from './lib/extraCabinet.js'
import { createInterest, getInterest, listInterests, markInterestDone, closeInterest, snoozeInterest, REMIND_AFTER_DAYS } from './lib/interests.js'
import { createReserveCandidate, listReserve, getReserveCandidate, setReserveField, deleteReserveCandidate, markResumeReceived } from './lib/reserve.js'
import { applicationCard, recommendationCard, reserveListScreen, reserveCard, reserveFieldPrompt, reserveDeleteConfirm, RESERVE_NEW_PROMPT, INTEREST_KIND_KEYBOARD, interestPrompt, interestsScreen, interestCard, SEEKERS_KEYBOARD, buildVacancyViews, vacanciesScreen, vacancyCard, vacancyApplicationsScreen, recentApplicationsScreen, consultationsScreen, consultationCard, seekersMonthSummary } from './lib/seekersCabinet.js'
import { incrementArticleView, getArticleViews } from './lib/articleStats.js'
import { incrementNewsView, getNewsViews } from './lib/newsStats.js'
import { incrementEventView, incrementEventRegistration, getEventStats } from './lib/eventStats.js'
import { archiveLegacyCollections } from './lib/collectionStore.js'
import { recordConsent } from './lib/consentLog.js'
import { scanRetention, applyRetention, retentionReportText, retentionDoneText } from './lib/retention.js'
import { findPerson, describeFound, erasePerson, erasedText } from './lib/erasure.js'
import { planImport, applyImport, planSummary, doneSummary } from './lib/botHelpImport.js'
import { accountConfig, login as accountLogin, sessionFor, logout as accountLogout, bearer, startSession, revokeFor, sameText } from './lib/accountAuth.js'
import { startRegistration, startReset, peekToken, consumeToken, verifyLogin, changePassword as changeAccountPassword, setMarketing as setAccountMarketing, getAccount, contextOf, validEmail, linkTelegram, unlinkTelegram, findByTelegram, updateContact, ACTIVATE_TTL_MS, RESET_TTL_MS } from './lib/accountUsers.js'
import { issueCode, consumeCode, CODE_TTL_MS } from './lib/telegramLink.js'
import { logActivity, listActivity } from './lib/accountActivity.js'
import { getThread, markSeen, addUserMessage, addSupportReply, linkAdminMessage, loginByAdminMessage, MAX_TEXT as SUPPORT_MAX_TEXT } from './lib/supportChat.js'
import { threadByAdminMessage as recruiterThreadByAdminMessage } from './lib/recruiterChat.js'
import { registerVacanciesCabinet } from './lib/vacanciesCabinet.js'
import { registerCareerCabinet } from './lib/careerCabinet.js'
import { getRecommendation, recommendationByAdminMessage } from './lib/careerData.js'
import { accountDashboard } from './lib/accountDashboard.js'
import { composeAccountMail, composeSupportReplyMail } from './lib/accountMail.js'
import { accountProfile, residentJoin, residentStatus, subscriptionDetails } from './lib/accountProfile.js'
import { knowledgeTree, knowledgePage, knowledgeSearch, knowledgeFirstId, knowledgeStats } from './lib/knowledgeBase.js'
import { getProfile, saveProfile, grantConsent, addRequest, lastRequest, PRACTICES, LEVELS } from './lib/accountStore.js'
import { DOC_TYPES, LIMITS as DOC_LIMITS, ALLOWED_EXT, MIME as DOC_MIME, listDocuments, usedBytes as docsUsedBytes, addDocument, addVersion, updateDocument, deleteDocument, deleteVersion, versionFile } from './lib/accountDocs.js'
import { exportPersonData, accountEvents } from './lib/accountData.js'
import { nextTicketNumber } from './lib/ticketCounter.js'
import { renderTicketPdf, hasTicketImage, maskEmail } from './lib/ticketImage.js'
import { composeTicketMail, composeReminderMail } from './lib/ticketMail.js'
import { mskDayKey } from './lib/dailyReport.js'
import { logWebhook, lastWebhook, webhookEventsFor } from './lib/webhookLog.js'
import { CAMPAIGNS, ASSETS_DIR, PREVIEW_LEAD_MS, PREVIEW_WAIT_MS, getCampaign, getState as campaignState, patchState as patchCampaign, mediaId, saveMediaId, logDelivery, deliveredSet, campaignText, campaignLink, fitsCaption, audienceOf, campaignsScreen, campaignCard, sendNowConfirm, previewControl } from './lib/campaigns.js'
import { chatAuditScreen, digestScreen, overdueScreen, overdueCard, endedScreen, endedPlanScreen, planAction, endedJoins, waitingJoins, overdueReason, isSnoozed, cancelledAccessOver, hasOtherActive, chargesTodayScreen, consultTasksScreen, requestTasksScreen, resumeTasksScreen, interestTasksScreen, dealTasksScreen, cancelTasksScreen, cancelReasonPicker, unsubscribeConfirm, nudgeConfirm, NEXT_DATE_PROMPT, SNOOZE_DAYS } from './lib/dayTasks.js'
import { COMMUNITY_KEYBOARD, sectionScreen, menuScreen, subscribersScreen, planScreen, dueScreen, cancelledScreen, reminderMenuScreen, reminderPreviewScreen, reminderTargets, reminderMessage, planAmount, CANCEL_REASONS } from './lib/adminCabinet.js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createDeal, listDeals as listAllDeals, getDeal, moveDeal, setQualified, closeDeal, setRevenue, addDealPayment, prepayAmount, dealReceived, scheduleReminder, reopenDeal, stageOf, LAST_STAGE } from './lib/deals.js'
import { dealCard, activeDealsScreen, funnelScreen, stageScreen, closedScreen, monthSummary, monthKeyFor, dealTemplate, TEMPLATE_INTRO, NEW_DEAL_PROMPT, KADRY_KEYBOARD } from './lib/kadryCabinet.js'

const app = express()
app.use(cors())
app.set('trust proxy', 'loopback')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const PRODAMUS_SECRET_KEYS = allSecretKeys()
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'
// Секретная команда открытия кабинета разработчика (можно поменять в server/.env: ADMIN_COMMAND=...).
const ADMIN_COMMAND = process.env.ADMIN_COMMAND || 'KQ21022025RD'
const SUPPORT_HANDLE = process.env.SUPPORT_HANDLE || '@legalcareerist_support'
const BOT_USERNAME = (process.env.BOT_USERNAME || 'legalcareerist_bot').replace(/^@/, '')
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

// Отправка сообщения: { ok, messageId } — номер нужен, когда на сообщение потом отвечают (чат поддержки в кабинете).
async function sendTelegram(chatId, text, replyMarkup, opts = {}) {
  const res = await telegramFetch('sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}), ...(opts.silent ? { disable_notification: true } : {}), ...(replyMarkup ? { reply_markup: { inline_keyboard: replyMarkup } } : {}) }),
  })
  if (!res.ok) {
    console.error('[telegram] sendMessage ошибка:', await res.text())
    return { ok: false, messageId: null }
  }
  const body = await res.json().catch(() => null)
  return { ok: true, messageId: body?.result?.message_id ?? null }
}

async function sendTelegramMessage(chatId, text, replyMarkup, opts = {}) {
  return (await sendTelegram(chatId, text, replyMarkup, opts)).ok
}

/** Некритичное сообщение админу (отчёты, сводки, копии): без звука, если включён «тихий режим» в настройках уведомлений. */
const quiet = () => ({ silent: getAdminSettings().quiet })

// Пересылка настоящего файла (резюме, мотивационное письмо и т.п.) админу —
// документом в тот же чат, что и текстовые уведомления, с подписью, откуда он.
async function sendTelegramDocument(chatId, buffer, filename, caption, opts = {}) {
  const form = new FormData()
  form.append('chat_id', chatId)
  if (opts.silent) form.append('disable_notification', 'true')
  if (caption) form.append('caption', caption)
  form.append('document', new Blob([buffer]), filename)
  const res = await telegramFetch('sendDocument', { method: 'POST', body: form })
  if (!res.ok) console.error('[telegram] sendDocument ошибка:', await res.text())
  return res.ok
}

// Несколько файлов одной заявки (резюме, мотивационное, сопроводительное, рекомендация) приходят отдельными запросами;
// собираем их за пару секунд и отправляем одним альбомом — вместо 3–4 отдельных сообщений админу.
const DOC_ALBUM_WAIT_MS = Number(process.env.DOC_ALBUM_WAIT_MS) || 3000
const docAlbums = new Map()

function queueAdminDocument(key, { buffer, filename, label, name }) {
  let album = docAlbums.get(key)
  if (!album) {
    album = { docs: [], timer: null }
    docAlbums.set(key, album)
  }
  album.docs.push({ buffer, filename, label })
  clearTimeout(album.timer)
  album.timer = setTimeout(() => {
    docAlbums.delete(key)
    flushAdminAlbum(album.docs, name).catch((err) => console.error('[upload-document] не удалось отправить документы:', err))
  }, DOC_ALBUM_WAIT_MS)
}

async function flushAdminAlbum(docs, name) {
  if (docs.length === 1) {
    const [d] = docs
    await sendTelegramDocument(ADMIN_CHAT_ID, d.buffer, d.filename, [d.label || 'Документ', name].filter(Boolean).join(' — '))
    return
  }
  for (let i = 0; i < docs.length; i += 10) {
    const chunk = docs.slice(i, i + 10)
    if (chunk.length === 1) {
      await sendTelegramDocument(ADMIN_CHAT_ID, chunk[0].buffer, chunk[0].filename, [chunk[0].label || 'Документ', name].filter(Boolean).join(' — '))
      continue
    }
    const form = new FormData()
    form.append('chat_id', ADMIN_CHAT_ID)
    form.append('media', JSON.stringify(chunk.map((d, idx) => ({ type: 'document', media: `attach://f${idx}`, ...(idx === 0 ? { caption: `📎 ${name || 'Заявка'}: ${chunk.map((x) => x.label || 'документ').join(', ')}` } : {}) }))))
    chunk.forEach((d, idx) => form.append(`f${idx}`, new Blob([d.buffer]), d.filename))
    const res = await telegramFetch('sendMediaGroup', { method: 'POST', body: form })
    if (!res.ok) console.error('[telegram] sendMediaGroup ошибка:', await res.text())
  }
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

/** Единственный файл, который бот ещё выдаёт сам: чек-лист новичка для новых резидентов сообщества. */
const CHECKLIST_SLUG = 'checklist-novichka'

/**
 * Письмо покупателю с материалом: личная ссылка на скачивание (действует 7 дней), сам файл по почте не уходит.
 * Ссылка выдаётся, только если PDF уже загружен на сайт (scripts/upload-material.sh), иначе письмо говорит, что материал пришлёт поддержка.
 * Возвращает { ok, error?, linkIssued, expiresAt? }.
 */
async function emailMaterial({ to, name, materialSlug, token, free = false }) {
  const material = materialInfo(materialSlug)
  const link = token && getMaterialPdf(materialSlug) ? issueMaterialLink(token) : null
  const { subject, text } = composeMaterialMail({
    name,
    title: material?.title ?? materialSlug,
    downloadUrl: link ? `${SITE_URL}/materials/download?token=${link.token}` : null,
    expiresAt: link?.expiresAt,
    accessUrl: material?.accessUrl,
    reviewUrl: token ? `${SITE_URL}/materials/${materialSlug}?review=${token}#reviews` : null,
    supportHandle: SUPPORT_HANDLE,
    free,
  })
  const sent = await sendMail({ to, subject, text })
  return { ...sent, linkIssued: Boolean(link), expiresAt: link?.expiresAt }
}

/** Каталог мероприятий сайта (выгружается при сборке): по нему сервер берёт название и цену билета. */
// Прежние адреса переименованных мероприятий: старые ссылки и регистрации находят мероприятие по новому адресу.
const EVENT_SLUG_ALIASES = { 'yuridicheskaya-noch-dzhaza-2': 'dzhazovyy-vecher-dlya-yuristov-2' }

function readEventCatalog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'data', 'event-catalog.json'), 'utf8'))
  } catch {
    return []
  }
}

/** Мероприятие из каталога сайта по адресу (в том числе по прежнему, если оно переименовано). */
function findEvent(slug) {
  const actual = EVENT_SLUG_ALIASES[slug] ?? slug
  return readEventCatalog().find((e) => e.slug === actual)
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
function buildPaymentNotification({ kind, number, tariff, subscriptionName, amount, paidAt, nextPaymentAt, name, phone, email, telegram, orphan, extra = [] }) {
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
    ...extra,
  ].filter((l) => l !== null)
  return lines.join('\n')
}

const mailStatusLine = (mail) => (mail.ok ? '✉️ Письмо клиенту: отправлено ✅' : mail.error === 'no_email' ? '✉️ Письмо клиенту: почта не указана' : mail.error === 'smtp_not_configured' ? '⚠️ Письмо клиенту: почта на сервере не настроена (SMTP)' : `⚠️ Письмо клиенту: не ушло (${mail.error})`)

/** Билет-картинка во вложении письма: приложен / не удалось нарисовать (письмо при этом ушло без билета). */
const ticketStatusLine = (mail) => (mail.ticket ? '🎟 Именной билет приложен к письму ✅' : mail.ticketError ? `⚠️ Билет не приложен: не удалось нарисовать (${mail.ticketError})` : null)

/** Контактные строки в том же виде, что в уведомлении об оплате подписки. */
const contactLines = ({ name, phone, email, telegram }) => [
  name && name !== '—' ? `👤 фио: ${name}` : null,
  phone ? `📞 телефон: ${phone}` : null,
  email ? `✉️ почта: ${email}` : null,
  telegram ? `💬 телеграм: ${telegram}` : null,
]

/** Оплата билета на мероприятие: тот же формат, что у оплаты подписки (сумма в рублях, дата оплаты, контакты). */
function buildTicketPaidNotification({ lead, amount, paidAt, mail, warning }) {
  return [
    '💳 Билет оплачен',
    warning ? `⚠️ ${warning}` : null,
    '',
    `Мероприятия → ${lead.eventTitle || 'мероприятие'}`,
    `Билет: ${lead.tariff || 'не указан'}`,
    lead.promo ? `🎟 Промокод: ${lead.promo} (скидка ${formatRub(lead.discount ?? 0)} от ${formatRub(lead.basePrice ?? 0)})` : null,
    '',
    `📅 ${formatMoscowDateTime(new Date(paidAt).toISOString())}`,
    '',
    ...contactLines(lead),
    lead.howHeard ? `🗣 Откуда узнали: ${lead.howHeard}` : null,
    '',
    `💰 Сумма: ${formatRub(amount)}`,
    mailStatusLine(mail),
    ticketStatusLine(mail),
    `🗂 Регистрация №${lead.number} → «Оплатил»`,
  ].filter((l) => l !== null).join('\n')
}

/** Оплата материала маркетплейса. */
function buildMaterialPaidNotification({ purchase, material, phone, amount, paidAt, mail, test }) {
  const marketing = purchase.consentAt ? `✉️ Реклама и рассылки: ${purchase.marketingAt ? 'согласен(на)' : 'не выбрано'}` : null
  const slug = purchase.materialSlug
  const linkLine = !mail.ok
    ? mail.error === 'no_email'
      ? '🔗 Ссылка: у покупателя нет почты, письма не было — свяжитесь с ним'
      : null
    : mail.linkIssued
      ? `🔗 Личная ссылка на файл отправлена, действует ${LINK_DAYS} дней (до ${formatMskDateTime(mail.expiresAt)} мск)`
      : `⚠️ Файл материала не загружен на сайт, ссылка не выдана. Загрузите: bash scripts/upload-material.sh ${slug} файл.pdf, затем отправьте ссылку: bash scripts/material-link.sh ${purchase.email || 'почта'} --send`
  return [
    test ? '🧪 ТЕСТ: имитация оплаты материала (в финансы не идёт)' : '💳 Материал оплачен',
    '',
    `Маркетплейс → ${material?.title ?? slug}`,
    '',
    `📅 ${formatMoscowDateTime(new Date(paidAt).toISOString())}`,
    '',
    ...contactLines({ name: purchase.name, phone: phone || purchase.phone, email: purchase.email }),
    purchase.howHeard ? `🗣 Откуда узнали: ${purchase.howHeard}` : null,
    marketing,
    '',
    `💰 Сумма: ${formatRub(amount)}`,
    mailStatusLine(mail),
    linkLine,
  ].filter((l) => l !== null).join('\n')
}

/** Заменяет первую строку лид-уведомления («🔔 Новая заявка с сайта…») — для отложенных сообщений «не завершили оплату». */
const retitle = (text, title) => text.replace(/^🔔 Новая заявка с сайта/, title)

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
  // Карточка уже оплачена и действует: если это «первая оплата» (платёж №1) по новой подписке, у человека могут быть две подписки.
  const prior = match?.join
  const alreadyActive = Boolean(prior?.paid && prior.status === 'active' && !prior.lifetime && (prior.payments?.length ?? 0) > 0 && paymentNum === 1)
  if (!match) {
    const token = createOrphanJoin({ tariffId, name: extra.name, phone, email, telegram: extra.telegram })
    match = { join: { token }, isFirst: true }
  }

  // Скидочные подписки (350 и 500 ₽) в Prodamus автопродлеваемые: если он прислал дату следующего списания, подписка не разовая.
  // Разовой (доступ на 30 дней, по окончании бот напоминает и исключает из чата) считаем, только когда даты списания нет.
  const prodamusNext = pickNextPaymentDate(subscription, paidAt)
  const oneTime = !tariff && [350, 500].includes(Math.round(amount)) && !prodamusNext
  const nextPaymentAt = prodamusNext ?? (tariff ? addMonths(paidAt, tariff.months) : oneTime ? paidAt + 30 * 24 * 3600 * 1000 : null)
  const result = recordPayment(match.join.token, { tariffId, amount, paidAt, orderKey, nextPaymentAt, profileId, tgUserId, paymentNum, subscriptionId: subscription.id, subscriptionName, oneTime })
  if (!result) {
    console.error('[prodamus] не удалось записать платёж — карточка не найдена:', match.join.token)
    return
  }
  cancelPending({ kind: 'join', phone, email, telegram: extra.telegram })
  if (result.duplicate) {
    console.log('[prodamus] повторный вебхук по уже учтённой оплате — пропускаю:', orderKey)
    return
  }

  const rec = result.record
  console.log(`[prodamus] оплата учтена: ${rec.token} (${result.kind}, платёж №${result.number}), следующее списание:`, nextPaymentAt ? new Date(nextPaymentAt).toISOString() : 'неизвестно')

  // Первая оплата: личная ссылка на вступление и письмо с ней (и сроками, и тем, как отключить подписку).
  const adminLines = []
  let invite = null
  if (result.kind === 'first') {
    try {
      const full = getJoin(rec.token) ?? rec
      invite = communityInviteUrl() ? { url: communityInviteUrl() } : null
      adminLines.push(invite ? '🔗 Ссылка на вступление показана на странице оплаты и отправлена в письме' : '⚠️ COMMUNITY_INVITE_LINK не задана: ссылку на вступление человеку пришлите вручную')
      const mail = await sendSubscriptionMail(full, invite, { amount, paidAt })
      adminLines.push(mailStatusLine(mail))
      // Новая подписка при уже действующей: человек мог заплатить заново, когда старая не списалась, а потом старая всё же списалась.
      const others = listJoins().filter((j) => j.token !== rec.token && j.paid && !j.lifetime && j.status === 'active' && j.nextPaymentAt && samePerson(j, full))
      const known = [...others, ...(alreadyActive ? [prior] : [])]
      if (known.length) adminLines.push(`⚠️ У человека уже есть действующая подписка (${known.map((j) => `${planAmount(j, TARIFFS) || '?'} ₽${j.nextPaymentAt ? `, списание ${ruDateShort(j.nextPaymentAt)}` : ''}`).join('; ')}): возможен дубль. Проверьте в Prodamus и при необходимости отключите лишнюю подписку и верните деньги`)
    } catch (err) {
      console.error('[prodamus] ссылка/письмо после первой оплаты:', err)
    }
    if (rec.tgUserId) for (const tag of ['оплатил_подписку', 'резидент_сообщества']) addTag(rec.tgUserId, tag)
  }

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
      extra: adminLines,
    }),
  )

  if (result.kind === 'first' && rec.tgUserId) {
    await sendInviteLink(rec.tgUserId, getJoin(rec.token) ?? rec)
  } else if (result.kind === 'renewal') {
    const full = getJoin(rec.token) ?? rec
    await notifyResident(full, { text: chargeDoneText(amount, nextPaymentAt), keyboard: CABINET_KEYBOARD }, composeChargeDoneMail({ name: full.name, amount, paidAt, nextPaymentAt, ...mailContext() })).catch((err) => console.error('[prodamus] уведомление о списании:', err))
  }
}

/**
 * Уведомление Prodamus о неудачном автосписании: subscription.type = notification, notification_code = auto_payment, error, current_attempt,
 * last_attempt (yes — попытка последняя), date_next_payment — когда будет следующая попытка. Попытки идут раз в 8 часов, до 10.
 * Первое такое уведомление по этой дате списания: человеку «не получилось списать, проверьте карту» (бот и почта), подписчику жёлтая метка 🟡,
 * админу сообщение. Последняя неудачная попытка: сообщение админу, решать ему. Повторные уведомления по той же дате молча пропускаются.
 */
async function handleChargeFailure(body) {
  const sub = body.subscription
  const join = findPaidJoin({ profileId: sub.profile_id, tgUserId: body.tg_user_id, phone: body.customer_phone || body.phone, email: body.customer_email })
  const attempt = Number(sub.current_attempt) || Number(body.attempt) || null
  const last = String(sub.last_attempt) === 'yes'
  if (!join) {
    console.error('[prodamus] неудачное списание: подписчик не найден в учёте, подписка', sub.id, 'профиль', sub.profile_id)
    await sendTelegramMessage(ADMIN_CHAT_ID, `🟡 Списание не прошло, но подписчика нет в учёте: подписка Prodamus ${sub.id}, профиль ${sub.profile_id}${body.customer_phone ? `, ${body.customer_phone}` : ''}. Проверьте в Prodamus.`, undefined, quiet()).catch(() => false)
    return
  }
  const dueAt = join.nextPaymentAt
  const amount = Number(sub.cost) || planAmount(join, TARIFFS)
  const label = [join.name, join.telegram, join.phone].filter(Boolean).join(', ')
  const reason = [sub.error, sub.error_code].filter(Boolean).join(' / ')
  patchJoin(join.token, { watch: 'charge', lastChargeFailure: { at: Date.now(), attempt, last, error: reason } })
  if (join.tgUserId) addTag(join.tgUserId, 'контроль_списания')
  const firstNotice = join.chargeFailedNoticeFor !== dueAt
  if (firstNotice) {
    patchJoin(join.token, { chargeFailedNoticeFor: dueAt })
    const notices = process.env.AUTO_RESIDENT_REMINDERS !== '0' && process.env.CHARGE_FAILED_NOTICES !== '0'
    const r = notices ? await notifyResident(join, { text: chargeFailedText(amount, dueAt), keyboard: CHARGE_FAILED_KEYBOARD }, composeChargeFailedMail({ name: join.name, amount, chargeAt: dueAt, ...mailContext() })) : null
    const told = r ? `${r.bot ? 'бот ✅' : r.bot === false ? 'бот ❌' : 'бота нет'}, ${r.mail ? 'почта ✅' : r.mail === false ? 'почта ❌' : 'почты нет'}` : 'уведомления клиентам выключены'
    await sendTelegramMessage(ADMIN_CHAT_ID, `🟡 Списание не прошло: ${label} · ${amount ? `${amount} ₽` : 'сумма неизвестна'}\nПричина: ${reason || 'не указана'}. Попытка ${attempt ?? '?'}${last ? ' (последняя)' : `, следующая: ${sub.date_next_payment ?? 'неизвестно'} мск`}.\nЧеловека предупредили: ${told}.`, undefined, quiet()).catch(() => false)
  }
  if (last && join.chargeLastAttemptFor !== dueAt) {
    patchJoin(join.token, { chargeLastAttemptFor: dueAt })
    await sendTelegramMessage(ADMIN_CHAT_ID, `🟡 Последняя попытка списания не удалась: ${label}${amount ? ` · ${amount} ₽` : ''}. Prodamus больше не будет пытаться: напишите человеку и решите, что делать с доступом (раздел «Просрочено»).`, undefined, quiet()).catch(() => false)
  }
}

const ruDateShort = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))

/** Две карточки — один человек: совпал Telegram id, телефон или почта. */
function samePerson(a, b) {
  const phone = (v) => normalizePhone(v)
  const mail = (v) => String(v ?? '').trim().toLowerCase()
  return Boolean((a.tgUserId && a.tgUserId === b.tgUserId) || (phone(a.phone) && phone(a.phone) === phone(b.phone)) || (mail(a.email) && mail(a.email) === mail(b.email)))
}

/** Письмо после оплаты: ссылка на вступление (invite { url } или null), сроки, как отключить, кабинет. Возвращает { ok, error? }. */
async function sendSubscriptionMail(join, invite, { amount, paidAt } = {}) {
  if (!join.email) return { ok: false, error: 'no_email' }
  const last = (join.payments ?? []).at(-1)
  const mail = composeSubscriptionMail({
    name: join.name,
    tariff: TARIFFS[join.tariffId]?.label ?? last?.subscriptionName ?? 'Подписка на сообщество',
    amount: amount ?? last?.amount,
    paidAt: paidAt ?? last?.at ?? Date.now(),
    nextPaymentAt: join.nextPaymentAt,
    oneTime: Boolean(join.oneTime),
    invite,
    telegram: join.telegram,
    siteUrl: SITE_URL,
    botUsername: BOT_USERNAME,
    supportHandle: SUPPORT_HANDLE,
  })
  return sendMail({ to: join.email, ...mail })
}

/**
 * Какая карточка подписчика относится к уведомлению Prodamus о подписке. Сначала по profile_id, потом по Telegram id, телефону и почте.
 * Уведомления об отключении и включении (type: action) приходят иногда без profile_id и без контактов: тогда сверяем по дате следующего
 * списания (у подписки Prodamus и у нашей карточки она одна и та же) или по дате первого платежа, и только если подходит ровно одна карточка.
 */
function findJoinForSubscriptionEvent(body) {
  const sub = body.subscription ?? {}
  const profileId = sub.profile_id ? String(sub.profile_id) : null
  if (profileId) {
    const byProfile = findJoinForPayment({ profileId })
    if (byProfile) return byProfile.join
  }
  const byContact = findPaidJoin({ profileId, tgUserId: body.tg_user_id, phone: body.customer_phone || body.phone, email: body.customer_email })
  if (byContact) return byContact
  const next = parseProdamusDate(sub.date_next_payment)
  const first = parseProdamusDate(sub.date_first_payment)
  const near = (a, b) => Boolean(a && b) && Math.abs(a - b) < 3 * 60 * 1000
  const subId = String(sub.id ?? '')
  const candidates = listJoins().filter(
    (j) =>
      j.paid &&
      !j.lifetime &&
      (near(next, j.nextPaymentAt) || (first && (j.payments ?? []).some((p) => !p.estimated && near(first, p.at)))) &&
      !(j.payments ?? []).some((p) => p.subscriptionId && subId && String(p.subscriptionId) !== subId),
  )
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * Состояние подписки из любого вебхука с блоком subscription. Форматы подтверждены журналом Prodamus: type «action» с action_code
 * deactivation (отключил менеджер, active_manager 0), finish (отключил клиент, active_user 0) и reactivation (всё 1); сам блок содержит
 * флаги active, active_user и active_manager. Любой «0» — подписка отключена. Если карточку определить не удалось, админу уходит
 * предупреждение, чтобы подписку не потерять из виду.
 */
async function handleSubscriptionState(body) {
  const sub = body.subscription
  if (!sub) return
  const flags = ['active', 'active_user', 'active_manager'].filter((k) => sub[k] !== undefined && sub[k] !== '')
  if (!flags.length) return
  const inactive = flags.some((k) => String(sub[k]) === '0')
  const join = findJoinForSubscriptionEvent(body)
  if (!join) {
    if (sub.type === 'action') {
      console.error('[prodamus] уведомление о подписке: карточка не найдена, подписка', sub.id, sub.action_code)
      await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Prodamus прислал «${sub.action_code ?? 'изменение подписки'}» (${inactive ? 'отключена' : 'включена'}), но я не нашёл, чья это подписка: тариф №${sub.id}, ${sub.cost ? `${Math.round(Number(sub.cost))} ₽, ` : ''}дата следующего списания ${sub.date_next_payment || 'нет'}. Проверьте в Prodamus и при необходимости отпишите человека вручную.`, undefined, quiet()).catch(() => false)
    }
    return
  }

  const at = Date.now()
  const result = setSubscriptionActive(join.token, !inactive, at)
  if (!result?.changed) return

  console.log(`[prodamus] статус подписки ${join.token} изменился →`, inactive ? 'отключена' : 'включена')
  if (inactive) {
    await sendTelegramMessage(
      ADMIN_CHAT_ID,
      buildCancellationNotification({ record: result.record, tariff: TARIFFS[result.record.tariffId], at }),
    )
    // Вопрос о причине — только если подписку отключил сам клиент (active_user 0), а не менеджер в Prodamus; отключается CANCEL_SURVEY=0.
    if (result.record.tgUserId && String(sub.active_user) === '0' && process.env.CANCEL_SURVEY !== '0') {
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

/** Если человека раньше исключали из чата, снимаем блокировку: иначе его заявка не пройдёт. */
async function unbanForReturn(join) {
  if (!join?.tgUserId) return
  await telegramFetch('unbanChatMember', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID, user_id: Number(join.tgUserId), only_if_banned: true }) }).catch(() => null)
}

/**
 * Бот присылает ссылку на вступление: после оплаты и по /start access_…. Ссылка общая (COMMUNITY_INVITE_LINK, с одобрением заявок):
 * заявку принимает бот, и только если подписка оплачена.
 */
async function sendInviteLink(chatId, join) {
  const url = communityInviteUrl()
  if (join?.joinedAt) {
    await sendTelegramMessage(chatId, 'Подписка привязана ✅ Ты уже в закрытом чате сообщества.', [[{ text: 'Личный кабинет', callback_data: 'r:menu' }]])
    return
  }
  await unbanForReturn(join)
  await sendTelegramMessage(
    chatId,
    'Отлично! Оплата получена ✅\n\nНажми кнопку «Вступить в сообщество» и подай заявку, я сразу её приму.\n\nЖду тебя внутри!',
    url ? [[{ text: 'Вступить в сообщество', url }], [{ text: 'Личный кабинет', callback_data: 'r:menu' }]] : undefined,
  )
  if (!url) await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Оплата получена, но COMMUNITY_INVITE_LINK не задана: пришлите человеку (chat id ${chatId}) ссылку на сообщество вручную.`)
}

/** Метки и дата вступления: в карточке подписки и в карточке человека в боте (её заводим, если человек ещё не нажимал Start). */
function markJoined(from, join, at) {
  patchJoin(join.token, { joinedAt: join.joinedAt ?? at, lastJoinedAt: at, leftAt: undefined })
  if (!from?.id) return
  ensureBotUser(from)
  for (const tag of ['оплатил_подписку', 'резидент_сообщества', 'вступил_в_сообщество']) addTag(from.id, tag)
  updateBotUser(from.id, { communityJoinedAt: join.joinedAt ?? at })
}

/**
 * Заявка на вступление в чат сообщества (по общей ссылке COMMUNITY_INVITE_LINK). Человека опознаём по Telegram id или, если бота он не
 * запускал, по нику с сайта (decideJoinRequest): привязываем Telegram к оплаченной подписке, одобряем заявку, ставим метки и дату вступления.
 * Оплаты не нашли: заявку не трогаем, админу сообщение (одобрит вручную, если всё в порядке).
 */
async function handleJoinRequest(request) {
  if (String(request.chat?.id) !== String(COMMUNITY_CHAT_ID)) return
  const userId = request.from?.id
  const name = [request.from?.first_name, request.from?.last_name].filter(Boolean).join(' ')
  const who = `${name || 'без имени'}${request.from?.username ? ` (@${request.from.username})` : ''}, id ${userId}`
  const dmChat = request.user_chat_id ?? userId
  const supportButton = [[{ text: 'Поддержка', url: `https://t.me/${SUPPORT_HANDLE.replace(/^@/, '')}` }]]
  const post = (method, body) => telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const verdict = decideJoinRequest({ from: request.from, residentByTelegramId, joins: listJoins(), hasAccess })

  if (verdict.action === 'unpaid') {
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Заявка на вступление в сообщество без найденной оплаты: ${who}.\nЗаявка не одобрена: проверьте оплату и, если всё в порядке, одобрите вручную в чате.`)
    await sendTelegramMessage(dmChat, 'Не вижу подтверждения твоей оплаты 🙂 Подай заявку с того Telegram-аккаунта, ник которого указан при оплате, или запусти бота и нажми Start. Если оплата прошла, напиши в поддержку и приложи чек, мы быстро проверим.', supportButton).catch(() => false)
    return
  }

  if (verdict.bind) setTgUserId(verdict.join.token, String(userId))
  const res = await post('approveChatJoinRequest', { chat_id: COMMUNITY_CHAT_ID, user_id: userId })
  if (!res.ok) {
    console.error('[telegram] approveChatJoinRequest ошибка:', await res.text())
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Не удалось одобрить заявку ${name} (id ${userId}). Бот должен быть администратором чата сообщества с правом приглашать пользователей.`)
    return
  }
  const resident = getJoin(verdict.join.token)
  const now = Date.now()
  markJoined(request.from, resident, now)
  await sendTelegramMessage(ADMIN_CHAT_ID, `✅ Вступил(а) в сообщество: ${who}${verdict.bind ? `\nTelegram привязан к подписке по нику с сайта (${resident.telegram})` : ''}`, undefined, quiet()).catch(() => false)

  const days = resident.nextPaymentAt ? Math.max(1, Math.round((resident.nextPaymentAt - now) / 86400000)) : (TARIFFS[resident.tariffId]?.months ?? 1) * 30
  setTimeout(async () => {
    await sendTelegramMessage(dmChat, `Поздравляю! 🎉\nТеперь ты — полноценная часть нашего сообщества! 💗\n\nУ тебя есть ${days} дней вместе с нами. Наслаждайся общением, пользой и крутыми ребятами ✨\n\nЕсли будут вопросы — всегда пиши мне.`, [[{ text: 'Поддержка', url: `https://t.me/${SUPPORT_HANDLE.replace(/^@/, '')}` }, { text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
    setTimeout(async () => {
      await sendTelegramMessage(dmChat, 'Хотим, чтобы твое включение в сообщество прошло легко и с пользой с самого старта. Прикладываем чек-лист — пройдись по нему в удобное время, это займет пару минут', REMINDER_KEYBOARD).catch(() => false)
      const file = getMaterialFile(CHECKLIST_SLUG)
      if (file) await sendTelegramDocumentById(dmChat, file.fileId).catch(() => false)
    }, 10000)
  }, 10000)
}

/** События чата: вступление и выход тех, кто попал в чат не через нашу заявку (вручную, по общей ссылке), и любой выход резидента. */
async function handleChatMember(event) {
  if (String(event.chat?.id) !== String(COMMUNITY_CHAT_ID)) return
  const user = event.new_chat_member?.user
  if (!user || user.is_bot) return
  const inChat = (s) => s === 'member' || s === 'administrator' || s === 'creator'
  const was = event.old_chat_member?.status
  const now = event.new_chat_member?.status
  const cards = listJoins().filter((c) => String(c.tgUserId ?? '') === String(user.id))
  if (!inChat(was) && inChat(now)) for (const c of cards) patchJoin(c.token, { inChat: true })
  else if (inChat(was) && (now === 'left' || now === 'kicked')) for (const c of cards) patchJoin(c.token, { inChat: false })
  membershipCache.delete(String(user.id))
  const resident = residentByTelegramId(user.id)
  if (!resident) return
  if (!inChat(was) && inChat(now) && !resident.joinedAt && !event.via_join_request) { // вступившие по заявке уже учтены в handleJoinRequest
    markJoined(user, resident, Date.now())
    await sendTelegramMessage(ADMIN_CHAT_ID, `✅ Вступил(а) в сообщество (не по заявке бота): ${[user.first_name, user.last_name].filter(Boolean).join(' ')}${user.username ? ` (@${user.username})` : ''}`, undefined, quiet()).catch(() => false)
  } else if (inChat(was) && (now === 'left' || now === 'kicked')) {
    patchJoin(resident.token, { leftAt: Date.now() })
    addTag(user.id, 'вышел_из_сообщества')
  }
}

// Открытие страницы вакансии → +1 к счётчику просмотров. Считаем реальные
// заходы (не демо-число), но не завязываем это на успех/провал остального
// стека — счётчик пишется сам по себе, до всех проверок ниже.
app.post('/api/vacancy/:slug/view', (req, res) => {
  const stats = incrementView(req.params.slug, utmLabel(req.body?.utm))
  res.json({ ok: true, ...stats })
})

// Только чтение — просмотры всех вакансий разом, для карточек в списке «Соискателям» (не увеличивает счётчик).
// Так число в списке совпадает с тем, что человек увидит на странице вакансии.
app.get('/api/vacancies/views', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json(Object.fromEntries(Object.entries(allVacancyStats()).map(([slug, v]) => [slug, Number(v.views) || 0])))
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

// Бывшая синхронизация localStorage кабинетов с сервером закрыта (отдавала данные без авторизации).
// Старые клиенты, у которых ещё открыта прежняя версия сайта, получают 410 и работают только с локальными данными.
app.all('/api/store/*', (req, res) => res.sendStatus(410))

// ---- Личный кабинет на сайте (/cabinet): вход по логину и паролю из server/.env, см. lib/accountAuth.js ----
// Защита от перебора: не больше 20 неудачных входов за 15 минут на весь сервер (по адресу не считаем: за nginx он у всех
// одинаковый или подделывается). Пароль длинный и случайный, scrypt медленный, так что этого с запасом.
const loginFailures = { count: 0, resetAt: 0 }
const LOGIN_MAX_FAILURES = 20
const LOGIN_WINDOW_MS = 15 * 60 * 1000

/** Простой счётчик попыток по ключу (адрес, почта): true — лимит исчерпан. */
function hitLimit(map, key, max, windowMs, now = Date.now()) {
  const e = map.get(key)
  if (!e || e.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  e.count += 1
  return e.count > max
}
const customerLoginAttempts = new Map()
const registerAttempts = new Map()
const forgotAttempts = new Map()
const activateAttempts = new Map()
const HOUR_MS = 3600 * 1000

// Вход: администратор (логин и пароль из server/.env) или резидент (почта и пароль, lib/accountUsers.js).
app.post('/api/account/login', (req, res) => {
  const now = Date.now()
  const id = String(req.body?.login ?? '').trim()
  const cfg = accountConfig()
  if (cfg && sameText(id, cfg.login)) {
    // Администратор. Защита от перебора: не больше 20 неудачных входов за 15 минут на весь сервер (по адресу не считаем:
    // за nginx он у всех одинаковый или подделывается). Пароль длинный и случайный, scrypt медленный, так что этого с запасом.
    if (loginFailures.resetAt < now) Object.assign(loginFailures, { count: 0, resetAt: now + LOGIN_WINDOW_MS })
    if (loginFailures.count >= LOGIN_MAX_FAILURES) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const r = accountLogin(req.body?.login, req.body?.password)
    if (r.error) {
      loginFailures.count += 1
      return res.status(401).json({ ok: false, error: 'bad_credentials' })
    }
    logActivity(cfg.login, 'login')
    return res.json({ ok: true, token: r.token, expiresAt: r.expiresAt })
  }
  // Резидент: не больше 60 попыток за 15 минут с одного адреса и 8 неудачных подряд на одну почту (lib/accountUsers.js).
  if (hitLimit(customerLoginAttempts, req.ip, 60, LOGIN_WINDOW_MS, now)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const r = verifyLogin(id, req.body?.password, now)
  if (r.error === 'too_many_attempts') return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  if (r.error) return res.status(401).json({ ok: false, error: 'bad_credentials' })
  const session = startSession(`u:${r.account.id}`, now)
  logActivity(`u:${r.account.id}`, 'login')
  res.json({ ok: true, token: session.token, expiresAt: session.expiresAt })
})

/** Письмо со ссылкой «задать пароль» (подтверждение почты или восстановление). Возвращает { ok, error? } как sendMail. */
async function sendAccountLinkMail({ token, purpose, account }, kind = purpose) {
  const link = `${SITE_URL}/cabinet/activate?token=${token}`
  const mail = composeAccountMail({ kind, link, name: account.name, hours: (purpose === 'reset' ? RESET_TTL_MS : ACTIVATE_TTL_MS) / HOUR_MS })
  return sendMail({ to: account.email, subject: mail.subject, text: mail.text, html: mail.html })
}

// Регистрация резидента: почта и согласия. Пароль человек задаёт по ссылке из письма. Ответ не зависит от того, есть ли уже
// такая почта (иначе по ответу можно было бы узнавать, кто зарегистрирован); существующему владельцу уходит письмо «у вас уже есть кабинет».
app.post('/api/account/register', async (req, res) => {
  const body = req.body ?? {}
  if (!mailConfigured()) return res.status(503).json({ ok: false, error: 'mail_unavailable' })
  if (hitLimit(registerAttempts, req.ip, 10, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  if (!validEmail(body.email)) return res.status(400).json({ ok: false, error: 'bad_email' })
  if (!consentGiven(body)) return res.status(400).json({ ok: false, error: 'consent_required' })
  const r = startRegistration({ email: body.email, name: body.name, consentAt: Date.now(), consentVersion: consentVersion(body), marketing: consentChoice(body).marketing, marketingVersion: marketingVersion(body) })
  if (r.sent) {
    if (r.purpose === 'activate') recordConsent({ form: 'cabinet_register', version: consentVersion(body), given: true, ...marketingFields(body), name: r.account.name || undefined, email: r.account.email })
    const mail = await sendAccountLinkMail(r, r.purpose === 'reset' ? 'exists' : 'activate')
    if (!mail.ok) return res.status(502).json({ ok: false, error: 'mail_failed' })
  }
  res.json({ ok: true })
})

// «Забыли пароль»: так же отвечаем одинаково независимо от того, есть ли аккаунт.
app.post('/api/account/forgot', async (req, res) => {
  if (!mailConfigured()) return res.status(503).json({ ok: false, error: 'mail_unavailable' })
  if (hitLimit(forgotAttempts, req.ip, 10, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  if (!validEmail(req.body?.email)) return res.status(400).json({ ok: false, error: 'bad_email' })
  const r = startReset(req.body.email)
  if (r) {
    const mail = await sendAccountLinkMail(r)
    if (!mail.ok) return res.status(502).json({ ok: false, error: 'mail_failed' })
  }
  res.json({ ok: true })
})

// Страница «задайте пароль» узнаёт у сервера, что за ссылка (подтверждение почты или восстановление) и для какой почты.
app.get('/api/account/activation', (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (hitLimit(activateAttempts, req.ip, 60, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const info = peekToken(String(req.query.token ?? ''))
  if (!info) return res.status(404).json({ ok: false, error: 'bad_token' })
  res.json({ ok: true, purpose: info.purpose, email: info.email })
})

// Пароль по ссылке из письма: подтверждает почту, гасит ссылку и сразу открывает кабинет. После восстановления старые входы закрываются.
app.post('/api/account/activate', (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (hitLimit(activateAttempts, req.ip, 60, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const purpose = peekToken(String(req.body?.token ?? ''))?.purpose
  const r = consumeToken(String(req.body?.token ?? ''), req.body?.password)
  if (r.error) return res.status(r.error === 'bad_token' ? 404 : 400).json({ ok: false, error: r.error })
  const loginName = `u:${r.account.id}`
  revokeFor(loginName)
  logActivity(loginName, purpose === 'reset' ? 'password_reset' : 'password_set')
  const session = startSession(loginName)
  res.json({ ok: true, token: session.token, expiresAt: session.expiresAt })
})

/** Кто вошёл: администратор (настройки из .env) или резидент (аккаунт). Для всех разделов кабинета вид один: { login, tgId, name, email, phone }. */
function accountContext(req) {
  const s = sessionFor(bearer(req))
  if (!s) return null
  const cfg = accountConfig()
  if (cfg && s.login === cfg.login) return cfg
  const account = String(s.login).startsWith('u:') ? getAccount(String(s.login).slice(2)) : null
  return account ? contextOf(account) : null
}

app.get('/api/account/me', (req, res) => {
  const cfg = accountContext(req)
  if (!cfg) return res.status(401).json({ ok: false, error: 'unauthorized' })
  res.set('Cache-Control', 'no-store')
  res.json({ ok: true, ...accountProfile(cfg) })
})

app.post('/api/account/logout', (req, res) => {
  accountLogout(bearer(req))
  res.json({ ok: true })
})

/** Вошедший в кабинет или null — тогда уже отправлен ответ 401. */
function requireAccount(req, res) {
  const cfg = accountContext(req)
  if (!cfg) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return null
  }
  res.set('Cache-Control', 'no-store')
  return cfg
}

// Смена пароля резидента (нужен текущий). Остальные входы закрываются, этот остаётся.
app.post('/api/account/password', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (!String(cfg.login).startsWith('u:')) return res.status(400).json({ ok: false, error: 'not_supported' })
  if (hitLimit(customerLoginAttempts, `pw:${cfg.login}`, 10, LOGIN_WINDOW_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const r = changeAccountPassword(String(cfg.login).slice(2), req.body?.current, req.body?.password)
  if (r.error) return res.status(r.error === 'bad_credentials' ? 403 : 400).json({ ok: false, error: r.error })
  revokeFor(cfg.login, bearer(req))
  logActivity(cfg.login, 'password_changed')
  res.json({ ok: true })
})

// Привязка Telegram по коду из бота (команда /link, см. sendLinkCode): кабинет узнаёт Telegram id и находит подписку и карточку в боте.
// Привязать и снять можно только у аккаунта резидента; один Telegram — один аккаунт. Кто привязал, тому бот сообщает об этом
// (с маской почты) и называет команду /unlink: так видно, если код выманили.
const telegramLinkAttempts = new Map()
app.post('/api/account/telegram/link', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (!String(cfg.login).startsWith('u:')) return res.status(400).json({ ok: false, error: 'not_supported' })
  if (hitLimit(telegramLinkAttempts, `l:${cfg.login}`, 10, LOGIN_WINDOW_MS) || hitLimit(telegramLinkAttempts, `ip:${req.ip}`, 40, LOGIN_WINDOW_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  if (cfg.tgId) return res.status(409).json({ ok: false, error: 'already_linked' })
  const tgUserId = consumeCode(req.body?.code)
  if (!tgUserId) return res.status(400).json({ ok: false, error: 'bad_code' })
  const r = linkTelegram(String(cfg.login).slice(2), tgUserId)
  if (r.error) return res.status(409).json({ ok: false, error: r.error })
  logActivity(cfg.login, 'telegram_linked')
  void sendTelegramMessage(tgUserId, `✅ Telegram привязан к кабинету на сайте (${maskEmail(r.account.email) || 'почта скрыта'}).\n\nЕсли это сделали не вы, отвяжите командой /unlink.`).catch(() => {})
  res.json({ ok: true })
})

app.delete('/api/account/telegram', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (!String(cfg.login).startsWith('u:')) return res.status(400).json({ ok: false, error: 'not_supported' })
  const was = unlinkTelegram(String(cfg.login).slice(2))
  if (was) {
    logActivity(cfg.login, 'telegram_unlinked')
    void sendTelegramMessage(was, 'Кабинет на сайте отвязан от этого Telegram.').catch(() => {})
  }
  res.json({ ok: true })
})

/** Данные для журнала согласий о вошедшем: имя, Telegram id и ник из карточки бота. */
function accountIdentity(cfg) {
  const bot = cfg.tgId ? getBotUser(cfg.tgId) : null
  return { name: cfg.name || [bot?.firstName, bot?.lastName].filter(Boolean).join(' ') || cfg.login, tgId: cfg.tgId || undefined, telegram: bot?.username, phone: cfg.phone || cfg.contactPhone || bot?.phone, email: cfg.email || bot?.email }
}

app.get('/api/account/profile', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  res.json({ ok: true, profile: getProfile(cfg.login) })
})

// Сохранение частей профиля (practices, experience, expectations, privacy). При первом сохранении нужны две обязательные галочки.
app.put('/api/account/profile', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const r = saveProfile(cfg.login, req.body, consentGiven(req.body))
  if (r.error) return res.status(400).json({ ok: false, error: r.error })
  logActivity(cfg.login, 'profile_saved', { part: Object.keys(req.body ?? {}).find((k) => ['practices', 'experience', 'expectations', 'privacy'].includes(k)) })
  if (r.firstConsent) recordConsent({ form: 'cabinet_profile', version: consentVersion(req.body), given: true, ...marketingFields(req.body), ...accountIdentity(cfg) })
  if (r.firstConsent && consentChoice(req.body).marketing && cfg.tgId && getBotUser(cfg.tgId)) setMailingConsent(cfg.tgId, true)
  res.json({ ok: true, profile: r.profile })
})

// Согласие на рекламные и информационные сообщения: можно включить и отозвать в любой момент. Решение уходит в карточку бота
// (по ней идут рассылки) и в журнал согласий.
app.post('/api/account/marketing', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (typeof req.body?.marketing !== 'boolean') return res.status(400).json({ ok: false, error: 'bad_request' })
  const value = req.body.marketing
  if (cfg.tgId && getBotUser(cfg.tgId)) setMailingConsent(cfg.tgId, value)
  if (String(cfg.login).startsWith('u:')) setAccountMarketing(String(cfg.login).slice(2), value)
  logActivity(cfg.login, 'marketing_changed', { value })
  recordConsent({ form: 'cabinet_marketing', version: consentVersion(req.body), given: Boolean(getProfile(cfg.login).consentAt), marketing: value, marketingVersion: marketingVersion(req.body), ...accountIdentity(cfg) })
  res.json({ ok: true, marketing: value, at: Date.now(), applied: Boolean(cfg.tgId && getBotUser(cfg.tgId)) })
})

// Скачать все свои данные одним файлом.
app.get('/api/account/data', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  logActivity(cfg.login, 'data_exported')
  res.set('Content-Disposition', `attachment; filename="moi-dannye-${new Date().toISOString().slice(0, 10)}.json"`)
  res.type('application/json').send(JSON.stringify(exportPersonData(cfg), null, 2))
})

// Запрос на удаление данных: не стираем сами (в данных есть оплаты, которые закон велит хранить), а передаём админу в бота.
app.post('/api/account/data-request', async (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const previous = lastRequest(cfg.login, 'delete')
  if (previous && Date.now() - previous.at < 24 * 3600 * 1000) return res.json({ ok: true, already: true, at: previous.at })
  const request = addRequest(cfg.login, 'delete')
  logActivity(cfg.login, 'deletion_requested')
  if (BOT_TOKEN && ADMIN_CHAT_ID) {
    const who = accountIdentity(cfg)
    await sendTelegramMessage(ADMIN_CHAT_ID, `🗑 Запрос на удаление данных из личного кабинета\n\nКто: ${who.name} (${cfg.email ? `почта ${cfg.email}` : `логин ${cfg.login}`}${cfg.tgId ? `, Telegram id ${cfg.tgId}` : ''})\n\nЧтобы выполнить: /forget ${cfg.tgId || cfg.login}\nПлатёжные сведения при этом не удаляются, а обезличиваются — закон велит хранить их дольше.`).catch(() => false)
  }
  res.json({ ok: true, at: request.at })
})

// Сводка для обзора: счётчики, заполненность профиля, последние события и действия, непрочитанные ответы поддержки.
app.get('/api/account/dashboard', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  res.json({ ok: true, ...accountDashboard(cfg) })
})

// Имя и телефон для связи. Почта задаётся при регистрации и здесь не меняется (смена почты требует подтверждения нового адреса).
app.put('/api/account/contact', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (!String(cfg.login).startsWith('u:')) return res.status(400).json({ ok: false, error: 'not_supported' })
  const r = updateContact(String(cfg.login).slice(2), { name: req.body?.name, phone: req.body?.phone })
  if (r.error) return res.status(400).json({ ok: false, error: r.error })
  logActivity(cfg.login, 'contact_updated')
  res.json({ ok: true, contact: { name: r.account.name ?? '', email: r.account.email, phone: r.account.phone ?? '' } })
})

// Журнал действий в кабинете (вход, смена пароля, привязка Telegram, профиль, документы…): последние 100.
app.get('/api/account/activity', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  res.json({ ok: true, activity: listActivity(cfg.login, 100) })
})

// ---- Чат поддержки в кабинете (lib/supportChat.js) ----
// Сообщение человека уходит админу в бота; админ отвечает «Ответить» (Reply) на него, и ответ появляется здесь. Открытие чата
// отмечает ответы прочитанными; обзор показывает только число непрочитанных и ничего не отмечает.
const supportAttempts = new Map()

app.get('/api/account/support', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const thread = getThread(cfg.login)
  markSeen(cfg.login)
  res.json({ ok: true, messages: thread.messages, unread: thread.unread, maxLength: SUPPORT_MAX_TEXT })
})

app.post('/api/account/support', async (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (hitLimit(supportAttempts, cfg.login, 10, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const r = addUserMessage(cfg.login, req.body?.text)
  if (r.error) return res.status(400).json({ ok: false, error: 'empty' })
  logActivity(cfg.login, 'support_message')
  const notified = await notifySupportMessage(cfg, r.message)
  res.json({ ok: true, message: r.message, notified })
})

/** Передаёт сообщение из чата админу в бота и запоминает его номер: ответ (Reply) админа найдёт по нему нужную переписку. */
async function notifySupportMessage(cfg, message) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return false
  try {
    const who = accountIdentity(cfg)
    const sent = await sendTelegram(ADMIN_CHAT_ID, `💬 Чат поддержки на сайте\n\nОт: ${who.name} (${cfg.email ? `почта ${cfg.email}` : `логин ${cfg.login}`}${cfg.tgId ? `, Telegram id ${cfg.tgId}` : ''})\n\n${message.text}\n\n↩️ Чтобы ответить, нажмите «Ответить» (Reply) на это сообщение: ответ появится в чате кабинета.`)
    if (sent.ok && sent.messageId) linkAdminMessage(cfg.login, sent.messageId)
    return sent.ok
  } catch (err) {
    console.error('[support] не удалось передать сообщение админу:', err?.message ?? err)
    return false
  }
}

/** Ответ админа (Reply в боте) попадает в чат кабинета; человеку уходит письмо и, если Telegram привязан, сообщение в бота. */
async function deliverSupportReply(adminChatId, login, text) {
  const r = addSupportReply(login, text)
  if (r.error) {
    await sendTelegramMessage(adminChatId, 'Пустой ответ не отправлен.')
    return
  }
  logActivity(login, 'support_reply')
  // в ленту уведомлений кабинета: письмо и сообщение в Telegram ниже уходят и так, поэтому копию в Telegram не шлём
  void vacanciesCabinet.notifyAccount(login, { kind: 'support_reply', title: 'Ответ службы поддержки', text: r.message.text, link: '/cabinet/support' }, { telegram: false }).catch(() => {})
  const account = String(login).startsWith('u:') ? getAccount(String(login).slice(2)) : null
  const notes = []
  if (account) {
    const link = `${SITE_URL}/cabinet/support`
    if (mailConfigured()) {
      const mail = composeSupportReplyMail({ name: account.name, text: r.message.text, link })
      const sent = await sendMail({ to: account.email, subject: mail.subject, text: mail.text, html: mail.html }).catch(() => ({ ok: false }))
      notes.push(sent.ok ? 'письмо отправлено' : 'письмо не ушло')
    }
    if (account.tgUserId) {
      const ok = await sendTelegramMessage(account.tgUserId, `💬 Ответ службы поддержки\n\n${r.message.text}\n\nЧат: ${link}`).catch(() => false)
      notes.push(ok ? 'сообщение в Telegram отправлено' : 'в Telegram не доставлено')
    }
  }
  await sendTelegramMessage(adminChatId, `✅ Ответ добавлен в чат кабинета${notes.length ? ` (${notes.join(', ')})` : ''}.`)
}

// ---- Подписка на сообщество в кабинете (раздел «Статус») ----
// Подписку находим по Telegram id и по подтверждённой почте аккаунта (как и статус резидента).
app.get('/api/account/subscription', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  res.json({ ok: true, subscription: subscriptionDetails(cfg.tgId, cfg.email) })
})

// ---- Закрытая база знаний для резидентов (кабинет на сайте, /cabinet/knowledge) ----
// Файлы лежат на сервере (server/content/knowledge, см. lib/knowledgeBase.js и docs/knowledge-base.md). Доступ проверяется при каждом
// запросе: резидент с действующей или бессрочной подпиской и администратор; у закончившейся подписки доступа нет сразу.
const kbSearchAttempts = new Map()

function requireKb(req, res) {
  const cfg = requireAccount(req, res)
  if (!cfg) return null
  res.set('X-Robots-Tag', 'noindex')
  const admin = !String(cfg.login).startsWith('u:')
  if (!admin) {
    const status = residentStatus(cfg.tgId, Date.now(), cfg.email).status
    if (status !== 'active' && status !== 'lifetime') {
      res.status(403).json({ ok: false, error: 'members_only', status })
      return null
    }
  }
  return { cfg, admin }
}

app.get('/api/account/kb', (req, res) => {
  const who = requireKb(req, res)
  if (!who) return
  const opts = { admin: who.admin }
  res.json({ ok: true, admin: who.admin, firstId: knowledgeFirstId(opts), stats: knowledgeStats(opts), tree: knowledgeTree(opts) })
})

app.get('/api/account/kb/page', (req, res) => {
  const who = requireKb(req, res)
  if (!who) return
  const page = knowledgePage(String(req.query.id ?? ''), { admin: who.admin })
  if (!page) return res.status(404).json({ ok: false, error: 'not_found' })
  res.json({ ok: true, page })
})

app.get('/api/account/kb/search', (req, res) => {
  const who = requireKb(req, res)
  if (!who) return
  if (hitLimit(kbSearchAttempts, who.cfg.login, 120, 60 * 1000)) return res.status(429).json({ ok: false, error: 'too_many_requests' })
  const q = String(req.query.q ?? '').slice(0, 100)
  res.json({ ok: true, results: knowledgeSearch(q, { admin: who.admin }) })
})

const subscriptionAttempts = new Map()

/** Отключение автопродления из кабинета: тот же путь, что в боте (Prodamus setActivity), доступ остаётся до конца оплаченного периода. */
app.post('/api/account/subscription/cancel', async (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (hitLimit(subscriptionAttempts, `c:${cfg.login}`, 5, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const join = residentJoin(cfg.tgId, cfg.email)
  if (!join) return res.status(404).json({ ok: false, error: 'no_subscription' })
  if (join.status !== 'active') return res.status(409).json({ ok: false, error: 'already_cancelled' })
  const reason = String(req.body?.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 500) || 'не указана'
  // Основатель проходит путь клиента целиком, но подписка не меняется (иначе он потерял бы доступ).
  const test = Boolean(join.lifetime)
  const { confirmed, results } = test ? { confirmed: true, results: [] } : await cancelSubscription(join, reason)
  const endsAt = test ? join.endsAt : join.nextPaymentAt
  logActivity(cfg.login, 'subscription_cancelled')
  if (BOT_TOKEN && ADMIN_CHAT_ID) {
    const who = accountIdentity(cfg)
    await sendTelegramMessage(ADMIN_CHAT_ID, buildKadryRichNotification({
      template: 'support',
      direction: 'Кабинет на сайте → Сообщество',
      service: 'Отмена подписки резидентом',
      date: new Date().toISOString(),
      name: who.name,
      phone: who.phone,
      email: who.email,
      telegram: who.telegram,
      details: [
        `Причина: ${reason}`,
        test ? 'ТЕСТ основателя: ничего не отключено, подписка осталась активной' : join.oneTime ? 'Разовая подписка — доступ закончится в срок, списаний нет' : confirmed ? 'Отключена в Prodamus автоматически' : '⚠️ Автоматически отключить в Prodamus не удалось — отключите вручную, иначе спишут деньги',
        ...results.map((r) => `Prodamus, подписка ${r.id}: ${r.ok ? 'OK' : 'ошибка'} (${r.raw ?? r.status})`),
        endsAt ? `Доступ до ${new Date(endsAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })}` : 'Дата окончания неизвестна',
      ],
      ticketNumber: String(nextTicketNumber()),
      origin: 'из кабинета',
    })).catch(() => false)
  }
  res.json({ ok: true, confirmed, test, endsAt: endsAt ?? null })
})

/**
 * Смена карты для списаний. Prodamus не даёт ни клиенту, ни нам сменить карту самостоятельно (в REST API есть только включение и
 * выключение подписки, скидка и дата списания), поэтому запрос уходит в чат поддержки с данными подписки, а дальше это делает человек.
 */
app.post('/api/account/subscription/card', async (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  if (hitLimit(subscriptionAttempts, `k:${cfg.login}`, 3, 24 * HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const sub = subscriptionDetails(cfg.tgId, cfg.email)
  if (sub.status === 'none') return res.status(404).json({ ok: false, error: 'no_subscription' })
  const date = (ts) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'не указана')
  const text = [
    'Прошу помочь сменить банковскую карту для списаний по подписке.',
    `Тариф: ${sub.tariff ?? 'не указан'}.`,
    sub.nextPayment ? `Следующее списание: ${date(sub.nextPayment)}.` : `Доступ до: ${date(sub.until)}.`,
  ].join('\n')
  const r = addUserMessage(cfg.login, text)
  if (r.error) return res.status(400).json({ ok: false, error: 'empty' })
  logActivity(cfg.login, 'card_change_requested')
  const notified = await notifySupportMessage(cfg, r.message)
  res.json({ ok: true, notified })
})

app.get('/api/account/events', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  res.json({ ok: true, events: accountEvents(cfg) })
})

// Справочники профиля для формы (коды и названия практик и уровней) — чтобы не дублировать их на сайте и сервере.
app.get('/api/account/options', (req, res) => {
  if (!requireAccount(req, res)) return
  res.json({ ok: true, practices: PRACTICES, levels: LEVELS })
})

// ---- Документы личного кабинета: резюме, сопроводительные, тестовые (lib/accountDocs.js) ----
const documentsState = (cfg) => ({ ok: true, documents: listDocuments(cfg.login), types: DOC_TYPES, extensions: ALLOWED_EXT, limits: DOC_LIMITS, usedBytes: docsUsedBytes(cfg.login), consentAt: getProfile(cfg.login).consentAt })

app.get('/api/account/documents', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  res.json(documentsState(cfg))
})

const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DOC_LIMITS.fileBytes, files: 1, fields: 12, fieldSize: 4096 } }).single('file')
const DOC_ERRORS = {
  empty_file: [400, 'empty_file'], bad_type: [400, 'bad_type'], bad_content: [400, 'bad_content'], file_too_large: [413, 'file_too_large'],
  bad_doc_type: [400, 'bad_doc_type'], too_many_documents: [409, 'too_many_documents'], too_many_versions: [409, 'too_many_versions'],
  storage_full: [409, 'storage_full'], not_found: [404, 'not_found'],
}
const docError = (res, code) => {
  const [status, error] = DOC_ERRORS[code] ?? [400, 'bad_request']
  return res.status(status).json({ ok: false, error })
}

// Загрузка: новый документ или, если передан docId, новая версия существующего. Вход проверяется до разбора файла.
app.post('/api/account/documents', (req, res, next) => (requireAccount(req, res) ? next() : undefined), (req, res) => {
  const cfg = accountContext(req)
  documentUpload(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return docError(res, 'file_too_large')
    if (err || !req.file) return res.status(400).json({ ok: false, error: 'no_file' })
    const b = req.body ?? {}
    let consent
    try {
      consent = JSON.parse(String(b.consent ?? 'null'))
    } catch {
      consent = null
    }
    const body = { consent, consentVersion: b.consentVersion, marketingVersion: b.marketingVersion }
    const needConsent = !getProfile(cfg.login).consentAt
    if (needConsent && !consentGiven(body)) return res.status(400).json({ ok: false, error: 'consent_required' })
    // multer читает имя файла как latin1, поэтому настоящее имя (UTF-8) приходит отдельным полем
    const file = { buffer: req.file.buffer, filename: String(b.fileName || req.file.originalname || '') }
    const r = b.docId ? addVersion(cfg.login, String(b.docId), file) : addDocument(cfg.login, { type: String(b.type ?? 'cv'), title: b.title, note: b.note, target: b.target }, file)
    if (r.error) return docError(res, r.error)
    logActivity(cfg.login, 'document_added', { docType: r.doc?.type })
    if (needConsent && grantConsent(cfg.login)) {
      recordConsent({ form: 'cabinet_documents', version: consentVersion(body), given: true, ...marketingFields(body), ...accountIdentity(cfg) })
      if (consentChoice(body).marketing && cfg.tgId && getBotUser(cfg.tgId)) setMailingConsent(cfg.tgId, true)
    }
    res.json({ ...documentsState(cfg), doc: r.doc })
  })
})

app.patch('/api/account/documents/:id', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const r = updateDocument(cfg.login, req.params.id, { title: req.body?.title, note: req.body?.note, target: req.body?.target, primary: req.body?.primary === true ? true : undefined })
  if (r.error) return docError(res, r.error)
  res.json(documentsState(cfg))
})

app.delete('/api/account/documents/:id', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const r = deleteDocument(cfg.login, req.params.id)
  if (r.error) return docError(res, r.error)
  logActivity(cfg.login, 'document_deleted')
  res.json(documentsState(cfg))
})

app.delete('/api/account/documents/:id/versions/:n', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const r = deleteVersion(cfg.login, req.params.id, Number(req.params.n))
  if (r.error) return docError(res, r.error)
  res.json(documentsState(cfg))
})

// Скачивание файла версии. Файл отдаётся как вложение с запретом угадывать тип: даже если внутри окажется не то, что заявлено
// в расширении, браузер его не выполнит.
app.get('/api/account/documents/:id/versions/:n/file', (req, res) => {
  const cfg = requireAccount(req, res)
  if (!cfg) return
  const f = versionFile(cfg.login, req.params.id, Number(req.params.n))
  if (!f) return docError(res, 'not_found')
  res.set({
    'Content-Type': DOC_MIME[f.ext] ?? 'application/octet-stream',
    'Content-Length': String(f.size),
    'Content-Disposition': `attachment; filename="document.${f.ext}"; filename*=UTF-8''${encodeURIComponent(f.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  })
  fs.createReadStream(f.path).pipe(res)
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
  // Файлы одной заявки (одно и то же «имя — вакансия») склеиваются в один альбом.
  const who = [name, vacancy].filter(Boolean).join(' — ')
  queueAdminDocument(who || 'без имени', { buffer: req.file.buffer, filename: req.file.originalname, label, name: who })
  res.json({ ok: true })
})

// Формы, которые считаются заказом услуги рекрутинга и становятся сделкой.
const DEAL_FORM_TYPES = new Set(['service_order', 'employer_request'])
// Формы раздела «Мероприятия», которые записываются в кабинет: регистрация на билет и заявки.
const EVENT_LEAD_TYPES = new Set(['event_registration', 'event_partner_application', 'event_order', 'partner_application', 'event_submission'])

const SERVICE_FALLBACK = { contact: 'Контакты', support_request: 'Поддержка', ambassador_application: 'Амбассадор', community_join: 'Вступление в сообщество' }

/**
 * Что человек отметил под формой сайта: { policy, processing, marketing } — ознакомлен с Политикой, согласен на обработку
 * персональных данных, хочет рекламные и информационные сообщения. Засчитывается только явное true.
 * Прежняя версия сайта присылала consent: true — это только «обработка», без Политики.
 */
const consentChoice = (body) => {
  const c = body?.consent
  if (c === true) return { policy: false, processing: true, marketing: false }
  return { policy: c?.policy === true, processing: c?.processing === true, marketing: c?.marketing === true }
}
/** Обязательные согласия даны: Политика и обработка (реклама — по желанию, на отправку не влияет). */
const consentGiven = (body) => {
  const c = consentChoice(body)
  return c.policy && c.processing
}
const consentVersion = (body) => String(body?.consentVersion ?? '').slice(0, 20) || '2025-09-01'
const marketingVersion = (body) => String(body?.marketingVersion ?? '').slice(0, 20) || '2026-10-14'
/** Поля для журнала согласий: реклама и её редакция. */
const marketingFields = (body) => ({ marketing: consentChoice(body).marketing, marketingVersion: marketingVersion(body) })

// ---- Вкладка «Вакансии» кабинета: отклики, чат с рекрутером по вакансиям, уведомления, кадровый резерв (lib/vacanciesCabinet.js) ----
// Уведомления кабинета (copy в Telegram и на почту), ответ админа Reply в чате вакансии и смена статуса отклика кнопками в боте.
const vacanciesCabinet = registerVacanciesCabinet(app, {
  requireAccount, hitLimit, readVacancyCatalog, sendTelegram, sendTelegramMessage, mailConfigured, sendMail, accountIdentity, logActivity, recordConsent, consentVersion,
  siteUrl: SITE_URL,
  botReady: () => Boolean(BOT_TOKEN && ADMIN_CHAT_ID),
  adminChatId: ADMIN_CHAT_ID,
})

// ---- Вкладка «Построение карьеры»: план, подготовка к интервью, шаблоны, рекомендация, подкаст, портфолио (lib/careerCabinet.js) ----
// Запрос рекомендации и заявка на подкаст приходят админу в бота; рекомендацию админ пишет ответом (Reply) на запрос.
const careerCabinet = registerCareerCabinet(app, {
  requireMember: requireKb, hitLimit, sendTelegram, sendTelegramMessage, accountIdentity, logActivity, recordConsent, consentVersion,
  notifyAccount: vacanciesCabinet.notifyAccount,
  botReady: () => Boolean(BOT_TOKEN && ADMIN_CHAT_ID),
  adminChatId: ADMIN_CHAT_ID,
})

app.post('/api/notify', async (req, res) => {
  const { direction, service, source, formType, name, contact, phone, email, telegram, company, template, interest, date, vacancySlug, eventSlug, ticketNumber, utm } = req.body ?? {}
  const utmSource = utmLabel(utm)
  const howHeard = cleanHowHeard(req.body?.howHeard)
  logLeadSource({ kind: service || SERVICE_FALLBACK[formType] || formType || 'Заявка', name, answer: howHeard, utm: utmSource })
  // Вступление в сообщество фиксирует согласие в /api/community/subscribe — второй раз не пишем.
  if (formType !== 'community_join') {
    recordConsent({ form: formType || 'form', version: consentVersion(req.body), given: consentGiven(req.body), ...marketingFields(req.body), name, phone, email, telegram })
  }

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
      const created = createDeal({ company, name, phone, email, telegram, request: request === 'не указано' ? '' : request, details: lines, source: formType, expectedFee, howHeard })
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
      const app = createApplication({ vacancySlug, vacancyTitle: catalogTitle || String(service ?? '').match(/«(.+)»/)?.[1], name, phone, email, telegram, source: utmSource, documents, howHeard })
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
        howHeard,
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
        howHeard,
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
      const c = createConsultation({ kind: isOrder ? 'order' : 'question', services, promo, total, name, phone, email, telegram, source: utmSource, howHeard })
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
  const consentNote = (consentGiven(req.body) ? '' : '\n⚠️ Не отмечены обязательные галочки: ознакомление с Политикой и согласие на обработку ПДн (форма старой версии или заявка в обход формы) — запросите согласие') + `\n✉️ Реклама и рассылки: ${consentChoice(req.body).marketing ? 'согласен(на)' : 'не выбрано'}`
  const sourceNote = (utm && utmSource !== 'без метки' ? `\n📣 Источник: ${utmSource}` : '') + (howHeard ? `\n${howHeardLine(howHeard)}` : '') + consentNote
  // Нажали «Перейти к оплате» — это ещё не клиент: уведомление придёт одно, и только если оплаты нет (см. pendingNotices.js);
  // при оплате вместо него приходит «Оплата получена».
  if (formType === 'community_join') {
    if (getAdminSettings().unpaidNotices) queuePending({ kind: 'join', phone, email, telegram, text: retitle(text, `⏳ Не завершили оплату подписки через ${PENDING_MINUTES} мин`) + sourceNote })
    return res.json({ ok: true })
  }
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
  // Без согласия на обработку персональных данных ссылку на оплату не выдаём.
  if (!consentGiven(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })

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
    const token = createPendingJoin({ tariffId, name, phone, email, telegram, howHeard: cleanHowHeard(req.body.howHeard), consentAt: Date.now(), marketingAt: consentChoice(req.body).marketing ? Date.now() : null })
    recordConsent({ form: 'community_join', version: consentVersion(req.body), given: true, ...marketingFields(req.body), name, phone, email, telegram })
    const urlSuccess = `${SITE_URL}/community/success?token=${token}`
    const url = await createPaymentLink({ tariffId, phone, email, urlSuccess, name, telegram })
    res.json({ ok: true, url })
  } catch (err) {
    console.error('[subscribe] ошибка генерации ссылки на оплату:', err)
    res.status(500).json({ ok: false, error: 'link_generation_failed' })
  }
})

// Подтверждение оплаты для страниц успеха (подписка, билет, материал): сайт отправляет в Яндекс Метрику цель pay_* только когда
// оплата подтверждена подписанным вебхуком Prodamus. Отдаём только факт оплаты, сумму и обезличенный номер заказа — без контактов.
const PAY_TOKEN_RE = /^[0-9a-f]{8,64}$/i
const orderRef = (kind, token) => `${kind}-${crypto.createHash('sha256').update(token).digest('hex').slice(0, 10)}`
app.get('/api/payment/status', (req, res) => {
  res.set('Cache-Control', 'no-store')
  const kind = String(req.query.kind ?? '')
  const token = String(req.query.token ?? '')
  const none = { ok: true, paid: false }
  if (!PAY_TOKEN_RE.test(token)) return res.json(none)
  if (kind === 'community') {
    const join = getJoin(token)
    const first = (join?.payments ?? []).find((p) => Number(p.amount) > 0)
    return res.json(join?.paid && first ? { ok: true, paid: true, amount: Number(first.amount), order: orderRef(kind, token) } : none)
  }
  if (kind === 'ticket') {
    const lead = listEventLeads().find((l) => l.token === token && l.kind === 'registration')
    return res.json(lead && (lead.status === 'paid' || lead.status === 'attended') && Number(lead.amount) > 0 ? { ok: true, paid: true, amount: Number(lead.amount), order: `ev-${lead.number}` } : none)
  }
  if (kind === 'product') {
    const purchase = getPurchase(token)
    return res.json(purchase?.paid && Number(purchase.amount) > 0 ? { ok: true, paid: true, amount: Number(purchase.amount), order: orderRef(kind, token) } : none)
  }
  res.json(none)
})

// Страница после оплаты подписки: ссылка на вступление в закрытый чат по токену из ссылки возврата с оплаты (его знает только заплативший).
// Пока вебхук Prodamus не дошёл, paid=false, и страница опрашивает снова. Ссылка общая, а заявку одобряет бот, и только оплатившим.
const accessAttempts = new Map()
app.get('/api/community/access', (req, res) => {
  res.set('Cache-Control', 'no-store')
  const token = String(req.query.token ?? '')
  if (!PAY_TOKEN_RE.test(token)) return res.json({ ok: true, known: false, paid: false })
  if (hitLimit(accessAttempts, `g:${token}`, 240, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const join = getJoin(token)
  if (!join || join.lifetime) return res.json({ ok: true, known: false, paid: false })
  if (!join.paid) return res.json({ ok: true, known: true, paid: false })
  const url = hasAccess(join) ? communityInviteUrl() : ''
  res.json({ ok: true, known: true, paid: true, joined: Boolean(join.joinedAt), telegram: join.telegram || '', invite: url ? { url } : null })
})

// Чек об оплате билета для страницы возврата с оплаты: сайт показывает «печатающийся» чек с именем гостя, билетом и номером.
// Токен — из ссылки возврата (urlSuccess), её получает только заплативший. Отдаём ровно то, что напечатано на чеке: без почты и телефона.
// known=false — такого заказа нет (чек показывать не нужно); paid=false при known=true — оплата ещё не подтверждена вебхуком Prodamus.
app.get('/api/ticket/receipt', (req, res) => {
  res.set('Cache-Control', 'no-store')
  const token = String(req.query.token ?? '')
  if (!PAY_TOKEN_RE.test(token)) return res.json({ ok: true, known: false, paid: false })
  const lead = listEventLeads().find((l) => l.token === token && l.kind === 'registration')
  if (!lead) return res.json({ ok: true, known: false, paid: false })
  if (lead.status !== 'paid' && lead.status !== 'attended') return res.json({ ok: true, known: true, paid: false })
  res.json({
    ok: true,
    known: true,
    paid: true,
    name: lead.name ?? '',
    tariff: lead.tariff ?? '',
    amount: Number(lead.amount) || Number(lead.price) || 0,
    number: lead.number,
    eventSlug: lead.eventSlug ?? '',
    paidAt: lead.paidAt ?? null,
    hasTicket: hasTicketImage(lead.eventSlug ?? ''),
  })
})

// Скачать именной билет файлом PDF: кнопка «Скачать билет» на странице после оплаты. Токен — из ссылки возврата с оплаты
// (её знает только заплативший), как и у чека. Рисуем на лету, на диск не сохраняем.
const ticketPdfAttempts = new Map()
function ticketPdfRateLimited(ip) {
  const now = Date.now()
  const e = ticketPdfAttempts.get(ip)
  if (!e || e.resetAt < now) {
    ticketPdfAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  e.count += 1
  return e.count > 30
}
app.get('/api/ticket/pdf', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (ticketPdfRateLimited(req.ip)) return res.status(429).json({ ok: false, error: 'too_many_requests' })
  const token = String(req.query.token ?? '')
  if (!PAY_TOKEN_RE.test(token)) return res.status(404).json({ ok: false, error: 'not_found' })
  const lead = listEventLeads().find((l) => l.token === token && l.kind === 'registration')
  if (!lead || (lead.status !== 'paid' && lead.status !== 'attended') || !hasTicketImage(lead.eventSlug ?? '')) return res.status(404).json({ ok: false, error: 'not_found' })
  try {
    const ticket = await renderTicketPdf({ eventSlug: lead.eventSlug, number: lead.number, name: lead.name, phone: lead.phone, email: lead.email, paidAt: lead.paidAt ?? Date.now() })
    res.set({
      'Content-Type': ticket.contentType,
      'Content-Disposition': `attachment; filename="bilet-${lead.number}.pdf"; filename*=UTF-8''${encodeURIComponent(ticket.filename)}`,
    })
    res.send(ticket.buffer)
  } catch (err) {
    console.error('[ticket] не удалось нарисовать билет для скачивания, регистрация №', lead.number, err)
    res.status(500).json({ ok: false, error: 'render_failed' })
  }
})

// Покупка материала маркетплейса → ссылка на разовую оплату Prodamus.
app.post('/api/marketplace/purchase', async (req, res) => {
  const { materialSlug, name, phone, email } = req.body ?? {}
  if (!MATERIALS[materialSlug]) return res.status(400).json({ ok: false, error: 'unknown_material' })
  if (!consentGiven(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
  if (!phone) return res.status(400).json({ ok: false, error: 'phone_required' })
  // Покупатель с сайта получает файл по почте (в Telegram — по кнопке из письма), поэтому почта обязательна.
  if (!EMAIL_RE.test(String(email ?? '').trim())) return res.status(400).json({ ok: false, error: 'email_required' })

  try {
    logLeadSource({ kind: `Материал: ${MATERIALS[materialSlug].title}`, name, answer: req.body.howHeard })
    const token = createPendingPurchase({ materialSlug, name, phone, email, howHeard: cleanHowHeard(req.body.howHeard), consentAt: Date.now(), marketingAt: consentChoice(req.body).marketing ? Date.now() : null })
    recordConsent({ form: 'material_purchase', version: consentVersion(req.body), given: true, ...marketingFields(req.body), name, phone, email })
    const urlSuccess = `${SITE_URL}/materials/thanks?token=${token}`
    const url = await createProductPaymentLink({ materialSlug, phone, email, urlSuccess })
    res.json({ ok: true, url })
  } catch (err) {
    console.error('[marketplace] ошибка генерации ссылки на оплату:', err)
    res.status(500).json({ ok: false, error: 'link_generation_failed' })
  }
})

// Бесплатный гайд маркетплейса: почта и согласия вместо оплаты. Файл не показывается на странице — личная ссылка (7 дней) уходит на почту,
// поэтому получить его может только владелец ящика. Чужую почту «закидать» письмами не дают ограничения по адресу и по IP.
const freeGrantByIp = new Map()
const freeGrantByEmail = new Map()
app.post('/api/marketplace/free', async (req, res) => {
  const { materialSlug, email } = req.body ?? {}
  const material = materialInfo(materialSlug)
  if (!material?.free) return res.status(400).json({ ok: false, error: 'unknown_material' })
  if (!consentGiven(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
  const mail = String(email ?? '').trim()
  if (mail.length > 200 || !EMAIL_RE.test(mail)) return res.status(400).json({ ok: false, error: 'email_required' })
  if (hitLimit(freeGrantByIp, req.ip, 20, HOUR_MS) || hitLimit(freeGrantByEmail, mail.toLowerCase(), 3, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  // Без файла ссылку выдавать нечего: лучше честно отказать, чем отправить письмо «пришлёт поддержка».
  if (!getMaterialPdf(materialSlug)) {
    console.error(`[marketplace] бесплатный материал «${materialSlug}»: файла нет, выдача невозможна`)
    return res.status(503).json({ ok: false, error: 'file_missing' })
  }

  const name = String(req.body.name ?? '').trim().slice(0, 120)
  try {
    logLeadSource({ kind: `Бесплатный материал: ${material.title}`, name, answer: req.body.howHeard })
    const token = grantFreeMaterial({ materialSlug, name, email: mail, howHeard: cleanHowHeard(req.body.howHeard), consentAt: Date.now(), marketingAt: consentChoice(req.body).marketing ? Date.now() : null })
    recordConsent({ form: 'material_free', version: consentVersion(req.body), given: true, ...marketingFields(req.body), name, email: mail })
    const sent = await emailMaterial({ to: mail, name, materialSlug, token, free: true })
    if (!sent.ok) {
      console.error('[marketplace] письмо с бесплатным материалом не ушло:', sent.error)
      return res.status(502).json({ ok: false, error: 'mail_failed' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[marketplace] ошибка выдачи бесплатного материала:', err)
    res.status(500).json({ ok: false, error: 'grant_failed' })
  }
})

// ---- Личная ссылка на материал (купленный или бесплатный) ----
// Ссылка приходит покупателю в письме после оплаты и действует 7 дней (materialLinks.js). Страница /materials/download?token=…
// спрашивает здесь, что это за ссылка и не истёк ли срок, а кнопка «Скачать» ведёт на /api/materials/download — туда же, но за файлом.
const materialLinkAttempts = new Map()
const MATERIAL_LINK_WINDOW_MS = 15 * 60 * 1000

/** Покупка, материал и срок по токену из адреса; либо { status, error } для ответа. */
function lookupMaterialLink(req) {
  if (hitLimit(materialLinkAttempts, req.ip, 120, MATERIAL_LINK_WINDOW_MS)) return { status: 429, error: 'too_many_requests' }
  const token = String(req.query.token ?? '')
  if (!looksLikeLinkToken(token)) return { status: 404, error: 'not_found' }
  const link = resolveMaterialLink(token)
  if (link.error === 'expired') return { status: 410, error: 'expired', expiresAt: link.expiresAt }
  if (link.error) return { status: 404, error: 'not_found' }
  const purchase = getPurchase(link.purchaseToken)
  // Покупку обезличили или стёрли (удаление данных по запросу), либо она не оплачена: тогда и ссылка не работает.
  if (!hasMaterialAccess(purchase)) return { status: 404, error: 'not_found' }
  return { purchase, material: materialInfo(purchase.materialSlug), expiresAt: link.expiresAt }
}

app.get('/api/materials/link', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
  const found = lookupMaterialLink(req)
  if (found.error) return res.status(found.status).json({ ok: false, error: found.error, ...(found.expiresAt ? { expiresAt: found.expiresAt } : {}) })
  res.json({ ok: true, title: found.material?.title ?? found.purchase.materialSlug, expiresAt: found.expiresAt, fileReady: Boolean(getMaterialPdf(found.purchase.materialSlug)) })
})

app.get('/api/materials/download', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
  const found = lookupMaterialLink(req)
  if (found.error) return res.status(found.status).json({ ok: false, error: found.error, ...(found.expiresAt ? { expiresAt: found.expiresAt } : {}) })
  const slug = found.purchase.materialSlug
  const file = getMaterialPdf(slug)
  if (!file) return res.status(404).json({ ok: false, error: 'file_missing' })
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': String(file.size),
    'Content-Disposition': `attachment; filename="${slug}.pdf"`,
  })
  const stream = fs.createReadStream(file.path)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
})

// ---- Отзывы о материалах ----
// Публично: рейтинги и тексты отзывов (без контактов). Оставить отзыв может только покупатель — по токену покупки из письма/бота.

app.get('/api/materials/ratings', (_req, res) => {
  const summary = ratingsSummary()
  res.json(Object.fromEntries(Object.entries(summary).map(([slug, v]) => [slug, { sum: v.sum, count: v.count }])))
})

app.get('/api/materials/:slug/reviews', (req, res) => {
  if (!materialInfo(req.params.slug)) return res.status(404).json({ ok: false, error: 'unknown_material' })
  const reviews = publicReviews(req.params.slug)
  res.json({ ok: true, reviews, count: reviews.length, sum: reviews.reduce((acc, r) => acc + r.rating, 0) })
})

/** Покупка, по которой разрешён отзыв: оплачена (или материал получен бесплатно) и относится к этому материалу. */
const purchaseForReview = (token, slug) => {
  const purchase = /^[0-9a-f]{8,64}$/i.test(String(token ?? '')) ? getPurchase(String(token)) : null
  return hasMaterialAccess(purchase) && purchase.materialSlug === slug ? purchase : null
}

app.get('/api/materials/:slug/review-access', (req, res) => {
  const purchase = purchaseForReview(req.query.token, req.params.slug)
  if (!purchase) return res.status(403).json({ ok: false, error: 'no_access' })
  const mine = getReviewByPurchase(String(req.query.token))
  res.json({ ok: true, review: mine ? { rating: mine.rating, text: reviewText(mine), name: mine.name } : null })
})

app.post('/api/materials/:slug/review', async (req, res) => {
  const slug = req.params.slug
  const token = String(req.body?.token ?? '')
  const purchase = purchaseForReview(token, slug)
  if (!purchase) return res.status(403).json({ ok: false, error: 'no_access' })
  const rating = Number(req.body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ ok: false, error: 'rating_required' })
  // Два отдельных согласия: на обработку персональных данных и — отдельным документом — на публикацию (распространение) имени, оценки и текста.
  if (!consentGiven(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
  if (req.body?.publishConsent !== true) return res.status(400).json({ ok: false, error: 'publish_consent_required' })
  const signature = reviewSignature(req.body?.displayName)
  if (!signature) return res.status(400).json({ ok: false, error: 'name_required' })

  const at = Date.now()
  const publishVersion = String(req.body?.publishConsentVersion ?? '').slice(0, 20) || '2026-10-14'
  const { review, updated } = saveReview({ materialSlug: slug, purchaseToken: token, name: signature, rating, text: req.body.text, consents: { processingAt: at, publishAt: at, publishVersion } })
  recordConsent({ form: 'review', version: consentVersion(req.body), given: true, ...marketingFields(req.body), name: purchase.name, phone: purchase.phone, email: purchase.email, at })
  recordConsent({ form: 'review_publication', version: publishVersion, given: true, name: purchase.name, phone: purchase.phone, email: purchase.email, at })
  res.json({ ok: true })

  if (BOT_TOKEN && ADMIN_CHAT_ID) {
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
    const text = [
      updated ? '✏️ Отзыв о материале обновлён' : '⭐ Новый отзыв о материале',
      '',
      `Маркетплейс → ${materialInfo(slug)?.title ?? slug}`,
      `Оценка: ${stars} (${review.rating} из 5)`,
      review.text ? `💬 Отзыв: ${review.text}` : null,
      '',
      `👤 Имя на сайте: ${review.name}`,
      `🗂 Отзыв №${review.number} — уже опубликован на странице материала`,
    ].filter((l) => l !== null).join('\n')
    await sendTelegramMessage(ADMIN_CHAT_ID, text, [[{ text: '🙈 Скрыть отзыв', callback_data: `a:x:rvh:${review.number}` }, { text: '⭐ Все отзывы', callback_data: 'a:x:rv' }]]).catch(() => false)
  }
})

// Проверка промокода на билет: сервер возвращает цену со скидкой (в форме показываем её до оплаты).
// От подбора кодов перебором защищает ограничение попыток с одного адреса.
const promoAttempts = new Map()
function promoRateLimited(ip) {
  const now = Date.now()
  const e = promoAttempts.get(ip)
  if (!e || e.resetAt < now) {
    promoAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  e.count += 1
  return e.count > 20
}

/** Билет мероприятия из каталога сайта с применённым промокодом (если передан). Возвращает { event, tariff, price, discount, promo } или { error }. */
function priceTicket(slug, tariffId, promoCode) {
  const event = findEvent(slug)
  if (!event) return { error: 'unknown_event', status: 404 }
  if (event.status !== 'open' || event.registrationLink) return { error: 'not_for_sale', status: 400 }
  const tariff = event.tariffs.find((t) => t.id === tariffId)
  if (!tariff || !(tariff.price > 0)) return { error: 'unknown_tariff', status: 400 }
  if (!promoCode) return { event, tariff, price: tariff.price, discount: 0, promo: null }
  const promo = findPromo(promoCode)
  if (!promo) return { error: 'invalid_promo', status: 400 }
  const { price, discount } = applyPromo(tariff.price, promo)
  return { event, tariff, price, discount, promo }
}

app.post('/api/event/:slug/promo', (req, res) => {
  if (promoRateLimited(req.ip)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
  const r = priceTicket(req.params.slug, req.body?.tariffId, String(req.body?.code ?? '').trim() || 'пусто')
  if (r.error) return res.status(r.status).json({ ok: false, error: r.error })
  res.json({ ok: true, code: r.promo.code, label: promoLabel(r.promo), price: r.price, discount: r.discount, basePrice: r.tariff.price })
})

// Покупка билета на мероприятие → регистрация (ожидает оплаты) + ссылка на оплату Prodamus.
// Название и цену берём из каталога на сервере; оплата привязывается к регистрации по order_id «ev-N».
app.post('/api/event/:slug/checkout', async (req, res) => {
  const promoCode = String(req.body?.promoCode ?? '').trim()
  const ticket = priceTicket(req.params.slug, req.body?.tariffId, promoCode)
  if (ticket.error) return res.status(ticket.status).json({ ok: false, error: ticket.error })
  const { event, tariff } = ticket
  if (!consentGiven(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })

  const name = String(req.body.name ?? '').trim()
  const phone = String(req.body.phone ?? '').trim()
  const email = String(req.body.email ?? '').trim()
  const telegram = normalizeTelegram(req.body.telegram)
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' })
  if (normalizePhone(phone).length < 11 && !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'contact_required' })
  // Подтверждение и напоминание уходят на почту — без неё участник остался бы без билета на руках.
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'email_required' })

  try {
    incrementEventRegistration(event.slug)
    logLeadSource({ kind: `Билет: ${event.title}`, name, answer: req.body.howHeard, utm: utmLabel(req.body.utm) })
    const lead = createEventLead({ kind: 'registration', formType: 'event_registration', eventSlug: event.slug, eventTitle: event.title, tariff: tariff.name, name, phone, email, telegram, source: utmLabel(req.body.utm), howHeard: cleanHowHeard(req.body.howHeard) })
    setEventLeadField(lead.number, 'price', ticket.price)
    setEventLeadField(lead.number, 'consentAt', Date.now())
    if (consentChoice(req.body).marketing) setEventLeadField(lead.number, 'marketingAt', Date.now())
    recordConsent({ form: 'event_ticket', version: consentVersion(req.body), given: true, ...marketingFields(req.body), name, phone, email, telegram })
    if (ticket.promo) {
      setEventLeadField(lead.number, 'basePrice', tariff.price)
      setEventLeadField(lead.number, 'promo', ticket.promo.code)
      setEventLeadField(lead.number, 'discount', ticket.discount)
    }
    const orderId = `ev-${lead.number}`
    const urlSuccess = `${SITE_URL}/events/${event.slug}?paid=1&t=${lead.token}`
    const url = await createEventPaymentLink({ title: `${event.title} — ${tariff.name}`, price: ticket.price, orderId, phone, email: EMAIL_RE.test(email) ? email : '', urlSuccess, name })
    if (BOT_TOKEN && ADMIN_CHAT_ID && getAdminSettings().unpaidNotices) {
      // Не шлём сразу: если человек оплатит в ближайшие минуты, придёт одно сообщение «Билет оплачен», а это — только если не оплатил.
      const text = buildLeadNotification({ direction: 'Мероприятия', service: 'Билет на мероприятие', date: new Date().toISOString(), name, phone, email, telegram, details: [`Мероприятие: ${event.title}`, `Билет: ${tariff.name} — ${formatRub(ticket.price)}${ticket.promo ? ` (промокод ${ticket.promo.code}: −${formatRub(ticket.discount)} от ${formatRub(tariff.price)})` : ''}`, ...(lead.howHeard ? [`Откуда узнали: ${lead.howHeard}`] : [])], ticketNumber: String(lead.number) })
      queuePending({ kind: 'ticket', eventNumber: lead.number, phone, email, telegram, text: `${retitle(text, `⏳ Не завершили оплату билета через ${PENDING_MINUTES} мин`)}\n\n🗂 Регистрация №${lead.number}`, keyboard: [[{ text: `📂 Открыть №${lead.number}`, callback_data: `a:x:evcard:${lead.number}` }]] })
    }
    res.json({ ok: true, url })
  } catch (err) {
    console.error('[event-checkout] ошибка генерации ссылки на оплату:', err)
    res.status(500).json({ ok: false, error: 'link_generation_failed' })
  }
})

// Апдейты от Telegram-бота @legalcareerist_bot. Настраивается один раз
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
  const ok = await sendTelegramDocument(ADMIN_CHAT_ID, buffer, `legalcareerist-data-${mskDayKey(Date.now())}.tar.gz`, caption, quiet())
  if (ok) writeBackupState({ ...readBackupState(), lastAt: Date.now() })
  return ok
}

const menuBack = (text, data) => [[{ text, callback_data: data }, { text: '🏠 Меню', callback_data: 'a:menu' }]]
const DAY_MS = 24 * 3600 * 1000
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---- Рекламные рассылки (lib/campaigns.js): посты с фото или видео по расписанию тем, кто дал согласие на рекламу ----

/** Один запрос Telegram для рассылки: при ограничении частоты (429) ждёт и повторяет; blocked — человек заблокировал бота или аккаунта нет. */
async function campaignCall(method, payload, form) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res
    try {
      res = await telegramFetch(method, form ? { method: 'POST', body: form } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } catch (err) {
      return { ok: false, kind: 'failed', error: err.message }
    }
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok) return { ok: true, data: data.result }
    if (res.status === 429) {
      await pause(((data?.parameters?.retry_after ?? 5) + 1) * 1000)
      continue
    }
    const description = String(data?.description ?? '')
    const blocked = res.status === 403 || /bot was blocked|user is deactivated|chat not found|can't initiate/i.test(description)
    return { ok: false, kind: blocked ? 'blocked' : 'failed', error: description || `HTTP ${res.status}` }
  }
  return { ok: false, kind: 'failed', error: 'слишком частые запросы' }
}

/** Отправка поста одному человеку: ok, blocked или failed. Файл грузится в Telegram один раз, дальше уходит по file_id. */
async function sendCampaignTo(c, chatId) {
  const text = campaignText(c, SITE_URL)
  const markup = { inline_keyboard: [[{ text: '🎟 Купить билет', url: campaignLink(SITE_URL, c) }]] }
  const single = fitsCaption(c, SITE_URL)
  const video = c.media.kind === 'video'
  const method = video ? 'sendVideo' : 'sendPhoto'
  const field = video ? 'video' : 'photo'
  const cached = mediaId(c.media.file)
  let r
  if (cached) {
    r = await campaignCall(method, { chat_id: chatId, [field]: cached, ...(video ? { supports_streaming: true, width: c.media.width, height: c.media.height } : {}), ...(single ? { caption: text, reply_markup: markup } : {}) })
  } else {
    const form = new FormData()
    form.append('chat_id', String(chatId))
    if (video) {
      form.append('supports_streaming', 'true')
      form.append('width', String(c.media.width))
      form.append('height', String(c.media.height))
    }
    if (single) {
      form.append('caption', text)
      form.append('reply_markup', JSON.stringify(markup))
    }
    form.append(field, new Blob([fs.readFileSync(path.join(ASSETS_DIR, c.media.file))]), c.media.file)
    r = await campaignCall(method, null, form)
    const fileId = r.ok ? (video ? r.data?.video?.file_id : r.data?.photo?.at(-1)?.file_id) : null
    if (fileId) saveMediaId(c.media.file, fileId)
  }
  if (!r.ok) {
    console.error(`[campaign] ${c.id} → ${chatId}: ${r.error}`)
    return r.kind
  }
  if (!single) {
    const t = await campaignCall('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true }, reply_markup: markup })
    if (!t.ok) {
      console.error(`[campaign] ${c.id} → ${chatId} (текст): ${t.error}`)
      return t.kind
    }
  }
  return 'ok'
}

const campaignAudienceSize = () => audienceOf(listBotUsers(), ADMIN_CHAT_ID).length

/** Тестовая копия админу и кнопки «Пауза» / «Отправить сейчас». Рассылка уйдёт не раньше чем через PREVIEW_WAIT_MS после неё. */
async function sendCampaignPreview(c, now) {
  const state = campaignState(c.id)
  const tries = (state.previewTries ?? 0) + 1
  patchCampaign(c.id, { previewTries: tries })
  const r = await sendCampaignTo(c, ADMIN_CHAT_ID)
  if (r !== 'ok') {
    if (tries === 1 || tries === 3) await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Рассылка ${c.number}: не удалось отправить вам тестовую копию (${r}). Пока тест не дойдёт, рассылка не уйдёт.`).catch(() => false)
    return false
  }
  patchCampaign(c.id, { previewAt: now })
  const ctl = previewControl(c, Math.max(c.sendAt, now + PREVIEW_WAIT_MS), campaignAudienceSize())
  await sendTelegramMessage(ADMIN_CHAT_ID, ctl.text, ctl.keyboard)
  return true
}

/** Рассылка получателям. Кому уже доставлено, пропускаем (журнал), поэтому после перезапуска сервера она продолжается без дублей. */
async function runCampaign(c) {
  const done = deliveredSet(c.id)
  const todo = audienceOf(listBotUsers(), ADMIN_CHAT_ID).filter((u) => !done.has(String(u.id)))
  if (!campaignState(c.id).startedAt) {
    patchCampaign(c.id, { startedAt: Date.now(), total: todo.length })
    await sendTelegramMessage(ADMIN_CHAT_ID, `📤 Рассылка ${c.number} началась: ${todo.length} получателей.`, undefined, quiet()).catch(() => false)
  }
  const count = { ok: 0, blocked: 0, failed: 0 }
  let stopped = null
  let failedInRow = 0
  for (let i = 0; i < todo.length; i++) {
    if (i % 20 === 0 && campaignState(c.id).paused) {
      stopped = 'пауза'
      break
    }
    const result = await sendCampaignTo(c, todo[i].id)
    logDelivery(c.id, todo[i].id, result)
    count[result] += 1
    failedInRow = result === 'failed' ? failedInRow + 1 : 0
    if (failedInRow >= 15) {
      // 15 неудач подряд — это не заблокировавшие бота, а проблема с Telegram или сетью: ставим на паузу
      patchCampaign(c.id, { paused: true })
      stopped = 'много ошибок подряд'
      break
    }
    await pause(40)
  }
  if (!stopped) patchCampaign(c.id, { finishedAt: Date.now(), goNow: undefined })
  const all = deliveredSet(c.id)
  const lines = [stopped ? `⏸ Рассылка ${c.number} остановлена (${stopped}). Продолжится с того же места после «Возобновить».` : `✅ Рассылка ${c.number} закончена.`, `Доставлено сейчас: ${count.ok}, бот заблокирован: ${count.blocked}, не доставлено: ${count.failed}.`, `Всего получили эту рассылку: ${all.size}.`]
  await sendTelegramMessage(ADMIN_CHAT_ID, lines.join('\n'), [[{ text: '📣 Все рассылки', callback_data: 'a:x:nl' }]], quiet()).catch(() => false)
}

let campaignsRunning = false
/** Раз в 30 секунд: за час до времени отправки шлёт админу тест, затем (не раньше чем через PREVIEW_WAIT_MS) запускает рассылку. Отключить: CAMPAIGNS=0. */
async function processCampaigns() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID || campaignsRunning || process.env.CAMPAIGNS === '0') return
  campaignsRunning = true
  try {
    for (const c of CAMPAIGNS) {
      const state = campaignState(c.id)
      const now = Date.now()
      if (state.finishedAt || state.paused) continue
      if (!state.previewAt && !state.goNow) {
        if (now >= c.sendAt - PREVIEW_LEAD_MS && (state.previewTries ?? 0) < 3) await sendCampaignPreview(c, now)
        continue
      }
      if (state.goNow || now >= Math.max(c.sendAt, state.previewAt + PREVIEW_WAIT_MS)) await runCampaign(c)
    }
  } finally {
    campaignsRunning = false
  }
}

/**
 * Где человек сейчас по отношению к чату сообщества (getChatMember): in — в чате, out — нет (вышел, исключён, не вступал), admin — администратор
 * или владелец чата, none — у карточки нет Telegram id, unknown — Telegram не ответил (тогда ничего не делаем).
 */
async function chatMembership(tgUserId) {
  if (!tgUserId) return 'none'
  try {
    const res = await telegramFetch('getChatMember', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID, user_id: Number(tgUserId) }) })
    const data = await res.json()
    if (!data.ok) return /user not found|PARTICIPANT_ID_INVALID/i.test(String(data.description ?? '')) ? 'out' : 'unknown'
    const m = data.result ?? {}
    if (m.status === 'creator' || m.status === 'administrator') return 'admin'
    if (m.status === 'left' || m.status === 'kicked' || (m.status === 'restricted' && m.is_member === false)) return 'out'
    return 'in'
  } catch {
    return 'unknown'
  }
}

const membershipCache = new Map()
/** То же с кэшем на минуту: пока админ листает списки, Telegram не дёргаем заново. */
async function membershipOf(join) {
  if (!join.tgUserId) return 'none'
  const hit = membershipCache.get(String(join.tgUserId))
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.mem
  const mem = await chatMembership(join.tgUserId)
  if (mem !== 'unknown') membershipCache.set(String(join.tgUserId), { at: Date.now(), mem })
  return mem
}

/** Телефон и почту, которых нет в карточке подписки, берём из карточки человека в боте: админу они нужны, чтобы проверить оплату в Prodamus. */
const withContacts = (joins) =>
  joins.map((j) => {
    const u = j.tgUserId ? getBotUser(j.tgUserId) : null
    return u && (!j.phone || !j.email) ? { ...j, phone: j.phone || u.phone || '', email: j.email || u.email || '' } : j
  })

/** Список просрочки (оплату ещё можно получить). */
const overdueView = async (now) => overdueScreen(withContacts(listJoins()), TARIFFS, now)

/** Список «Срок вышел» с проверкой, в чате ли каждый (до 12 человек за раз). */
async function endedView(now) {
  const joins = withContacts(listJoins())
  const list = endedJoins(joins, now).filter((j) => !isSnoozed(j, now))
  const membership = new Map()
  for (const j of list.slice(0, 12)) membership.set(j.token, await membershipOf(j))
  return endedScreen(joins, TARIFFS, now, membership)
}

/** Карточка человека из просрочки или «Срок вышел»: контакты, причина, что присылал Prodamus, где он (в чате или нет) и подходящая кнопка. */
async function overdueCardFor(token, now) {
  const joins = withContacts(listJoins())
  const j = joins.find((x) => x.token === token)
  if (!j) return overdueView(now)
  const ended = overdueReason(j, now).code === 'ended'
  const membership = ended ? await membershipOf(j) : undefined
  const events = webhookEventsFor({ profileId: j.prodamusProfileId, subscriptionIds: (j.payments ?? []).map((p) => p.subscriptionId) })
  return overdueCard(j, TARIFFS, now, events, ended ? { membership, plan: planAction(j, membership, joins, now) } : {})
}

/** Возврат к нужному списку после действия над человеком. */
const backViewFor = async (j, now) => (j && overdueReason(withContacts([j])[0], now).code === 'ended' ? endedView(now) : overdueView(now))

/** План закрытия доступа тем, у кого срок вышел (до 15 за раз): что делать с каждым, исходя из того, где он сейчас. */
async function buildEndedPlan(now) {
  const joins = withContacts(listJoins())
  const plan = []
  for (const j of endedJoins(joins, now).filter((x) => !isSnoozed(x, now)).slice(0, 15)) {
    const mem = await membershipOf(j)
    plan.push({ join: j, mem, ...planAction(j, mem, joins, now) })
  }
  return plan
}

/** Сверка: сколько людей в чате по данным Telegram и как они раскладываются по карточкам (экран «Сообщество → Сверка с чатом»). */
async function chatAudit(now) {
  const call = async (method) => (await telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID }) }).then((r) => r.json()).catch(() => null))
  const [count, admins] = await Promise.all([call('getChatMemberCount'), call('getChatAdministrators')])
  const staff = admins?.ok ? admins.result.map((a) => ({ id: String(a.user.id), name: [a.user.first_name, a.user.last_name].filter(Boolean).join(' ') || a.user.username || `id ${a.user.id}` })) : []
  const joins = withContacts(listJoins())
  const shown = joins.filter((j) => j.lifetime || j.status === 'active').slice(0, 120)
  const cards = []
  for (const j of shown) cards.push({ join: j, mem: await membershipOf(j) })
  return chatAuditScreen({ total: count?.ok ? Number(count.result) : null, staff, cards, joins, now })
}

/** Убрать из активных без исключения и без сообщения человеку (его нет в чате или это лишняя карточка). */
function closeQuietly(join, now, by = 'admin') {
  setSubscriptionActive(join.token, false, now)
  if (!getJoin(join.token)?.cancelReason) setCancelReason(join.token, 'expired')
  patchJoin(join.token, { cancelledBy: by, snoozedUntil: undefined })
}

/** Выполняет план: исключает из чата и пишет (kick), тихо закрывает (close), отмечает (mark). Возвращает счётчики. */
async function runEndedPlan(plan, now, by = 'admin') {
  const done = { kicked: 0, closed: 0, marked: 0, skipped: 0, failed: [] }
  for (const p of plan) {
    const j = p.join
    if (p.action === 'kick') {
      if (await kickAndNotify(j)) {
        patchJoin(j.token, { cancelledBy: by })
        done.kicked += 1
      } else done.failed.push(j)
      await pause(300)
    } else if (p.action === 'close') {
      closeQuietly(j, now, by)
      done.closed += 1
    } else if (p.action === 'mark') {
      patchJoin(j.token, { inChat: false })
      done.marked += 1
    } else done.skipped += 1
  }
  return done
}

const doneLines = (done) => [done.kicked ? `🚪 Исключено из чата: ${done.kicked}` : null, done.closed ? `🔕 Убрано из активных: ${done.closed}` : null, done.marked ? `✅ Отмечено (их нет в чате): ${done.marked}` : null, done.skipped ? `⏭ Пропущено: ${done.skipped}` : null, done.failed.length ? `⚠️ Не удалось исключить: ${done.failed.map((j) => j.name || j.telegram || j.phone).join(', ')}` : null].filter(Boolean).join('\n')

/** Экран с пометкой сверху: что только что сделала нажатая кнопка. */
const withNote = (screen, note) => (note ? { ...screen, text: `${note}\n\n${screen.text}` } : screen)

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
    case 'rvs':
      return communityReviewsScreen(data.joins, listCommunityReviews())
    case 'rvapp':
      return approvedReviewsScreen(listCommunityReviews())
    case 'rvok': {
      const r = decideCommunityReview(arg, 'approved')
      if (!r) return { text: 'Этот отзыв уже обработан или не найден. Все отзывы: «Отзывы и бонусы».', keyboard: menuBack('⬅️ Отзывы и бонусы', 'a:x:rvs') }
      const j = getJoin(r.joinToken)
      const already = Boolean(j?.reviewThankedAt) // бонус за отзыв выдаётся один раз на человека
      if (j && !already) {
        extendSubscription(j.token, REVIEW_BONUS_DAYS)
        setJoinField(j.token, 'reviewThankedAt', Date.now())
      }
      if (r.tgUserId) {
        const thanks = already ? 'Спасибо за отзыв 🙌 он правда важен для нас!' : reviewThanks(getBotUser(r.tgUserId) ?? {}, REVIEW_BONUS_DAYS)
        await sendTelegramMessage(r.tgUserId, thanks, [[{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
      }
      const note = !j
        ? 'Карточка подписки не найдена, бонус только записан.'
        : already
          ? 'Бонус за отзыв этому человеку уже начислялся, поэтому дни повторно не добавлены.'
          : j.oneTime
            ? `Срок разовой подписки сдвинут на ${REVIEW_BONUS_DAYS} дня.`
            : 'У подписки с автопродлением дату списания задаёт Prodamus: бонус записан в карточку (в кабинете «Бонусные дни»), а дата списания не изменилась. Чтобы реально сдвинуть списание, сделайте это в Prodamus.'
      return { text: `✅ Отзыв одобрен: ${[r.name, r.telegram].filter(Boolean).join(', ') || r.tgUserId}. Текст сохранён в «Одобренных отзывах».\n\n${note}`, keyboard: [[{ text: '📄 Одобренные отзывы', callback_data: 'a:x:rvapp' }, { text: '⬅️ Отзывы и бонусы', callback_data: 'a:x:rvs' }]] }
    }
    case 'rvno': {
      const r = decideCommunityReview(arg, 'rejected')
      if (!r) return { text: 'Этот отзыв уже обработан или не найден. Все отзывы: «Отзывы и бонусы».', keyboard: menuBack('⬅️ Отзывы и бонусы', 'a:x:rvs') }
      return { text: `❌ Отзыв отклонён: ${[r.name, r.telegram].filter(Boolean).join(', ') || r.tgUserId}. Бонус не начислен, человеку ничего не отправлено: при желании напишите ему сами.`, keyboard: menuBack('⬅️ Отзывы и бонусы', 'a:x:rvs') }
    }
    case 'kick': {
      const j = getJoin(arg)
      if (!j) return { text: 'Подписчик не найден.', keyboard: menuBack('⬅️ Сообщество', 'a:sec:community') }
      return { text: `🚪 Исключить ${[j.name, j.telegram].filter(Boolean).join(' ')} из чата сообщества и написать ему, что подписка истекла?\n\nЧеловек сможет вернуться сам, оплатив подписку.`, keyboard: [[{ text: '✅ Да, исключить', callback_data: `a:x:kickok:${arg}` }, { text: 'Отмена', callback_data: 'a:x:over' }]] }
    }
    case 'kickok': {
      const j = getJoin(arg)
      const ok = j ? await kickAndNotify(j) : false
      if (ok) patchJoin(j.token, { cancelledBy: 'admin', snoozedUntil: undefined })
      return withNote(await endedView(now), ok ? `🚪 Готово: ${j.name || j.telegram || j.phone} исключён(а) из чата, ему отправлено сообщение.` : '⚠️ Не удалось исключить: нет Telegram id или бот не администратор чата. Подробности в логе.')
    }
    case 'chataud':
      return chatAudit(now)
    case 'nl':
      return campaignsScreen(now, campaignAudienceSize())
    case 'nlc': {
      const c = getCampaign(arg)
      return c ? campaignCard(c, now, campaignAudienceSize(), SITE_URL) : campaignsScreen(now, campaignAudienceSize())
    }
    case 'nlt': {
      const c = getCampaign(arg)
      if (!c) return campaignsScreen(now, campaignAudienceSize())
      const r = await sendCampaignTo(c, chatId)
      return withNote(campaignCard(c, now, campaignAudienceSize(), SITE_URL), r === 'ok' ? '👁 Тестовая копия отправлена выше, только вам.' : `⚠️ Не удалось отправить тест (${r}).`)
    }
    case 'nlp': {
      const c = getCampaign(arg)
      if (!c) return campaignsScreen(now, campaignAudienceSize())
      const paused = !campaignState(c.id).paused
      patchCampaign(c.id, { paused })
      if (!paused) void processCampaigns()
      return withNote(campaignCard(c, now, campaignAudienceSize(), SITE_URL), paused ? '⏸ Рассылка на паузе: никому не уйдёт, пока не нажмёте «Возобновить».' : '▶️ Рассылка возобновлена.')
    }
    case 'nlgo': {
      const c = getCampaign(arg)
      return c ? sendNowConfirm(c, campaignAudienceSize()) : campaignsScreen(now, campaignAudienceSize())
    }
    case 'nlgook': {
      const c = getCampaign(arg)
      if (!c) return campaignsScreen(now, campaignAudienceSize())
      patchCampaign(c.id, { goNow: true, paused: false })
      void processCampaigns()
      return withNote(campaignCard(c, now, campaignAudienceSize(), SITE_URL), '🚀 Отправка запущена. Когда закончится, пришлю итог.')
    }
    case 'over':
      return overdueView(now)
    case 'ovc':
      return overdueCardFor(arg, now)
    case 'ovsnz': {
      const j = getJoin(arg)
      if (j) patchJoin(j.token, { snoozedUntil: now + SNOOZE_DAYS * DAY_MS })
      return withNote(await backViewFor(j, now), j ? `⏰ Отложено на ${SNOOZE_DAYS} дня: ${j.name || j.telegram || j.phone}. В сводку вернётся ${ruDateShort(now + SNOOZE_DAYS * DAY_MS)}, если оплаты не будет.` : null)
    }
    case 'ovdate': {
      const j = getJoin(arg)
      if (!j) return overdueView(now)
      adminInput.set(String(chatId), { type: 'next-date', token: j.token })
      return { text: NEXT_DATE_PROMPT(j), keyboard: [[{ text: '⬅️ К карточке', callback_data: `a:x:ovc:${j.token}` }]] }
    }
    case 'ovcxl': {
      const j = getJoin(arg)
      return j ? unsubscribeConfirm(j) : overdueView(now)
    }
    case 'ovcxlok': {
      const j = getJoin(arg)
      if (!j) return overdueView(now)
      // Срок вышел: тихо закрываем (причина «срок истёк» ставится сама); иначе спрашиваем причину отписки
      if (overdueReason(withContacts([j])[0], now).code === 'ended') {
        closeQuietly(j, now)
        return withNote(await endedView(now), `🔕 ${j.name || j.telegram || j.phone}: убран(а) из активных, из чата не исключали, ничего не отправляли.`)
      }
      setSubscriptionActive(j.token, false, now)
      patchJoin(j.token, { cancelledBy: 'admin', snoozedUntil: undefined })
      return withNote(cancelReasonPicker(getJoin(j.token)), '🔕 Отписан(а): из просрочки убран(а).')
    }
    case 'endall': {
      const plan = await buildEndedPlan(now)
      return plan.length ? endedPlanScreen(plan) : endedView(now)
    }
    case 'endok': {
      const plan = await buildEndedPlan(now)
      const done = await runEndedPlan(plan, now)
      return withNote(await endedView(now), `✅ Готово.\n${doneLines(done)}`)
    }
    case 'endone': {
      const j = getJoin(arg)
      if (j) patchJoin(j.token, { inChat: false })
      return withNote(await endedView(now), j ? `✅ ${j.name || j.telegram || j.phone}: отмечено, его нет в чате.` : null)
    }
    case 'ovn': {
      const j = getJoin(arg)
      return j ? nudgeConfirm(j, chargeFailedText(planAmount(j, TARIFFS), j.nextPaymentAt)) : overdueView(now)
    }
    case 'ovnok': {
      const j = getJoin(arg)
      if (!j) return overdueView(now)
      if (j.lastManualNoticeAt && now - j.lastManualNoticeAt < 6 * 3600 * 1000) return withNote(await overdueCardFor(j.token, now), `Напоминание уже отправляли ${ruDateShort(j.lastManualNoticeAt)} в последние 6 часов, повторно не отправляю.`)
      const amount = planAmount(j, TARIFFS)
      const r = await notifyResident(j, { text: chargeFailedText(amount, j.nextPaymentAt), keyboard: CHARGE_FAILED_KEYBOARD }, composeChargeFailedMail({ name: j.name, amount, chargeAt: j.nextPaymentAt, ...mailContext() }))
      patchJoin(j.token, { watch: 'charge', chargeFailedNoticeFor: j.nextPaymentAt, lastManualNoticeAt: now })
      if (j.tgUserId) addTag(j.tgUserId, 'контроль_списания')
      return withNote(await overdueCardFor(j.token, now), `🔔 Напоминание отправлено: ${r.bot ? 'бот ✅' : r.bot === false ? 'бот ❌' : 'бота нет'}, ${r.mail ? 'почта ✅' : r.mail === false ? 'почта ❌' : 'почты нет'}.`)
    }
    case 'dg': {
      switch (arg) {
        case 'con':
          return consultTasksScreen(listConsultations(), now)
        case 'ev':
          return requestTasksScreen(listEventLeads(), now)
        case 'res':
          return resumeTasksScreen(listReserve())
        case 'int':
          return interestTasksScreen(now)
        case 'deal':
          return dealTasksScreen(now)
        case 'cxl':
          return cancelTasksScreen(listJoins(), now)
        case 'chg':
          return chargesTodayScreen(data, TARIFFS, now)
        case 'end':
          return endedView(now)
        default:
          return digestScreen(data, TARIFFS, now, currentHealth())
      }
    }
    case 'dgcon': {
      const c = setConsultationStatus(arg, arg2)
      return withNote(consultTasksScreen(listConsultations(), now), c ? `✅ Консультация №${arg}: ${CONSULTATION_STATUSES[arg2]}` : null)
    }
    case 'dgev': {
      setEventLeadStatus(arg, 'done')
      return withNote(requestTasksScreen(listEventLeads(), now), `✅ Заявка №${arg} обработана`)
    }
    case 'dgres': {
      markResumeReceived(arg)
      return withNote(resumeTasksScreen(listReserve()), `✅ Кандидат №${arg}: резюме получено`)
    }
    case 'dgint': {
      if (arg2 === 'done') markInterestDone(arg)
      else if (arg2 === 'snooze') snoozeInterest(arg)
      else if (arg2 === 'close') closeInterest(arg)
      return withNote(interestTasksScreen(now), `✅ Интерес №${arg}: ${arg2 === 'done' ? 'написали' : arg2 === 'snooze' ? 'напомню через неделю' : 'неактуально'}`)
    }
    case 'dgdeal': {
      const d = getDeal(arg)
      if (d && d.status === 'active') scheduleReminder(d.number, now + (d.stage === LAST_STAGE ? 3 : stageOf(d.stage).remindDays) * DAY_MS)
      return withNote(dealTasksScreen(now), d ? `✅ Сделка №${arg}: отмечено, напомню снова через срок этапа` : null)
    }
    case 'dgcrp': {
      const j = getJoin(arg)
      return j ? cancelReasonPicker(j) : cancelTasksScreen(listJoins(), now)
    }
    case 'dgcr': {
      if (['price', 'time', 'content', 'other'].includes(arg2)) setCancelReason(arg, arg2)
      return withNote(cancelTasksScreen(listJoins(), now), `✅ Причина отписки записана: ${CANCEL_REASONS[arg2] ?? '—'}`)
    }
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
    case 'evreg':
      return eventRegistrationsScreen(data.eventLeads)
    case 'evone':
      return eventScreen(data.eventLeads, arg)
    case 'evcard':
      return eventCard(arg)
    case 'evst':
      setEventLeadStatus(arg, arg2)
      return eventCard(arg)
    case 'evticket': {
      const e = getEventLead(arg)
      if (!e || e.kind !== 'registration' || !['paid', 'attended'].includes(e.status) || !e.email || !hasTicketImage(e.eventSlug)) return eventCard(arg)
      const mail = await sendTicketMail(e, e.amount)
      const card = eventCard(arg)
      const result = mail.ok ? `🎟 Билет ${mail.ticket ? 'отправлен' : 'не приложен, но письмо с подтверждением отправлено'} на ${e.email}` : `⚠️ Письмо не ушло (${mail.error})`
      return { ...card, text: `${result}${mail.ticketError ? `\n⚠️ Билет не нарисовался: ${mail.ticketError}` : ''}\n\n${card.text}` }
    }
    case 'evpaid':
      adminInput.set(String(chatId), { type: 'event-paid', number: Number(arg) })
      return { text: `💳 Регистрация №${arg}: отправьте сумму оплаты числом, например 3500. Отмена — /cancel.`, keyboard: menuBack('⬅️ К карточке', `a:x:evcard:${arg}`) }
    case 'evreq':
      return eventRequestsScreen(data.eventLeads)
    case 'evmonth':
      return eventsMonthSummary(data.eventLeads, arg, now)
    case 'impgo':
    case 'impall': {
      const entry = importPlans.get(arg)
      if (!entry || Date.now() - entry.at > IMPORT_CONFIRM_MS) return { text: 'Подтверждение устарело. Пришлите файл с подписью /import ещё раз.', keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
      importPlans.delete(arg)
      return { text: doneSummary(applyImport(entry.plan, { includeReview: action === 'impall' })), keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
    }
    case 'erase': {
      const plan = erasePlans.get(arg)
      if (!plan || Date.now() - plan.at > ERASE_CONFIRM_MS) return { text: 'Подтверждение устарело. Повторите команду /forget с данными человека.', keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
      erasePlans.delete(arg)
      return { text: erasedText(erasePerson(plan.keys)), keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
    }
    case 'pdscan': {
      const plan = scanRetention(now)
      return plan.total ? { text: retentionReportText(plan), keyboard: [[{ text: '🗑 Удалить сейчас', callback_data: 'a:x:pdgo' }], [{ text: '⬅️ Меню', callback_data: 'a:menu' }]] } : { text: '🧹 Данных с истёкшим сроком хранения нет.', keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
    }
    case 'pdgo':
      return { text: retentionDoneText(applyRetention(now)), keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
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
      return u ? userCard(u, listJoins().find((j) => String(j.tgUserId ?? '') === String(u.id) && j.lifetime), TARIFFS, now) : { text: 'Пользователь не найден.', keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
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
    case 'promo':
      return promosScreen(listPromos(), promoLabel)
    case 'promonew':
      adminInput.set(String(chatId), { type: 'promo' })
      return { text: PROMO_PROMPT, keyboard: menuBack('⬅️ Промокоды', 'a:x:promo') }
    case 'promodel':
      removePromo(arg)
      return promosScreen(listPromos(), promoLabel)
    case 'rv':
      return reviewsScreen(listReviews(), (slug) => materialInfo(slug)?.title ?? slug)
    case 'rvc': {
      const r = getReview(arg)
      return r ? reviewCard(r, materialInfo(r.materialSlug)?.title ?? r.materialSlug) : reviewsScreen(listReviews(), (slug) => materialInfo(slug)?.title ?? slug)
    }
    case 'rvh': {
      const current = getReview(arg)
      const r = current ? setReviewHidden(arg, !current.hidden) : null
      if (r) logAction(chatId, `review:${r.hidden ? 'hide' : 'show'}:${r.number}`)
      return r ? reviewCard(r, materialInfo(r.materialSlug)?.title ?? r.materialSlug) : reviewsScreen(listReviews(), (slug) => materialInfo(slug)?.title ?? slug)
    }
    case 'notif':
      return notificationsScreen(arg ? toggleAdminSetting(arg) : getAdminSettings())
    case 'src':
      return howHeardScreen(arg === 'all' ? 'all' : '30', now)
    case 'pc': {
      const u = getBotUser(arg)
      if (!u) return { text: 'Пользователь не найден.', keyboard: menuBack('⬅️ Пользователи бота', 'a:x:bots') }
      const join = data.joins.filter((j) => String(j.tgUserId ?? '') === String(u.id)).sort((a, b) => (b.lastPaidAt ?? 0) - (a.lastPaidAt ?? 0))[0]
      return userCard(u, join, TARIFFS, now)
    }
    default:
      return { text: 'Раздел не найден.', keyboard: [[{ text: '🏠 Меню', callback_data: 'a:menu' }]] }
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
    case 'app':
    case 'appst': {
      const found = applications.find((a) => a.number === Number(arg))
      if (!found) return { text: `Отклик №${arg} не найден.`, keyboard: SEEKERS_KEYBOARD }
      // статус записывается сразу, уведомление человеку (кабинет, Telegram, почта) уходит следом
      if (action === 'appst') void vacanciesCabinet.notifyApplicationStatus(found.number, arg2).catch((err) => console.error('[application] не удалось уведомить кандидата:', err?.message ?? err))
      const fresh = listApplications().find((a) => a.number === found.number) ?? found
      return applicationCard(fresh, vacancies.find((v) => v.slug === fresh.vacancySlug)?.key)
    }
    case 'rec':
    case 'recst': {
      const found = getRecommendation(arg)
      if (!found) return { text: `Запрос рекомендации №${arg} не найден.`, keyboard: SEEKERS_KEYBOARD }
      if (action === 'recst') void careerCabinet.changeRecommendationStatus(found.number, arg2).catch((err) => console.error('[recommendation] не удалось уведомить человека:', err?.message ?? err))
      // статус записывается сразу (до первого await внутри), поэтому карточка ниже уже с новым статусом
      return recommendationCard(getRecommendation(found.number) ?? found)
    }
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
  if (pending.type === 'promo') {
    const parsed = parsePromoInput(text)
    if (!parsed) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, 'Не разобрал. Формат: КОД и скидка, например RESIDENT 20% или FRIEND 500. Код — 3–32 букв/цифр, процент от 1 до 95. Или /cancel.')
      return
    }
    const added = addPromo(parsed)
    if (added.error) {
      adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, `Код ${parsed.code} уже есть. Придумайте другой или /cancel.`)
      return
    }
    const screen = promosScreen(listPromos(), promoLabel)
    await sendLongMessage(chatId, `✅ Промокод добавлен: ${parsed.code} (${promoLabel(parsed)})\n\n${screen.text}`, screen.keyboard)
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
  if (pending.type === 'next-date') {
    const j = getJoin(pending.token)
    const parsed = parseRuDate(text.trim())
    const now = Date.now()
    // «02.11» без года, введённое в конце года про январь, — это следующий год
    const nextYear = (ts) => {
      const d = new Date(ts)
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      return d.getTime()
    }
    const at = parsed && !/\d+\.\d+\.\d{2,4}/.test(text) && parsed < now - DAY_MS ? nextYear(parsed) : parsed
    if (!j || !at || at < now) {
      if (j) adminInput.set(String(chatId), pending)
      await sendTelegramMessage(chatId, j ? 'Нужна дата в будущем: ДД.ММ или ДД.ММ.ГГГГ, например 02.11. Дата в прошлом оставит человека в просрочке. Или /cancel.' : 'Карточка не найдена.')
      return
    }
    patchJoin(j.token, { nextPaymentAt: at, snoozedUntil: undefined })
    const screen = await overdueView(now)
    await sendLongMessage(chatId, `✅ ${j.name || j.telegram || j.phone}: следующее списание ${ruDateShort(at)}. Из просрочки убран(а); если в этот день оплаты не будет, вернётся.\n\n${screen.text}`, screen.keyboard)
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

/** Утренняя сводка дня (одно сообщение): счётчики, дела на сегодня, состояние системы. После отправки сдвигает напоминания. */
async function sendMorningDigest() {
  const screen = digestScreen(allData(), TARIFFS, Date.now(), currentHealth())
  return sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard, quiet())
}

/** «Итог дня» в 20:00: те же цифры и кнопки, что в сводке, плюс деньги за день. Всё разобрано — короткое «день закрыт». Отключается в «Система → Уведомления». */
async function sendEveningClose() {
  if (!getAdminSettings().eveningClose) return true
  const screen = digestScreen(allData(), TARIFFS, Date.now(), [], { evening: true })
  return sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard, quiet())
}

/** Отложенные уведомления «не завершили оплату»: уходят, если за PENDING_MINUTES оплата не пришла. */
async function sendPendingNoticesIfDue() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return
  for (const n of takeDuePending()) await sendTelegramMessage(ADMIN_CHAT_ID, n.text, n.keyboard ?? undefined).catch(() => false)
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
  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard, quiet()).catch(() => false)
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
  if (action === 'subs') return subscribersScreen(joins, TARIFFS, { waiting: waitingJoins(joins, now).length, ended: endedJoins(joins, now).filter((j) => j.status === 'active').length })
  if (action === 'plan') return planScreen(joins, TARIFFS, arg, now)
  if (action === 'due') return dueScreen(joins, now, TARIFFS)
  if (action === 'due14') return dueScreen(joins, now, TARIFFS, 14)
  if (action === 'cancelled') return cancelledScreen(joins, TARIFFS)
  if (action === 'rem') return arg ? reminderPreviewScreen(joins, now, Number(arg)) : reminderMenuScreen()
  if (action === 'remgo') {
    const days = Number(arg)
    const targets = reminderTargets(joins, now, days)
    let sent = 0
    const failed = []
    for (const join of [...targets.reachable, ...targets.unreachable]) {
      const r = await notifyResident(join, { text: reminderMessage(join, SUPPORT_HANDLE, days, TARIFFS), keyboard: CABINET_KEYBOARD }, composeChargeReminderMail({ name: join.name, days, amount: planAmount(join, TARIFFS), chargeAt: join.nextPaymentAt, ...mailContext() }))
      if (r.bot || r.mail) {
        markReminded(join.token, `${join.nextPaymentAt}:${days}`)
        sent += 1
      } else failed.push(join)
    }
    const lines = [`✅ Напоминаний отправлено: ${sent}`]
    if (failed.length) lines.push('', 'Не дошло (нет почты, а в бота человек не заходил или заблокировал его):', ...failed.map((j) => `• ${[j.name, j.telegram, j.phone].filter(Boolean).join(', ')}`))
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
    ]
    return { text: lines.join('\n'), keyboard: COMMUNITY_KEYBOARD }
  }
  return menuScreen()
}

// Кнопки, которые что-то меняют или отправляют данные: помощникам (только просмотр) они недоступны, в журнал попадают только они.
// Кнопки, которые только открывают ввод текста или подтверждение — в журнал не пишем (запишется само действие).
const PROMPT_ONLY = /^a:(k:(rev|new)|s:(ikind|inew|rnew|redit|rdel)|x:(tnew|ambnew|ambdel|evpaid|promonew|ovdate))\b/
const MUTATING = /^a:(k:(adv|back|q1|q0|lost|reopen|revok|rev|new|pp|pf)|s:(vst|cst|idone|iclose|isnooze|ikind|inew|rnew|redit|rdel|rdelok)|x:(grant|promonew|promodel|tnew|tdone|ambnew|ambplus|ambdel|ambdelok|kickok|rvok|rvno|cr|evst|evpaid|backup|erase|pdgo|impgo|impall|dgcon|dgev|dgres|dgint|dgdeal|dgcr|ovsnz|ovdate|ovcxlok|ovnok|endok|endone|nlt|nlp|nlgook)|remgo)\b/

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
// Если у человека несколько карточек (старые тестовые, бессрочная, действующая), выбираем ту же, что в кабинете на сайте
// (residentJoin в lib/accountProfile.js): бессрочная, иначе та, что действует дольше всех. Так срок и история одинаковы в боте и на сайте.
function residentByTelegramId(tgId) {
  return residentJoin(tgId)
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
  return mainMenuScreen(SITE_URL, user, Boolean(residentByTelegramId(user.id)))
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
  const screen = step === 'question' ? supportPrompt(user) : { text: CONTACT_PROMPTS.contact, keyboard: contactCancelKeyboard() }
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

/** Завершение диалога: обращение в поддержку. Админу приходит уведомление в том же оформлении, что с сайта, с номером обращения. */
async function finishContactFlow(chatId, user, flow) {
  userFlows.delete(String(chatId))
  const d = flow.data
  const name = user.contactName || [user.firstName, user.lastName].filter(Boolean).join(' ')
  const phone = d.phone || user.phone
  const email = d.email || user.email
  updateBotUser(chatId, { phone: d.phone, email: d.email })
  const number = nextTicketNumber()
  const text = buildKadryRichNotification({
    template: 'support',
    direction: 'Бот → Поддержка',
    service: 'Обращение в поддержку',
    date: new Date().toISOString(),
    name,
    phone,
    email,
    telegram: user.username,
    details: [`Вопрос: ${d.question}`],
    ticketNumber: String(number),
    origin: 'из бота',
  })
  await sendTelegramMessage(ADMIN_CHAT_ID, text, [
    [{ text: '👤 Карточка человека', callback_data: `a:x:pc:${chatId}` }, { text: '✉️ Написать', url: user.username ? `https://t.me/${user.username.replace(/^@/, '')}` : `tg://user?id=${chatId}` }],
  ])
  await sendTelegramMessage(chatId, `${user.firstName ? `${user.firstName}, спасибо` : 'Спасибо'}! Вопрос принят, номер обращения №${number}. Мы свяжемся с тобой в ближайшее время.`, [[{ text: 'Главное меню', callback_data: 'u:menu' }]])
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
  if (action !== 'support' && action !== 'contact') userFlows.delete(String(chatId))
  if (action === 'nc') return reply(noConsentScreen(user))
  if (action === 'consent') user = giveConsent(query.from.id) ?? user
  if (action === 'g') user = setGender(query.from.id, arg) ?? user
  if (action === 'mail1') user = setMailingConsent(query.from.id, true) ?? user
  if (action === 'mail0') user = setMailingConsent(query.from.id, false) ?? user
  // Без согласия на обработку ПД остальные кнопки воронки недоступны — показываем нужный шаг.
  if (!user.consentAt) return reply(flowScreen(user))
  if (action === 'consent' || action === 'g' || action === 'mail1' || action === 'mail0') return reply(flowScreen(user))

  switch (action) {
    case 'support':
    case 'contact':
      // «Поддержка» сразу просит написать вопрос: следующее сообщение человека уходит админу.
      return askNextContactStep(chatId, user, { data: {} }, query)
    case 'legal':
      return reply(legalScreen(SITE_URL))
    case 'about':
      return reply(aboutScreen(SITE_URL, SUPPORT_HANDLE))
    case 'cancelflow':
      return reply(mainMenuScreen(SITE_URL, user))
    case 'unsub': {
      setMailingConsent(query.from.id, false)
      return reply(unsubscribedScreen({ ...user, mailingConsent: false }))
    }
    case 'community':
    case 'join': // кнопки «Хочу вступить» и выбора срока в старых сообщениях: оплата теперь только на сайте
    case 'sub': {
      const resident = residentByTelegramId(chatId)
      return reply(hasAccess(resident) ? communityResidentScreen() : communityScreen(Boolean(resident), SITE_URL))
    }
    case 'aboutclub':
      return reply(aboutClubScreen(SITE_URL))
    case 'ach':
      return reply(achievementsScreen('u:aboutclub'))
    case 'achabout':
      return reply(achievementsScreen('u:about'))
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
  // Клиента в Prodamus ищем по Telegram id, а если карточка с сайта и Telegram не привязан — по телефону или почте.
  const who = join.tgUserId ? { tgUserId: join.tgUserId } : join.phone ? { phone: join.phone } : join.email ? { email: join.email } : null
  if (!join.oneTime && who) {
    for (const id of ids) {
      try {
        results.push({ id, ...(await setSubscriptionActivity({ subscriptionId: id, ...who, active: false })) })
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

/**
 * Отзыв резидента о сообществе (текст пишется прямо в чате): сохраняем вместе с согласием на публикацию, показываем админу
 * и ждём его решения «Одобряем». Бонус сам не начисляется: отзыв может повредить бренду, его читает человек.
 */
async function finishReview(chatId, flow, message) {
  const text = String(message.text ?? message.caption ?? '').trim().slice(0, 3000)
  if (text.length < REVIEW_MIN_LENGTH) {
    await sendTelegramMessage(chatId, `Напиши, пожалуйста, чуть подробнее: отзыв нужен текстом, не короче ${REVIEW_MIN_LENGTH} символов. Отмена — /cancel.`)
    return
  }
  userFlows.delete(String(chatId))
  const join = getJoin(flow.token)
  const user = getBotUser(chatId) ?? {}
  const back = [[{ text: 'Главное меню', callback_data: 'u:menu' }]]
  if (listCommunityReviews().some((r) => r.joinToken === flow.token && r.status === 'new')) {
    await sendTelegramMessage(chatId, 'Твой отзыв уже на проверке, спасибо! Как только проверим, напишем сюда.', back)
    return
  }
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || (join?.name !== '—' ? join?.name : '') || ''
  const telegram = user.username ? `@${user.username.replace(/^@/, '')}` : join?.telegram || ''
  const id = addCommunityReview({ joinToken: flow.token, tgUserId: chatId, name, telegram, text })
  const screen = reviewForAdmin({ review: { id, tgUserId: String(chatId), name, telegram, text }, join })
  await sendTelegramMessage(ADMIN_CHAT_ID, screen.text, screen.keyboard)
  await sendTelegramMessage(chatId, `Спасибо, отзыв получили! 🙌 Мы его прочитаем${join?.reviewThankedAt ? '.' : ` и, если всё в порядке, добавим +${REVIEW_BONUS_DAYS} дня подписки. Напишем сюда.`}`, back)
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
  if (action === 'site') {
    await sendLinkCode(chatId, null)
    return
  }
  const user = getBotUser(chatId) ?? fromUser ?? {}
  let screen
  if (action === 'hist') screen = paymentsScreen(join)
  else if (action === 'sub') screen = subscriptionScreen(join, TARIFFS, Date.now(), siteLink(SITE_URL, '/community', 'bot_cabinet', '#join'))
  else if (action === 'link') {
    if (hasAccess(join) && !join.lifetime) await unbanForReturn(join)
    screen = linkScreen(join, communityInviteUrl())
  }
  else if (action === 'rv') screen = reviewScreen({ bonusDays: REVIEW_BONUS_DAYS, consentUrl: `${SITE_URL}/legal/consent-publication`, bonusGiven: Boolean(join.reviewThankedAt) })
  else if (action === 'rvgo') {
    userFlows.set(String(chatId), { kind: 'review', token: join.token })
    screen = reviewSendPrompt(REVIEW_MIN_LENGTH)
  }
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

/**
 * Бот состоит в чате сообщества администратором, поэтому Telegram присылает ему там ВСЕ сообщения. Отвечать на них нельзя:
 * бот работает только в личных чатах (и в чате админа/помощника). Иначе слово «привет» в групповой переписке запускало воронку
 * и бот писал в общий чат приветствие с просьбой дать согласие.
 */
function isOutsidePrivateChat(chat) {
  if (!chat?.id) return false
  // Группы, супергруппы и каналы в Telegram имеют отрицательный id (личные чаты — положительный), даже если тип чата не пришёл.
  const isGroup = (chat.type && chat.type !== 'private') || Number(chat.id) < 0
  if (!isGroup) return false
  return String(chat.id) !== String(ADMIN_CHAT_ID) && !VIEWER_IDS.has(String(chat.id))
}

/** /link: код для привязки Telegram к кабинету на сайте. Только в личном чате (группы бот не обслуживает). */
async function sendLinkCode(chatId, from) {
  if (from) touchBotUser({ ...from, id: from.id ?? chatId })
  const code = issueCode(chatId)
  await sendTelegramMessage(
    chatId,
    `🔗 Код для привязки кабинета на сайте: <code>${code}</code>\n\nВведите его в кабинете на ${SITE_URL.replace(/^https?:\/\//, '')}, раздел «Telegram-бот». Код действует ${CODE_TTL_MS / 60000} минут и срабатывает один раз.\n\nНикому не сообщайте код: с ним можно привязать ваш Telegram к чужому кабинету. Если код просили не вы сами, просто проигнорируйте это сообщение.\n\nНужен кабинет? Зарегистрируйтесь на ${SITE_URL.replace(/^https?:\/\//, '')}/cabinet.`,
    undefined,
    { parseMode: 'HTML' },
  )
}

/** /unlink: снять привязку кабинета с этого Telegram. */
async function unlinkCabinet(chatId) {
  const account = findByTelegram(chatId)
  if (account && unlinkTelegram(account.id)) {
    logActivity(`u:${account.id}`, 'telegram_unlinked')
    await sendTelegramMessage(chatId, 'Кабинет на сайте отвязан от этого Telegram. Привязать снова можно командой /link.')
  } else await sendTelegramMessage(chatId, 'К этому Telegram кабинет на сайте не привязан.')
}

async function handleTelegramUpdate(update) {
  if (update?.chat_join_request) {
    await handleJoinRequest(update.chat_join_request)
    return
  }
  if (update?.chat_member) {
    await handleChatMember(update.chat_member)
    return
  }
  if (isOutsidePrivateChat(update?.message?.chat) || isOutsidePrivateChat(update?.callback_query?.message?.chat)) {
    console.log('[tg] групповой чат — бот там не отвечает:', update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id)
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
  // Удаление данных человека по его запросу и сроки хранения — только админу (помощникам-наблюдателям недоступно).
  if (isAdmin && text && /^\/forget(@\w+)?(\s|$)/i.test(text)) {
    await handleForgetCommand(chatId, text.replace(/^\/forget(@\w+)?\s*/i, ''))
    return
  }
  if (isAdmin && text && /^\/retention(@\w+)?$/i.test(text)) {
    const screen = await extrasAction(['pdscan'], Date.now(), chatId)
    await sendLongMessage(chatId, screen.text, screen.keyboard)
    return
  }
  // Админ присылает PDF с подписью «/material <slug>» — бот запоминает файл для выдачи покупателям.
  // Если подпись неверная или её нет, бот отвечает подсказкой (раньше молчал, и было не понять, что не так).
  if (!isAdmin && chatId && message?.document && /^\/material/i.test(message.caption ?? '')) {
    await sendTelegramMessage(chatId, `Загружать материалы может только админский аккаунт. Ваш chat id: ${chatId}${isViewer ? ' (это чат помощника, только просмотр)' : ''}. Если это ваш аккаунт, сверьте его с TELEGRAM_ADMIN_CHAT_ID в server/.env.`)
    return
  }
  // Выгрузка BotHelp: админ присылает CSV-файл с подписью /import — бот показывает, что будет сделано, и ждёт кнопку.
  if (isAdmin && message?.document && /^\/import\b/i.test(message.caption ?? '')) {
    await handleImportFile(chatId, message.document)
    return
  }
  if (isAdmin && text && /^\/import(@\w+)?$/i.test(text)) {
    await sendTelegramMessage(chatId, 'Загрузка выгрузки из BotHelp.\n\nПришлите CSV-файл («Подписчики → Экспорт», поле «дни» должно быть в файле) и напишите в подписи к нему /import. Бот сначала покажет, что будет загружено, и только после кнопки «Загрузить» запишет: карточки, метки, согласия на рассылку и подписки с оставшимися днями.')
    return
  }
  if (isAdmin && message?.document && !/^\/material\s+\S/i.test(message.caption ?? '')) {
    await sendTelegramMessage(chatId, `Файл «${message.document.file_name ?? 'без имени'}» получен, но я не понял подпись${message.caption ? ` «${message.caption.slice(0, 60)}»` : ''}.\n\nЧек-лист новичка сообщества: подпись /material ${CHECKLIST_SLUG}\nВыгрузка из BotHelp: подпись /import\n\nPDF материалов маркетплейса бот больше не выдаёт: их загружают на сайт командой bash scripts/upload-material.sh.`)
    return
  }
  if (isAdmin && message?.document) {
    const slug = message.caption.replace(/^\/material\s*/i, '').trim()
    if (slug !== CHECKLIST_SLUG) {
      await sendTelegramMessage(chatId, `Через бота загружается только чек-лист новичка сообщества: /material ${CHECKLIST_SLUG}.\nPDF материалов маркетплейса загружают на сайт: bash scripts/upload-material.sh <адрес материала> <файл.pdf>.`)
      return
    }
    setMaterialFile(slug, message.document.file_id, message.document.file_name)
    logAction(chatId, `input:material-file:${slug}`)
    await sendTelegramMessage(chatId, `✅ Файл «${message.document.file_name}» сохранён для чек-листа новичка сообщества — теперь бот будет отправлять его новым резидентам.`)
    return
  }
  if (isAdmin && text === '/cancel') {
    adminInput.delete(String(chatId))
    await sendTelegramMessage(chatId, 'Отменено.', KADRY_KEYBOARD)
    return
  }
  // Ответ (Reply) админа на сообщение из чата с рекрутером по вакансии: уходит в чат этой вакансии.
  if (isAdmin && text && !text.startsWith('/') && message.reply_to_message?.message_id) {
    const vacancyThread = recruiterThreadByAdminMessage(message.reply_to_message.message_id)
    if (vacancyThread) {
      await vacanciesCabinet.deliverRecruiterReply(chatId, vacancyThread, text)
      return
    }
  }
  // Ответ (Reply) админа на запрос рекомендации: текст ответа становится рекомендацией в кабинете человека.
  if (isAdmin && text && !text.startsWith('/') && message.reply_to_message?.message_id) {
    const recommendation = recommendationByAdminMessage(message.reply_to_message.message_id)
    if (recommendation) {
      await careerCabinet.deliverRecommendation(chatId, recommendation, text)
      return
    }
  }
  // Ответ (Reply) админа на сообщение из чата поддержки кабинета: уходит в чат этого человека.
  if (isAdmin && text && !text.startsWith('/') && message.reply_to_message?.message_id) {
    const supportLogin = loginByAdminMessage(message.reply_to_message.message_id)
    if (supportLogin) {
      await deliverSupportReply(chatId, supportLogin, text)
      return
    }
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
  if (chatId && (message?.photo || message?.document) && userFlows.get(String(chatId))?.kind === 'review') {
    await finishReview(chatId, userFlows.get(String(chatId)), message)
    return
  }
  if (chatId && text && !text.startsWith('/') && userFlows.has(String(chatId)) && !pendingInput) {
    const flow = userFlows.get(String(chatId))
    if (flow.kind === 'cancel') await finishCancellation(chatId, flow, text.trim())
    else if (flow.kind === 'review') await finishReview(chatId, flow, message)
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
  if (chatId && text && /^\/link(@\w+)?$/i.test(text.trim())) {
    await sendLinkCode(chatId, message.from)
    return
  }
  if (chatId && text && /^\/unlink(@\w+)?$/i.test(text.trim())) {
    await unlinkCabinet(chatId)
    return
  }
  if (chatId && (text === '/menu' || text === '/cabinet')) {
    await startFlow(chatId, message.from)
    return
  }
  // Отказ от рекламной рассылки командой: этот способ назван в тексте согласия на рекламу (/legal/marketing-consent), п. 3.2.
  if (chatId && text === '/stop_newsletter') {
    const user = setMailingConsent(chatId, false)
    if (user) {
      const screen = unsubscribedScreen(user)
      await sendTelegramMessage(chatId, screen.text, screen.keyboard)
    } else {
      await sendTelegramMessage(chatId, 'Рекламную рассылку вам и так не отправляем: вы на неё не подписаны.')
    }
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
  // Кнопка «Получить код в боте» в кабинете открывает бота по t.me/бот?start=link
  if (payload === 'link') {
    await sendLinkCode(chatId, message.from)
    return
  }
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
    await sendInviteLink(chatId, getJoin(token))
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

/**
 * Письмо участнику об оплате билета. Если для мероприятия есть шаблон, к письму прикладывается именной билет-картинка
 * (имя, номер и контакты берутся из регистрации). Не получилось нарисовать — письмо уходит без билета, причина в ответе (ticketError).
 * Возвращает { ok, error?, ticket, ticketError? }.
 */
async function sendTicketMail(lead, amount) {
  if (!lead.email) return { ok: false, error: 'no_email' }
  const event = findEvent(lead.eventSlug)
  let ticket = null
  let ticketError = null
  if (hasTicketImage(lead.eventSlug)) {
    try {
      ticket = await renderTicketPdf({ eventSlug: lead.eventSlug, number: lead.number, name: lead.name, phone: lead.phone, email: lead.email, paidAt: lead.paidAt ?? Date.now() })
    } catch (err) {
      ticketError = err.message || String(err)
      console.error('[ticket] не удалось нарисовать билет, регистрация №', lead.number, err)
    }
  }
  const { subject, text, html } = composeTicketMail({ lead, amount, event, hasTicket: Boolean(ticket), supportHandle: SUPPORT_HANDLE })
  const mail = await sendMail({ to: lead.email, subject, text, html, attachments: ticket ? [{ filename: ticket.filename, content: ticket.buffer, contentType: ticket.contentType }] : undefined })
  return { ...mail, ticket: Boolean(ticket && mail.ok), ticketError }
}

/** Успешная оплата билета: статус «Оплатил» и сумма в регистрации, письмо участнику, уведомление админу. */
async function handleEventPayment(number, body, signed) {
  const amount = Number(body.sum) || null
  // Оплату билета засчитываем только по уведомлению с верной подписью Prodamus: без неё «оплату» мог прислать кто угодно,
  // зная номер регистрации. Админу — сообщение: если платёж настоящий, его отмечают вручную в карточке регистрации.
  if (!signed) {
    console.error('[prodamus] уведомление об оплате билета без подписи — не засчитано, регистрация №', number)
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Пришло уведомление об оплате билета (регистрация №${number}, ${formatRub(amount ?? 0)}) без подписи Prodamus — автоматически не засчитано.\n\nПроверьте платёж в кабинете Prodamus: если он настоящий, отметьте оплату в карточке регистрации. Подпись приходит, когда на платёжной странице Prodamus задан секретный ключ.`, [[{ text: `📂 Открыть №${number}`, callback_data: `a:x:evcard:${number}` }]]).catch(() => false)
    return
  }
  const lead = markEventLeadPaid(number, amount, String(body.order_id ?? ''))
  if (!lead) {
    console.error('[prodamus] оплата билета: регистрация не найдена №', number)
    await sendTelegramMessage(ADMIN_CHAT_ID, `⚠️ Пришла оплата билета (${formatRub(Number(body.sum) || 0)}, order_num ${body.order_num ?? '—'}), но регистрация №${number} не найдена. Проверьте в Prodamus.`).catch(() => false)
    return
  }
  if (lead.duplicate) {
    console.log('[prodamus] повторный вебхук по оплате билета — пропускаю:', number)
    return
  }
  const mail = await sendTicketMail(lead, amount)
  cancelPending({ kind: 'ticket', eventNumber: lead.number })
  if (lead.promo) markPromoUsed(lead.promo)
  // Сумма в оплате не совпала с ценой билета (частичная оплата, другая цена на платёжной странице) — пусть админ посмотрит.
  const mismatch = amount != null && lead.price != null && Math.abs(amount - lead.price) > 0.5
  const warning = mismatch ? `Оплачено ${formatRub(amount)}, а цена билета ${formatRub(lead.price)} — проверьте платёж в Prodamus` : null
  const text = buildTicketPaidNotification({ lead, amount: amount ?? lead.price ?? 0, paidAt: Date.now(), mail, warning })
  await sendTelegramMessage(ADMIN_CHAT_ID, text, [[{ text: `📂 Открыть №${lead.number}`, callback_data: `a:x:evcard:${lead.number}` }]])
}

/**
 * Напоминания участникам: за день до мероприятия и в день мероприятия. Письмо всем оплатившим, у кого есть почта, по одному разу
 * на каждое напоминание; к письму приложен именной билет (если у мероприятия он есть). Админу — короткий итог; если у мероприятия
 * не указано место, предупреждение, пока не поздно.
 */
async function sendEventReminders(now = Date.now()) {
  const kinds = [
    { when: 'tomorrow', day: mskDayKey(now + 24 * 3600 * 1000), field: 'reminderSentAt', word: 'завтра' },
    { when: 'today', day: mskDayKey(now), field: 'dayReminderSentAt', word: 'сегодня' },
  ]
  for (const event of readEventCatalog()) {
    const eventDay = mskDayKey(new Date(event.dateTime).getTime())
    for (const kind of kinds) {
      if (eventDay !== kind.day) continue
      const people = listEventLeads().filter((l) => l.kind === 'registration' && l.status === 'paid' && !l[kind.field] && findEvent(l.eventSlug)?.slug === event.slug)
      if (!people.length) continue
      let sent = 0
      let withTicket = 0
      let noEmail = 0
      let failed = 0
      let ticketFailed = 0
      for (const lead of people) {
        if (!lead.email) {
          noEmail += 1
          continue
        }
        let ticket = null
        if (hasTicketImage(lead.eventSlug)) {
          try {
            ticket = await renderTicketPdf({ eventSlug: lead.eventSlug, number: lead.number, name: lead.name, phone: lead.phone, email: lead.email, paidAt: lead.paidAt ?? Date.now() })
          } catch (err) {
            ticketFailed += 1
            console.error('[ticket] не удалось нарисовать билет для напоминания, регистрация №', lead.number, err)
          }
        }
        const { subject, text, html } = composeReminderMail({ lead, event, when: kind.when, hasTicket: Boolean(ticket), supportHandle: SUPPORT_HANDLE })
        const mail = await sendMail({ to: lead.email, subject, text, html, attachments: ticket ? [{ filename: ticket.filename, content: ticket.buffer, contentType: ticket.contentType }] : undefined })
        if (mail.ok) {
          setEventLeadField(lead.number, kind.field, Date.now())
          sent += 1
          if (ticket) withTicket += 1
        } else {
          failed += 1
        }
      }
      const report = [
        `🔔 Напоминания о мероприятии «${event.title}» (${kind.word})`,
        '',
        `✉️ Отправлено: ${sent}`,
        withTicket ? `🎟 С билетом: ${withTicket}` : null,
        ticketFailed ? `⚠️ Билет не нарисовался у ${ticketFailed} чел., письмо им ушло без билета` : null,
        noEmail ? `📭 Без почты (напомнить вручную): ${noEmail}` : null,
        failed ? `⚠️ Не ушло: ${failed} (проверьте почту на сервере)` : null,
        !(event.location || event.venue) ? '⚠️ В каталоге не указано место проведения — в напоминании его нет. Сообщите участникам вручную.' : null,
      ].filter((l) => l !== null)
      await sendTelegramMessage(ADMIN_CHAT_ID, report.join('\n'))
    }
  }
  return true
}

// Уведомления Prodamus об оплате подписки.
app.post('/api/prodamus/webhook', async (req, res) => {
  const body = req.body ?? {}
  const sign = req.headers['sign'] || body.signature

  // signed — подпись пришла и совпала хотя бы с одним ключом платёжных страниц (неверная подпись отсекается сразу).
  const signed = Boolean(PRODAMUS_SECRET_KEYS.length && sign)
  if (PRODAMUS_SECRET_KEYS.length && sign) {
    // Уведомление подписано ключом той платёжной страницы, с которой пришла оплата (подписки, материалы, билеты — могут быть разными).
    const valid = PRODAMUS_SECRET_KEYS.some((key) => HmacHelper.verify(body, key, sign))
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

    // Prodamus сам сообщает о неудачном автосписании (без payment_status): предупреждаем человека сразу, не дожидаясь суток.
    if (body.subscription?.notification_code === 'auto_payment' && body.payment_status !== 'success') {
      await handleChargeFailure(body)
      return
    }

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
      await handleEventPayment(Number(eventMatch[1]), body, signed)
      return
    }

    console.log('[prodamus] покупка материала — телефон:', phone)
    const purchase = markPurchasePaidByPhone(phone)
    console.log('[prodamus] результат поиска покупки:', purchase ? `найдена ${purchase.token}` : 'не найдена')
    if (purchase) {
      // Имитация оплаты (scripts/simulate-payment.sh): order_id начинается с TEST- — в финансы не попадает.
      const isTest = String(body.order_id ?? '').startsWith('TEST-')
      if (!isTest) recordPurchasePayment(purchase.token, Number(body.sum) || MATERIALS[purchase.materialSlug]?.price || 0)
      const material = MATERIALS[purchase.materialSlug]
      const buyerEmail = purchase.email || String(body.customer_email ?? '').trim()
      if (buyerEmail && !purchase.email) purchase.email = buyerEmail
      const mail = buyerEmail ? await emailMaterial({ to: buyerEmail, name: purchase.name, materialSlug: purchase.materialSlug, token: purchase.token }) : { ok: false, error: 'no_email' }
      console.log('[prodamus] письмо с материалом:', mail.ok ? (mail.linkIssued ? 'отправлено со ссылкой' : 'отправлено без ссылки (файл не загружен)') : mail.error)
      const text = buildMaterialPaidNotification({ purchase, material, phone, amount: Number(body.sum) || material?.price || 0, paidAt: Date.now(), mail, test: isTest })
      await sendTelegramMessage(ADMIN_CHAT_ID, text)
    }
  })
})

// Отложенные решения — в список «Система → Доработки», чтобы не потерялись.
ensureTodo('Личный кабинет покупателя материалов (история покупок, новая ссылка из кабинета): вернуть после юридической проработки. Сейчас покупатель получает личную ссылку на 7 дней в письме, новую ссылку выдаёт админ: bash scripts/material-link.sh <почта> --send')

console.log(`[prodamus] платёжные страницы — ${payformSummary()}`)
console.log(`[mail] почта для писем клиентам: ${mailConfigured() ? 'настроена' : 'не настроена (SMTP_HOST/SMTP_USER/SMTP_PASS в server/.env)'}`)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Ежедневный отчёт админу в 21:00 по Москве. Раз в минуту проверяем время;
// дату последней отправки храним в файле, чтобы перезапуск процесса не
// приводил ни к повтору, ни к пропуску отчёта за день.
// Раз в сутки после указанного часа (МСК): дата последнего запуска хранится в файле, чтобы перезапуск не повторял и не пропускал задачу.
const DAILY_JOBS_FILE = path.join(import.meta.dirname, 'data', 'daily-jobs.json')
// ---- Загрузка выгрузки BotHelp админом (см. lib/botHelpImport.js) ----
/** Ожидающие подтверждения загрузки: id → { plan, at }. Живут в памяти 15 минут; после перезапуска сервера файл нужно прислать заново. */
const importPlans = new Map()
const IMPORT_CONFIRM_MS = 15 * 60 * 1000

async function handleImportFile(chatId, document) {
  let plan
  try {
    if (document.file_size > 20 * 1024 * 1024) throw new Error('файл больше 20 МБ')
    plan = planImport((await downloadTelegramFile(document.file_id)).toString('utf8'))
  } catch (err) {
    await sendTelegramMessage(chatId, `⚠️ Не получилось прочитать файл: ${err.message}`)
    return
  }
  for (const [id, entry] of importPlans) if (Date.now() - entry.at > IMPORT_CONFIRM_MS) importPlans.delete(id)
  const id = crypto.randomBytes(4).toString('hex')
  importPlans.set(id, { plan, at: Date.now() })
  const keyboard = [[{ text: '✅ Загрузить', callback_data: `a:x:impgo:${id}` }]]
  if (plan.review.length) keyboard.push([{ text: `✅ Загрузить и завести подпиской «на проверку» (${plan.review.length})`, callback_data: `a:x:impall:${id}` }])
  keyboard.push([{ text: 'Отмена', callback_data: 'a:menu' }])
  await sendLongMessage(chatId, planSummary(plan), keyboard)
}

// ---- Сроки хранения и удаление данных по запросу (см. lib/retention.js, lib/erasure.js) ----
/** Подтверждения удаления: id → { keys, at }. Живут в памяти 15 минут: после перезапуска сервера команду /forget нужно повторить. */
const erasePlans = new Map()
const ERASE_CONFIRM_MS = 15 * 60 * 1000

async function handleForgetCommand(chatId, query) {
  const hint = 'Удаление данных человека по его запросу.\n\nОтправьте: /forget и телефон, e-mail, @ник или Telegram id человека.\nНапример: /forget +7 999 123-45-67'
  if (!query.trim()) return void (await sendTelegramMessage(chatId, hint))
  const found = findPerson(query)
  if (found.error) return void (await sendTelegramMessage(chatId, `Не разобрал «${query.trim().slice(0, 60)}». ${hint}`))
  if (found.empty) return void (await sendTelegramMessage(chatId, 'Ничего не найдено. Данные могут быть записаны с другим телефоном, почтой или ником — попробуйте другой.'))
  for (const [id, plan] of erasePlans) if (Date.now() - plan.at > ERASE_CONFIRM_MS) erasePlans.delete(id)
  const id = crypto.randomBytes(4).toString('hex')
  erasePlans.set(id, { keys: found.keys, at: Date.now() })
  await sendLongMessage(chatId, describeFound(found), [[{ text: '🗑 Удалить безвозвратно', callback_data: `a:x:erase:${id}` }], [{ text: 'Отмена', callback_data: 'a:menu' }]])
}

/** Ежедневная проверка сроков хранения. По умолчанию — отчёт админу с кнопкой; с RETENTION_AUTO=1 удаляет сама. */
async function runRetentionJob() {
  const plan = scanRetention(Date.now())
  if (!plan.total) return true
  if (process.env.RETENTION_AUTO === '1') {
    const done = applyRetention(Date.now())
    logAction('system', `retention:auto deleted=${done.deleted} anonymized=${done.anonymized} logs=${done.logs}`)
    await sendTelegramMessage(ADMIN_CHAT_ID, `${retentionReportText(plan, { auto: true })}\n\n${retentionDoneText(done)}`)
    return true
  }
  await sendLongMessage(ADMIN_CHAT_ID, retentionReportText(plan), [[{ text: '🗑 Удалить сейчас', callback_data: 'a:x:pdgo' }]])
  return true
}

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
  await sendTelegramMessage(join.tgUserId, 'Привет!\nК сожалению, твоя подписка истекла, а оплата не прошла вовремя, поэтому мне пришлось временно исключить тебя из сообщества 😔\n\nНо это легко исправить!\nТы в любой момент можешь продлить подписку и сразу вернуться назад. С радостью приму тебя обратно 💗\n\nЖдем тебя снова!', [[{ text: 'Продлить подписку на сайте', url: siteLink(SITE_URL, '/community', 'bot_renew', '#join') }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
  const call = (method, extra = {}) => telegramFetch(method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: COMMUNITY_CHAT_ID, user_id: Number(join.tgUserId), ...extra }) })
  const banned = await call('banChatMember')
  await call('unbanChatMember', { only_if_banned: true }).catch(() => null)
  if (!banned.ok) {
    console.error('[telegram] banChatMember ошибка:', await banned.text())
    return false
  }
  setSubscriptionActive(join.token, false, Date.now())
  if (!getJoin(join.token)?.cancelReason) setCancelReason(join.token, 'expired') // настоящую причину отписки, если её указали, не затираем
  for (const card of listJoins().filter((c) => String(c.tgUserId ?? '') === String(join.tgUserId))) patchJoin(card.token, { inChat: false })
  membershipCache.delete(String(join.tgUserId))
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
      await sendTelegramMessage(j.tgUserId, EXPIRY_TEXTS[daysLeft], [[{ text: 'Продлить на сайте', url: siteLink(SITE_URL, '/community', 'bot_expiry', '#join') }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
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
  // Подписки с автопродлением, у которых срок вышел (Prodamus перестал пробовать, прошло больше 4 дней или подписка отключена, а человек в чате):
  // по умолчанию их закрывает владелец кнопкой в сводке дня («Срок вышел»), при AUTO_EXCLUDE=1 бот делает это сам.
  if (process.env.AUTO_EXCLUDE === '1') {
    const plan = (await buildEndedPlan(now)).filter((p) => !p.join.oneTime && p.action !== 'skip')
    if (plan.length) {
      const done = await runEndedPlan(plan, now, 'auto')
      await sendTelegramMessage(ADMIN_CHAT_ID, `🚪 Автоматически закрыт доступ (срок подписки вышел).\n${doneLines(done)}\n\n${plan.map((p) => `• ${p.join.name || p.join.telegram || '—'} · ${p.join.phone || 'телефона нет'} — ${p.action === 'kick' ? 'исключён(а)' : 'убран(а) из активных'}`).join('\n')}`, undefined, quiet()).catch(() => false)
    }
  }
  return true
}

/**
 * Ежедневная сверка с чатом: отписанные, у которых оплаченный срок вышел, — в чате они или уже нет (бот не умеет перечислять участников
 * чата, поэтому спрашивает про каждого известного). Результат (inChat) попадает в «Срок вышел» в сводке дня. Выходы и вступления
 * дальше отслеживаются событиями chat_member.
 */
async function refreshChatMembership() {
  const now = Date.now()
  const joins = listJoins()
  const todo = joins.filter((j) => cancelledAccessOver(j, now) && j.inChat !== false && !hasOtherActive(j, joins, now)).slice(0, 150)
  for (const j of todo) {
    const mem = await chatMembership(j.tgUserId)
    if (mem !== 'unknown') patchJoin(j.token, { inChat: mem === 'in', inChatCheckedAt: now })
    await pause(150)
  }
  return true
}

/**
 * Просьба об отзыве: через REVIEW_ASK_AFTER_DAYS дней после первой настоящей оплаты подписки (у перенесённых из BotHelp приблизительные
 * даты в счёт не идут). Просьба считается отправленной, только если сообщение дошло: иначе пробуем снова не чаще раза в сутки.
 * Бонус за отзыв начисляет админ кнопкой «Одобряем», см. finishReview и extrasAction (rvok).
 */
let reviewFlowRunning = false
async function processReviewFlow() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID || reviewFlowRunning || process.env.REVIEW_FLOW === '0') return
  const now = Date.now()
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date(now)))
  if (hour < 10 || hour >= 21) return
  reviewFlowRunning = true
  try {
    const reviews = listCommunityReviews()
    for (const j of listJoins()) {
      if (!reviewRequestDue(j, reviews, now)) continue
      setJoinField(j.token, 'reviewTriedAt', now)
      const ok = await sendTelegramMessage(j.tgUserId, `Привет! 👋 Ты с нами уже почти месяц, и нам очень важно твоё мнение о сообществе: оно помогает делать его лучше.\n\nНапиши, пожалуйста, пару предложений прямо здесь: чем сообщество было полезно и что понравилось. Мы прочитаем и в благодарность добавим +${REVIEW_BONUS_DAYS} дня подписки.`, [[{ text: '✍️ Написать отзыв', callback_data: 'r:rv' }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]).catch(() => false)
      if (ok) setJoinField(j.token, 'reviewRequestedAt', now)
    }
  } finally {
    reviewFlowRunning = false
  }
}

/** Общие данные для писем резиденту. */
const mailContext = () => ({ siteUrl: SITE_URL, botUsername: BOT_USERNAME, supportHandle: SUPPORT_HANDLE })

/**
 * Сообщение резиденту по двум каналам: в бот (если он запускал бота) и на почту (если она есть). Это служебные сообщения о его подписке,
 * а не реклама, поэтому согласие на рассылку не нужно. Возвращает { bot, mail }: true — доставлено, false — не вышло, null — канала нет.
 */
async function notifyResident(join, { text, keyboard }, mail) {
  const bot = join.tgUserId ? await sendTelegramMessage(join.tgUserId, text, keyboard).catch(() => false) : null
  const mailResult = join.email && mail ? await sendMail({ to: join.email, ...mail }) : null
  return { bot, mail: mailResult ? mailResult.ok : null }
}

/**
 * Автонапоминания резидентам о списании: за 2 дня и за день, в бота и на почту, один раз на каждую дату списания.
 * Не получившим (ни бота, ни почты) пишет админ вручную: они видны в «Сообщество → Напоминания». Отключить: AUTO_RESIDENT_REMINDERS=0.
 * Заодно оповещает тех, у кого списание не прошло (sendChargeFailedNotices).
 */
async function sendAutoResidentReminders() {
  if (process.env.AUTO_RESIDENT_REMINDERS === '0') return true
  const now = Date.now()
  const count = { bot: 0, mail: 0, none: 0 }
  for (const days of [2, 1]) {
    const targets = reminderTargets(listJoins(), now, days)
    for (const join of [...targets.reachable, ...targets.unreachable]) {
      const r = await notifyResident(join, { text: reminderMessage(join, SUPPORT_HANDLE, days, TARIFFS), keyboard: CABINET_KEYBOARD }, composeChargeReminderMail({ name: join.name, days, amount: planAmount(join, TARIFFS), chargeAt: join.nextPaymentAt, ...mailContext() }))
      markReminded(join.token, `${join.nextPaymentAt}:${days}`) // отмечаем и при неудаче, чтобы не пытаться каждую минуту
      if (r.bot) count.bot += 1
      if (r.mail) count.mail += 1
      if (!r.bot && !r.mail) count.none += 1
    }
  }
  const failedCount = await sendChargeFailedNotices(now)
  const lines = []
  if (count.bot || count.mail || count.none) lines.push(`🔔 Напоминания о списании: в бот ${count.bot}, на почту ${count.mail}${count.none ? `, не дошло никуда ${count.none}` : ''}.`)
  if (failedCount) lines.push(`🟡 Списание не прошло: предупредили ${failedCount}.`)
  if (lines.length) await sendTelegramMessage(ADMIN_CHAT_ID, lines.join('\n'), undefined, quiet())
  return true
}

/**
 * Списание не прошло: время списания вышло больше 12 часов назад (первая повторная попытка Prodamus тоже не удалась), а оплаты нет, и прошло
 * не больше 4 суток (дальше попыток нет). Человеку уходит «не получилось списать, проверьте карту», подписчика отмечаем жёлтой меткой
 * 🟡 (её снимает следующая оплата). Один раз на дату списания. Только если вебхуки Prodamus сейчас доходят: иначе «не прошло» могло бы быть
 * неправдой. Отключить: CHARGE_FAILED_NOTICES=0.
 */
async function sendChargeFailedNotices(now) {
  if (process.env.CHARGE_FAILED_NOTICES === '0') return 0
  const last = lastWebhook()
  let sent = 0
  for (const j of listJoins()) {
    if (j.status !== 'active' || j.oneTime || j.lifetime || !j.nextPaymentAt) continue
    const late = now - j.nextPaymentAt
    if (late < 12 * 3600 * 1000 || late > 4 * 24 * 3600 * 1000 || j.chargeFailedNoticeFor === j.nextPaymentAt) continue
    if (!last || last.at < j.nextPaymentAt) continue // после времени списания от Prodamus не было ни одного уведомления: возможно, не доходят они, а не платёж не прошёл
    const amount = planAmount(j, TARIFFS)
    const r = await notifyResident(j, { text: chargeFailedText(amount, j.nextPaymentAt), keyboard: CHARGE_FAILED_KEYBOARD }, composeChargeFailedMail({ name: j.name, amount, chargeAt: j.nextPaymentAt, ...mailContext() }))
    patchJoin(j.token, { chargeFailedNoticeFor: j.nextPaymentAt, watch: 'charge' })
    if (j.tgUserId) addTag(j.tgUserId, 'контроль_списания')
    sent += 1
    await sendTelegramMessage(ADMIN_CHAT_ID, `🟡 Списание не прошло: ${[j.name, j.telegram, j.phone].filter(Boolean).join(', ')} · ${amount ? `${amount} ₽` : 'сумма неизвестна'}\nЧеловека предупредили: ${r.bot ? 'бот ✅' : r.bot === false ? 'бот ❌' : 'бота нет'}, ${r.mail ? 'почта ✅' : r.mail === false ? 'почта ❌' : 'почты нет'}.`, undefined, quiet()).catch(() => false)
  }
  return sent
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
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=30&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query', 'chat_join_request', 'chat_member']))}`, { signal: AbortSignal.timeout(45000) })
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
  setInterval(() => afterResponse('pending-notices', sendPendingNoticesIfDue), 60 * 1000)
  setInterval(() => afterResponse('kadry-monthly', sendKadryMonthlyIfDue), 60 * 1000)
  setInterval(() => afterResponse('resident-reminders', () => runDailyOnce('residentReminders', 10, sendAutoResidentReminders)), 60 * 1000)
  setInterval(() => afterResponse('expiry', () => runDailyOnce('expiry', 10, processExpiry)), 60 * 1000)
  setInterval(() => afterResponse('review-flow', processReviewFlow), 60 * 1000)
  setInterval(() => afterResponse('event-reminders', () => runDailyOnce('eventReminders', 10, sendEventReminders)), 60 * 1000)
  setInterval(() => afterResponse('campaigns', processCampaigns), 30 * 1000)
  setInterval(() => afterResponse('chat-membership', () => runDailyOnce('chatMembership', 8, refreshChatMembership)), 60 * 1000)
  setInterval(() => afterResponse('morning-digest', () => runDailyOnce('digest', 9, sendMorningDigest)), 60 * 1000)
  setInterval(() => afterResponse('evening-close', () => runDailyOnce('eveningClose', 20, sendEveningClose)), 60 * 1000)
  setInterval(() => afterResponse('retention', () => runDailyOnce('retention', 4, runRetentionJob)), 60 * 1000)
  if (process.env.DISABLE_BACKUP !== '1') {
    setInterval(() => afterResponse('backup', () => runDailyOnce('backup', 3, () => (getAdminSettings().nightBackup ? sendBackup('💾 Ежедневная резервная копия данных бота') : true))), 60 * 1000)
  }
}

// Страховка от падения процесса из-за необработанной ошибки где-то в фоне
// (например, сорвавшийся запрос к Telegram/Prodamus после ответа клиенту) —
// логируем и продолжаем работу вместо того, чтобы уронить сервер целиком.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))

// Для автотестов: доступ к фоновым задачам без ожидания расписания.
if (process.env.TEST_HOOKS === '1') globalThis.__hooks = { runRetentionJob, sendEventReminders, processExpiry, processReviewFlow, sendAutoResidentReminders, sendMorningDigest, sendEveningClose, refreshChatMembership, processCampaigns, sendPendingNoticesIfDue }

const PORT = process.env.PORT || 3001
ensureBuiltInPromos()
try {
  const archived = archiveLegacyCollections()
  if (archived) console.log('[privacy] копии данных кабинетов перенесены в архив:', archived)
} catch (err) {
  console.error('[privacy] не удалось перенести копии данных кабинетов:', err)
}
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
