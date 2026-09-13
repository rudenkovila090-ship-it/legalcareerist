/**
 * config.js
 * Статическая конфигурация цикла «12-недельный год» для бизнеса «Карьерный юрист».
 * Источник: ТЗ «приложение-трекер целей по методу 12-недельного года».
 *
 * Блоки (intermediate targets) помечены как редактируемые — при первом запуске
 * они копируются в хранилище (storage.js) и дальше правятся пользователем там,
 * этот файл остаётся неизменным «заводским» шаблоном.
 */

const CYCLE = {
  start: '2026-09-13',
  end: '2026-12-31',
};

// Пороговое значение нормы execution score (%)
const EXECUTION_THRESHOLD = 85;

const GOALS = [
  { id: 'G1', name: 'Выручка «Карьерного юриста»', start: 22000, target: 70000, unit: '₽/мес', priority: 1 },
  { id: 'G2', name: 'Личный доход на руки', start: 45000, target: 80000, unit: '₽/мес', priority: 2 },
  { id: 'G3', name: 'Накопления', start: 0, target: 30000, unit: '₽', priority: 3 },
];

// Блок: id, даты, промежуточные цели по каждой Goal (редактируемые пользователем)
const DEFAULT_BLOCKS = [
  { id: 1, start: '2026-09-13', end: '2026-10-09', targets: { G1: 29200, G2: 50250, G3: 6000 } },
  { id: 2, start: '2026-10-10', end: '2026-11-05', targets: { G1: 41200, G2: 59000, G3: 15000 } },
  { id: 3, start: '2026-11-06', end: '2026-12-02', targets: { G1: 55600, G2: 69500, G3: 22500 } },
  { id: 4, start: '2026-12-03', end: '2026-12-31', targets: { G1: 70000, G2: 80000, G3: 30000 } },
];

// Направления деятельности (Streams), привязаны к целям и сгруппированы для UI.
// kind: 'flow' — периодический поток (выручка/доход за неделю или месяц),
//       'stock' — накопительный остаток (вводится как текущее значение на дату).
const STREAM_GROUPS = {
  KYU: 'Карьерный юрист',
  OTHER: 'Другая работа',
  SAVINGS: 'Накопления',
};

const STREAMS = [
  { id: 'S1', name: 'КЮ Кадры', goals: ['G1'], kind: 'flow', group: STREAM_GROUPS.KYU },
  { id: 'S2', name: 'КЮ Сообщество', goals: ['G1'], kind: 'flow', group: STREAM_GROUPS.KYU },
  { id: 'S3', name: 'КЮ Мероприятия', goals: ['G1'], kind: 'flow', group: STREAM_GROUPS.KYU },
  { id: 'S4', name: 'КЮ Маркетинг', goals: ['G1'], kind: 'flow', group: STREAM_GROUPS.KYU },
  { id: 'S5', name: 'КЮ Legal Tech', goals: ['G1'], kind: 'flow', group: STREAM_GROUPS.KYU },
  { id: 'S6', name: 'КЮ HR', goals: ['G1'], kind: 'flow', group: STREAM_GROUPS.KYU },
  { id: 'S7', name: 'Privacy', goals: ['G2'], kind: 'flow', group: STREAM_GROUPS.OTHER },
  { id: 'S8', name: 'ИИ Стриж', goals: ['G2'], kind: 'flow', group: STREAM_GROUPS.OTHER },
  { id: 'S9', name: 'Накопления (остаток)', goals: ['G3'], kind: 'stock', group: STREAM_GROUPS.SAVINGS },
];

const TASK_PRIORITIES = ['главная задача недели', 'второстепенная'];
const TASK_LINK_TYPES = ['прямая выручка', 'удержание текущей выручки', 'воронка/подготовка', 'инфраструктура/административное'];
const TASK_STATUSES = ['не начато', 'в работе', 'выполнено', 'частично выполнено', 'отменено'];

