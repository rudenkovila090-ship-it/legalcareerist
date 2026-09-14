// Мост между localStorage и сервером — превращает демо-данные кабинетов
// (вакансии, отклики, резюме, избранное, мероприятия организатора, отзывы
// и т.п. — все lib/*.ts с ключами вида "ky_*") в данные, видимые с любого
// устройства/браузера, а не только в том, где их создали. Ни один из
// существующих lib/*.ts при этом не меняется — все они как и раньше
// синхронно читают/пишут localStorage; этот модуль просто держит его в
// курсе сервера.
//
// Как это работает:
// 1. hydrateFromServer() — один раз при загрузке приложения (main.tsx),
//    ДО первого рендера — забирает с сервера актуальные значения всех
//    ky_*-ключей и кладет их в localStorage. Блокирующий (await), иначе
//    компоненты успели бы прочитать localStorage раньше, чем придет
//    серверная копия, и не узнали бы о ней (все getX() в lib/*.ts читают
//    localStorage один раз при монтировании, не подписаны на изменения).
// 2. patchLocalStorage() — подменяет localStorage.setItem: любая запись
//    ключа "ky_*" (из какого угодно lib/*.ts) дополнительно улетает на
//    сервер в фоне (fire-and-forget, не блокирует интерфейс). Вызывается
//    ПОСЛЕ hydrateFromServer(), чтобы сама гидратация не отправляла на
//    сервер то, что только что оттуда же и пришло.
//
// Ограничение: сервер хранит одну общую копию на весь сайт — у прототипа
// нет ни настоящей авторизации, ни отдельных аккаунтов посетителей (везде
// один демо-кандидат и один демо-работодатель, см. accountRole.ts), так
// что здесь нет вопроса "чьи это данные" — это буквально те же демо-роли,
// просто без привязки к конкретному браузеру.
const KEY_PATTERN = /^ky_[a-z0-9_]+$/

// Сессионные ключи-исключения — не данные кабинета, а состояние "какую
// демо-роль сейчас изображает этот браузер" (lib/accountRole.ts). Хранится
// сырой строкой, не JSON.stringify(...), поэтому тело PUT-запроса не
// распарсилось бы как JSON — и по смыслу эта роль всё равно локальна для
// конкретного браузера/вкладки, синхронизировать ее не нужно.
const EXCLUDED_KEYS = new Set(['ky_active_role'])

let patched = false

export function patchLocalStorage() {
  if (patched || typeof window === 'undefined') return
  patched = true
  const original = window.localStorage.setItem.bind(window.localStorage)
  window.localStorage.setItem = (key: string, value: string) => {
    original(key, value)
    if (KEY_PATTERN.test(key) && !EXCLUDED_KEYS.has(key)) pushToServer(key, value)
  }
}

function pushToServer(key: string, value: string) {
  if (typeof fetch === 'undefined') return
  fetch(`/api/store/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: value, // value уже результат JSON.stringify(...) — валидный JSON-текст
  }).catch(() => {
    // Бэкенд недоступен/не настроен — данные все равно сохранены локально.
  })
}

/** Ограниченная по времени, чтобы недоступный бэкенд (или его отсутствие,
 *  если фронтенд развернут отдельно от server/) не задерживал загрузку
 *  сайта дольше секунды-другой — тогда просто работаем с тем, что уже
 *  есть в localStorage, как и раньше. */
export async function hydrateFromServer(timeoutMs = 1200): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/store/sync', { signal: controller.signal })
    if (!res.ok) return
    const data = (await res.json()) as Record<string, unknown>
    for (const [key, value] of Object.entries(data)) {
      if (!KEY_PATTERN.test(key) || EXCLUDED_KEYS.has(key) || value === null || value === undefined) continue
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // localStorage недоступен (приватный режим и т.п.) — не блокируем загрузку.
      }
    }
  } catch {
    // Сервер недоступен/таймаут — продолжаем с тем, что уже есть локально.
  } finally {
    clearTimeout(timeout)
  }
}
