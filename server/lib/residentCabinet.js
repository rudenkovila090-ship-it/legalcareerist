// Личный кабинет в боте: «Моя подписка» (статус, тариф, даты подключения, оплаты и списания), ссылка на сообщество,
// поддержка и «Настройки», где спрятано отключение подписки (подтверждение → причина → готово). Открывается только
// тем, чей Telegram-аккаунт привязан к подписке, — так чужие данные по телефону получить нельзя. Кнопки — «r:…».
import { gv } from './gender.js'

const MSK = 'Europe/Moscow'
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
export const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))

const BACK_ROW = [{ text: '⬅️ Кабинет', callback_data: 'r:menu' }]

/** Подписка «в силе»: бессрочная, активная или отключена, но оплаченный период ещё не закончился. */
export function hasAccess(join, now = Date.now()) {
  if (!join) return false
  if (join.lifetime || join.status === 'active') return true
  return join.status === 'cancelled' && Boolean(join.nextPaymentAt) && join.nextPaymentAt > now
}

export function residentMenu(join, user) {
  const name = user?.firstName || (join.name && join.name !== '—' ? join.name.split(' ')[0] : null)
  return {
    text: `${name ? `${name}, привет` : 'Привет'}! Это твой личный кабинет сообщества «Карьерный юрист».`,
    keyboard: [
      [{ text: '📋 Моя подписка', callback_data: 'r:sub' }],
      [{ text: '🔗 Ссылка на сообщество', callback_data: 'r:link' }],
      [{ text: '💬 Поддержка', callback_data: 'u:support' }, { text: '⚙️ Настройки', callback_data: 'r:set' }],
      [{ text: '⬅️ Сообщество', callback_data: 'u:community' }],
    ],
  }
}

/** «Моя подписка»: статус, тариф, когда подключена, последняя оплата, дата следующего списания. */
export function subscriptionScreen(join, tariffs, now = Date.now()) {
  if (join.lifetime) {
    const lines = [
      '📋 Моя подписка',
      '',
      'Статус: 🟢 активна',
      'Тариф: Основатель — бессрочно',
      `Начало подписки: ${ruDate(join.startAt ?? join.firstPaidAt ?? join.createdAt)}`,
      `Действует до: ${join.endsAt ? ruDate(join.endsAt) : 'бессрочно'}`,
      'Списаний нет — доступ к сообществу сохраняется.',
    ]
    return { text: lines.join('\n'), keyboard: [BACK_ROW] }
  }
  const paid = (join.payments ?? []).filter((p) => !p.estimated)
  const last = paid.at(-1) ?? (join.payments ?? []).at(-1)
  const amount = Number(last?.amount) || tariffs[join.tariffId]?.price || null
  const plan = tariffs[join.tariffId]?.period ?? last?.subscriptionName ?? null
  const active = join.status === 'active'
  const endsAt = join.nextPaymentAt
  const status = active ? '🟢 активна' : join.status === 'cancelled' ? (hasAccess(join, now) ? '🔕 отключена — доступ до конца оплаченного периода' : '⚪ закончилась') : '⏳ ожидает оплаты'
  // «Действует до» — конец оплаченного периода; у подписки с автопродлением дальше она продлится списанием.
  let until = null
  if (endsAt) until = active && !join.oneTime ? `Действует до: ${ruDate(endsAt)} (дальше продлится автоматически — списание${amount ? ` ${rub(amount)}` : ''})` : `Действует до: ${ruDate(endsAt)}`
  const lines = [
    '📋 Моя подписка',
    '',
    `Статус: ${status}`,
    plan ? `Тариф: ${plan}${amount ? ` · ${rub(amount)}` : ''}` : amount ? `Сумма: ${rub(amount)}` : null,
    `Начало подписки: ${join.firstPaidAt ? ruDate(join.firstPaidAt) : 'дата неизвестна'}`,
    until,
    join.lastPaidAt ? `Последняя оплата: ${ruDate(join.lastPaidAt)}${amount ? ` · ${rub(amount)}` : ''}` : null,
    paid.length ? `Всего оплат: ${paid.length}` : null,
    join.bonusDays ? `Бонусные дни: +${join.bonusDays}` : null,
  ].filter((l) => l !== null)
  const keyboard = []
  if (!hasAccess(join, now) || join.status === 'cancelled') keyboard.push([{ text: join.status === 'cancelled' ? 'Возобновить подписку' : 'Оформить подписку', callback_data: 'u:join' }])
  keyboard.push(BACK_ROW)
  return { text: lines.join('\n'), keyboard }
}

