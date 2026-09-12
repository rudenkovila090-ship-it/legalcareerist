import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { employerTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import KnowledgeList from '../KnowledgeList'
import { submitLead } from '../../lib/leads'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const railItems = [
  { id: 'hero', label: 'Обзор' },
  { id: 'about', label: 'О компании' },
  { id: 'value', label: 'Польза' },
  { id: 'cases', label: 'Кейсы' },
  { id: 'advantages', label: 'Преимущества' },
  { id: 'reviews', label: 'Отзывы' },
  { id: 'offer', label: 'Предложение' },
  { id: 'pricing', label: 'Цены' },
  { id: 'faq', label: 'FAQ' },
  { id: 'lead-form', label: 'Заявка' },
]

// Простые линейные иконки — без внешних иконок, только inline SVG.
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}
function IconUserCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16.5 11.5l1.7 1.7 3-3.2" />
    </svg>
  )
}
function IconTag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12.6 3.5H5a1.5 1.5 0 0 0-1.5 1.5v7.6c0 .4.16.78.44 1.06l8.6 8.6c.6.6 1.53.6 2.12 0l6.8-6.8c.6-.6.6-1.53 0-2.12l-8.6-8.6a1.5 1.5 0 0 0-1.06-.44z" />
      <circle cx="8.2" cy="8.2" r="1.3" />
    </svg>
  )
}
function IconContent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3.5" y="4.5" width="17" height="13" rx="1.5" />
      <path d="M7 20h10M9 8.5h6M9 12h6M9 15h3.5" />
    </svg>
  )
}
function IconNetwork() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="6" r="2.3" />
      <circle cx="12" cy="18" r="2.3" />
      <path d="M7.7 7.3L10.5 16M16.3 7.3L13.5 16M8.3 6h7.4" />
    </svg>
  )
}
function IconDatabase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5V18c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5V5.5" />
      <path d="M4.5 11.75c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    </svg>
  )
}
function IconHandshake() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3.5 12.5l3.7-3.7a2 2 0 0 1 2.83 0l1.47 1.47M20.5 12.5l-3.7-3.7a2 2 0 0 0-2.83 0L12.5 10.3" />
      <path d="M7.2 10.8l-3.7 3.7 3 3a2 2 0 0 0 2.83 0l.5-.5M16.8 10.8l3.7 3.7-3 3a2 2 0 0 1-2.83 0l-3.37-3.37a1.5 1.5 0 0 1 0-2.12v0a1.5 1.5 0 0 1 2.12 0l1.25 1.25" />
    </svg>
  )
}
function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="7.5" width="18" height="12" rx="1.8" />
      <path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18M10.5 12.5v1.6h3v-1.6" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5S15.5 15.7 15.5 19" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M16 13.6c2.7.4 4.5 2.3 4.5 5.4" />
    </svg>
  )
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 5.5c1.5-1 4-1.3 6-.5v14c-2-.8-4.5-.5-6 .5v-14z" />
      <path d="M20 5.5c-1.5-1-4-1.3-6-.5v14c2-.8 4.5-.5 6 .5v-14z" />
    </svg>
  )
}
function IconPhoneCall() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M5 4.5h3.5l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.8 19.8 4.2 13.2 3.5 6.1A1.5 1.5 0 0 1 5 4.5z" />
    </svg>
  )
}
function IconCoin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 15c0 1 1 1.7 2.5 1.7s2.5-.6 2.5-1.6c0-2.3-5-1.1-5-3.4 0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6M12 7.5v9" />
    </svg>
  )
}
function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3.5 13.5h5l1.5 2.3h4l1.5-2.3h5" />
      <path d="M4.7 13.2 6.5 6a1.6 1.6 0 0 1 1.6-1.2h7.8A1.6 1.6 0 0 1 17.5 6l1.8 7.2v4.3a1.5 1.5 0 0 1-1.5 1.5H6.2a1.5 1.5 0 0 1-1.5-1.5v-4.3z" />
    </svg>
  )
}
function IconAccountCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 18.5c1.2-2.3 3.4-3.5 6-3.5s4.8 1.2 6 3.5" />
    </svg>
  )
}

const employerTabs = [
  { id: 'recruiting', label: 'Рекрутинг', icon: IconBriefcase },
  { id: 'candidates', label: 'Найти сотрудника', icon: IconUsers },
  { id: 'knowledge', label: 'База знаний', icon: IconBook },
  { id: 'account', label: 'Личный кабинет', icon: IconAccountCircle },
] as const

// Демо-профили кандидатов для вкладки «Кандидаты» — обезличенные карточки,
// контакт открывается за отдельную плату (демо: лид с интересом к анкете).
// Опыт работы — структурированно: место работы + 2-3 обязанности; образование — место обучения + курс.
const candidateTemplates = [
  {
    position: 'Помощник юриста', sphere: 'Корпоративное право', exp: '1 год опыта', salaryFrom: '45 000 ₽',
    workplace: 'ООО «Правовой партнер»', duties: ['Готовил проекты договоров', 'Вел реестр документов', 'Сопровождал due diligence'],
    school: 'МГУ', course: '4 курс',
    skills: ['Договорная работа', 'КонсультантПлюс', 'Английский B2'],
  },
  {
    position: 'Младший юрист', sphere: 'Банкротство', exp: '2 года опыта', salaryFrom: '70 000 ₽',
    workplace: 'АБ «Северная коллегия»', duties: ['Сопровождал процедуры наблюдения', 'Готовил заявления о включении в реестр', 'Взаимодействовал с арбитражным управляющим'],
    school: 'СПбГУ', course: 'выпускник 2024',
    skills: ['Банкротное право', 'Арбитражный процесс', 'Kad.Arbitr'],
  },
  {
    position: 'Секретарь судебного заседания', sphere: 'Процессуальное право', exp: 'без опыта', salaryFrom: '40 000 ₽',
    workplace: 'учебная практика в районном суде', duties: ['Готовил протоколы заседаний', 'Вел делопроизводство'],
    school: 'МГЮА', course: '4 курс',
    skills: ['Делопроизводство', 'ГПК РФ', 'Внимательность к деталям'],
  },
  {
    position: 'Офис-менеджер', sphere: 'Административная поддержка', exp: '3 года опыта', salaryFrom: '55 000 ₽',
    workplace: 'Юридическая фирма «Гарант-Право»', duties: ['Вел документооборот', 'Организовывал встречи', 'Взаимодействовал с клиентами'],
    school: 'МГЮА', course: 'выпускник 2022',
    skills: ['Документооборот', 'MS Office', 'Организация процессов'],
  },
  {
    position: 'Помощник адвоката', sphere: 'Уголовное право', exp: '1 год опыта', salaryFrom: '35 000 ₽',
    workplace: 'Адвокатский кабинет', duties: ['Готовил ходатайства', 'Изучал материалы дел', 'Сопровождал на следственных действиях'],
    school: 'СПбГУ', course: '3 курс',
    skills: ['Уголовный процесс', 'Работа с материалами дела', 'Стрессоустойчивость'],
  },
  {
    position: 'Помощник арбитражного управляющего', sphere: 'Банкротство', exp: '2 года опыта', salaryFrom: '60 000 ₽',
    workplace: 'ООО «Финанс-Право»', duties: ['Вел инвентаризацию имущества', 'Готовил отчетность перед кредиторами', 'Сопровождал торги'],
    school: 'МГУ', course: 'выпускник 2023',
    skills: ['Банкротное право', 'ЕФРСБ', 'Работа с реестром кредиторов'],
  },
  {
    position: 'Помощник нотариуса', sphere: 'Нотариат', exp: '1 год опыта', salaryFrom: '50 000 ₽',
    workplace: 'Нотариальная контора', duties: ['Готовил проекты документов', 'Вел прием посетителей', 'Работал с реестром'],
    school: 'МГЮА', course: '3 курс',
    skills: ['Нотариат', 'Делопроизводство', 'Внимательность'],
  },
  {
    position: 'Бизнес-ассистент', sphere: 'Юридический консалтинг', exp: '2 года опыта', salaryFrom: '55 000 ₽',
    workplace: 'Консалтинговое бюро', duties: ['Организовывал встречи руководителя', 'Готовил отчеты', 'Вел переписку с клиентами'],
    school: 'СПбГУ', course: 'выпускник 2023',
    skills: ['Тайм-менеджмент', 'MS Office', 'Деловая переписка'],
  },
  {
    position: 'Помощник патентного поверенного', sphere: 'Интеллектуальная собственность', exp: '1 год опыта', salaryFrom: '50 000 ₽',
    workplace: 'Патентное бюро', duties: ['Готовил заявки на регистрацию товарных знаков', 'Вел переписку с Роспатентом'],
    school: 'МГУ', course: '4 курс',
    skills: ['Интеллектуальная собственность', 'Роспатент', 'Английский B2'],
  },
  {
    position: 'SMM-специалист', sphere: 'Юридический маркетинг', exp: '1 год опыта', salaryFrom: '45 000 ₽',
    workplace: 'Юридическая фирма «Гарант-Право»', duties: ['Вел социальные сети компании', 'Готовил контент-план', 'Анализировал охваты'],
    school: 'МГЮА', course: '3 курс',
    skills: ['SMM', 'Контент-маркетинг', 'Аналитика'],
  },
]

