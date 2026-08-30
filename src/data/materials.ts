import type { MaterialItem } from '../types'

// Каталог намеренно содержит только реальные материалы — демо-заглушки
// (гайды/чек-листы/статьи/вебинары «для вида») удалены по просьбе клиента,
// наполнение теперь только настоящим контентом.
export const materials: MaterialItem[] = [
  {
    id: 'm4',
    slug: 'longlist-studencheskie-yuridicheskie-meropriyatiya',
    title: 'Лонглист «Студенческие юридические мероприятия»',
    kind: 'longlist',
    direction: ['career', 'events'],
    price: 990,
    specialization: ['advocacy', 'consulting', 'inhouse', 'government'],
    industry: [],
    description: 'Подборка конференций, олимпиад, конкурсов и школ для студентов-юристов — с датами и ссылками на подачу заявок.',
    forWhom: 'Студентам-юристам, которые хотят участвовать в профильных мероприятиях',
    purchases: 96,
    rating: 4.8,
    reviewsCount: 14,
    qnaCount: 3,
    realPurchase: true,
  },
]
