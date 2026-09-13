/**
 * app.js — UI: рендеринг вкладок, обработка форм, точка входа приложения.
 * Данные живут в `state` (см. storage.js) и сохраняются в localStorage после
 * каждого изменения.
 */

let state = loadState();
let activeTab = 'dashboard';
const ui = {
  selectedWeekId: null,
  selectedBlockId: null,
  dailyDate: todayStr(),
  financeMode: 'weekly', // weekly | monthly — влияет только на подсказку периода по умолчанию
};

(function initUiDefaults() {
  const w = currentWeek(state.blocks);
  const b = currentBlock(state.blocks);
  ui.selectedWeekId = w ? w.id : allWeeks(state.blocks)[0].id;
  ui.selectedBlockId = b ? b.id : state.blocks[0].id;
})();

// --- Отмена действия (Undo) ---
// Перед каждым сохранением запоминаем состояние, которое было ДО текущего
// изменения. «Отменить» откатывает последнее сохранённое изменение.
const UNDO_LIMIT = 30;
let undoStack = [];
let lastSnapshot = JSON.stringify(state);

function save() {
  undoStack.push(lastSnapshot);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  lastSnapshot = JSON.stringify(state);
  saveState(state);
  updateUndoButton();
}

function undo() {
  if (!undoStack.length) return;
  state = JSON.parse(undoStack.pop());
  lastSnapshot = JSON.stringify(state);
  saveState(state);
  renderContent();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('undo-btn');
  if (btn) btn.disabled = undoStack.length === 0;
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  }
});

