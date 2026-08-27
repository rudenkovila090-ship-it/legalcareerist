import type { MaterialItem } from '../types'

export const materials: MaterialItem[] = [
  {
    id: 'm1',
    slug: 'zapis-gossluzhba-start',
    title: 'Запись: «Старт карьеры на госслужбе»',
    kind: 'recording',
    price: 990,
    specialization: ['government'],
    industry: ['gr'],
    description: 'Полная запись вебинара с презентацией и ответами на вопросы участников.',
    forWhom: 'Студентам и выпускникам, рассматривающим госслужбу',
  },
  {
    id: 'm2',
    slug: 'gaid-perehod-v-inhouse',
    title: 'Гайд «Переход из консалтинга в инхаус»',
    kind: 'guide',
    price: 1490,
    specialization: ['consulting', 'inhouse'],
    industry: ['corporate'],
    description: '30 страниц о том, как оценить оффер, договориться о зарплате и адаптироваться в новой роли.',
    forWhom: 'Юристам консалтинга, рассматривающим инхаус',
  },
  {
    id: 'm3',
    slug: 'chek-list-podgotovka-k-sobesedovaniyu',
    title: 'Чек-лист подготовки к собеседованию',
    kind: 'checklist',
    price: 0,
    specialization: ['advocacy', 'consulting', 'inhouse', 'government'],
    industry: [],
    description: 'Бесплатный чек-лист: что взять с собой, какие вопросы задать, как обсуждать зарплату.',
    forWhom: 'Всем соискателям',
  },
]
