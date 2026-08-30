// Бэкенд-эндпоинт сайта «Карьерный Юрист».
// 1. POST /api/notify — заявка с сайта → уведомление админу в Telegram.
// 2. POST /api/community/subscribe — выбор тарифа на сайте → подписанная
//    ссылка на оплату в Prodamus (идентификация клиента по телефону, без
//    tg_user_id — на этом шаге человек ещё не открывал бота).
// 3. POST /api/telegram/webhook — апдейты бота @LegalcareeristBot: по
//    /start access_<token> проверяет, оплачена ли заявка, и присылает
//    ссылку на вступление в сообщество (сразу либо как только придёт
//    вебхук об оплате).
// 4. POST /api/prodamus/webhook — уведомления Prodamus об оплате: находит
//    заявку по телефону, помечает оплаченной, шлёт ссылку в бота, если
//    человек уже успел нажать Start.
// Токены и секретные ключи — только в server/.env, в репозиторий не попадают.
import express from 'express'
import cors from 'cors'
import { createPaymentLink, TARIFFS } from './lib/prodamus.js'
import { HmacHelper } from './lib/hmac.js'
import { createPendingJoin, getPendingJoin, setTgUserId, markPaidByPhone } from './lib/store.js'

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

async function sendInviteLink(chatId, join) {
  const tariff = TARIFFS[join.tariffId]
  const label = tariff?.label ?? 'Сообщество'
  await sendTelegramMessage(
    chatId,
    `Оплата получена — добро пожаловать в «${label}»! 🎉\n\nСсылка на вступление в закрытое сообщество:\n${COMMUNITY_INVITE_LINK}`,
  )
}

app.post('/api/notify', async (req, res) => {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.error('[notify] TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID не заданы в server/.env')
    return res.status(500).json({ ok: false, error: 'not_configured' })
  }

  const { source, formType, name, contact, interest } = req.body ?? {}

  const lines = [
    '🔔 Новая заявка с сайта',
    source ? `Раздел: ${source}` : null,
    formType ? `Форма: ${formType}` : null,
    name ? `Имя: ${name}` : null,
    contact ? `Контакт: ${contact}` : null,
    ...(Array.isArray(interest) && interest.length ? interest.map((i) => `• ${i}`) : []),
  ].filter(Boolean)

  const ok = await sendTelegramMessage(ADMIN_CHAT_ID, lines.join('\n')).catch((err) => {
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

// Апдейты от Telegram-бота @LegalcareeristBot. Настраивается один раз
// командой setWebhook (см. README сервера).
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200) // Telegram ждёт быстрый ответ, обрабатываем после

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

  if (body.payment_status !== 'success') {
    console.log('[prodamus] статус не success — пропускаю:', body.payment_status)
    return
  }

  const phone = body.customer_phone || body.phone
  console.log('[prodamus] ищу заявку по телефону:', phone)
  const join = markPaidByPhone(phone)
  console.log('[prodamus] результат поиска заявки:', join ? `найдена ${join.token}, tgUserId=${join.tgUserId}` : 'не найдена')
  if (join?.tgUserId) {
    await sendInviteLink(join.tgUserId, join)
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
