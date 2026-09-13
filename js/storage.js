/**
 * storage.js — персистентность в localStorage.
 * Всё хранится в одном JSON-объекте под ключом STORAGE_KEY.
 */

const STORAGE_KEY = 'kyu_12week_tracker_v1';
const DRIVE_IMPORT_VERSION = 1; // бампается при переносе новых данных с Google Диска

function defaultState() {
  return {
    version: 1,
    driveImportVersion: DRIVE_IMPORT_VERSION,
    blocks: JSON.parse(JSON.stringify(DEFAULT_BLOCKS)), // редактируемые промежуточные цели
    tasks: [], // { id, title, streamId, goalId, blockId, weekId, priority, linkType, status, plannedDate, actualDate }
    dailyLogs: [], // { id, taskId, date, status, note }
    financialSnapshots: [], // { id, streamId, periodStart, periodEnd, amount, note }
    settings: {
      lastBlockReportSeenBlockId: 0,
    },
    // --- КЮ Кадры: помесячная воронка найма (план/факт), 2026 год ---
    kadry: {
      months: seedKadryMonths(),
    },
    // --- КЮ Сообщество: когорта резидентов, тарифы подписки, дневной P&L ---
    community: {
      residents: JSON.parse(JSON.stringify(COMMUNITY_RESIDENTS_SEED)), // перенесено из вашей таблицы
      tariffs: JSON.parse(JSON.stringify(COMMUNITY_DEFAULT_TARIFFS)), // редактируемые тарифы и цены
      tariffSales: seedTariffSales(),
      journal: seedCommunityJournal(),
      monthlyCosts: JSON.parse(JSON.stringify(COMMUNITY_MONTHLY_COSTS_SEED)), // 'YYYY-MM' -> { managerSalary, techSalary, botHelp, yoNote }
    },
    // --- КЮ Мероприятия: билеты и полезные материалы ---
    events: seedEvents(),
    // --- Дневная норма (что нужно делать каждый день) ---
    dailyNorms: {}, // 'YYYY-MM-DD' -> { [normId]: factValue }
    // --- КЮ Маркетинг: проекты и KPI по соцсетям/PR/сотрудничеству/рекламе ---
    marketing: {
      projects: seedMarketingProjects(),
      kpis: [], // { id, name, category, unit }
      kpiMonthly: {}, // 'YYYY-MM' -> { [kpiId]: { plan, fact } }
    },
    // --- OKR по блокам ---
    okr: {
      objectives: [], // { id, blockId, title, keyResults: [{id,name,target,current,unit}] }
    },
  };
}

function seedKadryMonths() {
  return JSON.parse(JSON.stringify(KADRY_MONTHLY_SEED));
}

function seedTariffSales() {
  const result = {};
  Object.keys(COMMUNITY_TARIFF_PLAN_SEED).forEach((month) => {
    result[month] = result[month] || {};
    Object.entries(COMMUNITY_TARIFF_PLAN_SEED[month]).forEach(([tariffId, plan]) => {
      result[month][tariffId] = { planUnits: plan.units, planRevenue: plan.revenue, factUnits: null };
    });
  });
  Object.keys(COMMUNITY_TARIFF_FACT_SEED).forEach((month) => {
    result[month] = result[month] || {};
    Object.entries(COMMUNITY_TARIFF_FACT_SEED[month]).forEach(([tariffId, factUnits]) => {
      result[month][tariffId] = { ...(result[month][tariffId] || { planUnits: null, planRevenue: null }), factUnits };
    });
  });
  return result;
}

function seedCommunityJournal() {
  return COMMUNITY_JOURNAL_SEED.map((r) => ({
    id: uid('jrn'),
    date: r.date,
    applications: r.applications || 0,
    joined: r.joined || 0,
    left: r.left || 0,
    joinedDemo: r.joinedDemo || 0,
    purchases: { ...r.purchases },
    reviewsTaken: 0,
    reviewsAnswered: 0,
    comment: '',
  }));
}