// Прогрессивная шкала: чем опытнее кандидат, тем дороже открыть его контакт.
function experienceYears(exp: string) {
  if (exp === 'без опыта') return 0
  const n = Number(exp.match(/\d+/)?.[0])
  return Number.isFinite(n) ? n : 0
}
function contactPrice(exp: string) {
  return 1000 + experienceYears(exp) * 500
}
// Стоимость контакта у части кандидатов фиксирована отдельно (не по общей
// прогрессивной шкале от опыта) — например, у кандидата №1.
function candidateContactPrice(c: { exp: string; contactPriceOverride?: number }) {
  return c.contactPriceOverride ?? contactPrice(c.exp)
}

// Скидка за объем — как в конструкторе карьерной консультации, но с другими
// порогами: заявка на подбор контактов нескольких кандидатов сразу выгоднее.
function candidatesTierDiscountPct(count: number): number {
  if (count >= 7) return 10
  if (count >= 3) return 5
  return 0
}

const cities = ['Москва', 'Санкт-Петербург']
const schedules = ['Гибкий', 'Полный']
const employments = ['Полная занятость', 'Частичная занятость', 'Проектная занятость']
const formats: string[] = ['Офис', 'Гибрид', 'Дистанционно']

// Кандидат №1 — реальная анкета (не из общей ротации шаблонов «базы контактов»),
// с фиксированной стоимостью открытия контакта.
const candidateOneOverride = {
  position: 'Помощник адвоката / юрист-стажёр',
  sphere: 'Гражданское и семейное право, арбитражный процесс',
  exp: '2 курс, стажёр',
  city: 'Москва',
  employment: 'Полная занятость / стажировка',
  format: 'Офис/гибрид',
  workplace: 'Помощник в сфере банкротства физических лиц',
  duties: [
    'Поиск и системный анализ судебной практики по банкротным спорам',
    'Подготовка юридических заключений и поручений',
    'Участие в муткортах: арбитражный процесс, семейные споры, банкротство юрлиц',
  ],
  highlights: [
    'Участвовала в подготовке материалов по делам о банкротстве физических лиц',
    'Представляла позицию в учебных арбитражных процессах (муткорты) по спорам о банкротстве юрлиц, семейным и гражданским делам',
    'Проанализировала судебную практику по [N] делам для подготовки правовых позиций',
  ],
  school: 'НИУ ВШЭ',
  course: '2 курс (специализация: гражданское право)',
  skills: ['КонсультантПлюс, Гарант — поиск и анализ судебной практики', 'MS Office (Word, Excel) — подготовка правовых документов', 'Русский — родной, английский'],
  contactPriceOverride: 1500,
}

const demoCandidates = Array.from({ length: 30 }, (_, i) => {
  const t = candidateTemplates[i % candidateTemplates.length]
  return {
    id: i + 1,
    ...t,
    city: cities[i % cities.length],
    schedule: schedules[i % schedules.length],
    employment: employments[(i + 1) % employments.length],
    format: formats[i % formats.length],
    highlights: undefined as string[] | undefined,
    contactPriceOverride: undefined as number | undefined,
  }
}).map((c) => (c.id === 1 ? { ...c, ...candidateOneOverride } : c))

const schools = [
  'МГУ', 'СПбГУ', 'НИУ ВШЭ', 'МГИМО', 'МГЮА', 'РАНХиГС',
  'Финансовый университет', 'РУДН', 'Казанский федеральный университет',
  'РГУП', 'УрГЮУ', 'РПА', 'РЭУ',
]
const positionOptions = Array.from(new Set(candidateTemplates.map((t) => t.position)))
function parseSalary(s: string) {
  return Number(s.replace(/\D/g, '')) || 0
}

const valueProps = [
  { icon: IconClock, title: 'Не тратите время на поиск', text: 'Размещение вакансии, отсев нерелевантных откликов, десятки собеседований — берем на себя.' },
  { icon: IconUserCheck, title: 'Кандидаты уже мотивированы', text: 'Наша база — активное сообщество студентов и выпускников, а не случайные отклики с job-бордов.' },
  { icon: IconTag, title: 'Фиксированная стоимость заранее', text: 'Процент от оклада известен до старта поиска — без скрытых доплат и пересмотра условий на середине пути.' },
]

const kpis = [
  { value: '5,5 дней', label: 'Time to Hire — среднее время закрытия вакансии', group: 'Операционный' },
  { value: '89%', label: 'Конверсия интервью в оффер', group: 'Операционный' },
  { value: '97%', label: 'кандидатов прошло испытательный срок', group: 'Качественный' },
]

const kadryAdvantages = [
  { title: 'Только юридический рынок', text: 'Специализируемся на начинающих и средних специалистах — понимаем их уровень, мотивацию и ожидания.' },
  { title: 'Собственная база 8 000+', text: 'Активное сообщество студентов и выпускников — кандидаты уже мотивированы и готовы к работе.' },
  { title: 'Оплата за результат', text: '30% от одного оклада кандидата: 75% предоплата до начала работ, 25% — после прохождения испытательного срока.' },
  { title: 'Бесплатная замена', text: 'Если кандидат не проходит испытательный срок — подбираем замену бесплатно в согласованные сроки.' },
]

