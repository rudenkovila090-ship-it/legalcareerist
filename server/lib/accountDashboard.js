// Сводка для обзора кабинета: сколько мероприятий и документов, насколько заполнен профиль и что ещё заполнить,
// последние события и действия, непрочитанные ответы поддержки. Всё считается по уже имеющимся данным кабинета.
import { getProfile } from './accountStore.js'
import { listDocuments } from './accountDocs.js'
import { accountEvents } from './accountData.js'
import { listActivity } from './accountActivity.js'
import { unreadCount } from './supportChat.js'

/** Из чего складывается «профиль заполнен на N %»: вес пункта, выполнен ли он и куда вести человека, если нет. Сумма весов — 100. */
function completenessChecks(cfg, profile, docs) {
  const name = cfg.contactName ?? cfg.name
  const phone = cfg.contactPhone ?? cfg.phone
  return [
    { key: 'name', label: 'Укажите имя', weight: 10, ok: Boolean(name), to: '/cabinet/profile' },
    { key: 'phone', label: 'Добавьте телефон для связи', weight: 10, ok: Boolean(phone), to: '/cabinet/profile' },
    { key: 'practice', label: 'Выберите основную практику', weight: 20, ok: Boolean(profile.practices.main), to: '/cabinet/practices' },
    { key: 'level', label: 'Укажите уровень', weight: 10, ok: Boolean(profile.experience.level), to: '/cabinet/practices' },
    { key: 'years', label: 'Укажите стаж', weight: 10, ok: profile.experience.years !== null, to: '/cabinet/practices' },
    { key: 'expectations', label: 'Заполните ожидания по роли', weight: 15, ok: profile.expectations.workFormat.length > 0 || Boolean(profile.expectations.city), to: '/cabinet/expectations' },
    { key: 'cv', label: 'Загрузите резюме', weight: 25, ok: docs.some((d) => d.type === 'cv'), to: '/cabinet/cv' },
  ]
}

export function accountDashboard(cfg, now = Date.now()) {
  const profile = getProfile(cfg.login)
  const docs = listDocuments(cfg.login)
  const events = accountEvents(cfg)
  const checks = completenessChecks(cfg, profile, docs)
  return {
    counts: { events: events.length, documents: docs.length },
    completeness: {
      percent: checks.filter((c) => c.ok).reduce((acc, c) => acc + c.weight, 0),
      missing: checks.filter((c) => !c.ok).map(({ key, label, to }) => ({ key, label, to })),
    },
    recentEvents: events.slice(0, 3),
    activity: listActivity(cfg.login, 6, now),
    support: { unread: unreadCount(cfg.login) },
  }
}
