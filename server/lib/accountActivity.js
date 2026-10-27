// Журнал действий в кабинете: что человек делал (вход, смена пароля, привязка Telegram, сохранение профиля, документы и т. п.).
// Пишем только вид действия и время (иногда одно безобидное уточнение: тип документа, включено или выключено): без адресов,
// данных браузера, названий и текстов. Ключ — логин кабинета («u:<id>» или логин администратора).
// Хранится не больше 100 последних записей на человека и не дольше TERMS.activity; попадает в «Мои данные»; стирается вместе с аккаунтом.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'account-activity.json')
const MAX_ENTRIES = 100
export const ACTIVITY_TTL_MS = 365 * 24 * 3600 * 1000

/** Какие действия бывают: остальные виды в журнал не пишутся. */
export const KINDS = new Set([
  'login', 'password_set', 'password_reset', 'password_changed', 'telegram_linked', 'telegram_unlinked',
  'profile_saved', 'contact_updated', 'document_added', 'document_deleted', 'marketing_changed',
  'data_exported', 'deletion_requested', 'support_message', 'support_reply', 'subscription_cancelled', 'card_change_requested',
  'recruiter_message', 'recruiter_reply', 'application_withdrawn', 'reserve_joined', 'reserve_renewed', 'reserve_left',
])
const META_KEYS = ['value', 'docType', 'part']

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
  fs.renameSync(tmp, FILE)
}

/** Записывает действие. Журнал вторичен: любая его ошибка не должна ломать само действие, поэтому ничего не бросаем. */
export function logActivity(login, kind, meta = {}, now = Date.now()) {
  try {
    if (!login || !KINDS.has(kind)) return false
    const data = load()
    const entry = { at: now, kind }
    for (const k of META_KEYS) {
      const v = meta?.[k]
      if (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40)) entry[k] = v
    }
    const list = (data[login] ?? []).filter((e) => e.at > now - ACTIVITY_TTL_MS)
    list.push(entry)
    data[login] = list.slice(-MAX_ENTRIES)
    save(data)
    return true
  } catch (err) {
    console.error('[activity] не записалось:', err?.message ?? err)
    return false
  }
}

/** Последние действия, новые сверху. */
export function listActivity(login, limit = 50, now = Date.now()) {
  return (load()[login] ?? []).filter((e) => e.at > now - ACTIVITY_TTL_MS).slice(-limit).reverse()
}

/** Стирает журнал человека (удаление аккаунта или данных по запросу). Возвращает число стёртых записей. */
export function eraseActivity(login) {
  const data = load()
  const n = data[login]?.length ?? 0
  if (n) {
    delete data[login]
    save(data)
  }
  return n
}

/** Сколько записей старше срока (для автоудаления по срокам хранения). */
export function countOldActivity(now = Date.now()) {
  return Object.values(load()).reduce((acc, list) => acc + list.filter((e) => e.at <= now - ACTIVITY_TTL_MS).length, 0)
}

/** Удаляет записи старше срока; пустые журналы убирает. Возвращает число удалённых записей. */
export function pruneActivity(now = Date.now()) {
  const data = load()
  let removed = 0
  for (const [login, list] of Object.entries(data)) {
    const kept = list.filter((e) => e.at > now - ACTIVITY_TTL_MS)
    removed += list.length - kept.length
    if (kept.length) data[login] = kept
    else delete data[login]
  }
  if (removed) save(data)
  return removed
}
