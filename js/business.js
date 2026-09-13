/**
 * business.js — детальная механика двух направлений со своими KPI:
 * КЮ Кадры (годовая воронка найма) и КЮ Сообщество (когорта резидентов,
 * тарифы подписки, дневной P&L). Считается отдельно от общей системы
 * недельных лид-показателей — здесь другая, более подробная механика,
 * перенесённая из рабочих таблиц пользователя.
 */

/**
 * Обновляет (или создаёт) финансовый снапшот направления за месяц так,
 * чтобы разные источники одной и той же цифры (например, ручной ввод на
 * вкладке «Финансы» и авторасчёт из КЮ Кадры/Сообщества/Мероприятий) не
 * расходились: при конфликте остаётся БОЛЬШЕЕ значение.
 */
function syncMonthlyFinancialSnapshot(streamId, monthKey, amount, note) {
  if (!(amount > 0)) return;
  const { start, end } = monthBounds(monthKey);
  const snap = state.financialSnapshots.find((s) => s.streamId === streamId && s.periodStart === start && s.periodEnd === end);
  if (!snap) {
    state.financialSnapshots.push({ id: uid('fin'), streamId, periodStart: start, periodEnd: end, amount, note });
  } else if (amount > snap.amount) {
    snap.amount = amount;
    snap.note = note;
  }
}

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
    const sumFact = kadryYearTotal(k.id, 'fact');
    const ref = KADRY_YTD_REFERENCE[k.id];
    // Если сумма по месяцам и справочная цифра расходятся — берём большую.
    const total = ref !== undefined ? Math.max(sumFact, ref) : sumFact;
    const pct = k.yearlyTarget ? (total / k.yearlyTarget) * 100 : null;
    return `<tr>
      <td>${k.name}</td>
      <td>${k.yearlyTarget !== null ? fmtMoney(k.yearlyTarget) : '—'} ${k.unit}</td>
      <td><b>${fmtMoney(total)} ${k.unit}</b></td>
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
        <thead><tr><th>Показатель</th><th>Годовая цель</th><th>Факт</th><th>%</th></tr></thead>
        <tbody>${refRows}</tbody>
      </table>
      <p class="small muted">«Факт» — сумма по месяцам ниже (или ваша цифра на момент переноса таблицы, если она больше).</p>
    </div>
    <div class="card">
      <h2>Помесячный план работы</h2>
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead>
          <tr><th></th>${headerCells}</tr>
          <tr><th>Месяц</th>${subHeaderCells}</tr>
        </thead>
        <tbody>${monthRows}</tbody>
        <tfoot><tr><td>Итого</td>${totalCells}</tr></tfoot>
      </table>
      </div>
      <p class="small muted">Сохраняется автоматически — итог и % от годовой цели пересчитаются сразу.</p>
    </div>
  `;
}

function syncKadryFinancials() {
  MONTHS_2026.forEach((m) => {
    const fact = kadryMonthEntry(m.key, 'revenue').fact;
    if (typeof fact === 'number' && fact > 0) {
      syncMonthlyFinancialSnapshot('S1', m.key, fact, 'Автосинхронизировано из КЮ Кадры');
    }
  });
}

