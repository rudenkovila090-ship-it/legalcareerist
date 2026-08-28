import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { employerTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import SectionRail from '../../components/SectionRail'
import KnowledgeList from '../KnowledgeList'
import { submitLead } from '../../lib/leads'

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

const cities = ['Москва', 'Санкт-Петербург']
const schedules = ['Гибкий график', 'Полный день']
const employments = ['Частичная занятость', 'Полная занятость']
const formats: string[] = ['Офис', 'Гибрид', 'Дистанционно']

const demoCandidates = Array.from({ length: 30 }, (_, i) => {
  const t = candidateTemplates[i % candidateTemplates.length]
  return {
    id: i + 1,
    ...t,
    city: cities[i % cities.length],
    schedule: schedules[i % schedules.length],
    employment: employments[(i + 1) % employments.length],
    format: formats[i % formats.length],
  }
})

const schools = ['МГУ', 'СПбГУ', 'МГЮА']
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
  { value: '100%', label: 'Доля кандидатов, прошедших испытательный срок', group: 'Качественный' },
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
  { icon: IconContent, title: 'Контент-маркетинг', text: 'Telegram-канал, YouTube, подкаст, ВК и другие соцсети.' },
  { icon: IconNetwork, title: 'Нетворкинг', text: 'Юридические мероприятия, конференции, форумы, рекомендации коллег и соискателей.' },
  { icon: IconDatabase, title: 'Своя база', text: 'Более 8 000 контактов, кадровый резерв.' },
  { icon: IconHandshake, title: 'Партнерства', text: 'Юридические сообщества и организации, блогеры.' },
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
  { q: 'Можно открыть контакты кандидатов самостоятельно, без заявки?', a: 'Да, во вкладке «Найти сотрудника» — там же фильтры по городу, вузу, занятости, графику, формату и зарплате. Контакт конкретного кандидата открывается за 2000 ₽ после короткой регистрации работодателя.' },
  { q: 'Что если кандидат не подойдет?', a: 'Бесплатно подберем замену в согласованные сроки — это часть условий сотрудничества, а не платная опция.' },
  { q: 'Сколько ждать первых кандидатов?', a: 'В среднем вакансия закрывается за 5–7 дней (Time to Hire — 5,5 дней). Есть кейсы закрытия за 1–3 дня.' },
  { q: 'Кого вы подбираете?', a: 'Помощников юристов и адвокатов, младших юристов, секретарей, офис-менеджеров и смежные административные позиции на юридическом рынке.' },
  { q: 'Где вы берете кандидатов?', a: 'Сначала предлагаем вакансию резидентам нашего Сообщества, затем — кадровому резерву (8 000+ контактов), и только потом размещаем в открытом доступе.' },
  { q: 'Какие документы я получу?', a: 'Договор, план работ, еженедельную отчетность, карточки кандидатов с рекомендациями и план адаптации нового сотрудника — на каждом этапе своя подтверждающая документация.' },
]