// Тип связи с целью определяется автоматически по ключевым словам в названии
// задачи — пользователь его не выбирает, только видит результат.
const LINK_TYPE_RULES = [
  { type: 'прямая выручка', keywords: ['продаж', 'оплат', 'трудоустро', 'закры', 'выручк', 'сделк', 'счёт', 'счет', 'договор', 'предложени'] },
  { type: 'удержание текущей выручки', keywords: ['продл', 'сопровожд', 'поддержк', 'удержан', 'текущего клиента', 'ретеншн'] },
  { type: 'инфраструктура/административное', keywords: ['докум', 'отчёт', 'отчет', 'администр', 'настрой', 'бухгалт', 'найм сотрудник', 'учёт', 'учет'] },
];
function inferLinkType(title) {
  const t = (title || '').toLowerCase();
  const rule = LINK_TYPE_RULES.find((r) => r.keywords.some((k) => t.includes(k)));
  return rule ? rule.type : 'воронка/подготовка';
}

const SIGNALS = {
  GREEN: { code: 'green', label: 'Зелёный', short: 'Всё по плану', text: 'Всё в порядке — продолжать в том же темпе.' },
  YELLOW: { code: 'yellow', label: 'Жёлтый', short: 'Не даёт результата', text: 'Действия выполняются, но не конвертируются в результат — пересмотреть тип действий или увеличить объём.' },
  RED: { code: 'red', label: 'Красный', short: 'Нужна корректировка', text: 'Отставание и по действиям, и по результату — нужна немедленная корректировка плана.' },
  BLUE: { code: 'blue', label: 'Синий', short: 'Растёт по инерции', text: 'Результат идёт по инерции или из другого источника — не снижать активность, зафиксировать нетипичность.' },
  NA: { code: 'na', label: 'Нет данных', short: 'Мало данных', text: 'Недостаточно данных за неделю для расчёта сигнала.' },
};

// =======================================================================
// КЮ Кадры — годовая воронка найма (помесячный план/факт), 2026 год
// =======================================================================

const MONTH_NAMES_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const MONTHS_2026 = MONTH_NAMES_RU.map((name, i) => ({
  key: `2026-${String(i + 1).padStart(2, '0')}`,
  name,
}));

function monthKeyOf(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null;
}

const KADRY_KPIS = [
  { id: 'baseCandidates', name: 'База кандидатов', unit: 'шт', yearlyTarget: 16000 },
  { id: 'resumeB2C', name: 'Резюме B2C', unit: 'шт', yearlyTarget: 270 },
  { id: 'lettersB2B', name: 'Письма B2B', unit: 'шт', yearlyTarget: 1600 },
  { id: 'vacanciesB2B', name: 'Вакансий B2B', unit: 'шт', yearlyTarget: 100 },
  { id: 'employment', name: 'Трудоустройств', unit: 'шт', yearlyTarget: 100 },
  { id: 'paidPlacements', name: 'Платные размещения', unit: 'шт', yearlyTarget: 30 },
  { id: 'careerConsults', name: 'Карьерные консультации', unit: 'шт', yearlyTarget: null },
  { id: 'psychologyClients', name: 'Найдено клиентов психологу', unit: 'шт', yearlyTarget: null },
  { id: 'revenue', name: 'Выручка', unit: '₽', yearlyTarget: 500000 },
];

// Справочно: факт с начала года по вашей таблице (для сверки после заполнения
// помесячной сетки ниже) — сумма месяцев с данными на момент переноса.
const KADRY_YTD_REFERENCE = {
  baseCandidates: 4161,
  resumeB2C: 127,
  lettersB2B: 356,
  vacanciesB2B: 15,
  employment: 8,
  paidPlacements: 1,
  revenue: 25698,
};

