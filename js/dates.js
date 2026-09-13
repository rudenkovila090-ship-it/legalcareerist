/**
 * dates.js — работа с датами, блоками и неделями внутри блоков.
 * Неделя внутри блока — 7-дневный период, начиная с даты старта блока;
 * последняя неделя блока может быть короче 7 дней.
 */

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(d) {
  if (typeof d === 'string') return d;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}

/** Первая и последняя дата месяца 'YYYY-MM' в виде строк. */
function monthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start: fmtDate(start), end: fmtDate(end) };
}

function todayStr() {
  const now = new Date();
  return fmtDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** Возвращает список недель { blockId, weekIndex, id, start, end } для одного блока. */
function weeksOfBlock(block) {
  const start = parseDate(block.start);
  const end = parseDate(block.end);
  const weeks = [];
  let cur = start;
  let idx = 1;
  while (cur <= end) {
    let weekEnd = addDays(cur, 6);
    if (weekEnd > end) weekEnd = end;
    weeks.push({
      blockId: block.id,
      weekIndex: idx,
      id: `B${block.id}-W${idx}`,
      start: fmtDate(cur),
      end: fmtDate(weekEnd),
    });
    cur = addDays(weekEnd, 1);
    idx += 1;
  }
  return weeks;
}

function allWeeks(blocks) {
  return blocks.flatMap(weeksOfBlock);
}

function findBlockForDate(blocks, dateStr) {
  const d = parseDate(dateStr);
  return blocks.find((b) => d >= parseDate(b.start) && d <= parseDate(b.end)) || null;
}

function findWeekForDate(blocks, dateStr) {
  const block = findBlockForDate(blocks, dateStr);
  if (!block) return null;
  const d = parseDate(dateStr);
  return weeksOfBlock(block).find((w) => d >= parseDate(w.start) && d <= parseDate(w.end)) || null;
}

function currentWeek(blocks) {
  return findWeekForDate(blocks, todayStr());
}

function currentBlock(blocks) {
  return findBlockForDate(blocks, todayStr());
}

/** Доля пройденного времени внутри блока (0..1) на указанную дату. */
function blockProgressFraction(block, dateStr) {
  const s = parseDate(block.start).getTime();
  const e = parseDate(block.end).getTime();
  const d = parseDate(dateStr).getTime();
  if (d <= s) return 0;
  if (d >= e) return 1;
  return (d - s) / (e - s);
}

/** Доля пройденного времени всего цикла (0..1) на указанную дату. */
function cycleProgressFraction(cycle, dateStr) {
  const s = parseDate(cycle.start).getTime();
  const e = parseDate(cycle.end).getTime();
  const d = parseDate(dateStr).getTime();
  if (d <= s) return 0;
  if (d >= e) return 1;
  return (d - s) / (e - s);
}
