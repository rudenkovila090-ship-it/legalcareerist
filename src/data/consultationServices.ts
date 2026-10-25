// Прайс-лист услуг карьерного консультирования — реальные цены от клиента.
// С 25.10.2026 стоимость всех услуг уменьшена на 50% (решение владельца): здесь действующие цены.
// Скидки: от 2 услуг — 5%, от 3 услуг — 10% (по количеству позиций в заказе).
// Промокоды: KQresident — одна услуга (самая дешевая в заказе) бесплатно для
// резидентов Сообщества; персональные промокоды на 15% на первую услугу
// выдаются вручную и проверяются менеджером при подтверждении заявки.
export interface ConsultationService {
  id: string
  title: string
  price: number
}

export interface ConsultationCategory {
  title: string
  services: ConsultationService[]
}

export const consultationCategories: ConsultationCategory[] = [
  {
    title: 'Резюме и сопроводительное письмо',
    services: [
      { id: 'resume-write', title: 'Составление резюме', price: 1500 },
      { id: 'resume-fix', title: 'Доработка резюме', price: 750 },
      { id: 'cover-letter', title: 'Составление сопроводительного письма', price: 1000 },
    ],
  },
  {
    title: 'Подготовка к трудоустройству',
    services: [
      { id: 'interview-prep', title: 'Подготовка к собеседованию', price: 2000 },
      { id: 'job-search-support', title: 'Сопровождение поиска работы', price: 4000 },
      { id: 'job-search-strategy', title: 'Составление стратегии поиска работы', price: 2000 },
    ],
  },
  {
    title: 'Карьерное консультирование',
    services: [
      { id: 'career-consult', title: 'Карьерная консультация', price: 2000 },
      { id: 'specialization-choice', title: 'Выбор специализации', price: 2000 },
      { id: 'self-determination', title: 'Профессиональное самоопределение', price: 2000 },
      { id: 'career-scenario', title: 'Составление карьерного сценария', price: 2000 },
    ],
  },
  {
    title: 'Карьерные переходы и кризисы',
    services: [
      { id: 'career-crisis', title: 'Работа с карьерным кризисом', price: 2000 },
      { id: 'burnout', title: 'Борьба с карьерным выгоранием и тупиком', price: 2000 },
      { id: 'career-transition', title: 'Карьерный переход', price: 2000 },
    ],
  },
  {
    title: 'Личный бренд',
    services: [
      { id: 'personal-brand', title: 'Построение персонального бренда юриста', price: 2000 },
      { id: 'personal-brand-promo', title: 'Продвижение личного бренда', price: 1500 },
    ],
  },
]

export const allConsultationServices: ConsultationService[] = consultationCategories.flatMap((c) => c.services)

export function tierDiscountPct(count: number): number {
  if (count >= 3) return 10
  if (count >= 2) return 5
  return 0
}
