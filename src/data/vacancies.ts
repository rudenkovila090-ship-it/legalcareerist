import type { Vacancy } from '../types'

// Каталог намеренно содержит только одну вакансию — технический пример
// структуры страницы (см. technicalExample), остальные демо-вакансии
// удалены по просьбе клиента: наполнение сайта только реальными вещами.
// Реальные вакансии добавляются сюда по мере поступления от работодателей.
export const vacancies: Vacancy[] = [
  {
    id: 'v1',
    slug: 'yurist-ma-inhouse',
    schedule: '5/2',
    experience: 'from3to5',
    education: ['specialist', 'master'],
    companyIndustry: ['Консалтинг', 'Юридическая фирма'],
    title: 'Юрист M&A, инхаус',
    company: 'Промышленный холдинг',
    companyTagline: 'Промышленный холдинг',
    anonymous: false,
    specialization: ['inhouse'],
    industry: ['corporate'],
    city: 'Москва',
    format: 'hybrid',
    employment: 'full',
    level: 'middle',
    salaryFrom: 250000,
    salaryTo: 350000,
    description:
      'Сопровождение сделок M&A внутри группы компаний: due diligence, структурирование, договорная работа.',
    highlights: [
      { title: 'Крупные сделки', description: 'Сопровождение M&A внутри группы компаний федерального масштаба' },
      { title: 'Due diligence и структурирование', description: 'Полный цикл сделки — от анализа рисков до закрытия' },
      { title: 'Гибридный график', description: 'Часть недели можно работать удаленно' },
      { title: 'Профессиональная среда', description: 'Юридическая команда холдинга с широким спектром практик' },
    ],
    responsibilities: [
      'сопровождать сделки M&A внутри группы компаний;',
      'проводить due diligence;',
      'структурировать сделки и готовить договорную документацию;',
      'взаимодействовать с внешними консультантами и регуляторами.',
    ],
    requirements: ['Опыт от 3 лет в M&A', 'Английский B2+', 'Опыт due diligence'],
    conditions: ['Официальное трудоустройство', 'ДМС', 'Гибридный график'],
    practiceAreas: ['Корпоративное право', 'M&A', 'Due diligence', 'Договорное право'],
    contactPhone: '+7 999 123-45-67',
    contactEmail: 'hr@example.ru',
    companyWebsite: 'legalcareerist.ru',
    companyAddress: 'Москва',
    status: 'open',
    visibilityStage: 'public',
    publishedAt: '2026-08-10',
    urgent: true,
    employerId: 'e1',
    technicalExample: true,
  },
]