function seedEvents() {
  const offers = JSON.parse(JSON.stringify(EVENTS_OFFERS_SEED));
  const sales = {};
  Object.keys(EVENTS_SALES_SEED).forEach((month) => {
    sales[month] = {};
    Object.entries(EVENTS_SALES_SEED[month]).forEach(([offerId, v]) => {
      sales[month][offerId] = { planQty: v.planQty ?? null, factQty: v.factQty ?? null };
    });
  });
  return { offers, sales };
}

function seedMarketingProjects() {
  return MARKETING_PROJECTS_SEED.map((p) => ({ id: uid('proj'), date: null, ...p }));
}

/**
 * Одноразовый перенос данных с Google Диска в уже существующее хранилище
 * (для тех, кто открывал приложение до переноса). Заполняет только пустые
 * места — не перезаписывает то, что вы уже ввели сами. Срабатывает один раз
 * на версию переноса (driveImportVersion).
 */
function applyDriveImport(parsed) {
  const seedMonths = seedKadryMonths();
  Object.keys(seedMonths).forEach((month) => {
    if (!parsed.kadry.months[month]) parsed.kadry.months[month] = {};
    Object.entries(seedMonths[month]).forEach(([kpiId, v]) => {
      const existing = parsed.kadry.months[month][kpiId];
      if (!existing || (existing.plan == null && existing.fact == null)) {
        parsed.kadry.months[month][kpiId] = v;
      }
    });
  });

  const seedSales = seedTariffSales();
  Object.keys(seedSales).forEach((month) => {
    if (!parsed.community.tariffSales[month]) parsed.community.tariffSales[month] = {};
    Object.entries(seedSales[month]).forEach(([tariffId, v]) => {
      const existing = parsed.community.tariffSales[month][tariffId];
      if (!existing || (existing.planUnits == null && existing.factUnits == null)) {
        parsed.community.tariffSales[month][tariffId] = v;
      }
    });
  });

  const existingDates = new Set(parsed.community.journal.map((r) => r.date));
  seedCommunityJournal().forEach((r) => {
    if (!existingDates.has(r.date)) parsed.community.journal.push(r);
  });

  Object.keys(COMMUNITY_MONTHLY_COSTS_SEED).forEach((month) => {
    if (!parsed.community.monthlyCosts[month]) {
      parsed.community.monthlyCosts[month] = { ...COMMUNITY_MONTHLY_COSTS_SEED[month] };
    }
  });

  const seededEvents = seedEvents();
  const existingOfferIds = new Set(parsed.events.offers.map((o) => o.id));
  seededEvents.offers.forEach((o) => {
    if (!existingOfferIds.has(o.id)) parsed.events.offers.push(o);
  });
  Object.keys(seededEvents.sales).forEach((month) => {
    if (!parsed.events.sales[month]) parsed.events.sales[month] = {};
    Object.entries(seededEvents.sales[month]).forEach(([offerId, v]) => {
      if (!parsed.events.sales[month][offerId]) parsed.events.sales[month][offerId] = v;
    });
  });

  const existingProjectNames = new Set(parsed.marketing.projects.map((p) => p.name));
  seedMarketingProjects().forEach((p) => {
    if (!existingProjectNames.has(p.name)) parsed.marketing.projects.push(p);
  });

  parsed.driveImportVersion = DRIVE_IMPORT_VERSION;
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
    // добавляем новые тарифы из заводского списка, если их ещё нет
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
    if (!parsed.marketing) parsed.marketing = { projects: [], kpis: [], kpiMonthly: {} };
    if (!parsed.marketing.projects) parsed.marketing.projects = [];
    if (!parsed.marketing.kpis) parsed.marketing.kpis = [];
    if (!parsed.marketing.kpiMonthly) parsed.marketing.kpiMonthly = {};
    if (!parsed.okr) parsed.okr = { objectives: [] };
    if (!parsed.okr.objectives) parsed.okr.objectives = [];

    if ((parsed.driveImportVersion || 0) < DRIVE_IMPORT_VERSION) {
      applyDriveImport(parsed);
      saveState(parsed);
    }
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