function bindKadryEvents() {
  document.querySelectorAll('.kadry-plan, .kadry-fact').forEach((el) => {
    el.addEventListener('change', () => {
      const month = el.dataset.month;
      const kpi = el.dataset.kpi;
      const planEl = document.querySelector(`.kadry-plan[data-month="${month}"][data-kpi="${kpi}"]`);
      const factEl = document.querySelector(`.kadry-fact[data-month="${month}"][data-kpi="${kpi}"]`);
      setKadryEntry(month, kpi, planEl.value, factEl.value);
      syncKadryFinancials();
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

/** Факт продаж (шт) тарифа за месяц: если ручной ввод и авторасчёт из
 * выручки дневного журнала расходятся — берём большее число. */
function reconciledTariffFactUnits(monthKey, tariff) {
  const manual = getTariffSale(monthKey, tariff.id).factUnits || 0;
  const revenue = tariffFactRevenueForMonth(monthKey, tariff.id);
  const implied = tariff.price > 0 ? Math.round(revenue / tariff.price) : 0;
  return Math.max(manual, implied);
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

function syncCommunityFinancials() {
  MONTHS_2026.forEach((m) => {
    const r = communityMonthlyRollup(m.key);
    if (r.revenue > 0) syncMonthlyFinancialSnapshot('S2', m.key, r.revenue, 'Автосинхронизировано из КЮ Сообщества');
  });
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

  // Тарифы + продажи объединены в одну таблицу: цена — прямо в шапке колонки.
  const tariffHeaderCells = state.community.tariffs.map((t) => `
    <th colspan="3">${t.name}<br><input type="number" class="tariff-price" data-tariff="${t.id}" value="${t.price}" title="Цена, ₽"> ₽</th>`).join('');
  const tariffSubHeaderCells = state.community.tariffs.map(() => '<th class="small muted">План шт</th><th class="small muted">Факт шт</th><th class="small muted">Факт ₽</th>').join('');
  const tariffMonthRows = MONTHS_2026.map((m) => {
    const cells = state.community.tariffs.map((t) => {
      const sale = getTariffSale(m.key, t.id);
      const factUnits = reconciledTariffFactUnits(m.key, t);
      const factRevenue = tariffFactRevenueForMonth(m.key, t.id);
      return `
        <td><input type="number" class="tariff-plan-units" data-month="${m.key}" data-tariff="${t.id}" value="${sale.planUnits ?? ''}"></td>
        <td><input type="number" class="tariff-fact-units" data-month="${m.key}" data-tariff="${t.id}" value="${sale.factUnits ?? ''}" title="Можно поправить вручную — если авторасчёт из журнала больше, используется он"></td>
        <td class="small">${fmtMoney(factRevenue)}${factUnits > (sale.factUnits || 0) ? ' <span class="small muted">(авто)</span>' : ''}</td>`;
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
        <td class="small">${fmtDateRu(r.date)}</td>
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

  // Затраты объединены с итогом по месяцам: редактируете прямо в этой таблице.
  const rollupRows = MONTHS_2026.map((m) => {
    const r = communityMonthlyRollup(m.key);
    return `<tr>
      <td class="small">${m.name}</td>
      <td>${r.applications}</td><td>${r.joined}</td><td>${r.left}</td><td>${r.joinedDemo}</td>
      <td>${fmtMoney(r.revenue)}</td>
      <td class="small muted">${fmtMoney(r.acquiring)}</td>
      <td class="small muted">${fmtMoney(r.tax)}</td>
      <td class="small muted">${fmtMoney(r.reserve)}</td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="managerSalary" value="${r.costs.managerSalary}"></td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="techSalary" value="${r.costs.techSalary}"></td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="botHelp" value="${r.costs.botHelp}"></td>
      <td><input type="number" class="cost-input" data-month="${m.key}" data-field="yoNote" value="${r.costs.yoNote}"></td>
      <td class="small muted">${fmtMoney(r.expense)}</td>
      <td><b>${fmtMoney(r.profit)}</b></td>
      <td>${r.profitability === null ? '—' : fmtPct(r.profitability)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="card">
      <h2>Резиденты сообщества</h2>
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead><tr><th>Месяц</th><th>Факт на начало</th><th>Новых</th><th>Отписка</th><th>Прирост</th><th>Факт на конец</th></tr></thead>
        <tbody>${residentsRows}</tbody>
      </table>
      </div>
      <p class="small muted">«Факт на начало» следующего месяца всегда равен «Факт на конец» предыдущего.</p>
    </div>

    <div class="card">
      <h2>Тарифы и продажи</h2>
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead>
          <tr><th></th>${tariffHeaderCells}</tr>
          <tr><th>Месяц</th>${tariffSubHeaderCells}</tr>
        </thead>
        <tbody>${tariffMonthRows}</tbody>
      </table>
      </div>
      <p class="small muted">Цена — в шапке колонки тарифа. Факт ₽ считается из дневного журнала ниже; факт шт можно поправить вручную, но если авторасчёт из выручки больше — используется он.</p>
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
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead><tr><th>Дата</th><th>Заявок</th><th>Вступ.</th><th>Отпис.</th><th>Демо</th>${state.community.tariffs.map((t) => `<th class="small">${t.name}</th>`).join('')}<th>Выручка</th><th>Расход</th><th>Прибыль</th><th></th></tr></thead>
        <tbody>${journalRows || `<tr><td colspan="${9 + state.community.tariffs.length}" class="muted small">Записей пока нет — добавьте первый день</td></tr>`}</tbody>
      </table>
      </div>
      <p class="small muted">Эквайринг ${(ACQUIRING_RATE * 100).toFixed(1)}%, налог ${(TAX_RATE * 100).toFixed(1)}%, резерв ${(RESERVE_RATE * 100).toFixed(0)}% считаются от выручки дня автоматически.</p>
    </div>

    <div class="card">
      <h2>Итог по месяцам</h2>
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead><tr><th>Месяц</th><th>Заявок</th><th>Вступ.</th><th>Отпис.</th><th>Демо</th><th>Выручка</th><th>Эквайринг</th><th>Налог</th><th>Резерв</th><th>Зарплата комьюнити-менеджера</th><th>Зарплата технического специалиста</th><th>BotHelp</th><th>YoNote</th><th>Расход</th><th>Прибыль</th><th>Рентаб.</th></tr></thead>
        <tbody>${rollupRows}</tbody>
      </table>
      </div>
      <p class="small muted">Выручка и удержания подтягиваются из дневного журнала выше; расходы редактируются прямо здесь. Эта же выручка автоматически идёт в «Финансы» → направление «КЮ Сообщество».</p>
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
      syncCommunityFinancials();
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
      syncCommunityFinancials();
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
    syncCommunityFinancials();
    save();
    renderContent();
  });
}

// =======================================================================
// КЮ Мероприятия — билеты и полезные материалы
// =======================================================================

function offerById(id) {
  return state.events.offers.find((o) => o.id === id);
}

function getOfferSale(monthKey, offerId) {
  const rec = (state.events.sales[monthKey] || {})[offerId] || {};
  return { planQty: rec.planQty ?? null, factQty: rec.factQty ?? null };
}

function setOfferSale(monthKey, offerId, field, value) {
  if (!state.events.sales[monthKey]) state.events.sales[monthKey] = {};
  if (!state.events.sales[monthKey][offerId]) state.events.sales[monthKey][offerId] = { planQty: null, factQty: null };
  state.events.sales[monthKey][offerId][field] = value === '' ? null : Number(value);
}

function eventsMonthlyRevenue(monthKey, field) {
  return state.events.offers.reduce((sum, o) => {
    const sale = getOfferSale(monthKey, o.id);
    return sum + (sale[field] || 0) * o.price;
  }, 0);
}

function syncEventsFinancials() {
  MONTHS_2026.forEach((m) => {
    const revenue = eventsMonthlyRevenue(m.key, 'factQty');
    if (revenue > 0) syncMonthlyFinancialSnapshot('S3', m.key, revenue, 'Автосинхронизировано из КЮ Мероприятий');
  });
}

function renderEvents() {
  const offerRows = state.events.offers.map((o) => `
    <tr data-id="${o.id}">
      <td>${o.name}</td>
      <td class="small muted">${o.type}</td>
      <td><input type="number" class="offer-price" data-id="${o.id}" value="${o.price}" style="width:90px"></td>
      <td><button class="ghost-danger offer-delete" data-id="${o.id}">Удалить</button></td>
    </tr>`).join('');

  const monthRows = state.events.offers.length ? MONTHS_2026.map((m) => {
    const cells = state.events.offers.map((o) => {
      const sale = getOfferSale(m.key, o.id);
      const planRevenue = (sale.planQty || 0) * o.price;
      const factRevenue = (sale.factQty || 0) * o.price;
      return `
        <td><input type="number" class="offer-plan-qty" data-month="${m.key}" data-offer="${o.id}" value="${sale.planQty ?? ''}"></td>
        <td class="small muted">${fmtMoney(planRevenue)}</td>
        <td><input type="number" class="offer-fact-qty" data-month="${m.key}" data-offer="${o.id}" value="${sale.factQty ?? ''}"></td>
        <td class="small">${fmtMoney(factRevenue)}</td>`;
    }).join('');
    return `<tr><td class="small">${m.name}</td>${cells}<td><b>${fmtMoney(eventsMonthlyRevenue(m.key, 'factQty'))}</b></td></tr>`;
  }).join('') : '';

  const offerHeaderCells = state.events.offers.map((o) => `<th colspan="4">${o.name}</th>`).join('');
  const offerSubHeaderCells = state.events.offers.map(() => '<th class="small muted">План шт</th><th class="small muted">План ₽</th><th class="small muted">Факт шт</th><th class="small muted">Факт ₽</th>').join('');

  return `
    <div class="card">
      <h2>Каталог: билеты и материалы</h2>
      <form id="offer-form" class="inline-form">
        <div class="field"><label>Название</label><input type="text" name="name" required placeholder="Например: билет на мастер-класс"></div>
        <div class="field"><label>Тип</label><select name="type"><option value="${EVENT_OFFER_TYPES.TICKET}">${EVENT_OFFER_TYPES.TICKET}</option><option value="${EVENT_OFFER_TYPES.MATERIAL}">${EVENT_OFFER_TYPES.MATERIAL}</option></select></div>
        <div class="field"><label>Цена, ₽</label><input type="number" name="price" required></div>
        <button type="submit" class="primary">Добавить</button>
      </form>
      <table>
        <thead><tr><th>Название</th><th>Тип</th><th>Цена, ₽</th><th></th></tr></thead>
        <tbody>${offerRows || '<tr><td colspan="4" class="muted small">Добавьте первый билет или материал</td></tr>'}</tbody>
      </table>
    </div>

    ${state.events.offers.length ? `
    <div class="card">
      <h2>Продажи по месяцам</h2>
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead>
          <tr><th></th>${offerHeaderCells}<th></th></tr>
          <tr><th>Месяц</th>${offerSubHeaderCells}<th class="small muted">Выручка, ₽</th></tr>
        </thead>
        <tbody>${monthRows}</tbody>
      </table>
      </div>
      <p class="small muted">Выручка автоматически идёт в «Финансы» → направление «КЮ Мероприятия».</p>
    </div>` : ''}
  `;
}

function bindEventsEvents() {
  document.getElementById('offer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.events.offers.push({
      id: uid('offer'),
      name: fd.get('name'),
      type: fd.get('type'),
      price: Number(fd.get('price')) || 0,
    });
    save();
    renderContent();
  });
  document.querySelectorAll('.offer-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      state.events.offers = state.events.offers.filter((o) => o.id !== id);
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.offer-price').forEach((el) => {
    el.addEventListener('change', () => {
      const o = offerById(el.dataset.id);
      if (o) o.price = Number(el.value) || 0;
      syncEventsFinancials();
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.offer-plan-qty, .offer-fact-qty').forEach((el) => {
    el.addEventListener('change', () => {
      const field = el.classList.contains('offer-plan-qty') ? 'planQty' : 'factQty';
      setOfferSale(el.dataset.month, el.dataset.offer, field, el.value);
      syncEventsFinancials();
      save();
      renderContent();
    });
  });
}

// =======================================================================
// Дневная норма — то, что нужно делать каждый день
// =======================================================================

function getDailyNormFact(date, normId) {
  const rec = state.dailyNorms[date];
  return rec && typeof rec[normId] === 'number' ? rec[normId] : 0;
}

function setDailyNormFact(date, normId, value) {
  if (!state.dailyNorms[date]) state.dailyNorms[date] = {};
  state.dailyNorms[date][normId] = value === '' ? 0 : Number(value);
}

function renderDailyNorms(date) {
  let lastGroup = null;
  const rows = DAILY_NORMS.map((n) => {
    const fact = getDailyNormFact(date, n.id);
    const done = fact >= n.target;
    const showGroup = n.group !== lastGroup;
    lastGroup = n.group;
    return `<tr>
      <td class="small muted norms-group-cell">${showGroup ? n.group : ''}</td>
      <td>${n.name}</td>
      <td class="small muted">${n.target} ${n.unit}</td>
      <td><input type="number" class="norm-fact" data-norm="${n.id}" value="${fact || ''}"></td>
      <td>${statusPill(done ? 'выполнено' : 'не начато')}</td>
    </tr>`;
  }).join('');

  return `
    <div class="card">
      <h2>Дневная норма</h2>
      <table class="norms-table">
        <colgroup><col style="width:20%"><col style="width:34%"><col style="width:16%"><col style="width:14%"><col style="width:16%"></colgroup>
        <thead><tr><th>Направление</th><th>Норма</th><th>Цель</th><th>Факт</th><th>Статус</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindDailyNormsEvents() {
  document.querySelectorAll('.norm-fact').forEach((el) => {
    el.addEventListener('change', () => {
      setDailyNormFact(ui.dailyDate, el.dataset.norm, el.value);
      save();
      renderContent();
    });
  });
}

// =======================================================================
// КЮ Маркетинг — проекты и KPI по соцсетям/PR/сотрудничеству/рекламе
// =======================================================================

function marketingKpiEntry(monthKey, kpiId) {
  const rec = (state.marketing.kpiMonthly[monthKey] || {})[kpiId] || {};
  return { plan: rec.plan ?? null, fact: rec.fact ?? null };
}

function setMarketingKpiEntry(monthKey, kpiId, plan, fact) {
  if (!state.marketing.kpiMonthly[monthKey]) state.marketing.kpiMonthly[monthKey] = {};
  state.marketing.kpiMonthly[monthKey][kpiId] = {
    plan: plan === '' || plan === null ? null : Number(plan),
    fact: fact === '' || fact === null ? null : Number(fact),
  };
}

function renderMarketing() {
  const projectRows = state.marketing.projects
    .slice()
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'в работе' ? -1 : 1))
    .map((p) => `
    <tr data-id="${p.id}">
      <td>${p.name}</td>
      <td class="small muted">${p.category}</td>
      <td class="small muted">${fmtDateRu(p.date)}</td>
      <td><select class="project-status-select" data-id="${p.id}">${MARKETING_PROJECT_STATUSES.map((s) => `<option value="${s}" ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="small muted">${p.notes || ''}</td>
      <td><button class="ghost-danger project-delete" data-id="${p.id}">Удалить</button></td>
    </tr>`).join('');

  const kpiRows = state.marketing.kpis.map((k) => `
    <tr data-id="${k.id}">
      <td>${k.name}</td>
      <td class="small muted">${k.category}</td>
      <td class="small muted">${k.unit}</td>
      <td><button class="ghost-danger kpi-delete" data-id="${k.id}">Удалить</button></td>
    </tr>`).join('');

  const kpiHeaderCells = state.marketing.kpis.map((k) => `<th colspan="2">${k.name}</th>`).join('');
  const kpiSubHeaderCells = state.marketing.kpis.map(() => '<th class="small muted">План</th><th class="small muted">Факт</th>').join('');
  const monthRows = state.marketing.kpis.length ? MONTHS_2026.map((m) => {
    const cells = state.marketing.kpis.map((k) => {
      const e = marketingKpiEntry(m.key, k.id);
      return `
        <td><input type="number" step="any" class="mkpi-plan" data-month="${m.key}" data-kpi="${k.id}" value="${e.plan ?? ''}"></td>
        <td><input type="number" step="any" class="mkpi-fact" data-month="${m.key}" data-kpi="${k.id}" value="${e.fact ?? ''}"></td>`;
    }).join('');
    return `<tr><td class="small">${m.name}</td>${cells}</tr>`;
  }).join('') : '';

  return `
    <div class="card">
      <h2>Проекты</h2>
      <form id="project-form" class="inline-form">
        <div class="field"><label>Название</label><input type="text" name="name" required placeholder="Например: ребрендинг соцсетей"></div>
        <div class="field"><label>Категория</label><select name="category">${MARKETING_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
        <div class="field"><label>Дата</label><input type="date" name="date" value="${todayStr()}"></div>
        <div class="field" style="flex:1"><label>Заметка</label><input type="text" name="notes"></div>
        <button type="submit" class="primary">Добавить проект</button>
      </form>
      <table>
        <thead><tr><th>Название</th><th>Категория</th><th>Дата</th><th>Статус</th><th>Заметка</th><th></th></tr></thead>
        <tbody>${projectRows || '<tr><td colspan="6" class="muted small">Проектов пока нет</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>KPI по направлениям</h2>
      <form id="kpi-form" class="inline-form">
        <div class="field"><label>Название KPI</label><input type="text" name="name" required placeholder="Например: подписчики Instagram"></div>
        <div class="field"><label>Категория</label><select name="category">${MARKETING_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></div>
        <div class="field"><label>Единица</label><input type="text" name="unit" placeholder="шт / ₽ / %" required></div>
        <button type="submit" class="primary">Добавить KPI</button>
      </form>
      <table>
        <thead><tr><th>KPI</th><th>Категория</th><th>Ед.</th><th></th></tr></thead>
        <tbody>${kpiRows || '<tr><td colspan="4" class="muted small">Добавьте первый KPI</td></tr>'}</tbody>
      </table>
    </div>

    ${state.marketing.kpis.length ? `
    <div class="card">
      <h2>План / факт по месяцам</h2>
      <div class="freeze-wrap">
      <table class="freeze-table">
        <thead>
          <tr><th></th>${kpiHeaderCells}</tr>
          <tr><th>Месяц</th>${kpiSubHeaderCells}</tr>
        </thead>
        <tbody>${monthRows}</tbody>
      </table>
      </div>
    </div>` : ''}
  `;
}

function bindMarketingEvents() {
  document.getElementById('project-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.marketing.projects.push({
      id: uid('proj'),
      name: fd.get('name'),
      category: fd.get('category'),
      date: fd.get('date') || todayStr(),
      status: 'в работе',
      notes: fd.get('notes') || '',
    });
    save();
    renderContent();
  });
  document.querySelectorAll('.project-status-select').forEach((sel) => {
    applyStatusSelectStyle(sel);
    sel.addEventListener('change', (e) => {
      const p = state.marketing.projects.find((x) => x.id === e.target.dataset.id);
      if (p) p.status = e.target.value;
      applyStatusSelectStyle(e.target);
      save();
    });
  });
  document.querySelectorAll('.project-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.marketing.projects = state.marketing.projects.filter((p) => p.id !== e.target.dataset.id);
      save();
      renderContent();
    });
  });

  document.getElementById('kpi-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.marketing.kpis.push({
      id: uid('mkpi'),
      name: fd.get('name'),
      category: fd.get('category'),
      unit: fd.get('unit'),
    });
    save();
    renderContent();
  });
  document.querySelectorAll('.kpi-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.marketing.kpis = state.marketing.kpis.filter((k) => k.id !== e.target.dataset.id);
      save();
      renderContent();
    });
  });
  document.querySelectorAll('.mkpi-plan, .mkpi-fact').forEach((el) => {
    el.addEventListener('change', () => {
      const month = el.dataset.month;
      const kpi = el.dataset.kpi;
      const planEl = document.querySelector(`.mkpi-plan[data-month="${month}"][data-kpi="${kpi}"]`);
      const factEl = document.querySelector(`.mkpi-fact[data-month="${month}"][data-kpi="${kpi}"]`);
      setMarketingKpiEntry(month, kpi, planEl.value, factEl.value);
      save();
      renderContent();
    });
  });
}

// =======================================================================
// Ежемесячный отчёт — только по «Карьерному юристу» (G1: Кадры, Сообщество,
// Мероприятия, Маркетинг, Legal Tech, HR — без личного дохода и накоплений)
// =======================================================================

const KYU_REVENUE_STREAMS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

function kyuMonthlyReport(monthKey) {
  const { start, end } = monthBounds(monthKey);
  const revenueByStream = KYU_REVENUE_STREAMS.map((sid) => {
    const stream = STREAMS.find((s) => s.id === sid);
    const snap = state.financialSnapshots.find((s) => s.streamId === sid && s.periodStart === start && s.periodEnd === end);
    return { stream, amount: snap ? snap.amount : 0 };
  });
  const totalRevenue = revenueByStream.reduce((sum, r) => sum + r.amount, 0);

  const kadryFacts = KADRY_KPIS.filter((k) => k.id !== 'revenue').map((k) => ({
    kpi: k, fact: kadryMonthEntry(monthKey, k.id).fact,
  }));

  const residentsRow = residentsChain().find((m) => m.key === monthKey);
  const communityRollup = communityMonthlyRollup(monthKey);

  const eventsRevenue = eventsMonthlyRevenue(monthKey, 'factQty');

  const tasksInMonth = state.tasks.filter((t) => t.plannedDate && monthKeyOf(t.plannedDate) === monthKey);
  const tasksDone = tasksInMonth.filter((t) => t.status === 'выполнено').length;

  return { monthKey, start, end, revenueByStream, totalRevenue, kadryFacts, residentsRow, communityRollup, eventsRevenue, tasksInMonth, tasksDone };
}

function renderKyuMonthlyReport(monthKey) {
  const r = kyuMonthlyReport(monthKey);
  const revenueRows = r.revenueByStream.map((x) => `<tr><td>${x.stream.name}</td><td>${fmtMoney(x.amount)} ₽</td></tr>`).join('');
  const kadryRows = r.kadryFacts.filter((x) => x.fact !== null).map((x) => `<tr><td>${x.kpi.name}</td><td>${fmtMoney(x.fact)} ${x.kpi.unit}</td></tr>`).join('');
  const monthOptions = MONTHS_2026.map((m) => `<option value="${m.key}" ${m.key === monthKey ? 'selected' : ''}>${m.name}</option>`).join('');

  return `
    <div class="card">
      <h2>Ежемесячный отчёт — Карьерный юрист</h2>
      <label class="small">Месяц: <select id="kyu-report-month-select">${monthOptions}</select></label>
      <h3 style="margin-top:12px">Выручка по направлениям</h3>
      <table><thead><tr><th>Направление</th><th>Выручка</th></tr></thead><tbody>${revenueRows}</tbody></table>
      <p><b>Итого за месяц: ${fmtMoney(r.totalRevenue)} ₽</b></p>

      ${kadryRows ? `<h3>КЮ Кадры — факт по KPI</h3><table><thead><tr><th>Показатель</th><th>Факт</th></tr></thead><tbody>${kadryRows}</tbody></table>` : ''}

      ${r.residentsRow ? `<h3>КЮ Сообщество</h3><p class="small">Резидентов на конец месяца: <b>${r.residentsRow.end}</b> (${r.residentsRow.growth >= 0 ? '+' : ''}${r.residentsRow.growth} за месяц) · Прибыль сообщества: <b>${fmtMoney(r.communityRollup.profit)} ₽</b></p>` : ''}

      ${r.eventsRevenue > 0 ? `<p class="small">КЮ Мероприятия — выручка за месяц: <b>${fmtMoney(r.eventsRevenue)} ₽</b></p>` : ''}

      <h3>Задачи</h3>
      <p class="small">Выполнено ${r.tasksDone} из ${r.tasksInMonth.length} задач, запланированных на этот месяц.</p>
    </div>
  `;
}

function bindKyuMonthlyReportEvents() {
  const sel = document.getElementById('kyu-report-month-select');
  if (sel) sel.addEventListener('change', (e) => {
    ui.selectedReportMonth = e.target.value;
    renderContent();
  });
}

// =======================================================================
// OKR по блокам (Objectives & Key Results)
// =======================================================================

function okrObjectivesForBlock(blockId) {
  return state.okr.objectives.filter((o) => o.blockId === blockId);
}

function krProgress(kr) {
  if (!kr.target) return null;
  return Math.max(0, Math.min(100, (kr.current / kr.target) * 100));
}

function objectiveProgress(o) {
  if (!o.keyResults.length) return null;
  const vals = o.keyResults.map(krProgress).filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderOkrSection(blockId) {
  const objectives = okrObjectivesForBlock(blockId);

  const objectivesHtml = objectives.map((o) => {
    const prog = objectiveProgress(o);
    const krRows = o.keyResults.map((kr) => {
      const p = krProgress(kr);
      return `<tr data-kr="${kr.id}" data-objective="${o.id}">
        <td>${kr.name}</td>
        <td><input type="number" step="any" class="kr-current" data-objective="${o.id}" data-kr="${kr.id}" value="${kr.current}"></td>
        <td class="small muted">из ${fmtMoney(kr.target)} ${kr.unit}</td>
        <td style="min-width:120px">
          <div class="progress-bar"><div class="progress-fill" style="width:${p === null ? 0 : p}%"></div></div>
        </td>
        <td class="small">${p === null ? '—' : fmtPct(p)}</td>
        <td><button class="ghost-danger kr-delete" data-objective="${o.id}" data-kr="${kr.id}">×</button></td>
      </tr>`;
    }).join('');

    return `
    <div class="card">
      <div class="goal-card-top">
        <b>${o.title}</b>
        <span class="signal-badge ${prog === null ? 'na' : prog >= 85 ? 'green' : prog >= 50 ? 'yellow' : 'red'}">${prog === null ? 'Нет данных' : fmtPct(prog)}</span>
      </div>
      <table>
        <thead><tr><th>Ключевой результат</th><th>Текущее</th><th></th><th>Прогресс</th><th></th><th></th></tr></thead>
        <tbody>${krRows || '<tr><td colspan="6" class="muted small">Добавьте ключевой результат ниже</td></tr>'}</tbody>
      </table>
      <form class="inline-form add-kr-form" data-objective="${o.id}">
        <div class="field"><label>Ключевой результат</label><input type="text" name="name" required placeholder="Например: 20 закрытых вакансий"></div>
        <div class="field"><label>Цель</label><input type="number" step="any" name="target" required></div>
        <div class="field"><label>Ед.</label><input type="text" name="unit" placeholder="шт / ₽ / %"></div>
        <button type="submit" class="secondary">Добавить KR</button>
      </form>
      <button class="ghost-danger objective-delete" data-objective="${o.id}" style="margin-top:8px">Удалить цель</button>
    </div>`;
  }).join('');

  const overallProgress = objectives.length
    ? objectives.map(objectiveProgress).filter((v) => v !== null).reduce((acc, v, _, arr) => acc + v / arr.length, 0)
    : null;

  return `
    <div class="card">
      <h2>OKR блока ${blockId}</h2>
      ${overallProgress !== null ? `<p><b>Прогресс по всем целям блока: ${fmtPct(overallProgress)}</b></p>` : '<p class="small muted">Целей пока нет — добавьте первую ниже.</p>'}
      <form id="objective-form" class="inline-form" data-block="${blockId}">
        <div class="field" style="flex:1"><label>Новая цель (Objective)</label><input type="text" name="title" required placeholder="Например: закрепиться в топ-3 кадровых агентств ниши"></div>
        <button type="submit" class="primary">Добавить цель</button>
      </form>
    </div>
    ${objectivesHtml}
  `;
}

function bindOkrEvents() {
  const objForm = document.getElementById('objective-form');
  if (objForm) objForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.okr.objectives.push({
      id: uid('okr'),
      blockId: Number(e.target.dataset.block),
      title: fd.get('title'),
      keyResults: [],
    });
    save();
    renderContent();
  });

  document.querySelectorAll('.add-kr-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const o = state.okr.objectives.find((x) => x.id === e.target.dataset.objective);
      if (!o) return;
      o.keyResults.push({
        id: uid('kr'),
        name: fd.get('name'),
        target: Number(fd.get('target')) || 0,
        current: 0,
        unit: fd.get('unit') || '',
      });
      save();
      renderContent();
    });
  });

  document.querySelectorAll('.kr-current').forEach((el) => {
    el.addEventListener('change', () => {
      const o = state.okr.objectives.find((x) => x.id === el.dataset.objective);
      const kr = o && o.keyResults.find((k) => k.id === el.dataset.kr);
      if (kr) kr.current = Number(el.value) || 0;
      save();
      renderContent();
    });
  });

  document.querySelectorAll('.kr-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const o = state.okr.objectives.find((x) => x.id === e.target.dataset.objective);
      if (o) o.keyResults = o.keyResults.filter((k) => k.id !== e.target.dataset.kr);
      save();
      renderContent();
    });
  });

  document.querySelectorAll('.objective-delete').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.okr.objectives = state.okr.objectives.filter((o) => o.id !== e.target.dataset.objective);
      save();
      renderContent();
    });
  });
}
