/**
 * business.js — детальная механика двух направлений со своими KPI:
 * КЮ Кадры (годовая воронка найма) и КЮ Сообщество (когорта резидентов,
 * тарифы подписки, дневной P&L). Считается отдельно от общей системы
 * недельных лид-показателей — здесь другая, более подробная механика,
 * перенесённая из рабочих таблиц пользователя.
 */

// =======================================================================
// КЮ Кадры
// =======================================================================

function kadryMonthEntry(monthKey, kpiId) {
  const m = state.kadry.months[monthKey];
  const e = m && m[kpiId];
  return { plan: e && e.plan != null ? e.plan : null, fact: e && e.fact != null ? e.fact : null };
}

function setKadryEntry(monthKey, kpiId, plan, fact) {
  if (!state.kadry.months[monthKey]) state.kadry.months[monthKey] = {};
  state.kadry.months[monthKey][kpiId] = {
    plan: plan === '' || plan === null || plan === undefined ? null : Number(plan),
    fact: fact === '' || fact === null || fact === undefined ? null : Number(fact),
  };
}

function kadryYearTotal(kpiId, field) {
  return MONTHS_2026.reduce((sum, m) => {
    const e = kadryMonthEntry(m.key, kpiId);
    return sum + (typeof e[field] === 'number' ? e[field] : 0);
  }, 0);
}

function renderKadry() {
  const refRows = KADRY_KPIS.map((k) => {
    const total = kadryYearTotal(k.id, 'fact');
    const ref = KADRY_YTD_REFERENCE[k.id];
    const pct = k.yearlyTarget ? (total / k.yearlyTarget) * 100 : null;
    return `<tr>
      <td>${k.name}</td>
      <td>${k.yearlyTarget !== null ? fmtMoney(k.yearlyTarget) : '—'} ${k.unit}</td>
      <td><b>${fmtMoney(total)} ${k.unit}</b></td>
      <td class="small muted">${ref !== undefined ? `${fmtMoney(ref)} ${k.unit}` : '—'}</td>
      <td>${pct === null ? '—' : fmtPct(pct)}</td>
    </tr>`;
  }).join('');

  const headerCells = KADRY_KPIS.map((k) => `<th colspan="2">${k.name}</th>`).join('');
  const subHeaderCells = KADRY_KPIS.map(() => '<th class="small muted">План</th><th class="small muted">Факт</th>').join('');
  const monthRows = MONTHS_2026.map((m) => {
    const cells = KADRY_KPIS.map((k) => {
      const e = kadryMonthEntry(m.key, k.id);
      return `
        <td><input type="number" step="any" class="kadry-plan" data-month="${m.key}" data-kpi="${k.id}" value="${e.plan ?? ''}"></td>
        <td><input type="number" step="any" class="kadry-fact" data-month="${m.key}" data-kpi="${k.id}" value="${e.fact ?? ''}"></td>`;
    }).join('');
    return `<tr><td class="small">${m.name}</td>${cells}</tr>`;
  }).join('');
  const totalCells = KADRY_KPIS.map((k) => `<td><b>${fmtMoney(kadryYearTotal(k.id, 'plan'))}</b></td><td><b>${fmtMoney(kadryYearTotal(k.id, 'fact'))}</b></td>`).join('');

  return `
    <div class="card">
      <h2>КЮ Кадры — годовые цели 2026</h2>
      <table>
        <thead><tr><th>Показатель</th><th>Годовая цель</th><th>Факт (сумма по месяцам)</th><th class="small">Справочно на переносе</th><th>%</th></tr></thead>
        <tbody>${refRows}</tbody>
      </table>
      <p class="small muted">Колонка «Факт» считается автоматически как сумма фактов по месяцам из таблицы ниже.</p>
    </div>
    <div class="card">
      <h2>Помесячный план работы</h2>
      <div style="overflow-x:auto">
      <table>
        <thead>
          <tr><th></th>${headerCells}</tr>
          <tr><th>Месяц</th>${subHeaderCells}</tr>
        </thead>
        <tbody>${monthRows}</tbody>
        <tfoot><tr><td>Итого</td>${totalCells}</tr></tfoot>
      </table>
      </div>
      <p class="small muted">Внесите свои план/факт по месяцам — сохраняется автоматически, итог и % от годовой цели пересчитаются сразу.</p>
    </div>
  `;
}

function bindKadryEvents() {
  document.querySelectorAll('.kadry-plan, .kadry-fact').forEach((el) => {
    el.addEventListener('change', () => {
      const month = el.dataset.month;
      const kpi = el.dataset.kpi;
      const planEl = document.querySelector(`.kadry-plan[data-month="${month}"][data-kpi="${kpi}"]`);
      const factEl = document.querySelector(`.kadry-fact[data-month="${month}"][data-kpi="${kpi}"]`);
      setKadryEntry(month, kpi, planEl.value, factEl.value);
      save();
      renderContent();
    });
  });
}

