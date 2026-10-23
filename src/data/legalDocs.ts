// Юридические документы сайта: один перечень для страницы /legal и страниц «Документы» разделов.
// Новый документ добавляется сюда (и в маршруты App.tsx) — он сразу появляется везде, а подвалы сайта ведут одной ссылкой на /legal.
export interface LegalDoc {
  to: string
  title: string
  note: string
}

export interface LegalGroup {
  title: string
  docs: LegalDoc[]
}

export const legalGroups: LegalGroup[] = [
  {
    title: 'Персональные данные',
    docs: [
      { to: '/legal/privacy', title: 'Политика обработки персональных данных', note: 'Какие данные мы собираем, зачем, сколько храним и как защищаем' },
      { to: '/legal/consent', title: 'Согласие на обработку персональных данных', note: 'Согласие, которое вы даёте в формах на сайте и в Telegram-боте' },
      { to: '/legal/marketing-consent', title: 'Согласие на получение рекламных и информационных материалов', note: 'Отдельное согласие на рассылки; отозвать его можно в любой момент' },
      { to: '/legal/consent-publication', title: 'Согласие на распространение персональных данных (публикация отзыва)', note: 'Отдельное согласие на публикацию вашего отзыва о материале' },
    ],
  },
  {
    title: 'Оферты',
    docs: [
      { to: '/legal/offer', title: 'Оферта на Лонглист «Студенческие юридические мероприятия»', note: 'Условия покупки материала' },
      { to: '/legal/offer-longlist-yuridicheskie-meropriyatiya', title: 'Оферта на Лонглист «Юридические мероприятия»', note: 'Условия покупки материала' },
      { to: '/legal/offer-gaid-kariera-yurista-v-notariate', title: 'Оферта на Гайд «Карьера юриста в нотариате»', note: 'Условия покупки материала' },
      { to: '/legal/offer-gaid-stipendii-i-granty', title: 'Оферта на Гайд «Стипендии и гранты»', note: 'Условия покупки материала' },
      { to: '/legal/offer-legal-night-jazz-2', title: 'Оферта мероприятия «Джазовый вечер для юристов 2»', note: 'Условия участия и покупки билета' },
    ],
  },
]

export const legalDocs: LegalDoc[] = legalGroups.flatMap((g) => g.docs)
