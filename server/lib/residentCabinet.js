// Личный кабинет в боте: «Моя подписка» (статус, тариф, даты подключения, оплаты и списания), ссылка на сообщество,
// поддержка и «Настройки», где спрятано отключение подписки (подтверждение → причина → готово). Открывается только
// тем, чей Telegram-аккаунт привязан к подписке, — так чужие данные по телефону получить нельзя. Кнопки — «r:…».
import { gv } from './gender.js'

const MSK = 'Europe/Moscow'
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
export const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))

const BACK_ROW = [{ text: '⬅️ Кабинет', callback_data: 'r:menu' }]
const DAY = 24 * 3600 * 1000
const plural = (n, [one, few, many]) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many)

/** Подписка «в силе»: бессрочная, активная или отключена, но оплаченный период ещё не закончился. */
/** Prodamus повторяет неудачное списание до ~3,3 суток: пока идут попытки, доступ ещё считается действующим. */
const AUTOPAY_RETRY_MS = 4 * DAY

/**
 * Есть ли у человека действующая подписка. Статус «активна» без даты считаем действующим, но если оплаченный срок вышел (разовая подписка —
 * сразу, с автопродлением — после попыток списания), подписки уже нет, даже если карточку никто не закрыл (например, перенесённую из BotHelp).
 */
export function hasAccess(join, now = Date.now()) {
  if (!join) return false
  if (join.lifetime) return true
  if (join.status === 'active') return !join.nextPaymentAt || join.nextPaymentAt + (join.oneTime ? 0 : AUTOPAY_RETRY_MS) > now
  return join.status === 'cancelled' && Boolean(join.nextPaymentAt) && join.nextPaymentAt > now
}

export function residentMenu(join, user) {
  const name = user?.firstName || (join.name && join.name !== '—' ? join.name.split(' ')[0] : null)
  return {
    text: `${name ? `${name}, привет` : 'Привет'}! Это твой личный кабинет сообщества «Карьерный юрист».`,
    keyboard: [
      [{ text: '📋 Моя подписка', callback_data: 'r:sub' }],
      [{ text: '🔗 Ссылка на сообщество', callback_data: 'r:link' }],
      [{ text: '⭐ Оставить отзыв', callback_data: 'r:rv' }],
      [{ text: '🌐 Кабинет на сайте', callback_data: 'r:site' }],
      [{ text: '💬 Поддержка', callback_data: 'u:support' }, { text: '⚙️ Настройки', callback_data: 'r:set' }],
      [{ text: '⬅️ Сообщество', callback_data: 'u:community' }],
    ],
  }
}

/** «Моя подписка»: статус, тариф, когда подключена, последняя оплата, дата следующего списания. */
export function subscriptionScreen(join, tariffs, now = Date.now(), payUrl = '') {
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
  const active = join.status === 'active' && hasAccess(join, now)
  const endsAt = join.nextPaymentAt
  const status = active ? '🟢 активна' : join.status === 'active' ? '⚪ закончилась' : join.status === 'cancelled' ? (hasAccess(join, now) ? '🔕 отключена — доступ до конца оплаченного периода' : '⚪ закончилась') : '⏳ ожидает оплаты'
  // «Действует до» — конец оплаченного периода; у подписки с автопродлением дальше она продлится списанием.
  let until = null
  if (endsAt) until = active && !join.oneTime && endsAt > now ? `Действует до: ${ruDate(endsAt)} (дальше продлится автоматически — списание${amount ? ` ${rub(amount)}` : ''})` : endsAt <= now ? `Срок закончился: ${ruDate(endsAt)}` : `Действует до: ${ruDate(endsAt)}`
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
  // Те же «Осталось N дней», что в кабинете на сайте: до конца оплаченного периода, округляем вверх.
  if (endsAt && endsAt > now && hasAccess(join, now)) {
    const left = Math.ceil((endsAt - now) / DAY)
    const at = lines.findIndex((l) => l.startsWith('Действует до'))
    lines.splice(at >= 0 ? at + 1 : lines.length, 0, `Осталось: ${left} ${plural(left, ['день', 'дня', 'дней'])}`)
  }
  const keyboard = [[{ text: '📜 История оплат', callback_data: 'r:hist' }]]
  if ((!hasAccess(join, now) || join.status === 'cancelled') && payUrl) keyboard.push([{ text: join.status === 'cancelled' ? 'Возобновить подписку на сайте' : 'Оформить подписку на сайте', url: payUrl }])
  keyboard.push(BACK_ROW)
  return { text: lines.join('\n'), keyboard }
}

