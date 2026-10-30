// Журнал входящих вебхуков Prodamus: каждое уведомление целиком дописывается
// в data/prodamus-webhooks.jsonl. pm2-логи чистятся и ротируются, а по этому
// файлу всегда можно восстановить оплаты и понять, доходили ли уведомления.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'prodamus-webhooks.jsonl')

export function logWebhook(body) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(FILE, `${JSON.stringify({ receivedAt: Date.now(), body })}\n`)
  } catch (err) {
    console.error('[prodamus] не удалось записать журнал вебхуков:', err.message)
  }
}

/** Время и статус последнего настоящего вебхука (без тестовых) или null. */
export function lastWebhook() {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      const rec = JSON.parse(lines[i])
      if (rec.body?.order_id) return { at: rec.receivedAt, status: rec.body.payment_status }
    }
  } catch {
    // файла ещё нет
  }
  return null
}

/** Что за уведомление пришло, одной строкой для админа (без персональных данных). */
export function describeWebhook(body) {
  const sub = body?.subscription
  if (body?.payment_status === 'success') return `оплата${sub?.payment_num ? ` №${sub.payment_num}` : ''}${sub?.cost ? ` на ${sub.cost} ₽` : ''}`
  if (sub?.notification_code === 'auto_payment') return `неудачная попытка автосписания${sub.current_attempt ? ` №${sub.current_attempt}` : ''}${sub.error ? `: ${String(sub.error).slice(0, 80)}` : ''}`
  if (sub?.notification_code === 'auto_payment_reminder') return 'напоминание Prodamus о предстоящем списании'
  if (sub?.type === 'action') return 'изменение подписки (action: включена или отключена)'
  return `уведомление Prodamus${sub?.type ? ` (${sub.type})` : ''}${body?.payment_status ? `, статус ${body.payment_status}` : ''}`
}

/**
 * Что Prodamus присылал по подписчику (по profile_id и номерам его подписок): для карточки просрочки. Последние limit уведомлений, новые
 * сверху. Журнал читается целиком, но вызывается только по нажатию кнопки админом.
 */
export function webhookEventsFor({ profileId, subscriptionIds = [] }, limit = 6) {
  const profile = profileId ? String(profileId) : ''
  const subs = new Set(subscriptionIds.filter(Boolean).map(String))
  if (!profile && !subs.size) return []
  const found = []
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0 && found.length < limit; i--) {
      let rec
      try {
        rec = JSON.parse(lines[i])
      } catch {
        continue
      }
      const sub = rec.body?.subscription
      if (!sub) continue
      if ((profile && String(sub.profile_id ?? '') === profile) || subs.has(String(sub.id ?? ''))) found.push({ at: rec.receivedAt, label: describeWebhook(rec.body) })
    }
  } catch {
    // файла ещё нет
  }
  return found
}
