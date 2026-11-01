// Сообщения резиденту в бот о списаниях: напоминание, списание прошло, списание не прошло. То же самое уходит и письмом
// (lib/subscriptionMail.js). Только тексты и кнопки; отправка и отметки «уже напоминали» — в server/index.js.

const MSK = 'Europe/Moscow'
const day = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long' }).format(new Date(ts))
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`

export const CABINET_KEYBOARD = [[{ text: '💼 Личный кабинет', callback_data: 'r:menu' }], [{ text: 'Главное меню', callback_data: 'u:menu' }]]

/** Напоминание о списании за days дней (2 или 1). */
export function chargeReminderText(join, days, amount) {
  const when = days === 1 ? 'Завтра' : `Через ${days} ${days < 5 ? 'дня' : 'дней'}`
  const date = join?.nextPaymentAt ? ` (${day(join.nextPaymentAt)})` : ''
  return ['Привет! 👋', `${when}${date} произойдёт списание за подписку${amount ? `: ${rub(amount)}` : ''}.`, '', 'Спасибо, что остаёшься с нами! 🧡', 'Если планы изменились, отключить автопродление можно в личном кабинете.'].join('\n')
}

export function chargeDoneText(amount, nextPaymentAt) {
  return ['Списание прошло ✅', amount ? `Оплачено: ${rub(amount)} за подписку на сообщество.` : 'Подписка на сообщество продлена.', nextPaymentAt ? `Следующее списание: ${day(nextPaymentAt)}.` : null, '', 'Спасибо, что ты с нами! 💗'].filter((l) => l !== null).join('\n')
}

export function chargeFailedText(amount, chargeAt) {
  return [
    'Привет! Не получилось списать оплату за подписку на сообщество' + (amount ? ` (${rub(amount)}, ${day(chargeAt)})` : '') + '.',
    '',
    'Возможно, банк отклонил платёж или у карты закончился срок. Проверь карту и баланс: платёжная система повторит попытку в ближайшие дни.',
    '',
    'Если карту нужно сменить, напиши в поддержку: поможем, чтобы подписка не прервалась.',
  ].join('\n')
}

export const CHARGE_FAILED_KEYBOARD = [[{ text: '💬 Поддержка', callback_data: 'u:support' }], [{ text: '💼 Личный кабинет', callback_data: 'r:menu' }]]
