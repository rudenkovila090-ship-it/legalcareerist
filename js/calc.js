/**
 * calc.js — вся расчётная логика: execution score, прогресс к целям блока,
 * сопоставление лид/лаг показателей (сигналы), прогноз (линейная экстраполяция).
 */

// ---------- Лид-показатели / Execution Score ----------

function leadEntryKey(weekId, metricId) {
  return `${weekId}|${metricId}`;
}

function getLeadEntry(state, weekId, metricId) {
  const key = leadEntryKey(weekId, metricId);
  const entry = state.leadMetricEntries[key];
  if (entry) return entry;
  const metric = LEAD_METRICS.find((m) => m.id === metricId);
  return { plan: metric ? metric.defaultPlan : null, fact: null };
}

function setLeadEntry(state, weekId, metricId, plan, fact) {
  const key = leadEntryKey(weekId, metricId);
  state.leadMetricEntries[key] = {
    plan: plan === '' || plan === null || plan === undefined ? null : Number(plan),
    fact: fact === '' || fact === null || fact === undefined ? null : Number(fact),
  };
}

function metricsForStream(streamId) {
  return LEAD_METRICS.filter((m) => m.streamIds.includes(streamId));
}

/** Execution score для одного направления за неделю. Возвращает null, если нет плановых данных. */
function executionScoreForStream(state, weekId, streamId) {
  const metrics = metricsForStream(streamId);
  let planSum = 0;
  let factSum = 0;
  let hasPlan = false;
  metrics.forEach((m) => {
    const e = getLeadEntry(state, weekId, m.id);
    if (typeof e.plan === 'number' && e.plan > 0) {
      hasPlan = true;
      planSum += e.plan;
      factSum += typeof e.fact === 'number' ? e.fact : 0;
    }
  });
  if (!hasPlan) return null;
  return (factSum / planSum) * 100;
}

/** Execution score по цели (среднее по направлениям цели, взвешенное по плану). */
function executionScoreForGoal(state, weekId, goalId) {
  const streams = STREAMS.filter((s) => s.goals.includes(goalId) && s.kind === 'flow');
  let planSum = 0;
  let factSum = 0;
  let hasPlan = false;
  streams.forEach((s) => {
    metricsForStream(s.id).forEach((m) => {
      const e = getLeadEntry(state, weekId, m.id);
      if (typeof e.plan === 'number' && e.plan > 0) {
        hasPlan = true;
        planSum += e.plan;
        factSum += typeof e.fact === 'number' ? e.fact : 0;
      }
    });
  });
  if (!hasPlan) return null;
  return (factSum / planSum) * 100;
}

/** Сводный execution score по всем направлениям за неделю. */
function executionScoreOverall(state, weekId) {
  let planSum = 0;
  let factSum = 0;
  let hasPlan = false;
  LEAD_METRICS.forEach((m) => {
    const e = getLeadEntry(state, weekId, m.id);
    if (typeof e.plan === 'number' && e.plan > 0) {
      hasPlan = true;
      planSum += e.plan;
      factSum += typeof e.fact === 'number' ? e.fact : 0;
    }
  });
  if (!hasPlan) return null;
  return (factSum / planSum) * 100;
}

function executionStatus(score) {
  if (score === null || score === undefined) return 'na';
  return score >= EXECUTION_THRESHOLD ? 'в графике' : 'риск';
}

// ---------- Финансовые факты ----------

/** Снапшоты направления, отсортированные по дате окончания периода (возр.) */
function snapshotsForStream(state, streamId) {
  return state.financialSnapshots
    .filter((s) => s.streamId === streamId)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0));
}

/**
 * Последний известный снапшот направления «по состоянию на» дату.
 * Берём период, который уже начался (periodStart <= atDate) — так текущая,
 * ещё не завершившаяся неделя/месяц тоже попадает в расчёт факта, как только
 * по ней есть хоть какое-то значение.
 */
function latestSnapshot(state, streamId, atDate) {
  const list = snapshotsForStream(state, streamId).filter((s) => s.periodStart <= atDate);
  return list.length ? list[list.length - 1] : null;
}

/** Текущий факт по цели на дату: для flow-целей (G1,G2) — сумма последних снапшотов
 * по каждому связанному flow-направлению; для stock-цели (G3) — последнее значение
 * накопительного направления. */