// Помесячный план/факт — перенесено напрямую из Google Диска
// («1. КЮ | Кадры» → «План-работы | Кадры», лист «Помесячный план работы»).
const KADRY_MONTHLY_SEED = {
  '2026-04': {
    resumeB2C: { plan: 30, fact: 57 }, lettersB2B: { plan: 20, fact: 20 },
    vacanciesB2B: { plan: 5, fact: 3 }, employment: { plan: 5, fact: 2 },
    paidPlacements: { plan: 2, fact: 0 }, revenue: { plan: 10000, fact: 3000 },
  },
  '2026-05': {
    baseCandidates: { plan: 150, fact: 1071 }, resumeB2C: { plan: 30, fact: 22 },
    lettersB2B: { plan: 180, fact: 200 }, vacanciesB2B: { plan: 5, fact: 5 },
    employment: { plan: 10, fact: 3 }, paidPlacements: { plan: 2, fact: 1 },
    revenue: { plan: 50000, fact: 11000 },
  },
  '2026-06': {
    baseCandidates: { plan: 1500, fact: 1531 }, resumeB2C: { plan: 30, fact: 9 },
    lettersB2B: { plan: 200, fact: 100 }, vacanciesB2B: { plan: 10, fact: 3 },
    employment: { plan: 20, fact: 1 }, paidPlacements: { plan: 3, fact: 0 },
    revenue: { plan: 50000, fact: 7900 },
  },
  '2026-07': {
    baseCandidates: { plan: 1600, fact: 536 }, resumeB2C: { plan: 30, fact: 29 },
    lettersB2B: { plan: 200, fact: 1 }, vacanciesB2B: { plan: 10, fact: 4 },
    employment: { plan: 10, fact: 1 }, paidPlacements: { plan: 3, fact: 0 },
    revenue: { plan: 50000, fact: 3000 },
  },
  '2026-08': {
    baseCandidates: { plan: 1800, fact: 460 }, resumeB2C: { plan: 30, fact: 7 },
    lettersB2B: { plan: 200, fact: 35 }, vacanciesB2B: { plan: 5, fact: 0 },
    employment: { plan: 10, fact: 1 }, paidPlacements: { plan: 3, fact: 0 },
    careerConsults: { plan: 5, fact: 2 }, psychologyClients: { plan: 2, fact: 0 },
    revenue: { plan: 50000, fact: 798 },
  },
  '2026-09': {
    baseCandidates: { plan: 4500, fact: 563 }, resumeB2C: { plan: 30, fact: 3 },
    lettersB2B: { plan: 200, fact: null }, vacanciesB2B: { plan: 10, fact: null },
    employment: { plan: 10, fact: null }, paidPlacements: { plan: 3, fact: null },
    careerConsults: { plan: 5, fact: null }, psychologyClients: { plan: 2, fact: null },
    revenue: { plan: 60000, fact: null },
  },
  '2026-10': {
    baseCandidates: { plan: 2500 }, resumeB2C: { plan: 30 }, lettersB2B: { plan: 200 },
    vacanciesB2B: { plan: 15 }, employment: { plan: 15 }, paidPlacements: { plan: 5 },
    careerConsults: { plan: 10 }, psychologyClients: { plan: 2 }, revenue: { plan: 70000 },
  },
  '2026-11': {
    baseCandidates: { plan: 3000 }, resumeB2C: { plan: 30 }, lettersB2B: { plan: 200 },
    vacanciesB2B: { plan: 15 }, employment: { plan: 15 }, paidPlacements: { plan: 5 },
    careerConsults: { plan: 10 }, psychologyClients: { plan: 2 }, revenue: { plan: 80000 },
  },
  '2026-12': {
    baseCandidates: { plan: 3350 }, resumeB2C: { plan: 30 }, lettersB2B: { plan: 200 },
    vacanciesB2B: { plan: 15 }, employment: { plan: 15 }, paidPlacements: { plan: 4 },
    careerConsults: { plan: 10 }, psychologyClients: { plan: 2 }, revenue: { plan: 80000 },
  },
};

// =======================================================================
// КЮ Сообщество — резиденты, тарифы подписки, дневной P&L
// =======================================================================

