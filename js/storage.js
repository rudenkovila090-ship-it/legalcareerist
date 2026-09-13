/**
 * storage.js — персистентность в localStorage.
 * Всё хранится в одном JSON-объекте под ключом STORAGE_KEY.
 */

const STORAGE_KEY = 'kyu_12week_tracker_v1';

function defaultState() {
  return {
    version: 1,
    blocks: JSON.parse(JSON.stringify(DEFAULT_BLOCKS)), // редактируемые промежуточные цели
    tasks: [], // { id, title, streamId, goalId, blockId, weekId, priority, linkType, status, plannedDate, actualDate, metricContribution }
    dailyLogs: [], // { id, taskId, date, status, note }
    leadMetricEntries: {}, // key `${weekId}|${metricId}` -> { plan, fact }
    financialSnapshots: [], // { id, streamId, periodStart, periodEnd, amount, note }
    settings: {
      lastBlockReportSeenBlockId: 0,
    },
    // --- КЮ Кадры: помесячная воронка найма (план/факт), 2026 год ---
    kadry: {
      months: {}, // 'YYYY-MM' -> { [kpiId]: { plan, fact } } — заполняется вручную
    },
    // --- КЮ Сообщество: когорта резидентов, тарифы подписки, дневной P&L ---
    community: {
      residents: JSON.parse(JSON.stringify(COMMUNITY_RESIDENTS_SEED)), // перенесено из вашей таблицы
      tariffs: JSON.parse(JSON.stringify(COMMUNITY_DEFAULT_TARIFFS)), // редактируемые тарифы и цены
      tariffSales: seedTariffSales(),
      journal: [], // { id, date, applications, joined, left, joinedDemo, purchases:{tariffId:amount}, reviewsTaken, reviewsAnswered, comment }
      monthlyCosts: JSON.parse(JSON.stringify(COMMUNITY_MONTHLY_COSTS_SEED)), // 'YYYY-MM' -> { managerSalary, techSalary, botHelp, yoNote }
    },
    // --- КЮ Мероприятия: билеты и полезные материалы ---
    events: {
      offers: [], // { id, name, type: 'билет'|'материал', price }
      sales: {}, // 'YYYY-MM' -> { [offerId]: { planQty, factQty } }
    },
    // --- Дневная норма (что нужно делать каждый день) ---
    dailyNorms: {}, // 'YYYY-MM-DD' -> { [normId]: factValue }
  };
}

function seedTariffSales() {
  const result = {};
  Object.keys(COMMUNITY_TARIFF_PLAN_SEED).forEach((month) => {
    result[month] = result[month] || {};
    Object.entries(COMMUNITY_TARIFF_PLAN_SEED[month]).forEach(([tariffId, planUnits]) => {
      result[month][tariffId] = { planUnits, factUnits: null };
    });
  });
  Object.keys(COMMUNITY_TARIFF_FACT_SEED).forEach((month) => {
    result[month] = result[month] || {};
    Object.entries(COMMUNITY_TARIFF_FACT_SEED[month]).forEach(([tariffId, factUnits]) => {
      result[month][tariffId] = { ...(result[month][tariffId] || { planUnits: null }), factUnits };
    });
  });
  return result;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = defaultState();
      saveState(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw);
    // на случай если структура блоков ещё не сохранена — дозаполняем
    if (!parsed.blocks || !parsed.blocks.length) parsed.blocks = JSON.parse(JSON.stringify(DEFAULT_BLOCKS));
    if (!parsed.tasks) parsed.tasks = [];
    if (!parsed.dailyLogs) parsed.dailyLogs = [];
    if (!parsed.leadMetricEntries) parsed.leadMetricEntries = {};
    if (!parsed.financialSnapshots) parsed.financialSnapshots = [];
    if (!parsed.settings) parsed.settings = { lastBlockReportSeenBlockId: 0 };
    if (!parsed.kadry) parsed.kadry = { months: {} };
    if (!parsed.community) {
      parsed.community = {
        residents: {},
        tariffs: JSON.parse(JSON.stringify(COMMUNITY_DEFAULT_TARIFFS)),
        tariffSales: {},
        journal: [],
        monthlyCosts: {},
      };
    }
    if (!parsed.community.tariffs || !parsed.community.tariffs.length) {
      parsed.community.tariffs = JSON.parse(JSON.stringify(COMMUNITY_DEFAULT_TARIFFS));
    }
    // добавляем новые тарифы из заводского списка, если их ещё нет (например, 530 ₽)
    COMMUNITY_DEFAULT_TARIFFS.forEach((t) => {
      if (!parsed.community.tariffs.some((x) => x.id === t.id)) {
        parsed.community.tariffs.push({ ...t });
      }
    });
    if (!parsed.community.tariffSales) parsed.community.tariffSales = {};
    if (!parsed.community.journal) parsed.community.journal = [];
    if (!parsed.community.monthlyCosts) parsed.community.monthlyCosts = {};
    if (!parsed.events) parsed.events = { offers: [], sales: {} };
    if (!parsed.events.offers) parsed.events.offers = [];
    if (!parsed.events.sales) parsed.events.sales = {};
    if (!parsed.dailyNorms) parsed.dailyNorms = {};
    return parsed;
  } catch (e) {
    console.error('Не удалось загрузить данные, создаю новое хранилище', e);
    const fresh = defaultState();
    saveState(fresh);
    return fresh;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
}
