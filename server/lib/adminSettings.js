// Настройки уведомлений админу (экран «Система → Уведомления» в боте). Хранятся в data/admin-settings.json.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'admin-settings.json')

export const NOTIFY_OPTIONS = {
  quiet: { title: '🔕 Тихие сообщения для некритичного', hint: 'отчёты, сводки и копии приходят без звука' },
  eveningClose: { title: '🏁 Итог дня в 20:00', hint: 'что осталось разобрать до конца дня; всё разобрано — «день закрыт»' },
  unpaidNotices: { title: '⏳ «Не завершили оплату»', hint: 'одно сообщение, если через 30 минут оплаты нет; при оплате не приходит' },
  nightBackup: { title: '💾 Ночная копия данных в чат', hint: 'файл со всеми данными бота в 03:00' },
}

const DEFAULTS = { quiet: true, eveningClose: true, unpaidNotices: true, nightBackup: true }

export function getAdminSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

/** Переключает опцию и возвращает новые настройки (неизвестный ключ игнорируется). */
export function toggleAdminSetting(key) {
  const current = getAdminSettings()
  if (!(key in NOTIFY_OPTIONS)) return current
  const next = { ...current, [key]: !current[key] }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2))
  return next
}