// Когорта резидентов сообщества — перенесена из вашей таблицы (цепочка
// «начало → конец» сходится помесячно, поэтому проставлена сразу).
const COMMUNITY_RESIDENTS_SEED = {
  '2026-04': { start: 41, new: 4, churn: 2 },
  '2026-05': { new: 2, churn: 6 },
  '2026-06': { new: 0, churn: 3 },
  '2026-07': { new: 5, churn: 0 },
  '2026-08': { new: 11, churn: 7 },
  '2026-09': { new: 1, churn: 3 },
  '2026-10': { new: 0, churn: 0 },
  '2026-11': { new: 0, churn: 0 },
  '2026-12': { new: 0, churn: 0 },
};

// Цены — действующие с 01.08.2026 (до этой даты были ниже: 350/500/1350/2520 ₽,
// см. лист «Финансы | Сообщество»). Для прошлых месяцев «План ₽» переносится
// напрямую из таблицы (planRevenue), а не пересчитывается по текущей цене —
// поэтому смена цены не искажает историю, только новые месяцы.
const COMMUNITY_DEFAULT_TARIFFS = [
  { id: 'discount1m', name: '1 месяц со скидкой', price: 530 },
  { id: 'm1', name: '1 месяц', price: 690 },
  { id: 'm3', name: '3 месяца', price: 2070 },
  { id: 'm6', name: '6 месяцев', price: 4140 },
];

// План продаж (шт и ₽) и факт продаж (шт) по тарифам — перенесены из
// Google Диска («Финансы | Сообщество», лист «Факт и план 2026») целиком.
const COMMUNITY_TARIFF_PLAN_SEED = {
  '2026-04': { discount1m: { units: 5, revenue: 1750 }, m1: { units: 1, revenue: 500 }, m3: { units: 1, revenue: 1350 }, m6: { units: 0, revenue: 0 } },
  '2026-05': { discount1m: { units: 5, revenue: 1750 }, m1: { units: 1, revenue: 500 }, m3: { units: 1, revenue: 1350 }, m6: { units: 1, revenue: 2520 } },
  '2026-06': { discount1m: { units: 5, revenue: 1750 }, m1: { units: 1, revenue: 500 }, m3: { units: 1, revenue: 1350 }, m6: { units: 1, revenue: 2520 } },
  '2026-07': { discount1m: { units: 5, revenue: 1750 }, m1: { units: 1, revenue: 500 }, m3: { units: 1, revenue: 1350 }, m6: { units: 1, revenue: 2520 } },
  '2026-08': { discount1m: { units: 5, revenue: 2650 }, m1: { units: 2, revenue: 1380 }, m3: { units: 5, revenue: 8850 }, m6: { units: 1, revenue: 3180 } },
  '2026-09': { discount1m: { units: 5, revenue: 2650 }, m1: { units: 3, revenue: 2070 }, m3: { units: 5, revenue: 8850 }, m6: { units: 2, revenue: 6360 } },
  '2026-10': { discount1m: { units: 5, revenue: 2650 }, m1: { units: 4, revenue: 2760 }, m3: { units: 5, revenue: 8850 }, m6: { units: 3, revenue: 9540 } },
  '2026-11': { discount1m: { units: 5, revenue: 2650 }, m1: { units: 5, revenue: 3450 }, m3: { units: 5, revenue: 8850 }, m6: { units: 3, revenue: 9540 } },
  '2026-12': { discount1m: { units: 5, revenue: 2650 }, m1: { units: 5, revenue: 3450 }, m3: { units: 5, revenue: 8850 }, m6: { units: 4, revenue: 12720 } },
};

const COMMUNITY_TARIFF_FACT_SEED = {
  '2026-04': { discount1m: 4, m1: 0, m3: 0, m6: 0 },
  '2026-05': { discount1m: 0, m1: 0, m3: 0, m6: 0 },
  '2026-06': { discount1m: 0, m1: 0, m3: 0, m6: 0 },
  '2026-07': { discount1m: 3, m1: 1, m3: 1, m6: 1 },
  '2026-08': { discount1m: 2, m1: 1, m3: 0, m6: 0 },
  '2026-09': { discount1m: 0, m1: 1, m3: 0, m6: 0 },
};

