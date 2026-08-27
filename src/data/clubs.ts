import type { CommunityClub } from '../types'

export const clubs: CommunityClub[] = [
  {
    id: 'c1',
    slug: 'klub-korporativnogo-prava',
    name: 'Клуб корпоративного права',
    specialization: ['inhouse', 'consulting'],
    industry: ['corporate'],
    description: 'Обсуждаем сделки M&A, корпоративное управление и карьеру в корпоративной практике.',
    telegramLink: 'https://t.me/example_corporate_club',
    coordinator: 'Анна Светлова',
  },
  {
    id: 'c2',
    slug: 'klub-advokatury',
    name: 'Клуб адвокатуры',
    specialization: ['advocacy'],
    industry: ['disputes'],
    description: 'Для тех, кто готовится к статусу адвоката или уже практикует: разборы дел, менторство.',
    telegramLink: 'https://t.me/example_advocacy_club',
    coordinator: 'Игорь Панов',
  },
  {
    id: 'c3',
    slug: 'klub-nalogovogo-prava',
    name: 'Клуб налогового права',
    specialization: ['consulting'],
    industry: ['tax'],
    description: 'Практикум по налоговым спорам и консультированию — от студентов до практикующих юристов.',
    telegramLink: 'https://t.me/example_tax_club',
    coordinator: 'Мария Крылова',
  },
  {
    id: 'c4',
    slug: 'klub-gossluzhby',
    name: 'Клуб госслужбы и GR',
    specialization: ['government'],
    industry: ['gr'],
    description: 'О карьере в госорганах, кадровом резерве и GR-направлении.',
    telegramLink: 'https://t.me/example_gov_club',
    coordinator: 'Дмитрий Орлов',
  },
]
