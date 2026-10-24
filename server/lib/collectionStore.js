// Прежнее «зеркало» данных кабинетов (localStorage ky_* ↔ сервер) закрыто: оно отдавало чужие данные без авторизации.
// Старые копии при запуске переносятся в архивную папку, которую не читает и не отдаёт ни один маршрут;
// удалить её можно вручную, когда убедитесь, что копии не нужны.
import fs from 'node:fs'
import path from 'node:path'

const DATA = path.join(import.meta.dirname, '..', 'data')

/** Переносит data/collections в data/_archive-collections-ГГГГММДД. Возвращает путь архива или null, если переносить нечего. */
export function archiveLegacyCollections() {
  const dir = path.join(DATA, 'collections')
  if (!fs.existsSync(dir)) return null
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  let target = path.join(DATA, `_archive-collections-${stamp}`)
  if (fs.existsSync(target)) target = `${target}-${Date.now()}`
  fs.renameSync(dir, target)
  return target
}