function goalCurrentFact(state, goalId, atDate) {
  const streams = STREAMS.filter((s) => s.goals.includes(goalId));
  const stock = streams.find((s) => s.kind === 'stock');
  if (stock) {
    const snap = latestSnapshot(state, stock.id, atDate);
    return snap ? snap.amount : 0;
  }
  let sum = 0;
  let any = false;
  streams.filter((s) => s.kind === 'flow').forEach((s) => {
    const snap = latestSnapshot(state, s.id, atDate);
    if (snap) {
      any = true;
      sum += snap.amount;
    }
  });
  return any ? sum : null;
}

// ---------- Прогресс к цели блока (лаг-показатель) ----------

function blockStartValue(blocks, block, goalId) {
  const idx = blocks.findIndex((b) => b.id === block.id);
  if (idx <= 0) {
    const goal = GOALS.find((g) => g.id === goalId);
    return goal ? goal.start : 0;
  }
  return blocks[idx - 1].targets[goalId];
}

function blockTargetValue(block, goalId) {
  return block.targets[goalId];
}

/** % выполнения промежуточной цели блока. */
function progressToBlockGoal(state, block, goalId, atDate) {
  const fact = goalCurrentFact(state, goalId, atDate);
  const startVal = blockStartValue(state.blocks, block, goalId);
  const targetVal = blockTargetValue(block, goalId);
  if (fact === null || targetVal === startVal) return null;
  const pct = ((fact - startVal) / (targetVal - startVal)) * 100;
  return pct;
}

/** Ожидаемое (линейное по графику) значение цели на дату внутри блока. */
function expectedPaceValue(state, block, goalId, dateStr) {
  const startVal = blockStartValue(state.blocks, block, goalId);
  const targetVal = blockTargetValue(block, goalId);
  const frac = blockProgressFraction(block, dateStr);
  return startVal + (targetVal - startVal) * frac;
}

/** % выполнения цели за весь цикл (от исходного старта до финальной цели). */
function progressToCycleGoal(state, goalId, atDate) {
  const goal = GOALS.find((g) => g.id === goalId);
  const fact = goalCurrentFact(state, goalId, atDate);
  if (fact === null || goal.target === goal.start) return null;
  return ((fact - goal.start) / (goal.target - goal.start)) * 100;
}

// ---------- Сигналы (сопоставление лид- и лаг-показателей) ----------

/**
 * Сигнал по цели за неделю.
 * exec >=85 & деньги растут по графику -> green
 * exec >=85 & деньги НЕ растут по графику -> yellow
 * exec <85 & деньги НЕ растут -> red
 * exec <85 & деньги растут -> blue
 */
function goalSignal(state, block, goalId, weekId, dateStr) {
  const execScore = executionScoreForGoal(state, weekId, goalId);
  const fact = goalCurrentFact(state, goalId, dateStr);
  if (execScore === null || fact === null) {
    return { ...SIGNALS.NA, execScore, fact };
  }
  const expected = expectedPaceValue(state, block, goalId, dateStr);
  // "растёт по факту" — сверяем с прошлым замером (неделя/период) и с ожидаемым темпом.
  const streams = STREAMS.filter((s) => s.goals.includes(goalId));
  const stock = streams.find((s) => s.kind === 'stock');
  const relevantStreamIds = (stock ? [stock] : streams.filter((s) => s.kind === 'flow')).map((s) => s.id);
  let prevFact = null;
  relevantStreamIds.forEach((sid) => {
    const snaps = snapshotsForStream(state, sid).filter((s) => s.periodEnd < dateStr);
    if (snaps.length) {
      const v = snaps[snaps.length - 1].amount;
      prevFact = (prevFact || 0) + v;
    }
  });
  const growing = prevFact === null ? fact > 0 : fact >= prevFact;
  const onPace = fact >= expected * 0.97; // допуск 3%
  const moneyOnTrack = growing && onPace;

  const execOk = execScore >= EXECUTION_THRESHOLD;
  let signal;
  if (execOk && moneyOnTrack) signal = SIGNALS.GREEN;
  else if (execOk && !moneyOnTrack) signal = SIGNALS.YELLOW;
  else if (!execOk && !moneyOnTrack) signal = SIGNALS.RED;
  else signal = SIGNALS.BLUE;

  return { ...signal, execScore, fact, expected, moneyOnTrack };
}

// ---------- Прогноз (линейная экстраполяция) ----------

/**
 * На основе снапшотов направлений цели за последние N периодов считает
 * среднюю скорость роста (₽/период) и экстраполирует на конец блока и на конец цикла.
 */