/** «Оставить отзыв»: согласие на публикацию, затем текст пишется прямо в чате. Бонус за отзыв выдаётся один раз. */
export function reviewScreen({ bonusDays, consentUrl, bonusGiven }) {
  const bonus = bonusGiven ? 'Бонус за отзыв выдаётся один раз и ты его уже получал(а), но отзыв нам всё равно очень ценен.' : `Мы прочитаем его и, если всё в порядке, добавим +${bonusDays} дня к подписке в благодарность.`
  return {
    text: `⭐ Отзыв о сообществе\n\nНапиши пару предложений: чем сообщество было тебе полезно и что понравилось. ${bonus}\n\nОтправляя отзыв, ты соглашаешься, что мы можем опубликовать его на сайте и в соцсетях «Карьерного юриста» с подписью: твоё имя и первая буква фамилии. Другие данные не публикуются. Согласие можно отозвать в любой момент.\n\nУсловия: ${consentUrl}`,
    keyboard: [[{ text: '✅ Согласен(на), написать отзыв', callback_data: 'r:rvgo' }], BACK_ROW],
  }
}

export function reviewSendPrompt(minLength) {
  return {
    text: `Напиши свой отзыв одним сообщением (не короче ${minLength} символов). Отмена — /cancel.`,
    keyboard: [[{ text: 'Передумал(а)', callback_data: 'r:menu' }]],
  }
}

/** «История оплат»: как в кабинете на сайте, новые сверху; суммы, перенесённые из прежней системы, помечены ≈. */
export function paymentsScreen(join) {
  const list = (join.payments ?? [])
    .filter((p) => Number(p.amount) > 0 || p.estimated)
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))
  const shown = list.slice(0, 15)
  const lines = ['📜 История оплат', '']
  if (!list.length) lines.push('Оплат пока нет.')
  for (const p of shown) lines.push(`• ${p.at ? ruDate(p.at) : 'дата неизвестна'} — ${Number(p.amount) > 0 ? `${rub(p.amount)}${p.estimated ? ' ≈' : ''}` : '—'}`)
  if (list.length > shown.length) lines.push(`…и ещё ${list.length - shown.length}`)
  if (list.some((p) => p.estimated)) lines.push('', '≈ сумма примерная: перенесена из прежней системы.')
  lines.push('', 'Чек каждой оплаты приходит на почту, указанную при оплате.')
  return { text: lines.join('\n'), keyboard: [BACK_ROW] }
}

/** «Ссылка на сообщество»: общая ссылка на вступление; заявку принимает бот, если подписка оплачена. url — ссылка (пусто, если не задана). */
export function linkScreen(join, url, now = Date.now()) {
  const support = [{ text: '💬 Поддержка', callback_data: 'u:support' }]
  if (!hasAccess(join, now)) return { text: '🔗 Ссылка на сообщество доступна при действующей подписке. Если оплата прошла, а ссылки нет, напиши в поддержку.', keyboard: [support, BACK_ROW] }
  if (!url) return { text: '🔗 Ссылку на сообщество пришлёт поддержка, напиши нам.', keyboard: [support, BACK_ROW] }
  if (join.lifetime) return { text: `🔗 Ссылка на вступление в закрытое сообщество:\n${url}`, keyboard: [BACK_ROW] }
  const joined = join.joinedAt ? `Ты уже в закрытом чате сообщества (с ${ruDate(join.joinedAt)}) ✅ Ссылка нужна, только если вышел(ла) из чата и хочешь вернуться.\n\n` : ''
  return {
    text: `🔗 ${joined}Ссылка на вступление в закрытое сообщество:\n${url}\n\nПодай заявку по ссылке, и я сразу её приму: подписка у тебя оплачена.`,
    keyboard: [[{ text: 'Вступить в сообщество', url }], BACK_ROW],
  }
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