function fmtMoney(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Math.round(v).toLocaleString('ru-RU');
}

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toFixed(0)}%`;
}

function clampPct(v) {
  if (v === null || v === undefined) return 0;
  return Math.max(0, Math.min(100, v));
}

function findWeekById(id) {
  return allWeeks(state.blocks).find((w) => w.id === id);
}

function weekLabel(w) {
  return `Блок ${w.blockId}, неделя ${w.weekIndex} (${fmtDateRu(w.start)}–${fmtDateRu(w.end)})`;
}
function weekLabelShort(w) {
  return `Неделя ${w.weekIndex} (${fmtDateRu(w.start)}–${fmtDateRu(w.end)})`;
}

// Устойчивые (латиница, без пробелов) CSS-классы для цветных статус-пилюль.
const STATUS_CLASS = {
  'не начато': 'not-started',
  'в работе': 'in-progress',
  'выполнено': 'done',
  'частично выполнено': 'partial',
  'отменено': 'cancelled',
  'в графике': 'ontrack',
  'риск': 'risk',
  'нет плана': 'not-started',
};

function statusPill(text) {
  const cls = STATUS_CLASS[text] || 'not-started';
  return `<span class="status-pill ${cls}">${text}</span>`;
}

// Короткие названия целей для тесных колонок таблиц.
const GOAL_SHORT = { G1: 'Выручка КЮ', G2: 'Личный доход', G3: 'Накопления' };

function findBlockById(id) {
  return state.blocks.find((b) => b.id === id);
}

// ---------------------------------------------------------------------
// Навигация по вкладкам
// ---------------------------------------------------------------------

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  renderContent();
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (btn) switchTab(btn.dataset.tab);
});
document.getElementById('undo-btn').addEventListener('click', undo);

function renderContent() {
  const app = document.getElementById('app');
  switch (activeTab) {
    case 'dashboard': app.innerHTML = renderDashboard(); break;
    case 'tasks': app.innerHTML = renderTasks(); bindTasksEvents(); break;
    case 'daily': app.innerHTML = renderDaily(); bindDailyEvents(); break;
    case 'metrics': app.innerHTML = renderMetrics(); bindMetricsEvents(); break;
    case 'finance': app.innerHTML = renderFinance(); bindFinanceEvents(); break;
    case 'kadry': app.innerHTML = renderKadry(); bindKadryEvents(); break;
    case 'community': app.innerHTML = renderCommunity(); bindCommunityEvents(); break;
    case 'events': app.innerHTML = renderEvents(); bindEventsEvents(); break;
    case 'blocks': app.innerHTML = renderBlocks(); bindBlocksEvents(); break;
    case 'settings': app.innerHTML = renderSettings(); bindSettingsEvents(); break;
    default: app.innerHTML = '<p>Неизвестная вкладка</p>';
  }
  if (activeTab === 'dashboard') bindDashboardEvents();
}

// ---------------------------------------------------------------------
// Дашборд
// ---------------------------------------------------------------------

function renderDashboard() {
  const today = todayStr();
  const block = findBlockById(ui.selectedBlockId) || currentBlock(state.blocks) || state.blocks[0];
  const week = findWeekById(ui.selectedWeekId) || currentWeek(state.blocks) || weeksOfBlock(block)[0];

  const goalCards = GOALS.map((g) => {
    const blockPct = clampPct(progressToBlockGoal(state, block, g.id, today));
    const cyclePct = clampPct(progressToCycleGoal(state, g.id, today));
    const sig = goalSignal(state, block, g.id, week.id, today);
    const fact = goalCurrentFact(state, g.id, today);
    return `
    <div class="card goal-card">
      <div class="goal-card-head">
        <span class="goal-name">${g.name}</span>
        <span class="signal-badge ${sig.code}">${sig.label}</span>
      </div>
      <div class="progress-row">
        <span class="progress-label">Блок</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${blockPct}%"></div></div>
        <span class="progress-pct">${progressToBlockGoal(state, block, g.id, today) === null ? '—' : fmtPct(progressToBlockGoal(state, block, g.id, today))}</span>
      </div>
      <div class="progress-row">
        <span class="progress-label">Цикл</span>
        <div class="progress-bar"><div class="progress-fill cycle" style="width:${cyclePct}%"></div></div>
        <span class="progress-pct">${progressToCycleGoal(state, g.id, today) === null ? '—' : fmtPct(progressToCycleGoal(state, g.id, today))}</span>
      </div>
      <div class="goal-meta">Факт: ${fmtMoney(fact)} ${g.unit} · Цель блока: ${fmtMoney(block.targets[g.id])} · Финал: ${fmtMoney(g.target)} ${g.unit}</div>
      <div class="goal-meta">Выполнение плана за неделю: ${sig.execScore === null ? '—' : fmtPct(sig.execScore)}</div>
      <div class="goal-signal-text">${sig.text}</div>
    </div>`;
  }).join('');

  const streamRows = STREAMS.filter((s) => s.kind === 'flow').map((s) => {
    const score = executionScoreForStream(state, week.id, s.id);
    const status = executionStatus(score);
    return `<tr><td>${s.name}</td><td>${score === null ? '—' : fmtPct(score)}</td><td>${statusPill(status)}</td></tr>`;
  }).join('');

  const weekTasks = state.tasks.filter((t) => t.weekId === week.id);
  const taskRows = weekTasks.length ? weekTasks.map((t) => `
    <tr>
      <td>${t.title}</td>
      <td class="small muted">${STREAMS.find((s) => s.id === t.streamId)?.name || ''}</td>
      <td class="small muted">${t.priority}</td>
      <td>${statusPill(t.status)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="muted small">Нет задач на эту неделю</td></tr>`;

  const attention = attentionItems(state, week, block);

  const weekOptions = weeksOfBlock(block).map((w) => `<option value="${w.id}" ${w.id === week.id ? 'selected' : ''}>${weekLabelShort(w)}</option>`).join('');
  const blockOptions = state.blocks.map((b) => `<option value="${b.id}" ${b.id === block.id ? 'selected' : ''}>Блок ${b.id} (${fmtDateRu(b.start)}–${fmtDateRu(b.end)})</option>`).join('');

  return `
    <div class="week-picker">
      <label>Блок: <select id="dash-block-select">${blockOptions}</select></label>
      <label>Неделя: <select id="dash-week-select">${weekOptions}</select></label>
      <span class="muted small">Сегодня: ${fmtDateRu(today)}</span>
    </div>

    <h2>Три цели</h2>
    <div class="grid-goals">${goalCards}</div>

    <div class="two-col">
      <div class="card">
        <h3>Выполнение плана по направлениям</h3>
        <table><thead><tr><th>Направление</th><th>Выполнение</th><th>Статус</th></tr></thead><tbody>${streamRows}</tbody></table>
      </div>
      <div class="card">
        <h3>Задачи текущей недели</h3>
        <table><thead><tr><th>Задача</th><th>Направление</th><th>Приоритет</th><th>Статус</th></tr></thead><tbody>${taskRows}</tbody></table>
      </div>
    </div>

    <div class="attention-box">
      <strong>На что обратить внимание</strong>
      ${attention.length ? `<ul>${attention.map((a) => `<li>${a}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:6px 0 0">Существенных отклонений не обнаружено.</p>'}
    </div>
  `;
}

function attentionItems(st, week, block) {
  const items = [];
  GOALS.forEach((g) => {
    const sig = goalSignal(st, block, g.id, week.id, week.end <= todayStr() ? week.end : todayStr());
    if (sig.code === 'red' || sig.code === 'yellow') {
      items.push(`<b>${g.name}</b>: сигнал «${sig.label}» — ${sig.text}`);
    } else if (sig.code === 'blue') {
      items.push(`<b>${g.name}</b>: сигнал «${sig.label}» — ${sig.text}`);
    }
  });
  STREAMS.filter((s) => s.kind === 'flow').forEach((s) => {
    const score = executionScoreForStream(st, week.id, s.id);
    if (score !== null && score < EXECUTION_THRESHOLD) {
      items.push(`<b>${s.name}</b>: выполнение лид-показателей ${fmtPct(score)} — ниже нормы ${EXECUTION_THRESHOLD}%, риск отставания по цели.`);
    }
  });
  return items;
}

function bindDashboardEvents() {
  const bSel = document.getElementById('dash-block-select');
  const wSel = document.getElementById('dash-week-select');
  if (bSel) bSel.addEventListener('change', (e) => {
    ui.selectedBlockId = Number(e.target.value);
    const firstWeek = weeksOfBlock(findBlockById(ui.selectedBlockId))[0];
    ui.selectedWeekId = firstWeek.id;
    renderContent();
  });
  if (wSel) wSel.addEventListener('change', (e) => {
    ui.selectedWeekId = e.target.value;
    renderContent();
  });
}

// ---------------------------------------------------------------------
// Задачи
// ---------------------------------------------------------------------

function streamOptions(selected) {
  const groups = [...new Set(STREAMS.map((s) => s.group))];
  return groups.map((group) => {
    const opts = STREAMS.filter((s) => s.group === group)
      .map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.name}</option>`)
      .join('');
    return `<optgroup label="${group}">${opts}</optgroup>`;
  }).join('');
}
function goalOptionsFor(streamId, selected) {
  const stream = STREAMS.find((s) => s.id === streamId) || STREAMS[0];
  return stream.goals.map((gid) => {
    const g = GOALS.find((x) => x.id === gid);
    return `<option value="${gid}" ${gid === selected ? 'selected' : ''}>${g.name}</option>`;
  }).join('');
}
function weekOptionsAll(selected) {
  return allWeeks(state.blocks).map((w) => `<option value="${w.id}" ${w.id === selected ? 'selected' : ''}>${weekLabel(w)}</option>`).join('');
}
function priorityOptions(selected) {
  return TASK_PRIORITIES.map((p) => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}
function linkTypeOptions(selected) {
  return TASK_LINK_TYPES.map((p) => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}
function statusOptions(selected) {
  return TASK_STATUSES.map((p) => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}

function renderTasks() {
  const defaultWeek = ui.selectedWeekId;
  const defaultStream = STREAMS[0].id;
  const rows = state.tasks
    .slice()
    .sort((a, b) => (a.weekId < b.weekId ? 1 : -1))
    .map((t) => `
    <tr data-id="${t.id}">
      <td>${t.title}</td>
      <td class="small">${STREAMS.find((s) => s.id === t.streamId)?.name || ''}</td>
      <td class="small">${GOAL_SHORT[t.goalId] || t.goalId}</td>
      <td class="small">${findWeekById(t.weekId) ? weekLabel(findWeekById(t.weekId)) : t.weekId}</td>
      <td class="small">${t.priority}</td>
      <td class="small">${t.linkType}</td>
      <td>
        <select class="task-status-select" data-id="${t.id}">${statusOptions(t.status)}</select>
      </td>
      <td class="small">${fmtDateRu(t.plannedDate)}</td>
      <td><button class="ghost-danger task-delete" data-id="${t.id}">Удалить</button></td>
    </tr>`).join('');

  return `
    <div class="card">
      <h2>Быстрое добавление задачи</h2>
      <form id="task-form" class="inline-form">
        <div class="field"><label>Название</label><input type="text" name="title" required placeholder="Например: написать 10 писем"></div>
        <div class="field"><label>Направление</label><select name="streamId" id="task-stream-select">${streamOptions(defaultStream)}</select></div>
        <div class="field"><label>Цель</label><select name="goalId" id="task-goal-select">${goalOptionsFor(defaultStream)}</select></div>
        <div class="field"><label>Неделя</label><select name="weekId">${weekOptionsAll(defaultWeek)}</select></div>
        <div class="field"><label>Приоритет</label><select name="priority">${priorityOptions()}</select></div>
        <div class="field"><label>Тип связи с целью</label><select name="linkType">${linkTypeOptions()}</select></div>
        <div class="field"><label>Плановая дата</label><input type="date" name="plannedDate" value="${todayStr()}"></div>
        <div class="field"><label>Вклад в лид-показатель (число)</label><input type="number" name="metricContribution" step="any" placeholder="напр. 12"></div>
        <button type="submit" class="primary">Добавить задачу</button>
      </form>
    </div>

    <div class="card">
      <h2>Все задачи (${state.tasks.length})</h2>
      <table>
        <thead><tr><th>Название</th><th>Направление</th><th>Цель</th><th>Неделя</th><th>Приоритет</th><th>Тип связи</th><th>Статус</th><th>План. дата</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="muted small">Задач пока нет</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

function bindTasksEvents() {
  const streamSel = document.getElementById('task-stream-select');
  const goalSel = document.getElementById('task-goal-select');
  streamSel.addEventListener('change', () => {
    goalSel.innerHTML = goalOptionsFor(streamSel.value);
  });

  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const streamId = fd.get('streamId');
    const weekId = fd.get('weekId');
    const week = findWeekById(weekId);
    const task = {
      id: uid('task'),
      title: fd.get('title'),
      streamId,
      goalId: fd.get('goalId'),
      blockId: week ? week.blockId : ui.selectedBlockId,
      weekId,
      priority: fd.get('priority'),
      linkType: fd.get('linkType'),
      status: 'не начато',
      plannedDate: fd.get('plannedDate') || null,
      actualDate: null,
      metricContribution: fd.get('metricContribution') ? Number(fd.get('metricContribution')) : null,
    };
    state.tasks.push(task);
    save();
    renderContent();
  });

  document.querySelectorAll('.task-status-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const task = state.tasks.find((t) => t.id === e.target.dataset.id);
      if (!task) return;
      task.status = e.target.value;
      if (task.status === 'выполнено' && !task.actualDate) task.actualDate = todayStr();
      save();
    });
  });

  document.querySelectorAll('.task-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      state.tasks = state.tasks.filter((t) => t.id !== id);
      save();
      renderContent();
    });
  });
}

// ---------------------------------------------------------------------
// Ежедневный отчёт
// ---------------------------------------------------------------------

function renderDaily() {
  const date = ui.dailyDate;
  // Невыполненные задачи с прошлых дней подтягиваются на сегодня автоматически
  // и остаются в списке, пока не будут отмечены выполненными/отменёнными.
  const dueTasks = state.tasks
    .filter((t) => t.plannedDate === date || (t.status !== 'выполнено' && t.status !== 'отменено' && t.plannedDate && t.plannedDate < date))
    .sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : 0)); // просроченные — первыми
  const rows = dueTasks.length ? dueTasks.map((t) => {
    const overdue = t.plannedDate && t.plannedDate < date;
    return `
    <tr data-id="${t.id}">
      <td>${t.title}${overdue ? ` <span class="status-pill risk">просрочено с ${fmtDateRu(t.plannedDate)}</span>` : ''}</td>
      <td class="small">${STREAMS.find((s) => s.id === t.streamId)?.name || ''}</td>
      <td><select class="daily-status-select" data-id="${t.id}">${statusOptions(t.status)}</select></td>
    </tr>`;
  }).join('') : `<tr><td colspan="3" class="muted small">На эту дату нет задач</td></tr>`;

  const existingLog = state.dailyLogs.find((l) => l.date === date);

  return `
    <div class="card">
      <h2>Ежедневный отчёт</h2>
      <div class="field" style="max-width:180px">
        <label>Дата</label>
        <input type="date" id="daily-date" value="${date}">
      </div>
    </div>
    <div class="card">
      <h3>Задачи на сегодня</h3>
      <table><thead><tr><th>Задача</th><th>Направление</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    ${renderDailyNorms(date)}
    <div class="card">
      <h3>Что сделал</h3>
      <form id="daily-note-form" class="inline-form">
        <div class="field" style="flex:1"><textarea name="note" rows="3" placeholder="Свободный текст: что сделал сегодня...">${existingLog ? existingLog.note : ''}</textarea></div>
        <button type="submit" class="primary">Сохранить заметку</button>
      </form>
    </div>
  `;
}

function bindDailyEvents() {
  document.getElementById('daily-date').addEventListener('change', (e) => {
    ui.dailyDate = e.target.value;
    renderContent();
  });
  document.querySelectorAll('.daily-status-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const task = state.tasks.find((t) => t.id === e.target.dataset.id);
      if (!task) return;
      task.status = e.target.value;
      if (task.status === 'выполнено' && !task.actualDate) task.actualDate = todayStr();
      save();
    });
  });
  document.getElementById('daily-note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const note = new FormData(e.target).get('note');
    let log = state.dailyLogs.find((l) => l.date === ui.dailyDate);
    if (!log) {
      log = { id: uid('log'), taskId: null, date: ui.dailyDate, status: null, note: '' };
      state.dailyLogs.push(log);
    }
    log.note = note;
    save();
  });
  bindDailyNormsEvents();
}

// ---------------------------------------------------------------------
// Лид-показатели
// ---------------------------------------------------------------------

function renderMetrics() {
  const weekId = ui.selectedWeekId;
  const week = findWeekById(weekId);
  const rows = LEAD_METRICS.map((m) => {
    const e = getLeadEntry(state, weekId, m.id);
    return `
    <tr>
      <td>${m.name}</td>
      <td class="small muted">${m.streamIds.map((sid) => STREAMS.find((s) => s.id === sid)?.name).filter(Boolean).join(' + ')}</td>
      <td><input type="number" step="any" class="metric-plan" data-metric="${m.id}" value="${e.plan ?? ''}" style="width:90px"></td>
      <td><input type="number" step="any" class="metric-fact" data-metric="${m.id}" value="${e.fact ?? ''}" style="width:90px"></td>
      <td class="small">${m.unit}</td>
    </tr>`;
  }).join('');

  const streamScores = STREAMS.filter((s) => s.kind === 'flow').map((s) => {
    const score = executionScoreForStream(state, weekId, s.id);
    return `<tr><td>${s.name}</td><td>${score === null ? '—' : fmtPct(score)}</td><td>${statusPill(executionStatus(score))}</td></tr>`;
  }).join('');
  const overall = executionScoreOverall(state, weekId);

  return `
    <div class="week-picker">
      <label>Неделя: <select id="metrics-week-select">${weekOptionsAll(weekId)}</select></label>
    </div>
    <div class="card">
      <h2>План / факт по лид-показателям</h2>
      <table>
        <thead><tr><th>Показатель</th><th>Направление</th><th>План/нед</th><th>Факт</th><th>Ед.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card">
      <h3>Выполнение плана по направлениям (норма — ${EXECUTION_THRESHOLD}%)</h3>
      <table><thead><tr><th>Направление</th><th>Выполнение</th><th>Статус</th></tr></thead><tbody>${streamScores}</tbody></table>
      <p><b>Сводное выполнение за неделю: ${overall === null ? '—' : fmtPct(overall)}</b></p>
    </div>
  `;
}

function bindMetricsEvents() {
  document.getElementById('metrics-week-select').addEventListener('change', (e) => {
    ui.selectedWeekId = e.target.value;
    renderContent();
  });
  function commit(metricId) {
    const planEl = document.querySelector(`.metric-plan[data-metric="${metricId}"]`);
    const factEl = document.querySelector(`.metric-fact[data-metric="${metricId}"]`);
    setLeadEntry(state, ui.selectedWeekId, metricId, planEl.value, factEl.value);
    save();
  }
  document.querySelectorAll('.metric-plan, .metric-fact').forEach((el) => {
    el.addEventListener('change', () => {
      commit(el.dataset.metric);
      renderContent();
    });
  });
}

// ---------------------------------------------------------------------
// Финансы
// ---------------------------------------------------------------------

function renderFinance() {
  const week = findWeekById(ui.selectedWeekId) || currentWeek(state.blocks);
  const rows = state.financialSnapshots
    .slice()
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))
    .map((s) => `
    <tr data-id="${s.id}">
      <td>${STREAMS.find((st) => st.id === s.streamId)?.name || ''}</td>
      <td class="small">${fmtDateRu(s.periodStart)} – ${fmtDateRu(s.periodEnd)}</td>
      <td>${fmtMoney(s.amount)} ₽</td>
      <td class="small muted">${s.note || ''}</td>
      <td><button class="ghost-danger fin-delete" data-id="${s.id}">Удалить</button></td>
    </tr>`).join('');

  const goalFactRows = GOALS.map((g) => {
    const fact = goalCurrentFact(state, g.id, todayStr());
    return `<tr><td>${g.name}</td><td>${fmtMoney(fact)} ${g.unit}</td></tr>`;
  }).join('');

  return `
    <div class="card">
      <h2>Ввод финансового факта</h2>
      <form id="finance-form" class="inline-form">
        <div class="field"><label>Направление</label><select name="streamId">${streamOptions(STREAMS[0].id)}</select></div>
        <div class="field"><label>Начало периода</label><input type="date" name="periodStart" value="${week ? week.start : todayStr()}"></div>
        <div class="field"><label>Конец периода</label><input type="date" name="periodEnd" value="${week ? week.end : todayStr()}"></div>
        <div class="field"><label>Сумма, ₽</label><input type="number" step="any" name="amount" required></div>
        <div class="field"><label>Комментарий</label><input type="text" name="note" placeholder="необязательно"></div>
        <button type="submit" class="primary">Добавить</button>
      </form>
      <p class="small muted">Для «Накопления (остаток)» — текущий остаток, для остальных направлений — выручка за период.</p>
    </div>

    <div class="two-col">
      <div class="card">
        <h3>Текущий факт по целям</h3>
        <table><thead><tr><th>Цель</th><th>Факт</th></tr></thead><tbody>${goalFactRows}</tbody></table>
      </div>
      <div class="card">
        <h3>История фактов</h3>
        <table><thead><tr><th>Направление</th><th>Период</th><th>Сумма</th><th>Коммент.</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted small">Пока нет данных</td></tr>'}</tbody></table>
      </div>
    </div>
  `;
}

function bindFinanceEvents() {
  document.getElementById('finance-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.financialSnapshots.push({
      id: uid('fin'),
      streamId: fd.get('streamId'),
      periodStart: fd.get('periodStart'),
      periodEnd: fd.get('periodEnd'),
      amount: Number(fd.get('amount')),
      note: fd.get('note') || '',
    });
    save();
    renderContent();
  });
  document.querySelectorAll('.fin-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      state.financialSnapshots = state.financialSnapshots.filter((s) => s.id !== id);
      save();
      renderContent();
    });
  });
}

// ---------------------------------------------------------------------
// Блоки / Отчёты
// ---------------------------------------------------------------------

function renderBlocks() {
  const blockRows = state.blocks.map((b) => `
    <tr data-block="${b.id}">
      <td>${b.id}</td>
      <td class="small">${fmtDateRu(b.start)} – ${fmtDateRu(b.end)}</td>
      ${GOALS.map((g) => `<td><input type="number" class="block-target" data-block="${b.id}" data-goal="${g.id}" value="${b.targets[g.id]}"></td>`).join('')}
    </tr>`).join('');

  const reportBlock = findBlockById(ui.selectedBlockId) || state.blocks[0];
  const report = blockReport(state, reportBlock);
  const forecastSection = GOALS.map((g) => {
    const f = forecastForGoal(state, reportBlock, g.id);
    if (!f.available) return `<div class="small muted" style="margin-bottom:6px"><b>${g.name}:</b> ${f.reason}</div>`;
    const warn = f.belowBlockTarget
      ? `⚠️ прогноз ниже цели блока на ${fmtMoney(f.blockTarget - f.forecastBlockEnd)} ${g.unit === '₽' ? '₽' : '₽/мес'}. Нужно нарастить темп на ~${fmtMoney(f.neededExtraPerWeekBlock)} ₽/нед.`
      : '✅ прогноз соответствует цели блока.';
    return `<div class="small" style="margin-bottom:6px"><b>${g.name}:</b> текущий темп ${fmtMoney(f.ratePerWeek)} ₽/нед → на конец блока ${fmtMoney(f.forecastBlockEnd)}, на 31.12 ${fmtMoney(f.forecastCycleEnd)}. ${warn}</div>`;
  }).join('');

  const goalsReportRows = report.goalsReport.map((g) => `
    <tr><td>${g.name}</td><td>${fmtMoney(g.fact)}</td><td>${fmtMoney(g.target)}</td><td>${g.pct === null ? '—' : fmtPct(g.pct)}</td></tr>
  `).join('');

  const unfinishedRows = report.unfinishedTasks.length ? report.unfinishedTasks.map((t) => `
    <tr data-id="${t.id}">
      <td>${t.title}</td><td class="small">${t.status}</td>
      <td><button class="secondary carry-task" data-id="${t.id}">Перенести в след. блок</button></td>
    </tr>`).join('') : '<tr><td colspan="3" class="muted small">Все задачи блока закрыты 🎉</td></tr>';

  const blockOptions = state.blocks.map((b) => `<option value="${b.id}" ${b.id === reportBlock.id ? 'selected' : ''}>Блок ${b.id}</option>`).join('');

  return `
    <div class="card">
      <h2>Промежуточные цели блоков</h2>
      <p class="small muted">Сколько нужно достичь к концу каждого блока, чтобы выйти на годовую цель. Правьте по итогам каждого блока — вручную, по факту.</p>
      <table>
        <thead><tr><th>Блок</th><th>Даты</th>${GOALS.map((g) => `<th>${GOAL_SHORT[g.id] || g.name}<br><span class="small muted">${g.unit}</span></th>`).join('')}</tr></thead>
        <tbody>${blockRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Отчёт по блоку</h2>
      <label class="small">Блок: <select id="report-block-select">${blockOptions}</select></label>
      <h3 style="margin-top:12px">Факт vs промежуточная цель</h3>
      <table><thead><tr><th>Цель</th><th>Факт</th><th>Цель блока</th><th>%</th></tr></thead><tbody>${goalsReportRows}</tbody></table>
      <p><b>Среднее выполнение плана за блок: ${report.avgExecScore === null ? '—' : fmtPct(report.avgExecScore)}</b></p>

      <h3>Невыполненные задачи</h3>
      <table><thead><tr><th>Задача</th><th>Статус</th><th></th></tr></thead><tbody>${unfinishedRows}</tbody></table>

      <h3>Рекомендации по следующей промежуточной цели</h3>
      <ul>${report.recommendations.map((r) => `<li class="small">${r}</li>`).join('')}</ul>
    </div>

    <div class="card">
      <h2>Прогноз (линейная экстраполяция по последним периодам)</h2>
      ${forecastSection}
    </div>
  `;
}

function bindBlocksEvents() {
  document.querySelectorAll('.block-target').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const blockId = Number(e.target.dataset.block);
      const goalId = e.target.dataset.goal;
      const block = findBlockById(blockId);
      block.targets[goalId] = Number(e.target.value);
      save();
      renderContent();
    });
  });
  document.getElementById('report-block-select').addEventListener('change', (e) => {
    ui.selectedBlockId = Number(e.target.value);
    renderContent();
  });
  document.querySelectorAll('.carry-task').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const task = state.tasks.find((t) => t.id === e.target.dataset.id);
      if (!task) return;
      const nextBlock = findBlockById(task.blockId + 1);
      if (!nextBlock) { alert('Это последний блок цикла.'); return; }
      task.blockId = nextBlock.id;
      const nextWeek = weeksOfBlock(nextBlock)[0];
      task.weekId = nextWeek.id;
      save();
      renderContent();
    });
  });
}

// ---------------------------------------------------------------------
// Настройки / экспорт
// ---------------------------------------------------------------------

function renderSettings() {
  return `
    <div class="card">
      <h2>Экспорт в CSV</h2>
      <div class="export-buttons">
        <button class="secondary" id="exp-tasks">Задачи</button>
        <button class="secondary" id="exp-metrics">Лид-показатели</button>
        <button class="secondary" id="exp-finance">Финансы</button>
        <button class="secondary" id="exp-daily">Ежедневные заметки</button>
        <button class="primary" id="exp-all">Всё сразу</button>
      </div>
    </div>
    <div class="card">
      <h2>Данные</h2>
      <p class="small muted">Хранятся только в этом браузере — без сервера и облака.</p>
      <button class="ghost-danger" id="reset-data">Сбросить все данные</button>
    </div>
  `;
}

function bindSettingsEvents() {
  document.getElementById('exp-tasks').addEventListener('click', () => exportTasksCsv(state));
  document.getElementById('exp-metrics').addEventListener('click', () => exportLeadMetricsCsv(state));
  document.getElementById('exp-finance').addEventListener('click', () => exportFinancialCsv(state));
  document.getElementById('exp-daily').addEventListener('click', () => exportDailyLogsCsv(state));
  document.getElementById('exp-all').addEventListener('click', () => exportAllCsv(state));
  document.getElementById('reset-data').addEventListener('click', () => {
    if (confirm('Точно удалить все данные без возможности восстановления?')) {
      resetAllData();
      state = loadState();
      renderContent();
    }
  });
}

// ---------------------------------------------------------------------
// Старт
// ---------------------------------------------------------------------

renderContent();
updateUndoButton();