function forecastForGoal(state, block, goalId, periods = 3) {
  const goal = GOALS.find((g) => g.id === goalId);
  const streams = STREAMS.filter((s) => s.goals.includes(goalId));
  const stock = streams.find((s) => s.kind === 'stock');
  const relevantStreamIds = (stock ? [stock] : streams.filter((s) => s.kind === 'flow')).map((s) => s.id);

  // Собираем помесячно/понедельно суммарный факт по всем periodEnd датам, встречающимся в снапшотах.
  const byPeriod = {};
  relevantStreamIds.forEach((sid) => {
    snapshotsForStream(state, sid).forEach((snap) => {
      byPeriod[snap.periodEnd] = (byPeriod[snap.periodEnd] || 0) + snap.amount;
    });
  });
  const periodEnds = Object.keys(byPeriod).sort();
  if (periodEnds.length < 2) {
    return { available: false, reason: 'Недостаточно финансовых фактов (нужно минимум 2 периода).' };
  }
  const recent = periodEnds.slice(-periods);
  const points = recent.map((d) => ({ date: d, value: byPeriod[d] }));
  const first = points[0];
  const last = points[points.length - 1];
  const daysSpan = (parseDate(last.date) - parseDate(first.date)) / 86400000;
  if (daysSpan <= 0) {
    return { available: false, reason: 'Недостаточно временного разброса между фактами.' };
  }
  const ratePerDay = (last.value - first.value) / daysSpan;
  const lastDate = parseDate(last.date);

  const daysToBlockEnd = (parseDate(block.end) - lastDate) / 86400000;
  const daysToCycleEnd = (parseDate(CYCLE.end) - lastDate) / 86400000;
  const forecastBlockEnd = last.value + ratePerDay * Math.max(daysToBlockEnd, 0);
  const forecastCycleEnd = last.value + ratePerDay * Math.max(daysToCycleEnd, 0);

  const blockTarget = blockTargetValue(block, goalId);
  const cycleTarget = goal.target;

  const blockGapWeekly = ratePerDay * 7;
  const requiredRatePerDayBlock = daysToBlockEnd > 0 ? (blockTarget - last.value) / daysToBlockEnd : 0;
  const requiredRatePerDayCycle = daysToCycleEnd > 0 ? (cycleTarget - last.value) / daysToCycleEnd : 0;
  const neededExtraPerWeekBlock = (requiredRatePerDayBlock - ratePerDay) * 7;
  const neededExtraPerWeekCycle = (requiredRatePerDayCycle - ratePerDay) * 7;

  return {
    available: true,
    lastValue: last.value,
    lastDate: last.date,
    ratePerWeek: ratePerDay * 7,
    forecastBlockEnd,
    forecastCycleEnd,
    blockTarget,
    cycleTarget,
    belowBlockTarget: forecastBlockEnd < blockTarget,
    belowCycleTarget: forecastCycleEnd < cycleTarget,
    neededExtraPerWeekBlock,
    neededExtraPerWeekCycle,
  };
}

// ---------- Отчёт по блоку ----------

function blockReport(state, block) {
  const goalsReport = GOALS.map((g) => {
    const fact = goalCurrentFact(state, g.id, block.end);
    const target = blockTargetValue(block, g.id);
    const startVal = blockStartValue(state.blocks, block, g.id);
    const pct = fact !== null && target !== startVal ? ((fact - startVal) / (target - startVal)) * 100 : null;
    return { goalId: g.id, name: g.name, fact, target, startVal, pct };
  });

  const weeks = weeksOfBlock(block);
  const scores = weeks
    .map((w) => executionScoreOverall(state, w.id))
    .filter((s) => s !== null);
  const avgExecScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const unfinishedTasks = state.tasks.filter(
    (t) => t.blockId === block.id && t.status !== 'выполнено' && t.status !== 'отменено'
  );

  const recommendations = goalsReport.map((g) => {
    if (g.pct === null) return `${g.name}: недостаточно данных для рекомендации.`;
    if (g.pct >= 100) return `${g.name}: цель блока выполнена (${g.pct.toFixed(0)}%) — можно повышать амбицию следующего блока.`;
    if (g.pct >= 85) return `${g.name}: почти по плану (${g.pct.toFixed(0)}%) — небольшая корректировка следующей промежуточной цели.`;
    return `${g.name}: отставание (${g.pct.toFixed(0)}%) — пересмотреть промежуточную цель следующего блока и/или увеличить объём действий.`;
  });

  return { block, goalsReport, avgExecScore, unfinishedTasks, recommendations };
}