const ACQUIRING_RATE = 0.048; // эквайринг
const TAX_RATE = 0.063; // налог
const RESERVE_RATE = 0.10; // резерв
// По умолчанию для месяца без данных — расходов нет (не додумываем зарплаты
// за периоды, которых ещё не было). YoNote продолжает списываться и без
// активности (видно по факту в таблице на октябрь-декабрь).
const COMMUNITY_DEFAULT_MONTHLY_COSTS = { managerSalary: 0, techSalary: 0, botHelp: 0, yoNote: 0 };
// Перенесено из Google Диска («Финансы | Сообщество», «Итог по месяцам»).
const COMMUNITY_MONTHLY_COSTS_SEED = {
  '2026-07': { managerSalary: 0, techSalary: 1500, botHelp: 1599, yoNote: 249 },
  '2026-08': { managerSalary: 0, techSalary: 2000, botHelp: 1599, yoNote: 249 },
  '2026-09': { managerSalary: 0, techSalary: 2000, botHelp: 1599, yoNote: 249 },
  '2026-10': { managerSalary: 0, techSalary: 0, botHelp: 0, yoNote: 249 },
  '2026-11': { managerSalary: 0, techSalary: 0, botHelp: 0, yoNote: 249 },
  '2026-12': { managerSalary: 0, techSalary: 0, botHelp: 0, yoNote: 249 },
};