// 8 этапов и документы, которые кандидат/заказчик получает на каждом из них —
// объединены в одну карточку на этап, чтобы не листать вверх-вниз между
// процессом и документами.
const processWithDocs = [
  { title: 'Формирование заказа', description: 'Прием заявки, формирование заказа.', docs: ['Бриф'] },
  { title: 'Согласование работ', description: 'Подписание договора, оплата, согласование вакансии.', docs: ['Договор', 'Счет на оплату', 'Сформированный заказ', 'Вакансия'] },
  { title: 'Представление плана работы', description: 'Аналитика рынка, поиск, скрининг, собеседование — план действий.', docs: ['План работ по поиску сотрудника'] },
  { title: 'Поиск кандидатов', description: 'Закрытое сообщество, кадровый резерв, соцсети, рекомендации, чаты.', docs: ['Еженедельная отчетность'] },
  { title: 'Скрининг и интервью', description: 'Первичный звонок с кандидатом, формирование списка кандидатов.', docs: ['Еженедельная отчетность'] },
  { title: 'Передача кандидата', description: 'В виде карточек с рекомендациями.', docs: ['Кандидаты с резюме'] },
  { title: 'Собеседование', description: 'Ваш финальный выбор — собираем обратную связь, формируем оффер.', docs: ['Рекомендации по собеседованию', 'Оффер и/или отказ кандидату'] },
  { title: 'Испытательный срок', description: '1 месяц, гарантия 1 замены, обратная связь через месяц.', docs: ['План адаптации нового сотрудника', 'Рекомендации по коммуникации', 'Форма обратной связи'] },
]

const marketingChannels = [
  { icon: IconDatabase, title: 'Своя база', text: 'Более 8 000 контактов, кадровый резерв.' },
  { icon: IconContent, title: 'Контент-маркетинг', text: 'Telegram-канал, YouTube, подкаст, ВК и другие соцсети.' },
  { icon: IconHandshake, title: 'Партнерства', text: 'Юридические сообщества и организации, блогеры.' },
  { icon: IconNetwork, title: 'Нетворкинг', text: 'Юридические мероприятия, конференции, форумы, рекомендации коллег и соискателей.' },
]

// То, что достается работодателю вместо наших ресурсов при поиске своими силами —
// показывается вместо marketingChannels, когда переключают маршрут на «Без нас».
const withoutUsDownsides = [
  { icon: IconClock, title: 'Поиск без сроков', text: 'Закрытие вакансии растягивается на недели, а то и месяцы — без гарантий результата.' },
  { icon: IconPhoneCall, title: 'Собеседуете сами', text: 'Все звонки, интервью и переговоры с кандидатами — на вас.' },
  { icon: IconCoin, title: 'Платите за размещение', text: 'Вакансия на джоб-бордах и в соцсетях — платно, и это не гарантирует отклики.' },
  { icon: IconInbox, title: 'Отбираете отклики вручную', text: 'Разбираете десятки нерелевантных резюме, чтобы найти пару подходящих.' },
]

const positions = [
  { title: 'Помощник юриста', salary: 'от 20 000 ₽' },
  { title: 'Помощник адвоката', salary: 'от 20 000 ₽' },
  { title: 'Младший юрист', salary: 'от 60 000 ₽' },
  { title: 'Секретарь', salary: 'от 40 000 ₽' },
  { title: 'Секретарь судебного заседания', salary: 'от 50 000 ₽' },
  { title: 'Секретарь нотариальной конторы', salary: 'от 60 000 ₽' },
  { title: 'Делопроизводитель', salary: 'от 50 000 ₽' },
  { title: 'Помощник патентного поверенного', salary: 'от 50 000 ₽' },
  { title: 'Помощник арбитражного управляющего', salary: 'от 50 000 ₽' },
  { title: 'Офис-менеджер', salary: 'от 50 000 ₽' },
  { title: 'Бизнес-ассистент', salary: 'от 50 000 ₽' },
  { title: 'SMM-специалист', salary: 'от 50 000 ₽' },
]

const cases = [
  { title: 'Младший юрист по строительству', city: 'Санкт-Петербург', salary: '80 000 ₽', days: '2 дня' },
  { title: 'Помощник адвоката по семейным делам', city: 'Москва', salary: '20 000 ₽', days: '3 дня' },
  { title: 'Помощник юриста по банкротству', city: 'Санкт-Петербург', salary: '30 000 ₽', days: '1 день', note: 'рекордный срок' },
  { title: 'Помощник юридического маркетолога', city: undefined, salary: '30 000 ₽', days: '3 дня' },
  { title: 'Помощник адвоката по семейным делам', city: 'Москва', salary: '25 000 ₽', days: '5 дней' },
  { title: 'Помощник арбитражного управляющего', city: 'Санкт-Петербург', salary: '65 000 ₽', days: '7 дней' },
  { title: 'Помощник адвоката по уголовному праву', city: 'Санкт-Петербург', salary: '25 000 ₽', days: '3 дня' },
  { title: 'Секретарь нотариальной конторы', city: 'Санкт-Петербург', salary: '50 000 ₽', days: '3 дня' },
]

const faqItems = [
  { q: 'Сколько стоит подбор сотрудника?', a: '30% от одного месячного оклада кандидата: 75% предоплата до начала работ, 25% — после прохождения испытательного срока. Точную сумму под вашу вакансию покажет калькулятор выше.' },
  { q: 'Можно открыть контакты кандидатов самостоятельно, без заявки?', a: 'Да, во вкладке «Найти сотрудника» — там же фильтры по городу, вузу, занятости, графику, формату и зарплате. Стоимость открытия контакта растет с опытом кандидата: от 1000 ₽ (без опыта) до 2500 ₽ (от 3 лет), после короткой регистрации работодателя.' },
  { q: 'Что если кандидат не подойдет?', a: 'Бесплатно подберем замену в согласованные сроки — это часть условий сотрудничества, а не платная опция.' },
  { q: 'Сколько ждать первых кандидатов?', a: 'Вакансия закрывается за 5–7 дней (Time to Hire — 5,5 дней). Есть кейсы закрытия за 1–3 дня.' },
  { q: 'Кого вы подбираете?', a: 'Помощников юристов и адвокатов, младших юристов, секретарей, офис-менеджеров и смежные административные позиции на юридическом рынке.' },
  { q: 'Где вы берете кандидатов?', a: 'Сначала предлагаем вакансию резидентам нашего Сообщества, затем — кадровому резерву (8 000+ контактов), и только потом размещаем в открытом доступе.' },
  { q: 'Какие документы я получу?', a: 'Договор, план работ, еженедельную отчетность, карточки кандидатов с рекомендациями и план адаптации нового сотрудника — на каждом этапе своя подтверждающая документация.' },
]

