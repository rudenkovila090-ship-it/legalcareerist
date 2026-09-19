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
//    подписок сообщества (находит заявку по телефону+тарифу, шлёт ссылку
//    в бота), и для разовых покупок материалов (шлёт админу уведомление
//    о покупке).
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
import { createPendingJoin, setTgUserId, markPaidByPhone } from './lib/store.js'
import { createPendingPurchase, getPurchase, markPurchasePaidByPhone } from './lib/materialsStore.js'
import { incrementView, incrementApplication } from './lib/vacancyStats.js'
import { incrementArticleView, getArticleViews } from './lib/articleStats.js'
import { incrementNewsView, getNewsViews } from './lib/newsStats.js'
import { incrementEventView, incrementEventRegistration, getEventStats } from './lib/eventStats.js'
import { isValidKey, writeCollection, readAllCollections } from './lib/collectionStore.js'
import { nextTicketNumber } from './lib/ticketCounter.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const PRODAMUS_SECRET_KEY = process.env.PRODAMUS_SECRET_KEY
const SITE_URL = process.env.SITE_URL || 'https://legalcareerist.ru'
const COMMUNITY_INVITE_LINK = process.env.COMMUNITY_INVITE_LINK

async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: form })
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
  const { tariffId, name, phone, email, telegram } = req.body ?? {}
  if (!TARIFFS[tariffId]) return res.status(400).json({ ok: false, error: 'unknown_tariff' })
  if (!phone) return res.status(400).json({ ok: false, error: 'phone_required' })

  try {
    const token = createPendingJoin({ tariffId, name, phone, email, telegram })
    const urlSuccess = `${SITE_URL}/community/success?token=${token}`
    const url = await createPaymentLink({ tariffId, phone, email, urlSuccess })
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
    if (body.payment_status !== 'success') {
      console.log('[prodamus] статус не success — пропускаю:', body.payment_status)
      return
    }

    const phone = body.customer_phone || body.phone

    // Есть subscription — это оплата подписки сообщества; нет — разовая
    // покупка материала маркетплейса. Это единственное надёжное отличие,
    // которое приходит в вебхуке.
    if (body.subscription) {
      const tariffId = tariffIdBySubscriptionId(body.subscription.id)
      console.log('[prodamus] подписка сообщества — телефон:', phone, 'тариф:', tariffId)
      const join = markPaidByPhone(phone, tariffId)
      console.log('[prodamus] результат поиска заявки:', join ? `найдена ${join.token} (${join.tariffId}), tgUserId=${join.tgUserId}` : 'не найдена')
      if (join?.tgUserId) {
        await sendInviteLink(join.tgUserId, join)
      }
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

// Страховка от падения процесса из-за необработанной ошибки где-то в фоне
// (например, сорвавшийся запрос к Telegram/Prodamus после ответа клиенту) —
// логируем и продолжаем работу вместо того, чтобы уронить сервер целиком.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