// =======================================================================
// КЮ Сообщество
// =======================================================================

function residentsChain() {
  let prevEnd = null;
  return MONTHS_2026.map((m) => {
    const rec = state.community.residents[m.key] || {};
    // Явно заданный старт (например, начало ведения учёта) важнее цепочки.
    const start = typeof rec.start === 'number' ? rec.start : (prevEnd !== null ? prevEnd : 0);
    const newCount = rec.new || 0;
    const churn = rec.churn || 0;
    const growth = newCount - churn;
    const end = start + growth;
    prevEnd = end;
    return { ...m, start, new: newCount, churn, growth, end };
  });
}

function setResidents(monthKey, field, value) {
  if (!state.community.residents[monthKey]) state.community.residents[monthKey] = {};
  state.community.residents[monthKey][field] = value === '' ? null : Number(value);
}

function tariffById(id) {
  return state.community.tariffs.find((t) => t.id === id);
}

/** Расчёт по одной записи дневного журнала: выручка и удержания от неё. */
function journalRowCalc(row) {
  const revenue = state.community.tariffs.reduce((sum, t) => sum + (Number(row.purchases[t.id]) || 0), 0);
  const acquiring = revenue * ACQUIRING_RATE;
  const tax = revenue * TAX_RATE;
  const reserve = revenue * RESERVE_RATE;
  const expense = acquiring + tax + reserve;
  const profit = revenue - expense;
  return { revenue, acquiring, tax, reserve, expense, profit };
}

function journalEntriesForMonth(monthKey) {
  return state.community.journal.filter((r) => monthKeyOf(r.date) === monthKey);
}

function tariffFactRevenueForMonth(monthKey, tariffId) {
  return journalEntriesForMonth(monthKey).reduce((sum, r) => sum + (Number(r.purchases[tariffId]) || 0), 0);
}

function getTariffSale(monthKey, tariffId) {
  const rec = (state.community.tariffSales[monthKey] || {})[tariffId] || {};
  return { planUnits: rec.planUnits ?? null, factUnits: rec.factUnits ?? null };
}

function setTariffSale(monthKey, tariffId, field, value) {
  if (!state.community.tariffSales[monthKey]) state.community.tariffSales[monthKey] = {};
  if (!state.community.tariffSales[monthKey][tariffId]) state.community.tariffSales[monthKey][tariffId] = { planUnits: null, factUnits: null };
  state.community.tariffSales[monthKey][tariffId][field] = value === '' ? null : Number(value);
}

function getMonthlyCosts(monthKey) {
  return state.community.monthlyCosts[monthKey] || { ...COMMUNITY_DEFAULT_MONTHLY_COSTS };
}

function setMonthlyCost(monthKey, field, value) {
  if (!state.community.monthlyCosts[monthKey]) state.community.monthlyCosts[monthKey] = { ...COMMUNITY_DEFAULT_MONTHLY_COSTS };
  state.community.monthlyCosts[monthKey][field] = value === '' ? 0 : Number(value);
}

/** Итог по месяцу: сумма дневного журнала + фиксированные расходы месяца. */
function communityMonthlyRollup(monthKey) {
  const rows = journalEntriesForMonth(monthKey);
  const sums = rows.reduce((acc, r) => {
    const c = journalRowCalc(r);
    acc.applications += r.applications || 0;
    acc.joined += r.joined || 0;
    acc.left += r.left || 0;
    acc.joinedDemo += r.joinedDemo || 0;
    acc.revenue += c.revenue;
    acc.acquiring += c.acquiring;
    acc.tax += c.tax;
    acc.reserve += c.reserve;
    return acc;
  }, { applications: 0, joined: 0, left: 0, joinedDemo: 0, revenue: 0, acquiring: 0, tax: 0, reserve: 0 });
  const costs = getMonthlyCosts(monthKey);
  const fixedCosts = (costs.managerSalary || 0) + (costs.techSalary || 0) + (costs.botHelp || 0) + (costs.yoNote || 0);
  const expense = sums.acquiring + sums.tax + sums.reserve + fixedCosts;
  const profit = sums.revenue - expense;
  const profitability = sums.revenue > 0 ? (profit / sums.revenue) * 100 : null;
  return { ...sums, costs, fixedCosts, expense, profit, profitability };
}

