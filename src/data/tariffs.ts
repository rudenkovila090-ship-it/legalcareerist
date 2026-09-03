// priceLabel — полная стоимость тарифа (то, что списывается при оплате);
// note — цена в пересчете на месяц, показывает выгоду, но не является
// суммой к оплате. Вынесено из CommunityHome.tsx, чтобы тем же списком
// тарифов мог пользоваться и виджет вступления, встроенный в статьи
// базы знаний (см. TariffJoinBlock).
export const tariffs = [
  { id: '1m', period: '1 месяц', price: 690, priceLabel: '690 ₽', note: 'Стандартная' },
  { id: '3m', period: '3 месяца', price: 1770, priceLabel: '1 770 ₽', note: '590 ₽/мес · выгоднее на 14%' },
  { id: '6m', period: '6 месяцев', price: 3180, priceLabel: '3 180 ₽', note: '530 ₽/мес · выгоднее на 23%' },
  { id: 'demo', period: 'Демодоступ', price: 0, priceLabel: 'Бесплатно', note: '7 дней, чтобы попробовать формат перед оплатой' },
] as const

export type TariffId = (typeof tariffs)[number]['id']
