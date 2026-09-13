/**
 * csv.js — экспорт данных в CSV (для внешнего анализа, п.4 ТЗ).
 */

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(';')];
  rows.forEach((r) => lines.push(r.map(csvEscape).join(';')));
  return '﻿' + lines.join('\n');
}

function downloadCsv(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportTasksCsv(state) {
  const headers = ['id', 'title', 'streamId', 'goalId', 'blockId', 'weekId', 'priority', 'linkType', 'status', 'plannedDate', 'actualDate', 'metricContribution'];
  const rows = state.tasks.map((t) => headers.map((h) => t[h]));
  downloadCsv('tasks.csv', rowsToCsv(headers, rows));
}

function exportLeadMetricsCsv(state) {
  const headers = ['weekId', 'metricId', 'metricName', 'streamId', 'plan', 'fact', 'executionPct'];
  const rows = [];
  Object.keys(state.leadMetricEntries).forEach((key) => {
    const [weekId, metricId] = key.split('|');
    const entry = state.leadMetricEntries[key];
    const metric = LEAD_METRICS.find((m) => m.id === metricId);
    const pct = entry.plan ? ((entry.fact || 0) / entry.plan) * 100 : '';
    rows.push([weekId, metricId, metric ? metric.name : '', metric ? metric.streamIds.join('+') : '', entry.plan, entry.fact, pct]);
  });
  downloadCsv('lead_metrics.csv', rowsToCsv(headers, rows));
}

function exportFinancialCsv(state) {
  const headers = ['id', 'streamId', 'streamName', 'periodStart', 'periodEnd', 'amount', 'note'];
  const rows = state.financialSnapshots.map((s) => {
    const stream = STREAMS.find((st) => st.id === s.streamId);
    return [s.id, s.streamId, stream ? stream.name : '', s.periodStart, s.periodEnd, s.amount, s.note || ''];
  });
  downloadCsv('financial_snapshots.csv', rowsToCsv(headers, rows));
}

function exportDailyLogsCsv(state) {
  const headers = ['id', 'taskId', 'date', 'status', 'note'];
  const rows = state.dailyLogs.map((l) => headers.map((h) => l[h]));
  downloadCsv('daily_logs.csv', rowsToCsv(headers, rows));
}

function exportAllCsv(state) {
  exportTasksCsv(state);
  exportLeadMetricsCsv(state);
  exportFinancialCsv(state);
  exportDailyLogsCsv(state);
}