// Дневной журнал — перенесён целиком из Google Диска («Финансы | Сообщество»,
// 01.07.2026–13.09.2026). Дни без единого события в исходнике не переносились —
// это то же самое, что 0 по всем полям.
const COMMUNITY_JOURNAL_SEED = [
  { date: '2026-07-01', joinedDemo: 1, purchases: { discount1m: 700, m1: 500 } },
  { date: '2026-07-03', purchases: { discount1m: 350 } },
  { date: '2026-07-04', purchases: { discount1m: 700, m1: 500 } },
  { date: '2026-07-06', purchases: { discount1m: 350 } },
  { date: '2026-07-07', purchases: { discount1m: 350 } },
  { date: '2026-07-08', purchases: { discount1m: 350 } },
  { date: '2026-07-10', purchases: { discount1m: 700 } },
  { date: '2026-07-12', purchases: { m1: 500 } },
  { date: '2026-07-13', purchases: { discount1m: 700, m1: 500 } },
  { date: '2026-07-18', purchases: { discount1m: 350 } },
  { date: '2026-07-19', purchases: { discount1m: 350 } },
  { date: '2026-07-20', purchases: { discount1m: 350 } },
  { date: '2026-07-21', purchases: { discount1m: 350 } },
  { date: '2026-07-23', purchases: { discount1m: 350 } },
  { date: '2026-07-24', joinedDemo: 1, purchases: { discount1m: 350, m1: 500, m3: 1350 } },
  { date: '2026-07-25', joined: 1, purchases: { discount1m: 1050, m1: 1000 } },
  { date: '2026-07-26', joined: 1, purchases: { discount1m: 350, m6: 2520 } },
  { date: '2026-07-27', joined: 1, joinedDemo: 2, purchases: { discount1m: 350 } },
  { date: '2026-07-28', purchases: { discount1m: 350 } },
  { date: '2026-07-29', purchases: { discount1m: 700 } },
  { date: '2026-07-30', joined: 2, purchases: { discount1m: 350, m1: 1500 } },
  { date: '2026-07-31', joinedDemo: 1, purchases: { discount1m: 700, m1: 500, m3: 1350 } },
  { date: '2026-08-02', purchases: { discount1m: 350 } },
  { date: '2026-08-03', left: 1, joinedDemo: 1, purchases: { discount1m: 1200 } },
  { date: '2026-08-05', joined: 1, purchases: { discount1m: 850 } },
  { date: '2026-08-09', joined: 1, purchases: { discount1m: 700, m1: 690 } },
  { date: '2026-08-10', purchases: { discount1m: 850 } },
  { date: '2026-08-11', purchases: { discount1m: 500 } },
  { date: '2026-08-12', left: 1, purchases: { discount1m: 850 } },
  { date: '2026-08-13', left: 1, purchases: { discount1m: 350 } },
  { date: '2026-08-14', purchases: { discount1m: 350 } },
  { date: '2026-08-16', joinedDemo: 1 },
  { date: '2026-08-18', applications: 1, joinedDemo: 1, purchases: { discount1m: 700 } },
  { date: '2026-08-19', joined: 2 },
  { date: '2026-08-21', purchases: { discount1m: 850 } },
  { date: '2026-08-23', left: 1, joinedDemo: 1 },
  { date: '2026-08-24', joined: 3, purchases: { discount1m: 2550 } },
  { date: '2026-08-25', left: 1, purchases: { discount1m: 350 } },
  { date: '2026-08-26', joined: 2, purchases: { discount1m: 700 } },
  { date: '2026-08-27', purchases: { discount1m: 700 } },
  { date: '2026-08-28', purchases: { discount1m: 700 } },
  { date: '2026-08-29', left: 1, purchases: { discount1m: 1000 } },
  { date: '2026-08-30', applications: 1, purchases: { discount1m: 1380 } },
  { date: '2026-08-31', joined: 2, left: 1, purchases: { discount1m: 1030, m1: 690 } },
  { date: '2026-09-01', joinedDemo: 1, purchases: { discount1m: 350 } },
  { date: '2026-09-02', left: 1, purchases: { discount1m: 700 } },
  { date: '2026-09-03', left: 1, joinedDemo: 1, purchases: { discount1m: 500 } },
  { date: '2026-09-04', joinedDemo: 1, purchases: { discount1m: 350 } },
  { date: '2026-09-05', purchases: { discount1m: 350 } },
  { date: '2026-09-07', purchases: { discount1m: 350 } },
  { date: '2026-09-08', joined: 1, purchases: { discount1m: 700, m1: 690 } },
  { date: '2026-09-09', purchases: { discount1m: 850 } },
  { date: '2026-09-10', purchases: { discount1m: 1000 } },
  { date: '2026-09-11', left: 1, joinedDemo: 1, purchases: { discount1m: 850 } },
  { date: '2026-09-12', joinedDemo: 3, purchases: { discount1m: 350 } },
  { date: '2026-09-13', joinedDemo: 1, purchases: { discount1m: 350 } },
];

// =======================================================================
// КЮ Мероприятия — продажа билетов и полезных материалов
// =======================================================================
// Каталог предложений (билеты/материалы) пользователь ведёт сам — это его
// продукты, они меняются от месяца к месяцу. Продажи считаются по месяцам,
// как у тарифов сообщества: план/факт по штукам, выручка = штуки × цена.

const EVENT_OFFER_TYPES = { TICKET: 'билет', MATERIAL: 'материал' };

// Перенесено из Google Диска («Мероприятия | Маркетинг» — тарифы для партнёров;
// «Мероприятия | Финансы» — реальные продажи билетов/материалов по месяцам).
const EVENTS_OFFERS_SEED = [
  { id: 'ev_notariat_ticket', name: 'Билет: Карьера юриста в нотариате', type: EVENT_OFFER_TYPES.TICKET, price: 441 },
  { id: 'ev_material', name: 'Полезный материал', type: EVENT_OFFER_TYPES.MATERIAL, price: 390 },
  { id: 'ev_organization', name: 'Организация мероприятия (для партнёра)', type: EVENT_OFFER_TYPES.MATERIAL, price: 18600 },
  { id: 'ev_partner_speaker', name: 'Партнёрский пакет: Спикер сессии', type: EVENT_OFFER_TYPES.MATERIAL, price: 10000 },
  { id: 'ev_partner_info', name: 'Партнёрский пакет: Информационный партнёр', type: EVENT_OFFER_TYPES.MATERIAL, price: 15000 },
  { id: 'ev_partner_content', name: 'Партнёрский пакет: Контент-партнёр', type: EVENT_OFFER_TYPES.MATERIAL, price: 25000 },
  { id: 'ev_partner_product', name: 'Партнёрский пакет: Продуктовый партнёр', type: EVENT_OFFER_TYPES.MATERIAL, price: 35000 },
  { id: 'ev_partner_official', name: 'Партнёрский пакет: Официальный партнёр', type: EVENT_OFFER_TYPES.MATERIAL, price: 45000 },
  { id: 'ev_partner_general', name: 'Партнёрский пакет: Генеральный партнёр', type: EVENT_OFFER_TYPES.MATERIAL, price: 60000 },
];

