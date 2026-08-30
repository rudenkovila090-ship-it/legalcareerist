// Маленький бэкенд-эндпоинт сайта «Карьерный Юрист».
// Сейчас одна задача: получить заявку с сайта (POST /api/notify) и переслать
// короткое уведомление админу в Telegram через Bot API.
// Токен бота и chat_id — только в server/.env на сервере, в репозиторий не попадают.
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

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

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: lines.join('\n') }),
    })
    if (!tgRes.ok) {
      console.error('[notify] Telegram API ответил ошибкой:', await tgRes.text())
      return res.status(502).json({ ok: false, error: 'telegram_error' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[notify] ошибка запроса к Telegram:', err)
    res.status(502).json({ ok: false, error: 'telegram_unreachable' })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`legalcareerist-server слушает порт ${PORT}`))