export default function KadryHome() {
  const [salary, setSalary] = useState(50000)
  const fee = Math.round(salary * 0.3)
  const prepay = Math.round(fee * 0.75)
  const afterProbation = fee - prepay

  const [form, setForm] = useState({ name: '', email: '', phone: '', position: '' })
  const [sent, setSent] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || (!form.email.trim() && !form.phone.trim())) return
    submitLead({
      sourceBlock: 'kadry',
      formType: 'employer_request',
      name: form.name,
      contact: [form.email, form.phone].filter(Boolean).join(' / '),
      interest: form.position ? [form.position] : [],
    })
    setSent(true)
  }

  const [tab, setTab] = useState<(typeof employerTabs)[number]['id']>('recruiting')
  const [openCandidates, setOpenCandidates] = useState<Record<number, boolean>>({})
  const [unlocked, setUnlocked] = useState<Record<number, boolean>>({})
  const [visibleCandidates, setVisibleCandidates] = useState(3)

  // Фильтры вкладки «Найти сотрудника»
  const [fCity, setFCity] = useState('Все города')
  const [fSchool, setFSchool] = useState('Все вузы')
  const [fEmployment, setFEmployment] = useState('Любая занятость')
  const [fSchedule, setFSchedule] = useState('Любой график')
  const [fFormat, setFFormat] = useState('Любой формат')
  const [fPosition, setFPosition] = useState('Все должности')
  const [maxSalary, setMaxSalary] = useState(80000)

  const filteredCandidates = demoCandidates.filter((c) =>
    (fCity === 'Все города' || c.city === fCity) &&
    (fSchool === 'Все вузы' || c.school === fSchool) &&
    (fEmployment === 'Любая занятость' || c.employment === fEmployment) &&
    (fSchedule === 'Любой график' || c.schedule === fSchedule) &&
    (fFormat === 'Любой формат' || c.format === fFormat) &&
    (fPosition === 'Все должности' || c.position === fPosition) &&
    parseSalary(c.salaryFrom) <= maxSalary,
  )

  function toggleCandidate(id: number) {
    setOpenCandidates((s) => ({ ...s, [id]: !s[id] }))
  }

  // Открытие контакта — 2000 ₽. Перед первым открытием работодатель
  // регистрируется и заполняет основную информацию о себе (форма ниже;
  // содержание полей уточняется позже по инструкции) — дальше открывает
  // контакты уже без повторной регистрации.
  const [employerRegistered, setEmployerRegistered] = useState(false)
  const [registeringId, setRegisteringId] = useState<number | null>(null)
  const [employerForm, setEmployerForm] = useState({ company: '', contact: '', phone: '', email: '' })

  function doUnlock(id: number) {
    submitLead({
      sourceBlock: 'kadry',
      formType: 'candidate_contact_unlock',
      name: employerForm.contact || 'Работодатель',
      contact: [employerForm.phone, employerForm.email].filter(Boolean).join(' / ') || '—',
      interest: [`Открыть контакт кандидата #${id} — 2000 ₽`, employerForm.company].filter(Boolean),
    })
    setUnlocked((u) => ({ ...u, [id]: true }))
  }

  function handleUnlockClick(id: number) {
    if (employerRegistered) {
      doUnlock(id)
    } else {
      setRegisteringId(id)
    }
  }

  function handleRegisterSubmit(e: FormEvent, id: number) {
    e.preventDefault()
    if (!employerForm.company.trim() || !employerForm.contact.trim() || (!employerForm.phone.trim() && !employerForm.email.trim())) return
    setEmployerRegistered(true)
    setRegisteringId(null)
    doUnlock(id)
  }

  return (
    <div className="bg-ink text-white">
      {tab === 'recruiting' && <SectionRail items={railItems} dark />}

      {/* Вкладки раздела: рекрутинг / кандидаты / база знаний / личный кабинет —
          сразу под панелью аудитории «Работодателям / Соискателям» из шапки.
          Закреплена (sticky) — остается на экране при скролле. */}
      <div className="sticky top-[142px] z-20 border-b border-white/10 bg-ink/95 py-4 backdrop-blur-xl">
        <div className="container-page">
        <div className="flex flex-wrap justify-end gap-3">
          {employerTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
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
            <select value={fCity} onChange={(e) => setFCity(e.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40">
              {['Все города', ...cities].map((v) => <option key={v} value={v} className="text-ink">{v}</option>)}
            </select>
            <select value={fSchool} onChange={(e) => setFSchool(e.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40">
              {['Все вузы', ...schools].map((v) => <option key={v} value={v} className="text-ink">{v}</option>)}
            </select>
            <select value={fEmployment} onChange={(e) => setFEmployment(e.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40">
              {['Любая занятость', ...employments].map((v) => <option key={v} value={v} className="text-ink">{v}</option>)}
            </select>
            <select value={fSchedule} onChange={(e) => setFSchedule(e.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40">
              {['Любой график', ...schedules].map((v) => <option key={v} value={v} className="text-ink">{v}</option>)}
            </select>
            <select value={fFormat} onChange={(e) => setFFormat(e.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40">
              {['Любой формат', ...formats].map((v) => <option key={v} value={v} className="text-ink">{v}</option>)}
            </select>
            <select value={fPosition} onChange={(e) => setFPosition(e.target.value)} className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40">
              {['Все должности', ...positionOptions].map((v) => <option key={v} value={v} className="text-ink">{v}</option>)}
            </select>
            <label className="sm:col-span-3 lg:col-span-6 text-sm text-white/70">
              Зарплатные ожидания — до {maxSalary.toLocaleString('ru-RU')} ₽
              <input
                type="range"
                min={20000}
                max={100000}
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
            {filteredCandidates.slice(0, visibleCandidates).map((c, i) => {
              const isOpen = !!openCandidates[c.id]
              const isUnlocked = unlocked[c.id]
              return (
                <div key={c.id} className="glass-dark flex flex-col rounded-xl p-5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gold-light">Кандидат №{i + 1}</div>
                  <div className="mt-1 font-semibold text-white">{c.position}</div>
                  <div className="mt-1 text-sm text-white/60">Сфера: {c.sphere}</div>
                  <div className="mt-1 text-sm text-white/60">Опыт: {c.exp}</div>
                  <div className="mt-1 text-sm text-white/40">{c.city} · от {c.salaryFrom}</div>
                  <div className="mt-1 text-sm text-white/40">{c.school}</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[c.schedule, c.employment, c.format].map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">{tag}</span>
                    ))}
                  </div>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm">
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
                      {isUnlocked ? (
                        <div className="rounded-lg bg-emerald-400/10 p-3 text-emerald-200">
                          Заявка на контакт отправлена — свяжемся для оплаты и передачи анкеты.
                        </div>
                      ) : registeringId === c.id ? (
                        <form onSubmit={(e) => handleRegisterSubmit(e, c.id)} className="space-y-2 rounded-lg border border-white/15 bg-white/5 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-white/50">Регистрация работодателя</div>
                          <input
                            value={employerForm.company}
                            onChange={(ev) => setEmployerForm((f) => ({ ...f, company: ev.target.value }))}
                            placeholder="Компания"
                            required
                            className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                          />
                          <input
                            value={employerForm.contact}
                            onChange={(ev) => setEmployerForm((f) => ({ ...f, contact: ev.target.value }))}
                            placeholder="Контактное лицо"
                            required
                            className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="tel"
                              value={employerForm.phone}
                              onChange={(ev) => setEmployerForm((f) => ({ ...f, phone: ev.target.value }))}
                              placeholder="Телефон"
                              className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                            />
                            <input
                              type="email"
                              value={employerForm.email}
                              onChange={(ev) => setEmployerForm((f) => ({ ...f, email: ev.target.value }))}
                              placeholder="Почта"
                              className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                            />
                          </div>
                          <button type="submit" className="w-full rounded-full bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90">
                            Открыть контакт — 2000 ₽
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUnlockClick(c.id)}
                          className="w-full rounded-full bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
                        >
                          Открыть контакт — 2000 ₽
                        </button>
                      )}
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
        </section>
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
          <h2 className="mb-6 text-2xl font-semibold text-white">Почему работодатели выбирают нас</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-2 divide-x divide-white/10">
              <div className="bg-white/[0.03] p-5 text-center text-sm font-semibold text-white/50">Обычный рекрутер</div>
              <div className="bg-gold-light/15 p-5 text-center text-sm font-semibold text-white">Карьерный Юрист</div>
            </div>
            {[
              ['Универсальный подбор на любом рынке', 'Только юридический рынок — знаем специфику профессии'],
              ['Кандидаты — отклики с открытых job-бордов', 'Собственная база 8 000+ и живое сообщество студентов-юристов'],
              ['Закрытие вакансии — недели', 'В среднем 5–7 дней (Time to Hire — 5,5 дней)'],
              ['Не отвечает за результат после найма', 'Бесплатная замена, если кандидат не прошел испытательный срок'],
            ].map(([bad, good]) => (
              <div key={good} className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 text-sm">
                <div className="flex items-start gap-2 p-5 text-white/40">
                  <span className="mt-0.5 shrink-0">✕</span>
                  <span>{bad}</span>
                </div>
                <div className="flex items-start gap-2 bg-gold-light/[0.06] p-5 text-white/80">
                  <span className="mt-0.5 shrink-0 text-gold-light">✓</span>
                  <span>{good}</span>
                </div>
              </div>
            ))}
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
          <div className="grid gap-4 sm:grid-cols-2">
            {cases.map((c, i) => (
              <div key={`${c.title}-${i}`} className="glass-dark rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-white">{c.title}</span>
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Закрыто</span>
                </div>
                <div className="mt-1 text-sm text-white/50">{c.city ?? 'Удаленно / любой город'} · {c.salary}</div>
                <div className="mt-2 text-[11px] text-white/35">
                  закрыто за {c.days}
                  {c.note && <span className="text-gold-light/80"> · {c.note}</span>}
                </div>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((p) => (
              <div key={p.title} className="flex items-center justify-between rounded-lg bg-white/10 px-4 py-3 text-sm">
                <span className="font-medium text-white">{p.title}</span>
                <span className="text-white/50">{p.salary}</span>
              </div>
            ))}
          </div>

          <h3 className="mb-2 mt-12 text-xl font-semibold text-white">Как мы работаем</h3>
          <p className="mb-6 text-sm text-white/60">8 этапов от заявки до выхода сотрудника — с документами, которые вы получаете на каждом из них.</p>
          <ol className="grid gap-4 sm:grid-cols-2">
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
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/40">Документы</div>
                  <ul className="space-y-0.5 text-sm text-white/70">
                    {step.docs.map((d) => <li key={d}>· {d}</li>)}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          <h3 className="mb-2 mt-14 text-xl font-semibold text-white">Как мы находим вам сотрудников</h3>
          <p className="mb-8 text-sm text-white/60">От заявки работодателя до найденного кандидата — как маршрут, который выстраивает навигатор, подсвечивая каналы поиска один за другим.</p>

          <div className="mx-auto max-w-3xl">
            <div className="relative h-28 w-full sm:h-36">
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
                <path
                  d="M 4 20 L 24 11 L 44 27 L 64 13 L 84 25 L 96 20"
                  fill="none"
                  stroke="rgba(111,147,196,0.18)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  id="route-path"
                  d="M 4 20 L 24 11 L 44 27 L 64 13 L 84 25 L 96 20"
                  fill="none"
                  stroke="transparent"
                  strokeWidth="1.4"
                />
                <path
                  className="route-build"
                  d="M 4 20 L 24 11 L 44 27 L 64 13 L 84 25 L 96 20"
                  pathLength={100}
                  fill="none"
                  stroke="#5ea1ff"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  filter="url(#route-glow)"
                />
                <circle r="1.6" fill="#eaf2ff" filter="url(#route-glow)">
                  <animateMotion dur="7s" repeatCount="indefinite">
                    <mpath href="#route-path" />
                  </animateMotion>
                </circle>
              </svg>

              <div className="glass-dark absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white" style={{ left: '4%', top: '50%' }}>
                <IconBriefcase />
              </div>
              <div className="glass-dark absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-white" style={{ left: '96%', top: '50%' }}>
                <IconUserCheck />
              </div>
            </div>
            <div className="relative mb-8 h-4 text-[11px] text-white/50">
              <span className="absolute" style={{ left: '4%' }}>Заявка от работодателя</span>
              <span className="absolute text-right" style={{ right: '4%' }}>Кандидат найден</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {marketingChannels.map((m, i) => (
                <div key={m.title} className="text-center">
                  <div className="mx-auto mb-2 h-1.5 w-1.5 rounded-full bg-gold-light" />
                  <div
                    className="route-pulse glass-dark h-full rounded-xl p-3 text-center"
                    style={{ animationDelay: `${i * 1.75}s` }}
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
          <h2 className="mb-6 text-2xl font-semibold text-white">Прозрачная система оплаты и гарантий</h2>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <ul className="space-y-3 pt-1 text-sm text-white/70">
              <li><strong className="text-white">Оплата за результат</strong> — 30% от одного месячного оклада кандидата: 75% предоплата до начала работ, 25% после прохождения испытательного срока.</li>
              <li><strong className="text-white">Бесплатная замена</strong> — если кандидат не проходит испытательный срок, подбираем замену бесплатно в согласованные сроки.</li>
              <li><strong className="text-white">Прозрачная отчетность</strong> — регулярно сообщаем о ходе поиска; если подходящих кандидатов нет — честно предупреждаем.</li>
            </ul>

            <div className="glass-dark rounded-2xl p-8 lg:-mt-1">
              <div className="text-xs uppercase tracking-wide text-white/50">Итого к оплате за подбор</div>
              <div className="mt-1 text-4xl font-semibold text-white">{fee.toLocaleString('ru-RU')} ₽</div>
              <div className="mt-1 text-sm text-white/50">
                при рыночной комиссии 40–50% это было бы {Math.round(salary * 0.45).toLocaleString('ru-RU')} ₽ — экономия {Math.round(salary * 0.45 - fee).toLocaleString('ru-RU')} ₽
              </div>

              <label className="mt-6 block text-sm font-semibold text-white">
                Оклад кандидата, ₽/мес
                <input
                  type="range"
                  min={20000}
                  max={150000}
                  step={5000}
                  value={salary}
                  onChange={(e) => setSalary(Number(e.target.value))}
                  className="mt-4 w-full accent-gold-light"
                />
              </label>
              <div className="mt-1 text-lg font-medium text-white/70">{salary.toLocaleString('ru-RU')} ₽/мес</div>

              <div className="mt-8">
                <div className="mx-auto w-fit rounded-xl border border-white/15 bg-white/10 px-6 py-4 text-center text-white">
                  <div className="text-xs text-white/60">Комиссия 30%</div>
                  <div className="mt-1 text-2xl font-semibold text-gold-light">{fee.toLocaleString('ru-RU')} ₽</div>
                </div>

                <svg viewBox="0 0 200 36" className="mx-auto block h-9 w-56" aria-hidden="true">
                  <path
                    d="M100 0 V16 M100 16 H40 M100 16 H160 M40 16 V32 M160 16 V32"
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/15 bg-white/10 p-4 text-center text-white">
                    <div className="text-xs text-white/60">75% предоплата</div>
                    <div className="mt-1 text-2xl font-semibold text-gold-light">{prepay.toLocaleString('ru-RU')} ₽</div>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/10 p-4 text-center text-white">
                    <div className="text-xs leading-snug text-white/60">25% после прохождения испытательного срока</div>
                    <div className="mt-1 text-2xl font-semibold text-gold-light">{afterProbation.toLocaleString('ru-RU')} ₽</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm">
                <span className="text-white/60">Ожидаемый срок закрытия вакансии</span>
                <span className="font-semibold text-white">5–7 дней</span>
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
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Имя"
                    required
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
                  />
                  <input
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    placeholder="Кого ищем"
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
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Номер телефона"
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
      </>
      )}
    </div>
  )
}