// Факт продаж (шт) по месяцам — из реального дневного журнала «Мероприятия | Финансы».
const EVENTS_SALES_SEED = {
  '2026-07': { ev_notariat_ticket: { factQty: 4 }, ev_material: { factQty: 6 }, ev_organization: { factQty: 1 } },
  '2026-08': { ev_material: { factQty: 17 } },
  '2026-09': { ev_material: { factQty: 1 } },
};

// =======================================================================
// КЮ Маркетинг — проекты и KPI по соцсетям/PR/сотрудничеству/рекламе
// =======================================================================

const MARKETING_CATEGORIES = ['Соцсети', 'PR', 'Сотрудничество', 'Реклама'];
const MARKETING_PROJECT_STATUSES = ['в работе', 'готово'];

// Перенесено из Google Диска («КЮ Маркетинг | План-работы»).
const MARKETING_PROJECTS_SEED = [
  { name: 'Подкаст: создавать узнаваемую музыку', category: 'PR', status: 'в работе', notes: '' },
  { name: 'Создать новогодний ивент-календарь', category: 'Сотрудничество', status: 'в работе', notes: '' },
];

// =======================================================================
// Дневная норма — то, что нужно делать каждый день (не путать с недельными
// лид-показателями выше). Сгруппирована по направлениям.
// =======================================================================

const DAILY_NORMS = [
  { id: 'dn_hypotheses', group: 'Карьерный юрист', name: '5 гипотез для бизнеса', target: 5, unit: 'шт' },
  { id: 'dn_b2b_contacts', group: 'КЮ Кадры', name: '10 контактов B2B', target: 10, unit: 'шт' },
  { id: 'dn_b2b_letters', group: 'КЮ Кадры', name: '10 писем B2B', target: 10, unit: 'шт' },
  { id: 'dn_b2c_contacts', group: 'КЮ Кадры', name: '150 контактов B2C', target: 150, unit: 'шт' },
  { id: 'dn_b2c_letters', group: 'КЮ Кадры', name: '20 писем B2C', target: 20, unit: 'шт' },
  { id: 'dn_check_applications', group: 'КЮ Кадры', name: 'Проверка заявок', target: 1, unit: 'раз' },
  { id: 'dn_threads', group: 'КЮ Маркетинг', name: '15 минут в Threads', target: 15, unit: 'мин' },
  { id: 'dn_instagram', group: 'КЮ Маркетинг', name: '15 минут в Instagram', target: 15, unit: 'мин' },
  { id: 'dn_knowledge_block', group: 'КЮ Сообщество', name: '1 блок базы знаний', target: 1, unit: 'шт' },
];

// Дневная норма — единственный источник «лид-показателей» приложения
// (отдельной вкладки для их ручного ввода больше нет). Execution score
// считается из фактов дневной нормы: группа нормы -> направление -> цель.
const STREAM_TO_NORM_GROUP = { S1: 'КЮ Кадры', S2: 'КЮ Сообщество', S4: 'КЮ Маркетинг' };
const GOAL_NORM_GROUPS = {
  G1: ['Карьерный юрист', 'КЮ Кадры', 'КЮ Сообщество', 'КЮ Маркетинг'],
  G2: [],
  G3: [],
};