function renderCommunity() {
  const chain = residentsChain();
  const residentsRows = chain.map((m) => `
    <tr>
      <td class="small">${m.name}</td>
      <td>${fmtMoney(m.start)}</td>
      <td><input type="number" class="res-new" data-month="${m.key}" value="${m.new || ''}"></td>
      <td><input type="number" class="res-churn" data-month="${m.key}" value="${m.churn || ''}"></td>
      <td class="${m.growth < 0 ? 'muted' : ''}">${m.growth > 0 ? '+' : ''}${m.growth}</td>
      <td><b>${fmtMoney(m.end)}</b></td>
    </tr>`).join('');

  const tariffPriceRows = state.community.tariffs.map((t) => `
    <tr><td>${t.name}</td><td><input type="number" class="tariff-price" data-tariff="${t.id}" value="${t.price}" style="width:100px"></td></tr>`).join('');

  const tariffHeaderCells = state.community.tariffs.map((t) => `<th colspan="4">${t.name}</th>`).join('');
  const tariffSubHeaderCells = state.community.tariffs.map(() => '<th class="small muted">План шт</th><th class="small muted">План ₽</th><th class="small muted">Факт шт</th><th class="small muted">Факт ₽</th>').join('');
  const tariffMonthRows = MONTHS_2026.map((m) => {
    const cells = state.community.tariffs.map((t) => {
      const sale = getTariffSale(m.key, t.id);
      const planRevenue = (sale.planUnits || 0) * t.price;
      const factRevenue = tariffFactRevenueForMonth(m.key, t.id);
      return `
        <td><input type="number" class="tariff-plan-units" data-month="${m.key}" data-tariff="${t.id}" value="${sale.planUnits ?? ''}"></td>
        <td class="small muted">${fmtMoney(planRevenue)}</td>
        <td><input type="number" class="tariff-fact-units" data-month="${m.key}" data-tariff="${t.id}" value="${sale.factUnits ?? ''}"></td>
        <td class="small">${fmtMoney(factRevenue)}</td>`;
    }).join('');
    return `<tr><td class="small">${m.name}</td>${cells}</tr>`;
  }).join('');

  const journalRows = state.community.journal
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((r) => {
      const c = journalRowCalc(r);
      return `
      <tr>
        <td class="small">${r.date}</td>
        <td class="small">${r.applications || 0}</td>
        <td class="small">${r.joined || 0}</td>
        <td class="small">${r.left || 0}</td>
        <td class="small">${r.joinedDemo || 0}</td>
        ${state.community.tariffs.map((t) => `<td class="small">${fmtMoney(Number(r.purchases[t.id]) || 0)}</td>`).join('')}
        <td>${fmtMoney(c.revenue)}</td>
        <td class="small muted">${fmtMoney(c.expense)}</td>
        <td class="small">${fmtMoney(c.profit)}</td>
        <td><button class="ghost-danger journal-delete" data-id="${r.id}">×</button></td>
      </tr>`;
    }).join('');

  const journalTariffInputs = state.community.tariffs.map((t) => `
    <div class="field"><label>${t.name}, ₽</label><input type="number" step="any" name="purchase_${t.id}" placeholder="0"></div>`).join('');

  const costRows = MONTHS_2026.map((m) => {
    const c = getMonthlyCosts(m.key);
    return `
    <tr>
      <td class="small">${m.name}</td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="managerSalary" value="${c.managerSalary}"></td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="techSalary" value="${c.techSalary}"></td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="botHelp" value="${c.botHelp}"></td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="yoNote" value="${c.yoNote}"></td>
    </tr>`;
  }).join('');

  const rollupRows = MONTHS_2026.map((m) => {
    const r = communityMonthlyRollup(m.key);
    return `<tr>
      <td class="small">${m.name}</td>
      <td>${r.applications}</td><td>${r.joined}</td><td>${r.left}</td><td>${r.joinedDemo}</td>
      <td>${fmtMoney(r.revenue)}</td>
      <td class="small muted">${fmtMoney(r.acquiring)}</td>
      <td class="small muted">${fmtMoney(r.tax)}</td>
      <td class="small muted">${fmtMoney(r.reserve)}</td>
      <td class="small muted">${fmtMoney(r.expense)}</td>
      <td><b>${fmtMoney(r.profit)}</b></td>
      <td>${r.profitability === null ? '—' : fmtPct(r.profitability)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="card">
      <h2>Резиденты сообщества</h2>
      <table>
        <thead><tr><th>Месяц</th><th>Факт на начало</th><th>Новых</th><th>Отписка</th><th>Прирост</th><th>Факт на конец</th></tr></thead>
        <tbody>${residentsRows}</tbody>
      </table>
      <p class="small muted">«Факт на начало» следующего месяца всегда равен «Факт на конец» предыдущего.</p>
    </div>

    <div class="two-col">
      <div class="card">
        <h3>Тарифы</h3>
        <table><thead><tr><th>Тариф</th><th>Цена, ₽</th></tr></thead><tbody>${tariffPriceRows}</tbody></table>
      </div>
      <div class="card">
        <h3>Затраты по месяцам</h3>
        <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Месяц</th><th>ЗП КМ</th><th>ЗП техспец.</th><th>BotHelp</th><th>YoNote</th></tr></thead>
          <tbody>${costRows}</tbody>
        </table>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Продажи по тарифам</h2>
      <div style="overflow-x:auto">
      <table>
        <thead>
          <tr><th></th>${tariffHeaderCells}</tr>
          <tr><th>Месяц</th>${tariffSubHeaderCells}</tr>
        </thead>
        <tbody>${tariffMonthRows}</tbody>
      </table>
      </div>
      <p class="small muted">План ₽ = план шт × цена тарифа. Факт ₽ — автосумма из дневного журнала ниже.</p>
    </div>

    <div class="card">
      <h2>Дневной журнал</h2>
      <form id="journal-form" class="inline-form">
        <div class="field"><label>Дата</label><input type="date" id="journal-date" name="date" value="${todayStr()}" required></div>
        <div class="field"><label>Заявок</label><input type="number" name="applications" placeholder="0"></div>
        <div class="field"><label>Вступило</label><input type="number" name="joined" placeholder="0"></div>
        <div class="field"><label>Отписалось</label><input type="number" name="left" placeholder="0"></div>
        <div class="field"><label>По демо-доступу</label><input type="number" name="joinedDemo" placeholder="0"></div>
        ${journalTariffInputs}
        <div class="field"><label>Отзывов взято</label><input type="number" name="reviewsTaken" placeholder="0"></div>
        <div class="field"><label>Отзывов отвечено</label><input type="number" name="reviewsAnswered" placeholder="0"></div>
        <div class="field" style="flex:1"><label>Комментарий</label><input type="text" name="comment"></div>
        <button type="submit" class="primary">Добавить день</button>
      </form>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Дата</th><th>Заявок</th><th>Вступ.</th><th>Отпис.</th><th>Демо</th>${state.community.tariffs.map((t) => `<th class="small">${t.name}</th>`).join('')}<th>Выручка</th><th>Расход</th><th>Прибыль</th><th></th></tr></thead>
        <tbody>${journalRows || `<tr><td colspan="${9 + state.community.tariffs.length}" class="muted small">Записей пока нет — добавьте первый день</td></tr>`}</tbody>
      </table>
      </div>
      <p class="small muted">Эквайринг ${(ACQUIRING_RATE * 100).toFixed(1)}%, налог ${(TAX_RATE * 100).toFixed(1)}%, резерв ${(RESERVE_RATE * 100).toFixed(0)}% считаются от выручки дня автоматически.</p>
    </div>

    <div class="card">
      <h2>Итог по месяцам</h2>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Месяц</th><th>Заявок</th><th>Вступ.</th><th>Отпис.</th><th>Демо</th><th>Выручка</th><th>Эквайринг</th><th>Налог</th><th>Резерв</th><th>Расход</th><th>Прибыль</th><th>Рентаб.</th></tr></thead>
        <tbody>${rollupRows}</tbody>
      </table>
      </div>
    </div>
  `;
}

function bindCommunityEvents() {
  document.querySelectorAll('.res-new, .res-churn').forEach((el) => {
    el.addEventListener('change', () => {
      const field = el.classList.contains('res-new') ? 'new' : 'churn';
      setResidents(el.dataset.month, field, el.value);
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.tariff-price').forEach((el) => {
    el.addEventListener('change', () => {
      const t = tariffById(el.dataset.tariff);
      if (t) t.price = Number(el.value) || 0;
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.tariff-plan-units, .tariff-fact-units').forEach((el) => {
    el.addEventListener('change', () => {
      const field = el.classList.contains('tariff-plan-units') ? 'planUnits' : 'factUnits';
      setTariffSale(el.dataset.month, el.dataset.tariff, field, el.value);
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.cost-input').forEach((el) => {
    el.addEventListener('change', () => {
      setMonthlyCost(el.dataset.month, el.dataset.field, el.value);
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.journal-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      state.community.journal = state.community.journal.filter((r) => r.id !== id);
      save();
      renderContent();
    });
  });
  document.getElementById('journal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const purchases = {};
    state.community.tariffs.forEach((t) => {
      purchases[t.id] = Number(fd.get(`purchase_${t.id}`)) || 0;
    });
    state.community.journal.push({
      id: uid('jrn'),
      date: fd.get('date'),
      applications: Number(fd.get('applications')) || 0,
      joined: Number(fd.get('joined')) || 0,
      left: Number(fd.get('left')) || 0,
      joinedDemo: Number(fd.get('joinedDemo')) || 0,
      purchases,
      reviewsTaken: Number(fd.get('reviewsTaken')) || 0,
      reviewsAnswered: Number(fd.get('reviewsAnswered')) || 0,
      comment: fd.get('comment') || '',
    });
    save();
    renderContent();
  });
}
