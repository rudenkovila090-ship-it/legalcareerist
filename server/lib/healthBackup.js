// Проверка состояния сервера и резервная копия данных бота (папка server/data).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const DATA_DIR = path.join(import.meta.dirname, '..', 'data')

const ago = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  if (min < 48 * 60) return `${Math.round(min / 60)} ч назад`
  return `${Math.round(min / 1440)} дн. назад`
}

function dataSizeMb() {
  try {
    return fs.readdirSync(DATA_DIR).reduce((acc, f) => acc + (fs.statSync(path.join(DATA_DIR, f)).isFile() ? fs.statSync(path.join(DATA_DIR, f)).size : 0), 0) / 1048576
  } catch {
    return 0
  }
}

function diskFreeGb() {
  try {
    const s = fs.statfsSync(DATA_DIR)
    return (s.bavail * s.bsize) / 1073741824
  } catch {
    return null
  }
}

/** Строки проверки: ✅ всё в порядке, ⚠️ есть замечание. */
export function healthLines({ lastWebhook, lastPollAt, pollingEnabled, errors, lastBackupAt, activeSubscribers, latencies = [] }) {
  const lines = []
  const dayAgo = Date.now() - 24 * 3600 * 1000
  const recent = errors.filter((e) => e.at > dayAgo)
  if (pollingEnabled) lines.push(lastPollAt && Date.now() - lastPollAt < 5 * 60 * 1000 ? `✅ Бот принимает сообщения (опрос ${ago(lastPollAt)})` : `⚠️ Бот давно не опрашивал Telegram (${lastPollAt ? ago(lastPollAt) : 'ни разу с запуска'}) — проверьте сеть сервера`)
  lines.push(lastWebhook ? `${Date.now() - lastWebhook.at > 7 * 24 * 3600 * 1000 && activeSubscribers ? '⚠️' : '✅'} Последний вебхук Prodamus: ${ago(lastWebhook.at)}` : `⚠️ Вебхуков Prodamus ещё не было`)
  lines.push(recent.length ? `⚠️ Ошибок за сутки: ${recent.length}. Последняя: ${recent.at(-1).msg}` : '✅ Ошибок за сутки нет')
  const okCalls = latencies.filter((l) => !l.failed).map((l) => l.ms).sort((a, b) => a - b)
  if (okCalls.length) {
    const median = okCalls[Math.floor(okCalls.length / 2)]
    const failed = latencies.filter((l) => l.failed).length
    lines.push(`${median > 2000 || failed > 3 ? '⚠️' : '✅'} Ответ Telegram: обычно ${(median / 1000).toFixed(1).replace('.', ',')} с, максимум ${(okCalls.at(-1) / 1000).toFixed(1).replace('.', ',')} с${failed ? `, сбоев: ${failed}` : ''} (последние ${latencies.length} запросов)`)
  }
  const free = diskFreeGb()
  if (free != null) lines.push(`${free < 1 ? '⚠️' : '✅'} Свободно на диске: ${free.toFixed(1).replace('.', ',')} ГБ`)
  lines.push(`💾 Данные бота: ${dataSizeMb().toFixed(2).replace('.', ',')} МБ · копия: ${lastBackupAt ? ago(lastBackupAt) : 'ещё не делалась'}`)
  lines.push(`⏱ Сервер работает: ${Math.round(process.uptime() / 3600)} ч · загрузка памяти ${Math.round((1 - os.freemem() / os.totalmem()) * 100)}%`)
  return lines
}

/** Архив папки data (.tar.gz) в памяти. */
export async function makeBackup() {
  const tmp = path.join(os.tmpdir(), `lc-backup-${Date.now()}.tar.gz`)
  try {
    await run('tar', ['-czf', tmp, '-C', DATA_DIR, '.'])
    return fs.readFileSync(tmp)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

const STATE = path.join(DATA_DIR, 'backup-state.json')

export function readBackupState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeBackupState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(STATE, JSON.stringify(state))
}