export function linkScreen(join, inviteLink, now = Date.now()) {
  if (!hasAccess(join, now)) return { text: '🔗 Ссылка на сообщество доступна при действующей подписке. Если оплата прошла, а ссылки нет, напиши в поддержку.', keyboard: [[{ text: '💬 Поддержка', callback_data: 'u:support' }], BACK_ROW] }
  if (!inviteLink) return { text: '🔗 Ссылку на сообщество пришлёт поддержка — напиши нам.', keyboard: [[{ text: '💬 Поддержка', callback_data: 'u:support' }], BACK_ROW] }
  return { text: `🔗 Ссылка на вступление в закрытое сообщество:\n${inviteLink}`, keyboard: [BACK_ROW] }
}

/** «Настройки»: рассылка и отключение подписки (внизу, чтобы до него доходили только намеренно). */
export function settingsScreen(join, user, now = Date.now()) {
  const mailing = user?.mailingConsent === true
  const canCancel = join.status === 'active' // у основателя кнопка тоже есть — чтобы видеть путь клиента (по факту ничего не отключается)
  const keyboard = [[{ text: mailing ? '🔔 Рассылка: включена (нажми, чтобы выключить)' : '🔕 Рассылка: выключена (нажми, чтобы включить)', callback_data: 'r:mail' }]]
  if (canCancel) keyboard.push([{ text: 'Отменить подписку', callback_data: 'r:cancel' }])
  keyboard.push(BACK_ROW)
  const lines = ['⚙️ Настройки личного кабинета', '', `Рекламная рассылка: ${mailing ? 'включена' : 'выключена'}`]
  if (join.status === 'cancelled') lines.push(`Подписка отключена${join.nextPaymentAt ? `, доступ ${join.nextPaymentAt > now ? 'заканчивается' : 'закончился'} ${ruDate(join.nextPaymentAt)}` : ''}.`)
  if (join.lifetime) lines.push('Основатель: отмена работает в тестовом режиме — подписка остаётся активной.')
  return { text: lines.join('\n'), keyboard }
}

export function cancelConfirmScreen(user) {
  return {
    text: `Ты ${gv(user, 'уверен', 'уверена', 'уверен(а)')}, что хочешь отключить подписку?`,
    keyboard: [[{ text: 'Да, хочу отменить', callback_data: 'r:cancelyes' }], [{ text: 'Нет, оставить', callback_data: 'r:set' }]],
  }
}

export function cancelReasonPrompt() {
  return {
    text: 'Напиши, пожалуйста, по какой причине ты хочешь отменить подписку — одним сообщением. Это поможет нам стать лучше.',
    keyboard: [[{ text: 'Передумал(а), оставить подписку', callback_data: 'r:set' }]],
  }
}

/** Итог отключения: дата окончания доступа и напоминание, что вернуться можно всегда. */
export function cancelDoneScreen(endsAt, confirmed, testMode = false) {
  const until = endsAt ? `Она заканчивается ${ruDate(endsAt)}.` : 'Она заканчивается в конце оплаченного периода.'
  return {
    text: `${confirmed ? 'Хорошо, мы отключили подписку.' : 'Хорошо, запрос на отключение принят — мы отключим подписку в ближайшее время.'} ${until}\n\nТы всегда сможешь вернуться в сообщество — просто оформи подписку снова.${testMode ? '\n\n(Тестовый режим основателя: на самом деле подписка осталась активной.)' : ''}`,
    keyboard: [[{ text: '⬅️ Сообщество', callback_data: 'u:community' }, { text: '🏠 Меню', callback_data: 'u:menu' }]],
  }
}
