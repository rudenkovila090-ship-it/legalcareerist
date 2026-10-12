import type { EventItem } from '../types'

// Новые мероприятия добавляются сюда. Блоки без содержания (описание, программа, спикеры, «что получите» и т. д.)
// на странице скрыты, пока не заполнены; место проведения можно добавить позже.
export const events: EventItem[] = [
  {
    id: 'ev2',
    slug: 'dzhazovyy-vecher-dlya-yuristov-2',
    // Сначала название по-русски, затем английское — по закону о русском языке.
    title: 'Джазовый вечер для юристов 2 / Legal Night Jazz 2',
    type: 'conference',
    format: 'offline',
    city: 'Санкт-Петербург',
    dateTime: '2026-11-28T18:00:00+03:00',
    endDateTime: '2026-11-28T22:00:00+03:00',
    price: 2490,
    status: 'open',
    specialization: [],
    industry: [],
    audienceLevel: [],
    featured: true,
    speakers: [],
    program: [],
    audienceFit: [],
    bonuses: [],
    takeaways: [],
    tariffs: [
      {
        id: 'light',
        name: 'Билет',
        price: 2490,
        includes: ['Билет на мероприятие'],
      },
    ],
    location: '',
    description: 'Иммерсивное расследование в закрытом джаз-баре: живой саксофон, нуар, мафиозные договорённости — и вопрос, что на самом деле убивает карьеру юриста.',
    organizer: {
      name: '«Карьерный юрист»',
      description: 'Кадровое агентство и сообщество для юридического рынка.',
      site: 'https://legalcareerist.ru',
    },
  },
]
