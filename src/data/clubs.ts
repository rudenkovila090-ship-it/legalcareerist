import type { CommunityClub } from '../types'

// Ссылка на Telegram-чат клуба (telegramLink) появится у клуба, когда чат реально откроется: до тех пор кнопки «Вступить» на странице клуба нет.

export const clubs: CommunityClub[] = [
  {
    id: 'c2',
    slug: 'klub-advokatury',
    name: 'Клуб адвокатуры',
    specialization: ['advocacy'],
    industry: ['disputes'],
    description: 'Для тех, кто готовится к статусу адвоката или уже практикует: разборы дел, менторство.',
    coordinator: 'Игорь Панов',
  },
  {
    id: 'c3',
    slug: 'klub-nalogovogo-prava',
    name: 'Клуб налогового права',
    specialization: ['consulting'],
    industry: ['tax'],
    description: 'Практикум по налоговым спорам и консультированию — от студентов до практикующих юристов.',
    coordinator: 'Мария Крылова',
  },
  {
    id: 'c4',
    slug: 'klub-gossluzhby',
    name: 'Клуб госслужбы и GR',
    specialization: ['government'],
    industry: ['gr'],
    description: 'О карьере в госорганах, кадровом резерве и GR-направлении.',
    coordinator: 'Дмитрий Орлов',
  },
]
