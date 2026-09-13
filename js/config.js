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

// Лид-показатели (Weekly Lead Metrics). defaultPlan можно менять по неделям/блокам —
// значения тут только "заводские" значения по умолчанию для новой недели.
const LEAD_METRICS = [
  { id: 'LM1', name: 'КЮ Кадры — контакты с работодателями', streamIds: ['S1'], unit: 'шт', defaultPlan: null },
  { id: 'LM2', name: 'Наём продажника — часы на поиск', streamIds: ['S1'], unit: 'часы', defaultPlan: 5 },
  { id: 'LM3', name: 'КЮ Сообщество — посты/анонсы', streamIds: ['S2'], unit: 'шт', defaultPlan: 21 },
  { id: 'LM4', name: 'КЮ Мероприятия — контакты/приглашения', streamIds: ['S3'], unit: 'шт', defaultPlan: 5 },
  { id: 'LM5', name: 'Privacy / ИИ Стриж — исходящие предложения', streamIds: ['S7', 'S8'], unit: 'шт', defaultPlan: 100 },
];

const TASK_PRIORITIES = ['главная задача недели', 'второстепенная'];
const TASK_LINK_TYPES = ['прямая выручка', 'удержание текущей выручки', 'воронка/подготовка', 'инфраструктура/административное'];
const TASK_STATUSES = ['не начато', 'в работе', 'выполнено', 'частично выполнено', 'отменено'];

const SIGNALS = {
  GREEN: { code: 'green', label: 'Зелёный', text: 'Всё в порядке — продолжать в том же темпе.' },
  YELLOW: { code: 'yellow', label: 'Жёлтый', text: 'Действия выполняются, но не конвертируются в результат — пересмотреть тип действий или увеличить объём.' },
  RED: { code: 'red', label: 'Красный', text: 'Отставание и по действиям, и по результату — нужна немедленная корректировка плана.' },
  BLUE: { code: 'blue', label: 'Синий', text: 'Результат идёт по инерции или из другого источника — не снижать активность, зафиксировать нетипичность.' },
  NA: { code: 'na', label: 'Нет данных', text: 'Недостаточно данных за неделю для расчёта сигнала.' },
};
