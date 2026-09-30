// Личный кабинет резидента в боте: подписка, ссылка на сообщество, как отключить,
// поддержка. Открывается только тем, чей Telegram-аккаунт уже привязан к оплаченной
// подписке (через ссылку доступа после оплаты или данные от Prodamus) — так чужие
// данные по телефону получить нельзя. Кнопки — callback «r:…».
const MSK = 'Europe/Moscow'
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))

const MENU_ROW = [{ text: '⬅️ Мой кабинет', callback_data: 'r:menu' }]

export function residentMenu(join, supportHandle) {
  const name = join.name && join.name !== '—' ? join.name : null
  return {
    text: `${name ? `${name}, здравствуйте` : 'Здравствуйте'}! Это ваш кабинет резидента сообщества «Карьерный юрист».`,
    keyboard: [
      [{ text: '📋 Моя подписка', callback_data: 'r:sub' }, { text: '🔗 Ссылка на сообщество', callback_data: 'r:link' }],
      [{ text: '🛑 Как отключить подписку', callback_data: 'r:off' }],
      [{ text: '💬 Написать в поддержку', url: `https://t.me/${String(supportHandle).replace(/^@/, '')}` }],
    ],
  }
}

export function subscriptionScreen(join, tariffs) {
  const last = (join.payments ?? []).filter((p) => !p.estimated).at(-1)
  const amount = Number(last?.amount) || tariffs[join.tariffId]?.price || null
  const plan = tariffs[join.tariffId]?.period ?? last?.subscriptionName ?? null
  const payments = (join.payments ?? []).filter((p) => !p.estimated).length
  const lines = [
    '📋 Моя подписка',
    '',
    `Статус: ${join.status === 'active' ? '🟢 активна' : join.status === 'cancelled' ? '🔕 отключена' : '⏳ ожидает оплаты'}`,
    plan ? `Тариф: ${plan}${amount ? ` · ${rub(amount)}` : ''}` : amount ? `Списание: ${rub(amount)}` : null,
    join.firstPaidAt ? `Участник с: ${ruDate(join.firstPaidAt)}` : null,
    payments ? `Оплат: ${payments}` : null,
    join.status === 'active' && join.nextPaymentAt ? `Следующее списание: ${ruDate(join.nextPaymentAt)}${amount ? ` (${rub(amount)})` : ''}` : null,
    join.status === 'cancelled' ? 'Автопродление отключено — новых списаний не будет.' : null,
  ].filter((l) => l !== null)
  return { text: lines.join('\n'), keyboard: [MENU_ROW] }
}

export function linkScreen(join, inviteLink) {
  if (join.status !== 'active') return { text: '🔗 Ссылка на сообщество доступна при активной подписке. Если оплата прошла, а ссылки нет, напишите в поддержку.', keyboard: [MENU_ROW] }
  if (!inviteLink) return { text: '🔗 Ссылку на сообщество мы пришлём в поддержке — напишите нам.', keyboard: [MENU_ROW] }
  return { text: `🔗 Ссылка на вступление в закрытое сообщество:\n${inviteLink}`, keyboard: [MENU_ROW] }
}

export function offScreen(supportHandle) {
  return {
    text: `🛑 Как отключить подписку\n\nНапишите нам в поддержку — ${supportHandle} — мы отключим автопродление. Также ссылка на управление подпиской обычно есть в письмах об оплате от Prodamus.\n\nДоступ к сообществу сохранится до конца оплаченного периода.`,
    keyboard: [[{ text: '💬 Написать в поддержку', url: `https://t.me/${String(supportHandle).replace(/^@/, '')}` }], MENU_ROW],
  }
}
