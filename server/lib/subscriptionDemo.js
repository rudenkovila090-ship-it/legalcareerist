import { subscriptionScreen } from './residentCabinet.js'
import { accessUntil, preciseMoscowTime } from './subscriptionAccess.js'

/** A pure UI demonstration: no payment, tag, membership or subscription mutation. */
export function subscriptionDemo(stage, startedAt) {
  const DAY = 86400000, paidAt = Number(startedAt), due = paidAt + 30 * DAY
  const join = { paid: true, status: 'active', tariffId: '1m', firstPaidAt: paidAt, lastPaidAt: paidAt, nextPaymentAt: due,
    priceLock: { amount: 690, subscriptionId: '2854597' }, payments: [{ at: paidAt, amount: 690, subscriptionId: '2854597' }] }
  const at = { paid: paidAt, reminder: due - DAY, failed: due + 1, expired: accessUntil(join), returned: accessUntil(join) + 1000 }[stage]
  if (!Number.isFinite(at)) return null
  if (stage === 'returned') { join.lastPaidAt = at; join.nextPaymentAt = at + 30 * DAY; join.payments.push({ at, amount: 690, subscriptionId: '2854597' }) }
  const description = {
    paid: 'Учебная оплата подтверждена. В боевом сценарии записываются цена, тариф, время начала и окончания, затем выдаётся ссылка на заявку в чат.',
    reminder: 'Учебное напоминание за 24 часа. Проверьте баланс и карту; списание выполняет Prodamus.',
    failed: 'Учебное списание не прошло. Оплаченный период завершился, но дополнительный доступ пока сохраняется.',
    expired: 'Учебная отсрочка закончилась. В боевом сценарии доступ закрывается, возможность вернуться по прежней цене остаётся.',
    returned: 'Учебное возвращение: новый публичный тариф условно 990 ₽, но резидент продлевает за закреплённые 690 ₽.',
  }[stage]
  const text = ['ТЕСТ ПОДПИСКИ — реальные списания и доступ не меняются.', `Время в сценарии: ${preciseMoscowTime(at)}.`, description,
    subscriptionScreen(join, { '1m': { price: 990, period: '1 месяц' } }, at).text].join('\n\n')
  return { text, keyboard: [
    [{ text: '1. Оплата', callback_data: 'r:demo:paid' }, { text: '2. За 24 часа', callback_data: 'r:demo:reminder' }],
    [{ text: '3. Неудача и отсрочка', callback_data: 'r:demo:failed' }],
    [{ text: '4. Конец отсрочки', callback_data: 'r:demo:expired' }, { text: '5. Возврат за 690 ₽', callback_data: 'r:demo:returned' }],
    [{ text: 'Мой настоящий кабинет', callback_data: 'r:menu' }],
  ] }
}
