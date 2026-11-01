import { pluralRu } from '../../lib/plural'
import { isResidentAccount, type CabinetUser } from '../../lib/cabinet'

export const inputClass = 'w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none'
/** Поля новых разделов: на телефоне 16 px, иначе iOS приближает страницу при вводе. */
export const fieldClass = 'w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3 text-base placeholder:text-ink/40 focus:border-ink/40 focus:outline-none sm:py-2.5 sm:text-sm'
export const labelClass = 'mb-1.5 block text-sm font-medium text-ink/80'

export const longDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

/** Сообщения об ошибках сервера в кабинете. */
export const errorText = (code: string): string =>
  ({
    consent_required: 'Отметьте обязательные галочки внизу формы.',
    bad_salary: 'Зарплата «от» не может быть больше «до».',
    bad_years: 'Стаж — число от 0 до 60.',
    bad_type: 'Подходят PDF, Word (doc, docx), ODT, RTF, Excel, PowerPoint и txt.',
    bad_content: 'Содержимое файла не похоже на заявленный формат. Сохраните документ заново в нужном формате и загрузите ещё раз.',
    file_too_large: 'Файл больше 10 МБ. Сожмите его или загрузите версию поменьше.',
    empty_file: 'Файл пустой.',
    no_file: 'Выберите файл.',
    too_many_documents: 'Достигнут предел документов. Удалите ненужные и загрузите снова.',
    too_many_versions: 'У документа уже максимум версий. Удалите старые.',
    storage_full: 'Место для файлов закончилось. Удалите ненужные документы.',
    not_found: 'Документ не найден. Обновите страницу.',
    unauthorized: 'Сессия закончилась. Обновите страницу и войдите снова.',
    network: 'Не получилось связаться с сервером. Попробуйте ещё раз.',
  })[code] ?? 'Не получилось сохранить. Попробуйте ещё раз.'

/** Размер файла для показа: «48 КБ», «2,4 МБ». */
export const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  const mb = Math.round((bytes / 1024 / 1024) * 10) / 10
  return `${String(mb).replace('.', ',')} МБ`
}

const pad = (n: number) => String(n).padStart(2, '0')
export const timeOfDay = (ts: number) => `${pad(new Date(ts).getHours())}:${pad(new Date(ts).getMinutes())}`

/** «только что», «5 минут назад», «3 часа назад», «вчера, 14:30», «12 октября». */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts
  if (diff < 60_000) return 'только что'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} ${pluralRu(minutes, ['минуту', 'минуты', 'минут'])} назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 12) return `${hours} ${pluralRu(hours, ['час', 'часа', 'часов'])} назад`
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((day(now) - day(ts)) / 86_400_000)
  if (days === 0) return `сегодня, ${timeOfDay(ts)}`
  if (days === 1) return `вчера, ${timeOfDay(ts)}`
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(new Date(ts).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

/** Заголовок дня для списков: «Сегодня», «Вчера» или «12 октября». */
export function dayTitle(ts: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((day(now) - day(ts)) / 86_400_000)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(new Date(ts).getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}

/** Инициалы для аватара: «Анна Иванова» → «АИ»; без имени — первая буква почты. */
export function initials(name: string, email = ''): string {
  const words = name.split(/\s+/).filter((w) => /\p{L}/u.test(w))
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
  return (email.trim()[0] ?? '?').toUpperCase()
}

/** Роль для подписи рядом с именем: администратор, резидент сообщества или обычный клиент сервиса. */
export function roleOf(user: CabinetUser): { label: string; tone: 'ink' | 'gold' | 'soft' } {
  if (!isResidentAccount(user)) return { label: 'Администратор', tone: 'ink' }
  if (user.resident.status === 'active' || user.resident.status === 'lifetime') return { label: 'Резидент сообщества', tone: 'gold' }
  return { label: 'Клиент сервиса', tone: 'soft' }
}

/** Резидент сообщества (подписка действует или бессрочная); администратор видит всё как резидент. */
export const isMember = (user: CabinetUser) => !isResidentAccount(user) || user.resident.status === 'active' || user.resident.status === 'lifetime'
