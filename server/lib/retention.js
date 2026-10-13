// Автоматические сроки хранения персональных данных (раздел 6 Политики).
// scanRetention() считает, что пора удалить или обезличить, ничего не меняя; applyRetention() выполняет.
// По умолчанию бот присылает админу отчёт с кнопкой «Удалить» (данные безвозвратны), а с RETENTION_AUTO=1 удаляет сам.
// В отчёте — только числа по разделам, без имён и контактов. Сроки — в TERMS (personData.js).
import fs from 'node:fs'
import path from 'node:path'
import { SOURCES, TERMS, recordsOf, anonymizeRecord, retentionContext } from './personData.js'
import { countOlderConsent, pruneConsentLog } from './consentLog.js'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')

/** Журнал jsonl с отметкой времени в поле tsField. */
function jsonlLog(id, title, file, tsField, term) {
  const full = path.join(DATA_DIR, file)
  const read = () => {
    try {
      return fs.readFileSync(full, 'utf8').split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  const stamp = (line) => {
    try {
      return Number(JSON.parse(line)[tsField]) || 0
    } catch {
      return 0
    }
  }
  return {
    id,
    title,
    term,
    count: (now) => read().filter((l) => stamp(l) < now - term).length,
    prune: (now) => {
      const lines = read()
      const kept = lines.filter((l) => stamp(l) >= now - term)
      if (kept.length !== lines.length) fs.writeFileSync(full, kept.join('\n') + (kept.length ? '\n' : ''))
      return lines.length - kept.length
    },
  }
}

const pendingNotices = {
  id: 'pendingNotices',
  title: 'Отложенные уведомления «не завершили оплату»',
  term: TERMS.pendingNotices,
  count: (now) => readPending().filter((n) => (n.due ?? 0) < now - TERMS.pendingNotices).length,
  prune: (now) => {
    const list = readPending()
    const kept = list.filter((n) => (n.due ?? 0) >= now - TERMS.pendingNotices)
    if (kept.length !== list.length) fs.writeFileSync(path.join(DATA_DIR, 'pending-notices.json'), JSON.stringify(kept))
    return list.length - kept.length
  },
}

function readPending() {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pending-notices.json'), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const consentLog = {
  id: 'consentLog',
  title: 'Журнал согласий',
  term: TERMS.consentLog,
  count: (now) => countOlderConsent(now - TERMS.consentLog),
  prune: (now) => pruneConsentLog(now - TERMS.consentLog),
}

export const LOGS = [
  jsonlLog('leadSources', 'Журнал «Откуда узнали»', 'lead-sources.jsonl', 'at', TERMS.leadSources),
  jsonlLog('audit', 'Журнал действий админа', 'audit.jsonl', 'at', TERMS.audit),
  jsonlLog('webhooks', 'Журнал платёжных уведомлений Prodamus', 'prodamus-webhooks.jsonl', 'receivedAt', TERMS.webhooks),
  consentLog,
  pendingNotices,
]

/** Что пора удалить/обезличить на момент now. Ничего не меняет. */
export function scanRetention(now = Date.now()) {
  const ctx = retentionContext(now)
  const items = []
  for (const source of SOURCES) {
    for (const rec of recordsOf(source)) {
      const due = source.due(rec, ctx)
      if (due) items.push({ source: source.id, title: source.title, token: rec.token, action: due.action, reason: due.reason })
    }
  }
  const logs = LOGS.map((l) => ({ id: l.id, title: l.title, count: l.count(now) })).filter((l) => l.count > 0)
  return { now, items, logs, total: items.length + logs.reduce((acc, l) => acc + l.count, 0) }
}

/**
 * Выполняет план: каждую запись перепроверяет по текущим данным (план мог устареть), так что кнопка в боте
 * никогда не удалит больше, чем положено на момент нажатия. Возвращает те же счётчики по разделам.
 */
export function applyRetention(now = Date.now()) {
  const ctx = retentionContext(now)
  const done = { deleted: 0, anonymized: 0, logs: 0, bySource: {} }
  for (const source of SOURCES) {
    for (const rec of recordsOf(source)) {
      const due = source.due(rec, ctx)
      if (!due) continue
      if (due.action === 'delete') source.store.remove(rec.token)
      else anonymizeRecord(source, rec.token)
      const key = due.action === 'delete' ? 'deleted' : 'anonymized'
      done[key] += 1
      const entry = (done.bySource[source.id] ??= { title: source.title, deleted: 0, anonymized: 0 })
      entry[key] += 1
    }
  }
  for (const l of LOGS) done.logs += l.prune(now)
  return done
}

const plural = (n, one, few, many) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

/** Текст отчёта админу: числа по разделам. withButtonHint — добавить подсказку про кнопку. */
export function retentionReportText(plan, { auto = false } = {}) {
  const bySource = new Map()
  for (const it of plan.items) {
    const e = bySource.get(it.source) ?? { title: it.title, deleted: 0, anonymized: 0 }
    e[it.action === 'delete' ? 'deleted' : 'anonymized'] += 1
    bySource.set(it.source, e)
  }
  const lines = [auto ? '🧹 Автоудаление данных по срокам хранения выполнено' : '🧹 Срок хранения данных истёк']
  lines.push('')
  for (const e of bySource.values()) {
    const parts = []
    if (e.deleted) parts.push(`удалить ${e.deleted}`)
    if (e.anonymized) parts.push(`обезличить ${e.anonymized}`)
    lines.push(`• ${e.title}: ${parts.join(', ')}`)
  }
  for (const l of plan.logs) lines.push(`• ${l.title}: удалить ${l.count} ${plural(l.count, 'запись', 'записи', 'записей')} старше срока`)
  lines.push('')
  lines.push('Сроки заданы в Политике (раздел 6). «Обезличить» — стереть ФИО и контакты, оставив сумму и дату платежа: их закон требует хранить дольше.')
  if (!auto) lines.push('Удаление безвозвратно. Копии в Telegram-чате (уведомления, ежедневные резервные копии) бот удалить не может — их чистите вы.')
  return lines.join('\n')
}

export function retentionDoneText(done) {
  const lines = ['🧹 Готово', '', `Удалено записей: ${done.deleted}`, `Обезличено записей: ${done.anonymized}`, `Удалено строк из журналов: ${done.logs}`]
  for (const e of Object.values(done.bySource)) lines.push(`• ${e.title}: удалено ${e.deleted}, обезличено ${e.anonymized}`)
  return lines.join('\n')
}
