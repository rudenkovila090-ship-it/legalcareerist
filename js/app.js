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
  selectedReportMonth: todayStr().slice(0, 7),
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

// Красит сам <select> статуса цветным фоном по важности (не только пилюли).
function applyStatusSelectStyle(selectEl) {
  Object.values(STATUS_CLASS).forEach((cls) => selectEl.classList.remove(`status-select-${cls}`));
  const cls = STATUS_CLASS[selectEl.value] || 'not-started';
  selectEl.classList.add(`status-select-${cls}`);
}

// Короткие названия целей для тесных колонок таблиц.
const GOAL_SHORT = { G1: 'Выручка КЮ', G2: 'Личный доход', G3: 'Накопления' };

// Простые линейные иконки для стат-плиток целей на дашборде.
const GOAL_ICONS = {
  G1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,17 9,11 13,15 21,5"/><polyline points="14,5 21,5 21,12"/></svg>',
  G2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/></svg>',
  G3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
};

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
    case 'finance': app.innerHTML = renderFinance(); bindFinanceEvents(); break;
    case 'kadry': app.innerHTML = renderKadry(); bindKadryEvents(); break;
    case 'community': app.innerHTML = renderCommunity(); bindCommunityEvents(); break;
    case 'events': app.innerHTML = renderEvents(); bindEventsEvents(); break;
    case 'marketing': app.innerHTML = renderMarketing(); bindMarketingEvents(); break;
    case 'blocks': app.innerHTML = renderBlocks(); bindBlocksEvents(); break;
    default: app.innerHTML = '<p>Неизвестная вкладка</p>';
  }
}

// ---------------------------------------------------------------------
// Дашборд
// ---------------------------------------------------------------------

