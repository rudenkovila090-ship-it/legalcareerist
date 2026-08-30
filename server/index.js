// Бэкенд-эндпоинт сайта «Карьерный Юрист».
// 1. POST /api/notify — заявка с сайта → уведомление админу в Telegram.
// 2. POST /api/telegram/webhook — апдейты от Telegram-бота (@LegalcareeristBot):
//    по /start <tariffId> генерирует подписанную ссылку на оплату подписки
//    сообщества и присылает её человеку в чат.
// 3. POST /api/prodamus/webhook — уведомления Prodamus об оплате подписки.
// Токены и секретные ключи — только в server/.env, в репозиторий не попадают.
import express from 'express'
import cors from 'cors'
import { buildSubscriptionLink, TARIFFS } from './lib/prodamus.js'
import { HmacHelper } from './lib/hmac.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID
const PRODAMUS_SECRET_KEY = process.env.PRODAMUS_SECRET_KEY

async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!res.ok) console.error('[telegram] sendMessage ошибка:', await res.text())
  return res.ok
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

// Апдейты от Telegram-бота @LegalcareeristBot. Настраивается один раз
// командой setWebhook (см. инструкцию в переписке/README сервера).
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200) // Telegram ждёт быстрый ответ, обрабатываем после

  const message = req.body?.message
  const text = message?.text
  const chatId = message?.chat?.id
  if (!chatId || !text || !text.startsWith('/start')) return

  const payload = text.slice('/start'.length).trim() // например "resident_1m"
  const match = payload.match(/^resident_(\w+)$/)
  const tariffId = match?.[1]
  const tariff = tariffId ? TARIFFS[tariffId] : null

  if (!tariff) {
    await sendTelegramMessage(chatId, 'Привет! Это бот «Карьерного юриста». Чтобы оформить подписку на сообщество, начните с сайта — раздел «Сообщество».')
    return
  }

  try {
    const link = buildSubscriptionLink({ tariffId, tgUserId: chatId })
    await sendTelegramMessage(
      chatId,
      `Тариф «${tariff.label}» — ${tariff.price.toLocaleString('ru-RU')} ₽.\n\nОплатите по ссылке ниже — после оплаты бот сам добавит вас в закрытое сообщество и пришлёт ссылку на вступление:\n\n${link}`,
    )
  } catch (err) {
    console.error('[telegram] ошибка генерации ссылки на оплату:', err)
    await sendTelegramMessage(chatId, 'Не получилось сформировать ссылку на оплату — напишите нам, разберёмся.')
  }
})

// Уведомления Prodamus об оплате/статусе подписки.
app.post('/api/prodamus/webhook', (req, res) => {
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

  // Пока просто логируем полный payload — точные поля события (успешная
  // оплата/статус подписки/дата следующего списания) уточним по первому
  // реальному вебхуку, чтобы не гадать с названиями полей.
  console.log('[prodamus] webhook:', JSON.stringify(body))

  res.sendStatus(200)
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
