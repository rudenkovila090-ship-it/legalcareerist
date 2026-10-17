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
