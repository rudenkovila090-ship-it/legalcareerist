// Лента уведомлений личного кабинета (соискатель/работодатель) — демо,
// как и остальные данные кабинета, живет в localStorage. Не связана с
// реальными событиями на сайте — набор правдоподобных уведомлений,
// показывающий механику раздела «Уведомления» в левом меню.
export interface AccountNotification {
  id: string
  text: string
  date: string
  read: boolean
}

type AccountRole = 'candidate' | 'employer'

const keyFor: Record<AccountRole, string> = {
  candidate: 'ky_candidate_notifications',
  employer: 'ky_employer_notifications',
}

function seedFor(role: AccountRole): AccountNotification[] {
  if (role === 'candidate') {
    return [
      { id: 'n1', text: 'Добро пожаловать в «Карьерный юрист» — заполните профиль, чтобы получать релевантные вакансии.', date: '2026-08-10T09:00:00.000Z', read: true },
      { id: 'n2', text: 'Ваш отклик на вакансию «Юрист M&A, инхаус» переведен в статус «На рассмотрении».', date: '2026-08-17T11:20:00.000Z', read: true },
      { id: 'n3', text: 'Через 3 дня — «Как тело и взгляд создают уверенного спикера», на который вы зарегистрированы. Ждем вас!', date: '2026-08-19T08:00:00.000Z', read: false },
      { id: 'n4', text: 'Доступна бесплатная генерация резюме — попробуйте конструктор.', date: '2026-08-20T10:00:00.000Z', read: false },
    ]
  }
  return [
    { id: 'n1', text: 'Вакансия «Юрист M&A, инхаус» прошла модерацию и опубликована.', date: '2026-05-12T09:05:00.000Z', read: true },
    { id: 'n2', text: 'Новый отклик на вакансию «Юрист M&A, инхаус» от Дмитрия Волкова.', date: '2026-08-17T14:10:00.000Z', read: true },
    { id: 'n3', text: 'Рассылка по кадровому резерву отправлена — 3200 получателей.', date: '2026-05-14T09:05:00.000Z', read: false },
    { id: 'n4', text: 'Место в рейтинге добавлено — учтено в расчете рейтинга работодателя.', date: '2026-08-21T12:00:00.000Z', read: false },
  ]
}

export function getNotifications(role: AccountRole): AccountNotification[] {
  try {
    const key = keyFor[role]
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as AccountNotification[]
    const seeded = seedFor(role)
    localStorage.setItem(key, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

export function markNotificationRead(role: AccountRole, id: string): AccountNotification[] {
  const all = getNotifications(role).map((n) => (n.id === id ? { ...n, read: true } : n))
  localStorage.setItem(keyFor[role], JSON.stringify(all))
  return all
}

export function markAllNotificationsRead(role: AccountRole): AccountNotification[] {
  const all = getNotifications(role).map((n) => ({ ...n, read: true }))
  localStorage.setItem(keyFor[role], JSON.stringify(all))
  return all
}

export function unreadCount(notifications: AccountNotification[]): number {
  return notifications.filter((n) => !n.read).length
}