function renderDashboard() {
  const today = todayStr();
  const block = currentBlock(state.blocks) || state.blocks[0];
  const week = currentWeek(state.blocks) || weeksOfBlock(block)[0];

  const goalCards = GOALS.map((g) => {
    const blockPctRaw = progressToBlockGoal(state, block, g.id, today);
    const cyclePctRaw = progressToCycleGoal(state, g.id, today);
    const blockPct = clampPct(blockPctRaw);
    const cyclePct = clampPct(cyclePctRaw);
    const sig = goalSignal(state, block, g.id, week.id, today);
    const fact = goalCurrentFact(state, g.id, today);
    return `
    <div class="card goal-card">
      <span class="signal-badge ${sig.code} tile-badge">${sig.label}</span>
      <div class="goal-tile-head">
        <div class="goal-icon">${GOAL_ICONS[g.id] || ''}</div>
        <div>
          <div class="goal-label">${g.name}</div>
          <div class="goal-value">${fmtMoney(fact)}<span class="goal-unit">${g.unit}</span></div>
        </div>
      </div>
      <div class="progress-row">
        <span class="progress-label">Блок</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${blockPct}%"></div></div>
        <span class="progress-pct">${blockPctRaw === null ? '—' : fmtPct(blockPctRaw)}</span>
      </div>
      <div class="progress-row">
        <span class="progress-label">Цикл</span>
        <div class="progress-bar"><div class="progress-fill cycle" style="width:${cyclePct}%"></div></div>
        <span class="progress-pct">${cyclePctRaw === null ? '—' : fmtPct(cyclePctRaw)}</span>
      </div>
      <div class="goal-meta">Цель блока ${fmtMoney(block.targets[g.id])} → финал ${fmtMoney(g.target)} ${g.unit}</div>
      <div class="goal-signal-text">${sig.short}</div>
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

  return `
    <div class="dash-header">
      <h2>Три цели</h2>
      <span class="muted small">Сегодня: ${fmtDateRu(today)}</span>
    </div>
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
function priorityOptions(selected) {
  return TASK_PRIORITIES.map((p) => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}
function statusOptions(selected) {
  return TASK_STATUSES.map((p) => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join('');
}

/**
 * Единственное место, где живёт логика 12-недельного плана в UI постановки
 * задач: сколько осталось до цели текущего блока и что стоит взять в работу.
 * Никаких «Блок 1, неделя 2» — только то, что помогает выбрать правильную
 * задачу сегодня.
 */
function renderTaskGuidance() {
  const today = todayStr();
  const block = currentBlock(state.blocks);
  const week = currentWeek(state.blocks);
  if (!block || !week) return '';
  const daysLeft = Math.max(0, Math.round((parseDate(block.end) - parseDate(today)) / 86400000));

  const rows = GOALS.map((g) => {
    const fact = goalCurrentFact(state, g.id, today);
    const target = block.targets[g.id];
    const gap = fact === null ? null : target - fact;
    const sig = goalSignal(state, block, g.id, week.id, today);
    const gapText = gap === null ? 'нет данных по факту' : gap > 0 ? `осталось ${fmtMoney(gap)} ${g.unit}` : 'цель блока выполнена';
    return `<tr><td>${g.name}</td><td>${gapText}</td><td><span class="signal-badge ${sig.code}">${sig.short}</span></td></tr>`;
  }).join('');

  return `
    <div class="card">
      <h3>Ориентир для задач · до конца блока ${daysLeft} дн.</h3>
      <table><tbody>${rows}</tbody></table>
      <p class="small muted">Ставьте задачи в первую очередь по направлениям с сигналом «нужна корректировка» или «не даёт результата» — они ближе всего к риску не дойти до цели блока.</p>
    </div>
  `;
}

function renderTasks() {
  const defaultStream = STREAMS[0].id;
  const rows = state.tasks
    .slice()
    .sort((a, b) => (a.plannedDate || '' < (b.plannedDate || '') ? 1 : -1))
    .map((t) => `
    <tr data-id="${t.id}">
      <td>${t.title}</td>
      <td class="small">${STREAMS.find((s) => s.id === t.streamId)?.name || ''}</td>
      <td class="small">${GOAL_SHORT[t.goalId] || t.goalId}</td>
      <td class="small">${t.priority}</td>
      <td class="small">${t.linkType}</td>
      <td>
        <select class="task-status-select" data-id="${t.id}">${statusOptions(t.status)}</select>
      </td>
      <td class="small">${fmtDateRu(t.plannedDate)}</td>
      <td><button class="ghost-danger task-delete" data-id="${t.id}">Удалить</button></td>
    </tr>`).join('');

  return `
    ${renderTaskGuidance()}

    <div class="card">
      <h2>Быстрое добавление задачи</h2>
      <form id="task-form" class="inline-form">
        <div class="field"><label>Название</label><input type="text" id="task-title-input" name="title" required placeholder="Например: написать 10 писем"></div>
        <div class="field"><label>Направление</label><select name="streamId" id="task-stream-select">${streamOptions(defaultStream)}</select></div>
        <div class="field"><label>Цель</label><select name="goalId" id="task-goal-select">${goalOptionsFor(defaultStream)}</select></div>
        <div class="field"><label>Приоритет</label><select name="priority">${priorityOptions()}</select></div>
        <div class="field"><label>Тип связи с целью</label><div class="auto-value" id="task-linktype-preview">${inferLinkType('')}</div></div>
        <div class="field"><label>Плановая дата</label><input type="date" name="plannedDate" value="${todayStr()}"></div>
        <button type="submit" class="primary">Добавить задачу</button>
      </form>
      <p class="small muted">Тип связи с целью определяется автоматически по названию задачи.</p>
    </div>

    <div class="card">
      <h2>Все задачи (${state.tasks.length})</h2>
      <table>
        <thead><tr><th>Название</th><th>Направление</th><th>Цель</th><th>Приоритет</th><th>Тип связи</th><th>Статус</th><th>План. дата</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="muted small">Задач пока нет</td></tr>'}</tbody>
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

  const titleInput = document.getElementById('task-title-input');
  const linkTypePreview = document.getElementById('task-linktype-preview');
  titleInput.addEventListener('input', () => {
    linkTypePreview.textContent = inferLinkType(titleInput.value);
  });

  document.getElementById('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const streamId = fd.get('streamId');
    const title = fd.get('title');
    const plannedDate = fd.get('plannedDate') || todayStr();
    // Неделя и блок определяются автоматически по плановой дате.
    const week = findWeekForDate(state.blocks, plannedDate);
    const task = {
      id: uid('task'),
      title,
      streamId,
      goalId: fd.get('goalId'),
      blockId: week ? week.blockId : ui.selectedBlockId,
      weekId: week ? week.id : ui.selectedWeekId,
      priority: fd.get('priority'),
      linkType: inferLinkType(title),
      status: 'не начато',
      plannedDate,
      actualDate: null,
    };
    state.tasks.push(task);
    save();
    renderContent();
  });

  document.querySelectorAll('.task-status-select').forEach((sel) => {
    applyStatusSelectStyle(sel);
    sel.addEventListener('change', (e) => {
      const task = state.tasks.find((t) => t.id === e.target.dataset.id);
      if (!task) return;
      task.status = e.target.value;
      if (task.status === 'выполнено' && !task.actualDate) task.actualDate = todayStr();
      applyStatusSelectStyle(e.target);
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
  `;
}

function bindDailyEvents() {
  document.getElementById('daily-date').addEventListener('change', (e) => {
    ui.dailyDate = e.target.value;
    renderContent();
  });
  document.querySelectorAll('.daily-status-select').forEach((sel) => {
    applyStatusSelectStyle(sel);
    sel.addEventListener('change', (e) => {
      const task = state.tasks.find((t) => t.id === e.target.dataset.id);
      if (!task) return;
      task.status = e.target.value;
      if (task.status === 'выполнено' && !task.actualDate) task.actualDate = todayStr();
      applyStatusSelectStyle(e.target);
      save();
    });
  });
  bindDailyNormsEvents();
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

    ${renderKyuMonthlyReport(ui.selectedReportMonth)}

    ${renderOkrSection(reportBlock.id)}
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
  bindKyuMonthlyReportEvents();
  bindOkrEvents();
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
// Старт
// ---------------------------------------------------------------------

// Синхронизируем финансовые факты с данными КЮ Кадры/Сообщества/Мероприятий
// сразу при загрузке — не дожидаясь правки полей вручную (например, после
// переноса данных с Google Диска).
syncKadryFinancials();
syncCommunityFinancials();
syncEventsFinancials();
saveState(state);

renderContent();
updateUndoButton();