// Собственный дропдаун вместо нативного <select> — так список вариантов
// гарантированно раскрывается ниже поля фильтра, а не туда, куда решит браузер.
function FilterSelect({ placeholder, resetLabel, value, options, onChange }: {
  placeholder: string
  resetLabel: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-left text-sm outline-none focus:border-white/40 ${value ? 'text-white' : 'text-white/50'}`}
      >
        <span className="truncate">{value || placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-white/15 bg-ink shadow-xl">
          {value && resetLabel && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="block w-full px-3 py-2 text-left text-sm text-white/50 hover:bg-white/10"
            >
              {resetLabel}
            </button>
          )}
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setOpen(false) }}
              className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const searchGoalOptions = ['Постоянная работа', 'Подработка', 'Проектная занятость', 'Свой вариант']
const CUSTOM_GOAL = 'Свой вариант'

const BASE_RATE = 30

export default function KadryHome() {
  useDocumentTitle('Кадры · Работодателям')
  const [salary, setSalary] = useState(50000)
  const [calcPosition, setCalcPosition] = useState('')
  const [searchGoal, setSearchGoal] = useState(searchGoalOptions[0])
  const [customGoal, setCustomGoal] = useState('')
  const [discountReturning, setDiscountReturning] = useState(false)
  const [discountContact, setDiscountContact] = useState(false)
  // «С нами» / «без нас» — переключатель маршрута ниже (см. секцию «Как мы
  // находим вам сотрудников»): по клику подменяет карточки под схемой.
  const [routeMode, setRouteMode] = useState<'with' | 'without'>('with')

  const discountPct = (discountReturning ? 1.5 : 0) + (discountContact ? 1.5 : 0)
  const rate = BASE_RATE - discountPct
  const baseFee = Math.round(salary * (BASE_RATE / 100))
  const fee = Math.round(salary * (rate / 100))
  const savedByDiscount = baseFee - fee
  const prepay = Math.round(fee * 0.75)
  const afterProbation = fee - prepay
  const goalLabel = searchGoal === CUSTOM_GOAL ? customGoal.trim() || CUSTOM_GOAL : searchGoal

  // «Оформить услугу» — лид-заявка из калькулятора, центрированная модалка.
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [serviceForm, setServiceForm] = useState({ company: '', fio: '', phone: '', email: '', telegram: '' })
  const [serviceSent, setServiceSent] = useState(false)

  function handleServiceSubmit(e: FormEvent) {
    e.preventDefault()
    if (!serviceForm.company.trim() || !serviceForm.fio.trim() || (!serviceForm.phone.trim() && !serviceForm.email.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'service_order',
      name: serviceForm.fio,
      contact: [serviceForm.phone, serviceForm.email, serviceForm.telegram].filter(Boolean).join(' / '),
      interest: [
        serviceForm.company,
        `Кого ищем: ${calcPosition.trim() || 'не указано'}`,
        `Цель поиска: ${goalLabel}`,
        `Заработная плата кандидата: ${salary.toLocaleString('ru-RU')} ₽/мес`,
        `Ставка агентства: ${rate}%${discountPct > 0 ? ` (скидка ${discountPct}%)` : ''}`,
        `Итого: ${fee.toLocaleString('ru-RU')} ₽`,
      ],
    })
    setServiceSent(true)
  }

  const [form, setForm] = useState({ company: '', fio: '', email: '', phone: '', telegram: '', position: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.fio.trim() || (!form.email.trim() && !form.phone.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'employer_request',
      name: form.fio,
      contact: [form.phone, form.email, form.telegram].filter(Boolean).join(' / '),
      interest: [form.company, form.position].filter(Boolean),
    })
    setSent(true)
  }

  const [tab, setTab] = useState<(typeof employerTabs)[number]['id']>('recruiting')
  // При переключении подвкладки (Рекрутинг/Найти сотрудника/База знаний/Личный
  // кабинет) страница должна показывать верх новой вкладки, а не оставаться
  // на прежней позиции скролла — раньше при переходе снизу страницы вниз и
  // оставалось.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])
  const [openCandidates, setOpenCandidates] = useState<Record<number, boolean>>({})
  const [visibleCandidates, setVisibleCandidates] = useState(3)

  // Фильтры вкладки «Найти сотрудника» — пустая строка значит «фильтр не
  // выбран»; подпись поля (Города/Формат/...) — это placeholder, а не
  // отдельный вариант выбора в списке.
  const [fCity, setFCity] = useState('')
  const [fSchool, setFSchool] = useState('')
  const [fEmployment, setFEmployment] = useState('')
  const [fSchedule, setFSchedule] = useState('')
  const [fFormat, setFFormat] = useState('')
  const [fPosition, setFPosition] = useState('')
  const [maxSalary, setMaxSalary] = useState(80000)

  const filteredCandidates = demoCandidates.filter((c) =>
    (!fCity || c.city === fCity) &&
    (!fSchool || c.school === fSchool) &&
    (!fEmployment || c.employment === fEmployment) &&
    (!fSchedule || c.schedule === fSchedule) &&
    (!fFormat || c.format === fFormat) &&
    (!fPosition || c.position === fPosition) &&
    parseSalary(c.salaryFrom) <= maxSalary,
  )

  function toggleCandidate(id: number) {
    setOpenCandidates((s) => ({ ...s, [id]: !s[id] }))
  }

  // Конструктор заявки на контакты — как в карьерной консультации: отмечаете
  // плюсиком нужных кандидатов (можно несколько), скидка растет с объемом,
  // а контакты работодателя оставляются один раз в конце, не на каждого кандидата.
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [requestForm, setRequestForm] = useState({ company: '', contact: '', phone: '', email: '', telegram: '' })
  const [requestSent, setRequestSent] = useState(false)

  function toggleSelect(id: number) {
    setSelectedIds((s) => ({ ...s, [id]: !s[id] }))
  }

  const selectedCandidates = demoCandidates.filter((c) => selectedIds[c.id])
  const selectedCount = selectedCandidates.length
  const candidatesSubtotal = selectedCandidates.reduce((sum, c) => sum + candidateContactPrice(c), 0)
  const candidatesTierPct = candidatesTierDiscountPct(selectedCount)
  const candidatesDiscount = Math.round((candidatesSubtotal * candidatesTierPct) / 100)
  const candidatesTotal = candidatesSubtotal - candidatesDiscount

  function handleRequestSubmit(e: FormEvent) {
    e.preventDefault()
    if (!requestForm.contact.trim() || (!requestForm.phone.trim() && !requestForm.email.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'candidates_selection_request',
      name: requestForm.contact,
      contact: [requestForm.phone, requestForm.email, requestForm.telegram].filter(Boolean).join(' / '),
      interest: [
        requestForm.company,
        ...selectedCandidates.map((c) => `Кандидат №${c.id} — ${c.position}, ${candidateContactPrice(c).toLocaleString('ru-RU')} ₽`),
        candidatesTierPct > 0 ? `Скидка ${candidatesTierPct}%` : '',
        `Итого: ${candidatesTotal.toLocaleString('ru-RU')} ₽`,
      ].filter(Boolean),
    })
    setRequestSent(true)
  }

  return (
    <div className="bg-ink text-white">
      {tab === 'recruiting' && <SectionRail items={railItems} dark />}

      {/* Вкладки раздела: рекрутинг / кандидаты / база знаний / личный кабинет.
          Закреплены (sticky), остаются на экране при скролле. top-16 —
          сразу под шапкой сайта (h-16). */}
      <div className="sticky top-16 z-20 border-b border-white/10 bg-ink/95 py-3 backdrop-blur-xl [transform:translateZ(0)] [will-change:transform]">
        <div className="container-page">
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">Работодателям</span>
          {/* Без flex-wrap — высота панели всегда постоянна, при нехватке
              ширины вкладки скроллятся по горизонтали, а не переносятся. */}
          <div className="flex justify-end gap-2 overflow-x-auto">
          {employerTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                tab === t.id ? 'bg-white text-ink' : 'border border-white/25 text-white/70 hover:text-white'
              }`}
            >
              <t.icon />
              {t.label}
            </button>
          ))}
          </div>
        </div>
        </div>
      </div>

      {tab === 'recruiting' && (
        <div id="hero">
          <PageHero
            dark
            eyebrow="Кадровое юридическое агентство"
            title="Находим сотрудников для юридических фирм — без лишних собеседований и потраченного времени"
            description="Подбор помощников, младших юристов, офис-менеджеров — быстро и точно."
          />
        </div>
      )}

      {tab === 'candidates' && (
        <section className="container-page pb-16">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Найти сотрудника</div>
          <h2 className="mb-6 text-2xl font-semibold text-white">Свежие анкеты из кадрового резерва</h2>

          <div className="glass-dark mb-6 grid gap-3 rounded-xl p-5 sm:grid-cols-3 lg:grid-cols-6">
            <FilterSelect placeholder="Город" resetLabel="Все города" value={fCity} options={cities} onChange={setFCity} />
            <FilterSelect placeholder="Учебное заведение" resetLabel="Любое учебное заведение" value={fSchool} options={schools} onChange={setFSchool} />
            <FilterSelect placeholder="Занятость" resetLabel="Любая занятость" value={fEmployment} options={employments} onChange={setFEmployment} />
            <FilterSelect placeholder="График" resetLabel="Любой график" value={fSchedule} options={schedules} onChange={setFSchedule} />
            <FilterSelect placeholder="Формат" resetLabel="Любой формат" value={fFormat} options={formats} onChange={setFFormat} />
            <FilterSelect placeholder="Должности" resetLabel="Все должности" value={fPosition} options={positionOptions} onChange={setFPosition} />
            <label className="sm:col-span-3 lg:col-span-6 text-sm text-white/70">
              Зарплатные ожидания — до {maxSalary.toLocaleString('ru-RU')} ₽
              <input
                type="range"
                min={20000}
                max={150000}
                step={5000}
                value={maxSalary}
                onChange={(e) => setMaxSalary(Number(e.target.value))}
                className="mt-2 w-full accent-gold-light"
              />
            </label>
          </div>

          <p className="mb-4 text-sm text-white/50">
            Показано {Math.min(visibleCandidates, filteredCandidates.length)} из {filteredCandidates.length} анкет
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            {filteredCandidates.slice(0, visibleCandidates).map((c) => {
              const isOpen = !!openCandidates[c.id]
              const isSelected = !!selectedIds[c.id]
              return (
                <div key={c.id} className={`glass-dark relative flex flex-col rounded-xl p-5 transition-colors ${isSelected ? 'ring-2 ring-gold-light' : ''}`}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(c.id)}
                    aria-label={isSelected ? 'Убрать из заявки' : 'Добавить в заявку'}
                    className={`absolute right-4 top-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                      isSelected ? 'bg-gold-light text-ink' : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {isSelected ? '✓' : '+'}
                  </button>

                  {/* Номер закреплен за id кандидата, а не за позицией в
                      отфильтрованном списке — иначе при смене фильтров
                      «Кандидат №2» указывал бы то на одного, то на другого. */}
                  <div className="pr-10 text-xs font-semibold uppercase tracking-wide text-gold-light">Кандидат №{c.id}</div>
                  <div className="mt-1 pr-10 font-semibold text-white">{c.position}</div>
                  <div className="mt-1 text-sm text-white/60">Сфера: {c.sphere}</div>
                  <div className="mt-1 text-sm text-white/60">Опыт: {c.exp}</div>
                  <div className="mt-1 text-sm text-white/40">{c.city} · от {c.salaryFrom}</div>
                  <div className="mt-1 text-sm text-white/40">{c.school}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[c.schedule, c.employment, c.format].map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">{tag}</span>
                    ))}
                  </div>

                  <div className="mt-3 text-sm font-semibold text-gold-light">Контакт — {candidateContactPrice(c).toLocaleString('ru-RU')} ₽</div>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
                      {c.highlights && (
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-white/40">Ключевые результаты</div>
                          <ul className="mt-1 space-y-0.5 text-white/60">
                            {c.highlights.map((h) => <li key={h}>· {h}</li>)}
                          </ul>
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-white/40">Опыт работы</div>
                        <p className="mt-1 text-white/70">{c.workplace}</p>
                        <ul className="mt-1 space-y-0.5 text-white/60">
                          {c.duties.map((d) => <li key={d}>· {d}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-white/40">Образование</div>
                        <p className="mt-1 text-white/70">{c.school}, {c.course}</p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-white/40">Навыки</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {c.skills.map((s) => (
                            <span key={s} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => toggleCandidate(c.id)}
                    className="mt-4 text-sm font-medium text-gold-light hover:text-white"
                  >
                    {isOpen ? 'Свернуть' : 'Подробнее'}
                  </button>
                </div>
              )
            })}
          </div>
          {visibleCandidates < filteredCandidates.length && (
            <button
              type="button"
              onClick={() => setVisibleCandidates((v) => Math.min(v + 3, filteredCandidates.length))}
              className="mt-6 rounded-full border border-white/25 px-6 py-2.5 text-sm font-semibold text-white/70 hover:text-white"
            >
              Посмотреть еще кандидатов
            </button>
          )}

          {selectedCount >= 3 && (
            <p className="mt-4 text-sm text-gold-light">
              {selectedCount >= 7 ? 'Скидка 10% за 7 и более кандидатов в заявке.' : 'Скидка 5% за 3 и более кандидатов в заявке — от 7 скидка 10%.'}
            </p>
          )}
        </section>
      )}

      {/* Плавающая корзина выбранных кандидатов — как в конструкторе карьерной
          консультации: плюсик на карточке добавляет кандидата в заявку,
          скидка растет с количеством, контакты работодателя — один раз в конце. */}
      {tab === 'candidates' && selectedCount > 0 && !requestModalOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
          {cartOpen && (
            <div className="w-80 max-w-[calc(100vw-3rem)] rounded-2xl border border-white/10 bg-ink p-5 text-white shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Ваша заявка</h3>
                <button type="button" onClick={() => setCartOpen(false)} className="text-white/40 hover:text-white" aria-label="Свернуть">✕</button>
              </div>
              <ul className="mb-3 max-h-48 space-y-2 overflow-y-auto text-sm">
                {selectedCandidates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="text-white/70">Кандидат №{c.id} — {c.position}</span>
                    <span className="shrink-0">{candidateContactPrice(c).toLocaleString('ru-RU')} ₽</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t border-white/10 pt-3 text-sm">
                <div className="flex justify-between text-white/60">
                  <span>Сумма</span>
                  <span>{candidatesSubtotal.toLocaleString('ru-RU')} ₽</span>
                </div>
                {candidatesDiscount > 0 && (
                  <div className="flex justify-between text-white/60">
                    <span>Скидка {candidatesTierPct}%</span>
                    <span>−{candidatesDiscount.toLocaleString('ru-RU')} ₽</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-semibold text-white">
                  <span>Итого</span>
                  <span>{candidatesTotal.toLocaleString('ru-RU')} ₽</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCartOpen(false)
                  setRequestModalOpen(true)
                }}
                className="mt-4 w-full rounded-full bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
              >
                Оставить заявку
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCartOpen((v) => !v)}
            className="glass-dark flex items-center gap-4 rounded-full bg-ink px-7 py-4 text-white shadow-xl"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-light text-sm font-bold text-ink">{selectedCount}</span>
            <span className="text-base font-semibold">{candidatesTotal.toLocaleString('ru-RU')} ₽</span>
          </button>
        </div>
      )}

      {/* Модалка заявки на выбранных кандидатов */}
      {requestModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRequestModalOpen(false)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            {requestSent ? (
              <div className="py-4 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                </div>
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-2 text-sm text-ink/60">Мы свяжемся с вами, чтобы согласовать оплату и передать контакты кандидатов.</p>
                <button
                  type="button"
                  onClick={() => {
                    setRequestModalOpen(false)
                    setRequestSent(false)
                    setSelectedIds({})
                    setRequestForm({ company: '', contact: '', phone: '', email: '', telegram: '' })
                  }}
                  className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Заявка на кандидатов</h3>
                  <button type="button" onClick={() => setRequestModalOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
                </div>
                <div className="mb-5 flex items-center justify-between rounded-lg bg-ink/[0.04] px-4 py-3 text-sm">
                  <span className="text-ink/60">{selectedCount} {selectedCount === 1 ? 'кандидат' : 'кандидата'} в заявке</span>
                  <span className="text-base font-semibold text-ink">{candidatesTotal.toLocaleString('ru-RU')} ₽</span>
                </div>
                <form onSubmit={handleRequestSubmit} className="grid gap-3">
                  <input
                    value={requestForm.company}
                    onChange={(e) => setRequestForm((f) => ({ ...f, company: e.target.value }))}
                    placeholder="Компания"
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    value={requestForm.contact}
                    onChange={(e) => setRequestForm((f) => ({ ...f, contact: e.target.value }))}
                    placeholder="ФИО"
                    required
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="tel"
                      value={requestForm.phone}
                      onChange={(e) => setRequestForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="Номер телефона"
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                    <input
                      type="email"
                      value={requestForm.email}
                      onChange={(e) => setRequestForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Почта"
                      className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                    />
                  </div>
                  <input
                    value={requestForm.telegram}
                    onChange={(e) => setRequestForm((f) => ({ ...f, telegram: e.target.value }))}
                    placeholder="Telegram"
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90">
                    Оставить заявку
                  </button>
                  <p className="text-xs text-ink/50">Нажимая «Оставить заявку», вы соглашаетесь на обработку персональных данных.</p>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'knowledge' && (
        <section className="container-page pb-16">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">База знаний</div>
          <h2 className="mb-6 text-2xl font-semibold text-white">Гайды, чек-листы, инструкции и статьи по подбору</h2>
          <div className="rounded-2xl bg-white p-2 text-ink">
            <KnowledgeList
              audience="employers"
              eyebrow="Кадры · Работодателям"
              title="База знаний"
              compact
            />
          </div>
        </section>
      )}

      {tab === 'account' && (
        <section className="container-page pb-16">
          <div className="glass-dark rounded-2xl p-8 text-center">
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Личный кабинет</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Заявки, статусы и документы в одном месте</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
              Сквозной личный кабинет для работодателей и соискателей — демо-каркас раздела.
            </p>
            <Link to="/account" className="mt-5 inline-block rounded-full bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink hover:opacity-90">
              Перейти в личный кабинет
            </Link>
          </div>
        </section>
      )}

      {tab === 'recruiting' && (
      <>

      {/* О компании — сравнение с обычным рекрутером, намеренно другая
          визуальная форма (таблица «против»), чтобы не повторять карточки
          «Чем мы отличаемся» ниже. */}
      <section id="about" className="border-y border-white/10 py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">О компании</div>
          {/* Контент раздела уточняется — временно пусто по просьбе клиента. */}
          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/30">
            Раздел «О компании» — наполнение уточняется
          </div>
        </div>
      </section>

      {/* Польза */}
      <section id="value" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">В чем наша польза</div>
        <h2 className="mb-6 text-2xl font-semibold text-white">Что вы получаете, работая с нами</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {valueProps.map((v) => (
            <div key={v.title} className="glass-dark flex gap-3 rounded-xl p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-light/30 text-white">
                <v.icon />
              </div>
              <div>
                <div className="font-semibold text-white">{v.title}</div>
                <p className="mt-1 text-sm text-white/60">{v.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Кейсы и результаты */}
      <section id="cases" className="border-y border-white/10 py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Кейсы и результаты</div>
          <h2 className="mb-6 text-2xl font-semibold text-white">Наши закрытые вакансии</h2>
          <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((c, i) => (
              <div key={`${c.title}-${i}`} className="glass-dark rounded-xl p-4">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Закрыто</span>
                  <span className="text-[11px] text-white/35">за {c.days}</span>
                  {c.note && (
                    <span className="rounded-full bg-gold-light/20 px-2 py-0.5 text-[11px] font-semibold text-gold-light">{c.note}</span>
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold leading-snug text-white">{c.title}</div>
                <div className="mt-1 text-xs text-white/50">{c.city ?? 'Удаленно / любой город'} · {c.salary}</div>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-8 max-w-3xl text-center">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/50">Ключевые показатели (KPI)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {kpis.map((k) => (
                <div key={k.label} className="glass-dark rounded-xl p-5 text-center text-white">
                  <div className="text-xs uppercase tracking-wide text-white/40">{k.group}</div>
                  <div className="mt-1 text-2xl font-semibold text-gold-light">{k.value}</div>
                  <div className="mt-1 text-sm text-white/60">{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Преимущества и выгоды */}
      <section id="advantages" className="container-page py-12">
        <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Преимущества и выгоды</div>
        <h2 className="mb-6 text-2xl font-semibold text-white">Чем мы отличаемся</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {kadryAdvantages.map((a) => (
            <div key={a.title} className="glass-dark rounded-xl p-5">
              <div className="font-semibold text-white">{a.title}</div>
              <p className="mt-1 text-sm text-white/60">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Отзывы (компактнее, чем на других страницах) */}
      <div id="reviews">
        <Testimonials items={employerTestimonials} compact dark />
      </div>

      {/* Что мы предлагаем */}
      <section id="offer" className="py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Что мы предлагаем</div>
          <h2 className="mb-6 text-2xl font-semibold text-white">Закрываем следующие позиции</h2>
          <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((p) => (
              <div key={p.title} className="rounded-lg bg-white/10 px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="truncate font-medium text-white">{p.title}</span>
                  <span className="shrink-0 text-white/50">{p.salary}</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="mb-2 mt-12 text-xl font-semibold text-white">Как мы работаем</h3>
          <p className="mb-6 text-sm text-white/60">8 этапов от заявки до выхода сотрудника — с документами, которые вы получаете на каждом из них.</p>
          <ol className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            {processWithDocs.map((step, i) => (
              <li key={step.title} className="glass-dark rounded-xl p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-light/30 text-sm font-semibold text-white">
                    {i + 1}
                  </div>
                  <div className="font-semibold text-white">{step.title}</div>
                </div>
                <p className="mt-2 text-sm text-white/60">{step.description}</p>
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold-light">Документы, которые вы получаете</div>
                  <ul className="space-y-0.5 text-sm text-white/70">
                    {step.docs.map((d) => <li key={d}>· {d}</li>)}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          <h3 className="mb-2 mt-14 text-xl font-semibold text-white">Как мы находим вам сотрудников</h3>
          <p className="mb-8 text-sm text-white/60">
            Мы — кадровое агентство: выстраиваем короткий прямой маршрут от заявки до найма. Без агентства тот же путь
            обычно длиннее и дороже — собственный поиск петляет между площадками, откликами и собеседованиями.
          </p>

          <div className="mx-auto max-w-3xl">
            <div className="relative h-40 w-full sm:h-48">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                <defs>
                  <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Без нас — запутанный клубок у каждого конца маршрута (там, где
                    без агентства теряется больше всего времени — на старте и на
                    финальном отборе), сплошная жирная серая линия, не пунктир.
                    Кликабельна — увеличенная прозрачная область поверх облегчает
                    попадание пальцем/курсором. */}
                <path
                  d="M4,20 C2,7 15,3 14,15 C13,25 2,24 22,17 L74,15 C82,25 96,27 90,13 C88,7 92,5 96,20"
                  fill="none"
                  stroke="transparent"
                  strokeWidth="7"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setRouteMode('without')}
                />
                <path
                  d="M4,20 C2,7 15,3 14,15 C13,25 2,24 22,17 L74,15 C82,25 96,27 90,13 C88,7 92,5 96,20"
                  fill="none"
                  stroke={routeMode === 'without' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.32)'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="pointer-events-none transition-colors"
                />

                {/* С нами — короткий прямой маршрут, подсвечен и анимирован */}
                <path
                  d="M 4 20 L 50 19 L 96 20"
                  fill="none"
                  stroke="rgba(111,147,196,0.18)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setRouteMode('with')}
                />
                <path
                  className="route-build pointer-events-none"
                  d="M 4 20 L 50 19 L 96 20"
                  pathLength={100}
                  fill="none"
                  stroke="#5ea1ff"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  filter="url(#route-glow)"
                />
              </svg>

              {/* Бегущая точка — обычный HTML-круг поверх SVG, не искажается
                  неравномерным масштабированием viewBox (preserveAspectRatio="none"). */}
              <div
                className="route-dot pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_2px_rgba(234,242,255,0.8)]"
                style={{ top: '49%' }}
              />

              <div className="glass-dark absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white" style={{ left: '4%', top: '50%' }}>
                <IconBriefcase />
              </div>
              <div className="route-endpoint-glow glass-dark absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white" style={{ left: '96%', top: '50%' }}>
                <IconUserCheck />
              </div>

              {/* Подписи — центрированы точно под своей иконкой */}
              <div className="absolute w-28 -translate-x-1/2 text-center text-[11px] text-white/50" style={{ left: '4%', top: '78%' }}>
                Заявка от работодателя
              </div>
              <div className="absolute w-28 -translate-x-1/2 text-center text-[11px] text-white/50" style={{ left: '96%', top: '78%' }}>
                Кандидат найден
              </div>
            </div>

            {/* Сравнение сроков — как выбор маршрута на карте: свой вариант подсвечен,
                клик по любому переключает и путь на схеме выше, и карточки под ней. */}
            <div className="mb-8 mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setRouteMode('with')}
                className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-left transition-colors ${
                  routeMode === 'with' ? 'bg-gold-light text-ink' : 'border border-white/15 text-white/50 hover:text-white'
                }`}
              >
                <IconClock />
                <div>
                  <div className="text-xs font-medium opacity-70">С Карьерным юристом</div>
                  <div className="text-sm font-bold">5–7 дней</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRouteMode('without')}
                className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-left transition-colors ${
                  routeMode === 'without' ? 'border border-white/25 bg-white/10 text-white' : 'border border-white/15 text-white/40 hover:text-white/70'
                }`}
              >
                <IconClock />
                <div>
                  <div className="text-xs font-medium opacity-70">Без нас</div>
                  <div className="text-sm font-bold">недели, а то и месяцы</div>
                </div>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {(routeMode === 'with' ? marketingChannels : withoutUsDownsides).map((m, i) => (
                <div key={m.title} className="text-center">
                  <div className="mx-auto mb-2 h-1.5 w-1.5 rounded-full bg-gold-light" />
                  <div
                    className={`glass-dark h-full rounded-xl p-3 text-center ${routeMode === 'with' ? 'route-pulse' : ''}`}
                    style={routeMode === 'with' ? { animationDelay: `${i * 1.75}s` } : undefined}
                  >
                    <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-gold-light/30 text-white">
                      <m.icon />
                    </div>
                    <div className="text-xs font-semibold text-white">{m.title}</div>
                    <p className="mt-1 text-[11px] leading-snug text-white/50">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Цены */}
      <section id="pricing" className="border-y border-white/10 py-12">
        <div className="container-page">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold-light">Цены</div>
          <h2 className="mb-2 text-2xl font-semibold text-white">Прозрачная система оплаты и гарантий</h2>
          <p className="mb-8 max-w-2xl text-sm text-white/60">
            Заполните параметры вакансии — рассчитаем точную стоимость подбора и оставите заявку, чтобы мы связались с вами.
          </p>

          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            {/* Ввод параметров */}
            <div className="glass-dark rounded-2xl p-6">
              <ul className="mb-6 space-y-3 text-sm text-white/70">
                <li><strong className="text-white">Оплата за результат</strong> — 75% предоплата до начала работ, 25% после прохождения испытательного срока.</li>
                <li><strong className="text-white">Бесплатная замена</strong> — если кандидат не проходит испытательный срок, подбираем замену бесплатно в согласованные сроки.</li>
                <li><strong className="text-white">Прозрачная отчетность</strong> — регулярно сообщаем о ходе поиска; если подходящих кандидатов нет — честно предупреждаем.</li>
              </ul>

              <div className="grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-white">
                  Кого ищем
                  <input
                    value={calcPosition}
                    onChange={(e) => setCalcPosition(e.target.value)}
                    placeholder="Например, юрист-стажёр"
                    className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-normal text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                </label>

                <label className="block text-sm font-semibold text-white">
                  Цель поиска
                  <FilterSelect
                    placeholder="Выберите цель"
                    resetLabel=""
                    value={searchGoal}
                    options={searchGoalOptions}
                    onChange={(v) => setSearchGoal(v || searchGoalOptions[0])}
                  />
                  {searchGoal === CUSTOM_GOAL && (
                    <input
                      value={customGoal}
                      onChange={(e) => setCustomGoal(e.target.value)}
                      placeholder="Опишите цель поиска"
                      className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-normal text-white outline-none placeholder:text-white/40 focus:border-white/40"
                    />
                  )}
                </label>
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <label className="text-sm font-semibold text-white" htmlFor="calc-salary">Заработная плата, ₽/мес</label>
                <input
                  id="calc-salary"
                  type="range"
                  min={20000}
                  max={150000}
                  step={5000}
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                  className="mt-3 w-full accent-gold-light"
                />
                {/* Свою сумму можно ввести напрямую — не только ползунком, диапазон
                    ползунка (20 000–150 000) не ограничивает то, что можно вписать. */}
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={salary}
                    onChange={(e) => setSalary(Math.max(0, Number(e.target.value) || 0))}
                    className="w-32 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-base font-medium text-white outline-none focus:border-white/40"
                  />
                  <span className="text-sm text-white/50">₽/мес</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/40">
                  Сумма, которую компания готова предложить сотруднику в месяц.
                </p>
              </div>

              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="mb-1 text-sm font-semibold text-white">Услуги, влияющие на ставку</div>
                <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-white/10 py-3">
                  <span className="text-sm text-white/80">Ранее обращались за поиском сотрудника</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-white/50">−1,5%</span>
                    <span className="relative inline-block h-5 w-9">
                      <input
                        type="checkbox"
                        checked={discountReturning}
                        onChange={(e) => setDiscountReturning(e.target.checked)}
                        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
                      />
                      <span className={`pointer-events-none absolute inset-0 rounded-full transition-colors ${discountReturning ? 'bg-gold-light' : 'bg-white/15'}`} />
                      <span className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${discountReturning ? 'translate-x-4' : ''}`} />
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 py-3">
                  <span className="text-sm text-white/80">Покупали контакт сотрудника</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-white/50">−1,5%</span>
                    <span className="relative inline-block h-5 w-9">
                      <input
                        type="checkbox"
                        checked={discountContact}
                        onChange={(e) => setDiscountContact(e.target.checked)}
                        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
                      />
                      <span className={`pointer-events-none absolute inset-0 rounded-full transition-colors ${discountContact ? 'bg-gold-light' : 'bg-white/15'}`} />
                      <span className={`pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${discountContact ? 'translate-x-4' : ''}`} />
                    </span>
                  </span>
                </label>
                <p className="mt-3 text-xs text-white/30">
                  Не является публичной офертой. Ставка рассчитывается индивидуально в пределах диапазона.
                </p>
              </div>
            </div>

            {/* Результат — персональные условия */}
            <div className="glass-dark mx-auto w-full max-w-sm rounded-2xl p-6">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-gold-light">Калькулятор рекрутинга</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                  <div className="text-xs text-white/50">Ставка агентства</div>
                  <div className="mt-0.5 text-xl font-bold text-white">
                    {discountPct > 0 && <span className="mr-1.5 text-sm font-normal text-white/40 line-through">{BASE_RATE}%</span>}
                    {rate}%
                  </div>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 p-3">
                  <div className="text-xs text-white/50">Комиссия за подбор</div>
                  <div className="mt-0.5 text-xl font-bold text-white">{fee.toLocaleString('ru-RU')} ₽</div>
                </div>
              </div>

              {discountPct > 0 && (
                <div className="mt-3 rounded-lg bg-emerald-400/15 px-3 py-2 text-xs font-medium text-emerald-300">
                  Скидка {discountPct}% уже учтена — экономите {savedByDiscount.toLocaleString('ru-RU')} ₽
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 items-stretch gap-2.5">
                <div className="flex flex-col rounded-xl border border-white/15 bg-white/10 p-3 text-white">
                  <div className="text-xs text-white/60">75% предоплата</div>
                  <div className="mt-auto pt-0.5 text-xl font-bold text-white">{prepay.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="flex flex-col rounded-xl border border-white/15 bg-white/10 p-3 text-white">
                  <div className="text-[11px] leading-snug text-white/60">25% после испытательного срока</div>
                  <div className="mt-auto pt-0.5 text-xl font-bold text-white">{afterProbation.toLocaleString('ru-RU')} ₽</div>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-xs uppercase tracking-wide text-white/50">Итого к оплате за подбор</div>
                <div className="mt-0.5 text-3xl font-bold text-white">{fee.toLocaleString('ru-RU')} ₽</div>
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(true)}
                  className="mt-4 w-full rounded-lg bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
                >
                  Подать заявку
                </button>
                <p className="mt-3 text-[11px] text-white/30">Не является публичной офертой.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <div id="faq">
        <FAQSection items={faqItems} title="Вопросы работодателей" dark />
      </div>

      {/* Найти сотрудника — объединенный яркий CTA-блок с формой */}
      <section id="lead-form" className="scroll-mt-16 bg-ink py-16 text-white">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Найти сотрудника</div>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Расскажите о вакансии — запустим поиск уже сегодня</h2>
            <p className="mt-4 max-w-md text-white/60">
              Опишите, кого ищете — свяжемся, обсудим бриф и условия. Первая подборка кандидатов —
              обычно в течение 5–7 дней.
            </p>
          </div>

          <div className="glass-dark rounded-2xl p-8">
            {sent ? (
              <div className="rounded-xl bg-emerald-400/10 p-6 text-emerald-200">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm">Мы свяжемся с вами в ближайшее время.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    placeholder="Компания"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    value={form.fio}
                    onChange={(e) => setForm((f) => ({ ...f, fio: e.target.value }))}
                    placeholder="ФИО"
                    required
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    value={form.telegram}
                    onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                    placeholder="Telegram"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="Кого ищем"
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-gold-light py-3.5 text-sm font-semibold text-ink hover:opacity-90"
                >
                  Найти сотрудника
                </button>
                <p className="text-xs text-white/40">Нажимая «Найти сотрудника», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Модалка «Оформить услугу» — центрированная лид-заявка из калькулятора */}
      {serviceModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setServiceModalOpen(false)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 text-ink sm:rounded-2xl sm:p-8">
            {serviceSent ? (
              <div className="py-4 text-center">
                <div className="mb-3 flex justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
                </div>
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-2 text-sm text-ink/60">Мы свяжемся с вами, чтобы согласовать детали и запустить поиск.</p>
                <button
                  type="button"
                  onClick={() => {
                    setServiceModalOpen(false)
                    setServiceSent(false)
                    setServiceForm({ company: '', fio: '', phone: '', email: '', telegram: '' })
                  }}
                  className="mt-6 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Ваш заказ</h3>
                  <button type="button" onClick={() => setServiceModalOpen(false)} className="text-ink/40 hover:text-ink" aria-label="Закрыть">✕</button>
                </div>
                <div className="mb-5 space-y-1 rounded-lg bg-ink/[0.04] px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink/60">{calcPosition.trim() || 'Кого ищем не указано'} · {goalLabel}</span>
                    <span className="text-base font-semibold text-ink">{fee.toLocaleString('ru-RU')} ₽</span>
                  </div>
                  <div className="text-xs text-ink/50">
                    Зарплата {salary.toLocaleString('ru-RU')} ₽/мес · ставка {rate}%
                    {discountPct > 0 && ` (скидка ${discountPct}%)`}
                  </div>
                </div>
                <form onSubmit={handleServiceSubmit} className="grid gap-3">
                  <input
                    value={serviceForm.company}
                    onChange={(e) => setServiceForm((f) => ({ ...f, company: e.target.value }))}
                    placeholder="Компания"
                    required
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    value={serviceForm.fio}
                    onChange={(e) => setServiceForm((f) => ({ ...f, fio: e.target.value }))}
                    placeholder="ФИО"
                    required
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    type="tel"
                    value={serviceForm.phone}
                    onChange={(e) => setServiceForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    type="email"
                    value={serviceForm.email}
                    onChange={(e) => setServiceForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <input
                    value={serviceForm.telegram}
                    onChange={(e) => setServiceForm((f) => ({ ...f, telegram: e.target.value }))}
                    placeholder="Telegram"
                    className="rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
                  />
                  <button type="submit" className="rounded-full bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink/90">
                    Отправить заявку
                  </button>
                  <p className="text-xs text-ink/50">Нажимая «Отправить заявку», вы соглашаетесь на обработку персональных данных.</p>
                </form>
              </>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
