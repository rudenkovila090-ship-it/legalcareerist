// Общее хранилище демо-данных кабинетов (вакансии, отклики, резюме,
// избранное, мероприятия организатора, отзывы и т.д.) — раньше это жило
// только в localStorage браузера, поэтому не пережимало смену устройства и
// не было общим между демо-кандидатом и демо-работодателем на разных
// компьютерах. Теперь каждый ключ localStorage вида "ky_*" (см.
// src/lib/serverSync.ts) зеркалится сюда отдельным JSON-файлом — тот же
// простой принцип, что и у остальных хранилищ сервера (vacancyStats.js,
// articleStats.js и т.п.), просто дженерик под произвольный ключ вместо
// одной конкретной сущности.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data', 'collections')

// Тот же префикс, что уже используют все lib/*.ts на клиенте — не белый
// список конкретных сущностей (их придется руками поддерживать при каждом
// новом lib/*.ts), а формат имени ключа. \w перестраховочно не берем —
// латиница/цифры/подчеркивание, как и везде в проекте.
const KEY_PATTERN = /^ky_[a-z0-9_]+$/

export function isValidKey(key) {
  return typeof key === 'string' && KEY_PATTERN.test(key)
}

function fileFor(key) {
  return path.join(DATA_DIR, `${key}.json`)
}

export function writeCollection(key, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(fileFor(key), JSON.stringify(value ?? null))
}

/** Всё разом — для синхронизации при загрузке приложения (один запрос
 *  вместо одного на каждый из полутора десятков ключей). */
export function readAllCollections() {
  if (!fs.existsSync(DATA_DIR)) return {}
  const result = {}
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json')) continue
    const key = file.slice(0, -'.json'.length)
    if (!isValidKey(key)) continue
    try {
      result[key] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))
    } catch {
      // Повреждённый файл — пропускаем, не роняем синхронизацию остальных ключей.
    }
  }
  return result
}
