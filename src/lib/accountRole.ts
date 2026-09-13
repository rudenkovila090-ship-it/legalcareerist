// Разделение личного кабинета на соискателя/работодателя — демо-вход без
// пароля (по решению заказчика для прототипа): кнопка "Войти как…" просто
// запоминает выбранную роль в localStorage, реальной авторизации нет.
// Когда появится настоящий бэкенд-логин, этот модуль — единственное место,
// которое нужно будет заменить на реальные сессии/токены.
export type ActiveRole = 'candidate' | 'employer'

const KEY = 'ky_active_role'

export function getActiveRole(): ActiveRole | null {
  const v = localStorage.getItem(KEY)
  return v === 'candidate' || v === 'employer' ? v : null
}

export function setActiveRole(role: ActiveRole) {
  localStorage.setItem(KEY, role)
}

export function clearActiveRole() {
  localStorage.removeItem(KEY)
}
