// Каталог подписок сообщества в клубной системе Prodamus для второго бота (бывший бот из BotHelp).
// ID — это номера подписок из личного кабинета Prodamus («Подписки»): платёжные страницы создавать не нужно,
// ссылку на оплату по такому ID строит код (lib/prodamus.js: do=link&subscription=ID).
//
// sale: true  — подписку предлагаем новым покупателям в сценариях бота;
// sale: false — подписка только узнаётся: по её ID бот понимает, что пришло очередное списание у человека, купившего
//               её раньше (старые резиденты продолжают платить по старой цене), но новым её не показывает.
// Что продавать, решает владелец: достаточно поменять sale здесь.
const DAY = 24 * 3600 * 1000

export const TARIFFS = {
  // Старые подписки (метка «подписка_350» в выгрузке BotHelp — 76 человек).
  old350: { subscription: 2611878, price: 350, days: 30, label: 'Подписка на сообщество (350 ₽ / 30 дней)', sale: false },
  old500: { subscription: 2611880, price: 500, days: 30, label: 'Подписка на сообщество (500 ₽ / 30 дней)', sale: false },
  // Пакеты по цене прежней линейки.
  old3m: { subscription: 2854589, price: 1350, days: 90, label: 'Подписка на 3 месяца (1350 ₽)', sale: false },
  old6m: { subscription: 2854592, price: 2520, days: 180, label: 'Подписка на 6 месяцев (2520 ₽)', sale: false },
  old12m: { subscription: 2854598, price: 4200, days: 360, label: 'Подписка на 12 месяцев (4200 ₽)', sale: false },
  // Актуальные тарифы сайта legalcareerist.ru/community (те же ID использует основной бот).
  '1m': { subscription: 2854597, price: 690, days: 30, label: 'Подписка на сообщество 1 месяц', sale: true },
  '3m': { subscription: 3005286, price: 1770, days: 90, label: 'Подписка на сообщество 3 месяца', sale: true },
  '6m': { subscription: 3005289, price: 3180, days: 180, label: 'Подписка на сообщество 6 месяцев', sale: true },
}

/** Тарифы, которые показываем покупателям. */
export const tariffsForSale = () => Object.entries(TARIFFS).filter(([, t]) => t.sale).map(([id, t]) => ({ id, ...t }))

/** Обратный поиск: по ID подписки Prodamus (из вебхука) — наш ключ тарифа, например «3m». */
export function tariffIdBySubscriptionId(subscriptionId) {
  return Object.entries(TARIFFS).find(([, t]) => String(t.subscription) === String(subscriptionId))?.[0] ?? null
}

/** Дата окончания оплаченного периода. */
export const periodEnd = (paidAt, tariff) => paidAt + tariff.days * DAY
