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
  };
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
