// Демо единого аккаунта (раздел 5, /account): один пользователь одновременно
// кандидат + участник сообщества — видит отклики, покупки и членство в клубе
// в одном месте без повторной регистрации (критерий приемки, раздел 10).
import type { Application, CommunityMembership, EventRegistration, MaterialPurchase, User } from '../types'

export const demoUser: User = {
  id: 'u_demo',
  roles: ['candidate', 'community_member'],
  name: 'Мария Кузнецова',
  email: 'maria.kuznetsova@example.com',
  phone: '+7 999 123-45-67',
  telegramId: '@maria_law',
  specialization: ['inhouse', 'consulting'],
  industry: ['corporate', 'tax'],
  newsletterOptIn: true,
  registeredAt: '2026-03-14',
}

export const demoApplications: (Application & { vacancyTitle: string })[] = [
  {
    id: 'app1',
    vacancyId: 'v1',
    vacancyTitle: 'Юрист M&A, инхаус',
    candidateId: 'u_demo',
    date: '2026-08-16',
    status: 'in_review',
  },
  {
    id: 'app2',
    vacancyId: 'v3',
    vacancyTitle: 'Юрист, налоговый консалтинг',
    candidateId: 'u_demo',
    date: '2026-08-20',
    status: 'new',
  },
]

export const demoMaterialPurchases: (MaterialPurchase & { materialTitle: string })[] = [
  {
    id: 'mp1',
    materialId: 'm4',
    materialTitle: 'Лонглист «Студенческие юридические мероприятия»',
    userId: 'u_demo',
    date: '2026-07-01',
    paid: true,
    accessUrl: '#',
  },
]

export const demoMemberships: (CommunityMembership & { clubName: string })[] = [
  {
    id: 'mem1',
    userId: 'u_demo',
    tier: 'free',
    joinedAt: '2026-04-02',
    active: true,
    clubName: 'Клуб корпоративного права',
  },
]

export const demoEventRegistrations: (EventRegistration & { eventTitle: string })[] = [
  {
    id: 'reg1',
    eventId: 'ev1',
    userId: 'u_demo',
    status: 'registered',
    eventTitle: 'Вебинар «Карьера в M&A»',
  },
]
