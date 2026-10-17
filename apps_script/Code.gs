/**
 * Ассистент «Карьерный юрист»: Telegram-бот внутри Google Таблицы.
 * Бесплатно: работает на Google Apps Script, хостинг, ключи и платные сервисы не нужны.
 * Таблица остаётся единственной памятью бота.
 *
 * @OnlyCurrentDoc
 */

// ============================================================================
// 1. НАСТРОЙКИ (можно менять)
// ============================================================================
const SETTINGS = {
  morning: '09:00',      // утренний список
  evening: '21:00',      // вечернее напоминание
  weekPlan: '09:05',     // план недели (понедельник)
  weekReview: '20:00',   // разбор недели (воскресенье)
  monthReview: '20:30',  // разбор месяца (последний день месяца)
  monthStart: '09:10',   // напоминание про цели месяца (1-е число)
  followupDays: 5,       // через сколько дней напомнить, если у шага нет срока
  hotMinutes: 4,         // сколько минут после сообщения бот отвечает почти мгновенно
  hotBudgetMinutes: 25,  // дневной лимит «быстрого режима» (квота Google: 90 мин/день)
  lateHours: 4,          // насколько можно опоздать с плановым сообщением
  lagThreshold: 0.85,    // ниже этой доли от нормы показатель считается отстающим
};

const SHEET_ACTIONS = 'Действия', SHEET_CONTACTS = 'Обращения', SHEET_SALES = 'Продажи';
const SHEET_PLANS = 'Планы', SHEET_SUMMARY = 'Сводка', SHEET_TASKS = 'Задачи', SHEET_GOALS = 'План года';

const CONTACT_COLS = ['Дата', 'Источник', 'Кто обратился', 'Имя или ник', 'Запрос', 'Этап',
  'Следующий шаг', 'Срок шага', 'Комментарий', 'Статус шага'];
const SALES_COLS = ['Дата', 'Направление', 'Клиент', 'Что продано', 'Сумма, ₽', 'Оплачено, ₽',
  'Источник', 'Статус оплаты', 'Долг, ₽', 'Комментарий'];
const TASK_COLS = ['ID', 'Срок', 'Задача', 'Направление', 'Цель (ID)', 'Статус', 'Источник', 'Результат'];
const GOAL_COLS = ['ID', 'Период', 'Направление', 'Цель', 'Метрика', 'Целевое значение', 'Единица',
  'Приоритет', 'Комментарий', 'Недельные действия'];

const TERMINAL_STAGES = ['Выход', 'Отказ', 'Закрыто'];
const STEP_DONE = 'сделано';
const STEP_OVERDUE = 'просрочен'; // именно это слово считает «Сводка»

// Показатели листа «Действия»: ключ, заголовок колонки.
const METRICS = [
  { key: 'touches', header: 'Касания работодателям' },
  { key: 'replies', header: 'Ответы работодателей' },
  { key: 'calls', header: 'Созвоны и встречи' },
  { key: 'proposals', header: 'КП отправлено' },
  { key: 'contracts', header: 'Договоры подписаны (новые клиенты)' },
  { key: 'new_residents', header: 'Новые резиденты' },
  { key: 'left_residents', header: 'Ушло резидентов' },
  { key: 'events_held', header: 'Мероприятий проведено' },
  { key: 'attendees', header: 'Участников пришло' },
  { key: 'posts', header: 'Посты и контент, шт' },
  { key: 'expenses', header: 'Расходы за день, ₽' },
  { key: 'hours_total', header: 'Часы работы' },
  { key: 'hours_sales', header: 'Часы на продажи' },
];
function metricHeader_(key) { return METRICS.filter(function (m) { return m.key === key; })[0].header; }

// ============================================================================
// 2. МЕЛКИЕ ПОМОЩНИКИ: текст и даты (даты внутри бота это строки ГГГГ-ММ-ДД)
// ============================================================================
const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
  'сентября', 'октября', 'ноября', 'декабря'];

function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function stripTags_(s) { return String(s).replace(/<[^>]+>/g, ''); }
function cut_(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1) + '…'; }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function cap_(s) { s = String(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function isoParts_(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return { y: +m[1], m: +m[2], d: +m[3] }; }
function isoToUtc_(iso) { const p = isoParts_(iso); return Date.UTC(p.y, p.m - 1, p.d); }
function isoFromUtc_(t) {
  const d = new Date(t);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}
function addDays_(iso, n) { return isoFromUtc_(isoToUtc_(iso) + n * 86400000); }
function diffDays_(a, b) { return Math.round((isoToUtc_(a) - isoToUtc_(b)) / 86400000); }
function weekdayIdx_(iso) { return (new Date(isoToUtc_(iso)).getUTCDay() + 6) % 7; } // пн = 0
function mondayOf_(iso) { return addDays_(iso, -weekdayIdx_(iso)); }
function serial_(iso) { return Math.round((isoToUtc_(iso) - Date.UTC(1899, 11, 30)) / 86400000); }
function fromSerial_(n) { return isoFromUtc_(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); }
function ru_(iso) { const p = isoParts_(iso); return pad2_(p.d) + '.' + pad2_(p.m) + '.' + p.y; }
function short_(iso) { const p = isoParts_(iso); return pad2_(p.d) + '.' + pad2_(p.m); }
function daysInMonth_(iso) { const p = isoParts_(iso); return new Date(Date.UTC(p.y, p.m, 0)).getUTCDate(); }
function monthEnd_(iso) { const p = isoParts_(iso); return p.y + '-' + pad2_(p.m) + '-' + pad2_(daysInMonth_(iso)); }
function monthStart_(iso) { const p = isoParts_(iso); return p.y + '-' + pad2_(p.m) + '-01'; }
function wdName_(iso) { return WEEKDAYS[weekdayIdx_(iso)]; }
function isoWeekLabel_(iso) {
  const t = new Date(isoToUtc_(iso));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3); // четверг этой недели
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return t.getUTCFullYear() + '-W' + pad2_(week);
}
function validDate_(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? isoFromUtc_(t.getTime()) : null;
}

// «Сейчас». __NOW__ подставляют только тесты.
let TZ_CACHE_ = null;
function tz_() { return TZ_CACHE_ || (TZ_CACHE_ = SpreadsheetApp.getActive().getSpreadsheetTimeZone()); }
function nowDate_() { return (typeof __NOW__ !== 'undefined' && __NOW__) ? new Date(__NOW__()) : new Date(); }
function nowInfo_() {
  const s = Utilities.formatDate(nowDate_(), tz_(), 'yyyy-MM-dd HH:mm');
  const hh = +s.slice(11, 13), mm = +s.slice(14, 16);
  return { iso: s.slice(0, 10), min: hh * 60 + mm };
}
function today_() { return nowInfo_().iso; }
function hhmm_(s) { const p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }

// Число из ячейки или текста: «13,000» (en_US) -> 13000, «1,5» -> 1.5, «35%» -> 35.
function num_(v) {
  if (typeof v === 'number') return v;
  let s = String(v === null || v === undefined ? '' : v).replace(/[\s %₽]/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const x = parseFloat(s);
  return isNaN(x) ? 0 : x;
}
function numOut_(x) { return Math.round(x * 100) / 100; }
function fmtNorm_(x) { return fmtNum_(x >= 10 ? Math.round(x) : Math.round(x * 10) / 10); }
function fmtNum_(x) {
  x = numOut_(x);
  const parts = String(x).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}
function hash_(s) {
  let h = 5381;
  s = String(s);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36).slice(-3);
}

// ============================================================================
// 3. РАЗБОР ДАТ НА РУССКОМ: «завтра», «в пятницу», «через 3 дня», «20.10», «5 ноября»
// ============================================================================
const CYR = '[а-яё]*';
const NO_CYR_BEFORE = '(?<![а-яё])';
const NO_CYR_AFTER = '(?![а-яё])';
const WD_RE = [
  /пн|понедельник[а-яё]*/, /вт|вторник[а-яё]*/, /ср|сред[а-яё]*/, /чт|четверг[а-яё]*/,
  /пт|пятниц[а-яё]*/, /сб|суббот[а-яё]*/, /вс|воскресень[а-яё]*/,
];

function tidy_(s) {
  return s.replace(/\s+/g, ' ').replace(/^[\s,;:—–\-]+|[\s,;:—–\-]+$/g, '').trim();
}

/** Возвращает { iso, rest }: найденная дата (или null) и текст без слов про дату. */
function parseDateWords_(text, today) {
  const s = String(text);
  const low = s.toLowerCase();
  let hit = null;

  function take(re, fn) {
    if (hit) return;
    const m = re.exec(low);
    if (!m) return;
    const iso = fn(m);
    if (iso) hit = { iso: iso, from: m.index, to: m.index + m[0].length };
  }
  function rollYear(d, mo, y, explicit) {
    let iso = validDate_(y, mo, d);
    if (iso && !explicit && iso < today) iso = validDate_(y + 1, mo, d);
    return iso;
  }
  const ty = isoParts_(today).y;

  // 20.10, 20/10, 20.10.2026, 20.10.26 (не цепляем «1.5ч»)
  take(/(?<![\d.])(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?(?![\d]|[а-яё])/, function (m) {
    let y = m[3] ? +m[3] : ty;
    if (m[3] && m[3].length === 2) y += 2000;
    return rollYear(+m[1], +m[2], y, !!m[3]);
  });
  // 5 ноября [2027]
  take(new RegExp('(\\d{1,2})\\s+(' + MONTHS_GEN.join('|') + ')(?:\\s+(\\d{4}))?'), function (m) {
    return rollYear(+m[1], MONTHS_GEN.indexOf(m[2]) + 1, m[3] ? +m[3] : ty, !!m[3]);
  });
  // через 3 дня / через 2 недели / через неделю / через месяц
  take(new RegExp(NO_CYR_BEFORE + 'через\\s+(?:(\\d+)\\s*)?(дн[а-яё]*|день|недел[а-яё]*|месяц[а-яё]*)'), function (m) {
    const n = m[1] ? +m[1] : 1;
    if (/^дн|^день/.test(m[2])) return addDays_(today, n);
    if (/^недел/.test(m[2])) return addDays_(today, 7 * n);
    return addDays_(today, 30 * n);
  });
  take(new RegExp(NO_CYR_BEFORE + 'через\\s+пару\\s+дней'), function () { return addDays_(today, 2); });
  // слова
  take(new RegExp(NO_CYR_BEFORE + 'послезавтра' + NO_CYR_AFTER), function () { return addDays_(today, 2); });
  take(new RegExp(NO_CYR_BEFORE + 'позавчера' + NO_CYR_AFTER), function () { return addDays_(today, -2); });
  take(new RegExp(NO_CYR_BEFORE + 'завтра' + NO_CYR_AFTER), function () { return addDays_(today, 1); });
  take(new RegExp(NO_CYR_BEFORE + 'вчера' + NO_CYR_AFTER), function () { return addDays_(today, -1); });
  take(new RegExp(NO_CYR_BEFORE + 'сегодня' + NO_CYR_AFTER), function () { return today; });
  // на следующей неделе -> ближайший понедельник
  take(new RegExp(NO_CYR_BEFORE + '(?:на\\s+)?след[а-яё.]*\\s+недел' + CYR), function () {
    return addDays_(mondayOf_(today), 7);
  });
  // день недели (строго в будущем): «в пятницу», «до пт», «вторник»
  for (let i = 0; i < 7 && !hit; i++) {
    const re = new RegExp(NO_CYR_BEFORE + '(?:(?:в|во|до|к|на)\\s+)?(?:' + WD_RE[i].source + ')' + NO_CYR_AFTER);
    take(re, function () {
      let delta = (i - weekdayIdx_(today) + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays_(today, delta);
    });
  }
  if (!hit) return { iso: null, rest: tidy_(s) };
  return { iso: hit.iso, rest: tidy_(s.slice(0, hit.from) + ' ' + s.slice(hit.to)) };
}

// ============================================================================
// 4. БЫСТРЫЙ ОТЧЁТ БЕЗ НЕЙРОСЕТИ: «написал 15, 3 ответили, созвон 1, кп 2, часов 6»
// ============================================================================
const NUM = '(\\d+(?:[.,]\\d+)?)';
const SEP = '\\s*[:=\\-–]?\\s*';
// Порядок важен: более узкие правила идут первыми и «съедают» свой фрагмент.
const REPORT_RULES = [
  { key: 'hours_sales', pats: ['час' + CYR + '\\s+(?:на\\s+)?продаж' + CYR + SEP + NUM, NUM + '\\s*ч(?:ас' + CYR + ')?\\s+(?:на\\s+)?продаж' + CYR] },
  { key: 'left_residents', pats: ['(?:ушл' + CYR + '|ушёл|отпал' + CYR + '|вышл' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:резидент' + CYR + '\\s+)?(?:ушл' + CYR + '|ушёл|отпал' + CYR + ')'] },
  { key: 'new_residents', pats: ['(?:нов' + CYR + '\\s+)?резидент(?:ов|а|ы)?' + NO_CYR_AFTER + SEP + NUM, NUM + '\\s*(?:нов' + CYR + '\\s+)?резидент(?:ов|а|ы)?' + NO_CYR_AFTER] },
  { key: 'expenses', pats: ['(?:расход' + CYR + '|потратил' + CYR + '|трат' + CYR + ')' + SEP + NUM + '(?:\\s*(тыс' + CYR + '\\.?|к' + NO_CYR_AFTER + '))?'] },
  { key: 'hours_total', pats: ['(?:работал' + CYR + '|часов(?:\\s+работы)?)' + SEP + NUM, NUM + '\\s*(?:ч|час' + CYR + ')' + NO_CYR_AFTER] },
  { key: 'replies', pats: ['(?:ответ' + CYR + '|откликнул' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:ответ' + CYR + '|откликнул' + CYR + ')'] },
  { key: 'proposals', pats: [NO_CYR_BEFORE + 'кп' + NO_CYR_AFTER + SEP + NUM, NUM + '\\s*(?:кп' + NO_CYR_AFTER + '|коммерческ' + CYR + '\\s+предложен' + CYR + ')'] },
  { key: 'contracts', pats: ['(?:договор' + CYR + '|контракт' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:договор' + CYR + '|контракт' + CYR + ')'] },
  { key: 'calls', pats: ['(?:созвон' + CYR + '|звонк' + CYR + '|звонок|встреч' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:созвон' + CYR + '|звонк' + CYR + '|звонок|встреч' + CYR + ')'] },
  { key: 'events_held', pats: ['(?:мероприят' + CYR + '|ивент' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:мероприят' + CYR + '|ивент' + CYR + ')'] },
  { key: 'attendees', pats: ['(?:участник' + CYR + '|гост' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:участник' + CYR + '|гост' + CYR + ')'] },
  { key: 'posts', pats: ['(?:пост' + CYR + '|сторис|рилс' + CYR + ')' + SEP + NUM, NUM + '\\s*(?:пост' + CYR + '|сторис|рилс' + CYR + ')'] },
  { key: 'touches', pats: ['(?:касани' + CYR + '|написал' + CYR + '|писал' + CYR + '|обзвонил' + CYR + ')' + SEP + NUM, NUM + '\\s*касани' + CYR] },
];
const REPORT_RES_ = REPORT_RULES.map(function (r) {
  return { key: r.key, res: r.pats.map(function (p) { return new RegExp(p, 'i'); }) };
});

/**
 * Разбирает отчёт. Возвращает null, если не нашёл ни одного показателя, иначе
 * { items:[{key,value}], iso, mode:'add'|'set', leftover }.
 */
function parseQuickReport_(text, today) {
  let work = String(text);
  const items = [];
  REPORT_RES_.forEach(function (rule) {
    for (let i = 0; i < rule.res.length; i++) {
      const m = rule.res[i].exec(work);
      if (!m) continue;
      let v = num_(m[1]);
      if (rule.key === 'expenses' && m[2]) v *= 1000;
      items.push({ key: rule.key, value: v });
      work = work.slice(0, m.index) + ' ' + work.slice(m.index + m[0].length);
      return;
    }
  });
  if (!items.length) return null;
  const mode = /(?<![а-яё])(поправ[а-яё]*|исправ[а-яё]*|на самом деле|итого|всего|было)(?![а-яё])/i.test(text) ? 'set' : 'add';
  const d = parseDateWords_(work, today);
  return { items: items, iso: d.iso || today, mode: mode, leftover: d.rest };
}

// ============================================================================
// 5. ТАБЛИЦА (чтение и запись). Правила те же, что у «Сводки»:
//    даты пишем числами, формулы (Продажи H:I) не трогаем, «просрочен» ставит бот.
// ============================================================================
function ss_() { return SpreadsheetApp.getActive(); }
function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('В таблице нет листа «' + name + '»');
  return s;
}
function s_(x) { return x === null || x === undefined ? '' : String(x).trim(); }
function isDateObj_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }


/** Google Таблицы разбирают записанный текст как при ручном вводе: «+7999…» станет числом, «10.11» датой,
 *  «=…» формулой. Апостроф в начале заставляет хранить значение как текст (сам апостроф не сохраняется). */
function txt_(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (!s) return s;
  return /^[=+\-@']/.test(s) || /^[\d\s.,:\/()+\-]+$/.test(s) ? "'" + s : s;
}

function cellIso_(v, d) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s_(d));
  if (m) return validDate_(+m[3], +m[2], +m[1]);
  if (isDateObj_(v)) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 36526 && v < 80000) return fromSerial_(v);
  return null;
}

function readGrid_(name, ncols) {
  const sh = sheet_(name);
  const rng = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 2000), ncols);
  return { sh: sh, v: rng.getValues(), d: rng.getDisplayValues() };
}
function lastUsedRow_(g, cols) {
  let last = 1;
  for (let i = 1; i < g.d.length; i++) {
    for (let k = 0; k < cols.length; k++) {
      if (s_(g.d[i][cols[k]]) !== '') { last = i + 1; break; }
    }
  }
  return last;
}
function ensureRows_(sh, need) {
  const max = sh.getMaxRows();
  if (need > max) sh.insertRowsAfter(max, need - max + 50);
}
function setDateFmt_(sh, r, c) { sh.getRange(r, c).setNumberFormat('dd.mm.yyyy'); }

// --- справочники и план -------------------------------------------------------------------
function readLists_() {
  const d = sheet_(SHEET_PLANS).getRange(1, 1, 40, 12).getDisplayValues();
  const header = (d[1] || []).map(s_);
  function col(title) {
    const c = header.indexOf(title);
    const out = [];
    if (c < 0) return out;
    for (let r = 2; r < d.length; r++) {
      const v = s_(d[r][c]);
      if (!v) break;
      out.push(v);
    }
    return out;
  }
  return { sources: col('Источник'), who: col('Кто обратился'), stages: col('Этап'), directions: col('Направление') };
}

/** Строки «Сводки» (как показаны в таблице) и воронка людей. */
function readSummary_() {
  const sh = sheet_(SHEET_SUMMARY);
  const d = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 80), 9).getDisplayValues();
  const rows = [], funnel = {};
  let start = -1;
  for (let i = 0; i < d.length; i++) if (s_(d[i][0]) === 'Показатель') { start = i; break; }
  if (start < 0) return { rows: rows, funnel: funnel };
  let inFunnel = false, cols = [];
  for (let i = start + 1; i < d.length; i++) {
    const r = d[i].map(s_);
    if (!r[0]) continue;
    if (r[0].indexOf('Воронка по людям') === 0) { inFunnel = true; continue; }
    if (inFunnel) {
      if (r[0] === 'Этап') cols = r.slice(1, 4);
      else if (cols.length) funnel[r[0]] = { cand: r[1], emp: r[2], res: r[3] };
      continue;
    }
    const section = !r.slice(1, 8).some(function (x) { return x !== ''; });
    rows.push({ label: r[0], today: r[1], week: r[2], month: r[3], plan: r[4], pct: r[5], perDay: r[6],
      light: r[7], goodWhen: r[8], section: section });
  }
  return { rows: rows, funnel: funnel };
}

// --- обращения (люди) ----------------------------------------------------------------------
function readContacts_() {
  const g = readGrid_(SHEET_CONTACTS, 10);
  const list = [];
  for (let i = 1; i < g.v.length; i++) {
    const v = g.v[i], d = g.d[i];
    let any = false;
    for (let c = 0; c < 9; c++) if (s_(d[c]) !== '') { any = true; break; }
    if (!any) continue;
    list.push({ row: i + 1, date: cellIso_(v[0], d[0]), source: s_(v[1]), who: s_(v[2]), name: s_(v[3]),
      request: s_(v[4]), stage: s_(v[5]), nextStep: s_(v[6]), due: cellIso_(v[7], d[7]),
      comment: s_(v[8]), status: s_(v[9]) });
  }
  return { g: g, list: list };
}
function isOpen_(c) { return TERMINAL_STAGES.indexOf(c.stage) < 0 && c.status.toLowerCase() !== STEP_DONE; }
function effDue_(c) {
  if (!isOpen_(c)) return null;
  if (c.due) return c.due;
  if (c.date && c.nextStep) return addDays_(c.date, SETTINGS.followupDays);
  return null;
}
function stepStatus_(stage, nextStep, due, done, today) {
  if (done && !nextStep) return STEP_DONE;
  if (TERMINAL_STAGES.indexOf(stage) < 0 && due && due < today && nextStep) return STEP_OVERDUE;
  return '';
}
function stampComment_(old, add, today) {
  const lines = s_(old) ? s_(old).split('\n') : [];
  lines.push(short_(today) + ': ' + s_(add));
  while (lines.join('\n').length > 1000 && lines.length > 1) lines.shift();
  return lines.join('\n');
}

function appendContact_(c, today) {
  const g = readGrid_(SHEET_CONTACTS, 10);
  const r = lastUsedRow_(g, [0, 1, 2, 3, 4, 5, 6, 7, 8]) + 1;
  ensureRows_(g.sh, r);
  const stage = c.stage || 'Новый';
  const status = stepStatus_(stage, c.nextStep || '', c.due || null, false, today);
  g.sh.getRange(r, 1, 1, 10).setValues([[serial_(c.date || today), txt_(c.source || 'Другое'), txt_(c.who || 'Другое'), txt_(c.name),
    txt_(c.request || ''), txt_(stage), txt_(c.nextStep || ''), c.due ? serial_(c.due) : '', txt_(c.comment || ''), status]]);
  setDateFmt_(g.sh, r, 1);
  if (c.due) setDateFmt_(g.sh, r, 8);
  return r;
}

/** patch: { stage, nextStep, due, stepDone, comment (строка или функция от записи) }. Проверяет, что в строке тот же человек. */
function patchContact_(row, expectHash, patch, today) {
  const rc = readContacts_();
  const cur = rc.list.filter(function (c) { return c.row === row; })[0];
  if (!cur || hash_(cur.name) !== expectHash) {
    throw new Error('Список изменился: открой его заново кнопкой «📋 Сегодня».');
  }
  const sh = rc.g.sh;
  const stage = patch.stage || cur.stage;
  let nextStep, due;
  if (patch.nextStep !== undefined) { nextStep = patch.nextStep; due = patch.due || null; }
  else if (patch.stepDone) { nextStep = ''; due = null; }
  else { nextStep = cur.nextStep; due = patch.due || cur.due; }
  if (patch.stage) sh.getRange(row, 6).setValue(txt_(stage));
  if (patch.nextStep !== undefined || patch.stepDone) sh.getRange(row, 7).setValue(txt_(nextStep));
  if (patch.nextStep !== undefined || patch.stepDone || patch.due) {
    sh.getRange(row, 8).setValue(due ? serial_(due) : '');
    if (due) setDateFmt_(sh, row, 8);
  }
  const note = typeof patch.comment === 'function' ? patch.comment(cur) : patch.comment;
  if (note) sh.getRange(row, 9).setValue(txt_(stampComment_(cur.comment, note, today)));
  sh.getRange(row, 10).setValue(stepStatus_(stage, nextStep, due, !!patch.stepDone, today));
  return { name: cur.name, stage: stage, nextStep: nextStep, due: due };
}

/** Держит «Статус шага» в порядке, чтобы «Сводка» верно считала просроченные. Ручные пометки не трогает. */
function syncOverdue_(contacts, today) {
  let n = 0;
  const sh = sheet_(SHEET_CONTACTS);
  contacts.forEach(function (c) {
    const st = c.status.toLowerCase();
    if (st !== '' && st !== STEP_OVERDUE) return;
    const want = stepStatus_(c.stage, c.nextStep, c.due, false, today);
    if (want !== c.status) { sh.getRange(c.row, 10).setValue(want); n++; }
  });
  return n;
}

// --- цифры дня -----------------------------------------------------------------------------
/** items: [{key,value}], mode: 'add' | 'set'. Возвращает строки для отчёта и данные для отмены. */
function writeActions_(iso, items, mode) {
  const g = readGrid_(SHEET_ACTIONS, 14);
  const header = g.d[0].map(s_);
  let row = 0;
  for (let i = 1; i < g.d.length; i++) if (cellIso_(g.v[i][0], g.d[i][0]) === iso) { row = i + 1; break; }
  const undo = [];
  if (!row) {
    row = lastUsedRow_(g, [0]) + 1;
    ensureRows_(g.sh, row);
    g.sh.getRange(row, 1).setValue(serial_(iso));
    setDateFmt_(g.sh, row, 1);
    undo.push({ sheet: SHEET_ACTIONS, r: row, c: 1, old: '' });
  }
  const cur = g.v[row - 1] || [];
  const lines = [];
  items.forEach(function (it) {
    const head = metricHeader_(it.key);
    const ci = header.indexOf(head);
    if (ci < 0) throw new Error('В листе «' + SHEET_ACTIONS + '» нет колонки «' + head + '»');
    const raw = cur[ci];
    const old = raw === '' || raw === undefined ? 0 : num_(raw);
    const nv = mode === 'set' ? it.value : old + it.value;
    undo.push({ sheet: SHEET_ACTIONS, r: row, c: ci + 1, old: raw === undefined ? '' : raw });
    g.sh.getRange(row, ci + 1).setValue(numOut_(nv));
    lines.push({ label: head, old: old, nv: numOut_(nv), delta: it.value });
  });
  return { lines: lines, undo: undo, row: row };
}

function undoCells_(cells) {
  cells.slice().reverse().forEach(function (u) { sheet_(u.sheet).getRange(u.r, u.c).setValue(u.old); });
}

// --- продажи -------------------------------------------------------------------------------
function appendSale_(s, today) {
  const g = readGrid_(SHEET_SALES, 10);
  const r = lastUsedRow_(g, [0, 1, 2, 3, 4, 5, 6, 9]) + 1;
  ensureRows_(g.sh, r);
  // только A:G и J: колонки H и I в таблице это формулы
  g.sh.getRange(r, 1, 1, 7).setValues([[serial_(s.date || today), txt_(s.direction || 'Другое'), txt_(s.client), txt_(s.what || ''),
    numOut_(s.amount || 0), numOut_(s.paid || 0), txt_(s.source || 'Другое')]]);
  if (s.comment) g.sh.getRange(r, 10).setValue(txt_(s.comment));
  setDateFmt_(g.sh, r, 1);
  return r;
}

// --- задачи --------------------------------------------------------------------------------
function readTasks_() {
  const g = readGrid_(SHEET_TASKS, 8);
  const list = [];
  for (let i = 1; i < g.v.length; i++) {
    const v = g.v[i], d = g.d[i];
    if (s_(v[0]) === '' || s_(v[2]) === '') continue;
    list.push({ row: i + 1, id: Math.round(num_(v[0])), due: cellIso_(v[1], d[1]), title: s_(v[2]), direction: s_(v[3]),
      goalId: s_(v[4]), status: s_(v[5]) || 'Открыта', source: s_(v[6]), result: s_(v[7]) });
  }
  return { g: g, list: list };
}
function taskOpen_(t) { return t.status === 'Открыта'; }

/** items: [{due,title,direction,goalId}] -> ids */
function addTasks_(items, source) {
  const rt = readTasks_();
  let next = rt.list.reduce(function (m, t) { return Math.max(m, t.id); }, 0) + 1;
  let r = lastUsedRow_(rt.g, [0, 1, 2]);
  const ids = [];
  ensureRows_(rt.g.sh, r + items.length);
  items.forEach(function (it) {
    r++;
    rt.g.sh.getRange(r, 1, 1, 8).setValues([[next, it.due ? serial_(it.due) : '', txt_(it.title), txt_(it.direction || ''),
      txt_(it.goalId || ''), 'Открыта', txt_(source || ''), '']]);
    if (it.due) setDateFmt_(rt.g.sh, r, 2);
    ids.push(next++);
  });
  return ids;
}
/** patch: { status, due }. Возвращает задачу или null. */
function patchTask_(id, patch) {
  const rt = readTasks_();
  const t = rt.list.filter(function (x) { return x.id === id; })[0];
  if (!t) return null;
  if (patch.status) rt.g.sh.getRange(t.row, 6).setValue(patch.status);
  if (patch.due) { rt.g.sh.getRange(t.row, 2).setValue(serial_(patch.due)); setDateFmt_(rt.g.sh, t.row, 2); }
  return t;
}

// --- цели года -----------------------------------------------------------------------------
function readGoals_() {
  const g = readGrid_(SHEET_GOALS, 10);
  const list = [];
  for (let i = 1; i < g.d.length; i++) {
    const d = g.d[i].map(s_);
    if (!d[3]) continue;
    list.push({ row: i + 1, id: d[0], period: d[1], direction: d[2], goal: d[3], metric: d[4], target: d[5],
      unit: d[6], priority: d[7], comment: d[8], weekly: d[9] });
  }
  return { g: g, list: list };
}
function appendGoals_(goals) {
  const rg = readGoals_();
  let n = rg.list.reduce(function (m, x) { return Math.max(m, parseInt(String(x.id).replace(/\D/g, ''), 10) || 0); }, 0);
  let r = lastUsedRow_(rg.g, [0, 1, 2, 3]);
  ensureRows_(rg.g.sh, r + goals.length);
  goals.forEach(function (x) {
    r++;
    rg.g.sh.getRange(r, 1, 1, 10).setValues([['G' + (++n), txt_(x.period), txt_(x.direction || 'Другое'), txt_(x.goal), txt_(x.metric || ''),
      txt_(x.target || ''), txt_(x.unit || ''), txt_(x.priority || 'средний'), txt_(x.comment || ''), txt_(x.weekly || '')]]);
  });
  return goals.length;
}

/** Создаёт нужные боту вкладки, если их ещё нет. */
function ensureSheets_() {
  const book = ss_();
  [[SHEET_TASKS, TASK_COLS], [SHEET_GOALS, GOAL_COLS]].forEach(function (p) {
    if (book.getSheetByName(p[0])) return;
    const sh = book.insertSheet(p[0]);
    sh.getRange(1, 1, 1, p[1].length).setValues([p[1]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  const tsh = sheet_(SHEET_TASKS);
  tsh.getRange(2, 2, Math.max(tsh.getMaxRows() - 1, 1), 1).setNumberFormat('dd.mm.yyyy');
}

/** Что не так в структуре таблицы (для проверки при настройке). */
function schemaProblems_() {
  const out = [];
  const need = [[SHEET_ACTIONS, 1, ['Дата'].concat(METRICS.map(function (m) { return m.header; }))],
    [SHEET_CONTACTS, 1, CONTACT_COLS], [SHEET_SALES, 1, SALES_COLS], [SHEET_PLANS, 2, ['Показатель', 'План на месяц']]];
  need.forEach(function (n) {
    const sh = ss_().getSheetByName(n[0]);
    if (!sh) { out.push('нет листа «' + n[0] + '»'); return; }
    const header = sh.getRange(n[1], 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0].map(s_);
    const miss = n[2].filter(function (c) { return header.indexOf(c) < 0; });
    if (miss.length) out.push('в листе «' + n[0] + '» нет колонок: ' + miss.join(', '));
  });
  if (!ss_().getSheetByName(SHEET_SUMMARY)) out.push('нет листа «' + SHEET_SUMMARY + '»');
  return out;
}

// ============================================================================
// 6. TELEGRAM И СОСТОЯНИЕ
// ============================================================================
function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k) { return props_().getProperty(k); }
function setProp_(k, v) { props_().setProperty(k, String(v)); }
function jprop_(k, dflt) {
  const v = prop_(k);
  if (!v) return dflt;
  try { return JSON.parse(v); } catch (e) { return dflt; }
}
function setJprop_(k, o) { setProp_(k, JSON.stringify(o)); }

/** Вызов Telegram API. Текст исходной ошибки сети не показываем: в нём может быть адрес с токеном. */
function tg_(method, payload) {
  let res;
  try {
    res = UrlFetchApp.fetch('https://api.telegram.org/bot' + prop_('BOT_TOKEN') + '/' + method, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}),
      muteHttpExceptions: true,
    });
  } catch (e) {
    throw new Error('Не удалось связаться с Telegram (сеть). Попробую снова при следующей проверке.');
  }
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { throw new Error('Telegram вернул непонятный ответ'); }
  if (!body.ok) { const err = new Error('Telegram: ' + body.description); err.tg = body; throw err; }
  return body.result;
}

function splitMessage_(text, limit) {
  limit = limit || 3900;
  const parts = [];
  let cur = '';
  String(text).split('\n').forEach(function (line) {
    if (cur && cur.length + line.length + 1 > limit) { parts.push(cur); cur = ''; }
    cur = cur ? cur + '\n' + line : line;
  });
  if (cur) parts.push(cur);
  return parts.length ? parts : [''];
}

function btn_(text, data) { return { text: text, callback_data: data }; }
function inline_(rows) { return { inline_keyboard: rows }; }
function mainKb_() {
  return { keyboard: [
    [{ text: '📋 Сегодня' }, { text: '✍️ Отчёт' }],
    [{ text: '➕ Задача' }, { text: '👤 Человек' }, { text: '💰 Продажа' }],
    [{ text: '🗓 Неделя' }, { text: '📊 Итоги' }, { text: '🎯 Цели' }],
  ], resize_keyboard: true, is_persistent: true };
}

/** Отправляет владельцу. Длинное режет по строкам; при ошибке разметки шлёт без неё. */
function send_(text, markup) {
  const parts = splitMessage_(text);
  let last = null;
  parts.forEach(function (p, i) {
    const payload = { chat_id: prop_('OWNER_ID'), text: p, parse_mode: 'HTML', disable_web_page_preview: true };
    if (markup && i === parts.length - 1) payload.reply_markup = markup;
    try { last = tg_('sendMessage', payload); }
    catch (e) {
      if (e.tg && /parse entities/i.test(e.tg.description || '')) {
        payload.parse_mode = undefined; payload.text = stripTags_(p);
        last = tg_('sendMessage', payload);
      } else throw e;
    }
  });
  return last;
}
function edit_(messageId, text, markup) {
  const payload = { chat_id: prop_('OWNER_ID'), message_id: messageId, text: text, parse_mode: 'HTML',
    disable_web_page_preview: true };
  if (markup) payload.reply_markup = markup;
  try { return tg_('editMessageText', payload); }
  catch (e) {
    if (e.tg && /not modified/i.test(e.tg.description || '')) return null;
    throw e;
  }
}
function dropKb_(messageId) {
  try { tg_('editMessageReplyMarkup', { chat_id: prop_('OWNER_ID'), message_id: messageId, reply_markup: { inline_keyboard: [] } }); }
  catch (e) { /* кнопки уже убраны */ }
}
function answer_(id, text) {
  try { tg_('answerCallbackQuery', { callback_query_id: id, text: text || '' }); } catch (e) { /* не критично */ }
}

// Короткоживущее состояние диалога («жду от тебя имя человека»).
function getState_() {
  const s = jprop_('STATE', null);
  if (!s) return null;
  if (nowDate_().getTime() - s.ts > 30 * 60 * 1000) { clearState_(); return null; }
  return s;
}
function setState_(flow, step, data) { setJprop_('STATE', { flow: flow, step: step, data: data || {}, ts: nowDate_().getTime() }); }
function clearState_() { props_().deleteProperty('STATE'); }

// Какие сообщения обновлять после нажатия кнопки: id -> 'm' (утро) | 'e' (вечер)
function rememberMsg_(id, kind) {
  const m = jprop_('MSGKIND', {});
  m[id] = kind;
  const keys = Object.keys(m).map(Number).sort(function (a, b) { return a - b; });
  while (keys.length > 20) delete m[keys.shift()];
  setJprop_('MSGKIND', m);
}

// ============================================================================
// 7. СООБЩЕНИЯ БОТА (всё считается кодом, без нейросети)
// ============================================================================
const ACTIVE_STAGES = ['Новый', 'В работе', 'Интервью', 'Оффер'];
const CAP_CONTACTS = 6, CAP_TASKS = 8;

function loadSnap_(parts) {
  const s = { today: today_(), contacts: [], tasks: [], goals: [], summary: [], funnel: {}, lists: null };
  if (parts.indexOf('contacts') >= 0) s.contacts = readContacts_().list;
  if (parts.indexOf('tasks') >= 0) s.tasks = readTasks_().list;
  if (parts.indexOf('goals') >= 0) s.goals = readGoals_().list;
  if (parts.indexOf('summary') >= 0) { const r = readSummary_(); s.summary = r.rows; s.funnel = r.funnel; }
  if (parts.indexOf('lists') >= 0) s.lists = readLists_();
  return s;
}

function buckets_(snap) {
  const out = { overdue: [], today: [], tomorrow: [], noStep: [] };
  snap.contacts.forEach(function (c) {
    if (!isOpen_(c)) return;
    const due = effDue_(c);
    if (!due) { if (ACTIVE_STAGES.indexOf(c.stage) >= 0 && !c.nextStep) out.noStep.push(c); }
    else if (due < snap.today) out.overdue.push(c);
    else if (due === snap.today) out.today.push(c);
    else if (due === addDays_(snap.today, 1)) out.tomorrow.push(c);
  });
  const byDue = function (a, b) { return (effDue_(a) || '') < (effDue_(b) || '') ? -1 : 1; };
  out.overdue.sort(byDue); out.today.sort(byDue);
  return out;
}

function contactLine_(c, snap) {
  const due = effDue_(c);
  const who = c.who ? ' (' + esc_(c.who) + ')' : '';
  const step = c.nextStep ? esc_(cut_(c.nextStep, 80)) : 'определить следующий шаг';
  const topic = c.request ? ' · <i>' + esc_(cut_(c.request, 90)) + '</i>' : '';
  let tail = '';
  if (due && due < snap.today) tail = ' — просрочено на ' + diffDays_(snap.today, due) + ' дн.';
  if (!c.due && due) tail += ' (срок не задан)';
  return '<b>' + esc_(cut_(c.name, 60)) + '</b>' + who + ' — ' + step + topic + tail;
}
function taskLine_(t, today) {
  const late = t.due && t.due < today ? ' (с ' + short_(t.due) + ')' : '';
  return '#' + t.id + ' ' + esc_(cut_(t.title, 120)) + (t.direction ? ' [' + esc_(t.direction) + ']' : '') + late;
}
function openTasksDue_(snap, upTo) {
  return snap.tasks.filter(function (t) { return taskOpen_(t) && t.due && t.due <= upTo; })
    .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id; });
}

function laggingRows_(summary) {
  return summary.filter(function (r) { return !r.section && (r.light === '🔴' || r.light === '🟡'); })
    .sort(function (a, b) { return (a.light !== '🔴') - (b.light !== '🔴'); });
}
function metricLine_(r) {
  return r.light + ' ' + esc_(r.label.trim()) + (r.goodWhen === '↓' ? ' (лимит)' : '') + ': ' + esc_(r.month) +
    (r.plan ? ' из ' + esc_(r.plan) : '') + (r.pct ? ' (' + esc_(r.pct) + ')' : '') +
    (r.perDay ? ', нужно ' + esc_(r.perDay) + '/день' : '');
}

/** Нумерованный список дел с кнопками. Возвращает { lines, rows }. */
function renderItems_(snap, b, opts) {
  const lines = [], rows = [];
  let n = 0;
  function sect(title, count) { lines.push(''); lines.push('<b>' + title + (count !== undefined ? ' (' + count + ')' : '') + '</b>'); }
  const people = b.overdue.concat(b.today);
  const shownPeople = people.slice(0, CAP_CONTACTS);
  function addPeople(list, title) {
    const part = list.filter(function (c) { return shownPeople.indexOf(c) >= 0; });
    if (!part.length) return;
    sect(title, list.length);
    part.forEach(function (c) {
      n++;
      lines.push(n + '. ' + contactLine_(c, snap));
      rows.push([btn_('✅ ' + n + ' ' + cut_(c.name, 14), 'cd:' + c.row + ':' + hash_(c.name)),
        btn_('⏩ +3 дня', 'cp:' + c.row + ':' + hash_(c.name))]);
    });
  }
  addPeople(b.overdue, '🔴 Просрочено');
  addPeople(b.today, '📌 Написать / сделать сегодня');
  if (people.length > shownPeople.length) lines.push('…и ещё ' + (people.length - shownPeople.length) + ' (закрой эти, и появятся следующие)');
  const tasks = openTasksDue_(snap, snap.today);
  if (tasks.length) {
    sect('✅ Задачи', tasks.length);
    tasks.slice(0, CAP_TASKS).forEach(function (t) {
      n++;
      lines.push(n + '. ' + taskLine_(t, snap.today));
      rows.push([btn_('✅ ' + n + ' #' + t.id, 'td:' + t.id), btn_('→ завтра', 'tm:' + t.id), btn_('✖', 'tx:' + t.id)]);
    });
    if (tasks.length > CAP_TASKS) lines.push('…и ещё ' + (tasks.length - CAP_TASKS));
  }
  return { lines: lines, rows: rows, count: n };
}

function morningMessage_(snap) {
  const t = snap.today;
  const b = buckets_(snap);
  const items = renderItems_(snap, b);
  const greet = nowInfo_().min < 12 * 60 ? 'Доброе утро!' : 'Добрый день!';
  const out = ['<b>☀️ ' + greet + ' ' + cap_(wdName_(t)) + ', ' + ru_(t) + '</b>'].concat(items.lines);
  if (!items.count) out.push('', 'На сегодня срочных шагов нет. Хороший день для новых касаний и контента.');
  if (b.tomorrow.length) out.push('', 'Завтра в очереди: ' + b.tomorrow.length + ' — ' + b.tomorrow.slice(0, 4).map(function (c) { return esc_(cut_(c.name, 30)); }).join(', '));
  if (b.noStep.length) out.push('', '<b>❓ Нет следующего шага (' + b.noStep.length + ')</b>', b.noStep.slice(0, 6).map(function (c) { return esc_(cut_(c.name, 30)); }).join(', '));
  const lag = laggingRows_(snap.summary);
  if (lag.length) {
    out.push('', '<b>📊 Темп месяца: отстаём</b>');
    lag.slice(0, 6).forEach(function (r) { out.push(metricLine_(r)); });
  }
  const rows = items.rows.slice();
  rows.push([btn_('✍️ Отчёт', 'rp:go'), btn_('➕ Задача', 'tk:add')]);
  return { text: out.join('\n'), kb: inline_(rows) };
}

const NUMBER_ROWS_ = ['Касания работодателям', 'Ответы работодателей', 'Созвоны и встречи', 'КП отправлено', 'Новые клиенты',
  'Новые резиденты', 'Новые обращения всего', 'Выручка итого', 'Часы на продажи'];
function eveningMessage_(snap) {
  const t = snap.today;
  const done = snap.summary.filter(function (r) {
    return !r.section && r.today && r.today !== '0' && r.today !== '0%' &&
      NUMBER_ROWS_.some(function (p) { return r.label.trim().indexOf(p) === 0; });
  });
  const out = ['<b>🌙 Вечер, ' + ru_(t) + '. Подведём день</b>', ''];
  out.push(done.length ? 'В журнале за сегодня: ' + done.map(function (r) { return esc_(r.label.trim()) + ' — ' + esc_(r.today); }).join('; ')
    : 'За сегодня в журнале пока пусто.');
  const b = buckets_(snap);
  const items = renderItems_(snap, b);
  if (items.count) out.push('', '<b>Не закрыто:</b>');
  const rows = items.rows.slice();
  rows.push([btn_('✍️ Заполнить отчёт', 'rp:go')]);
  return { text: out.concat(items.lines.filter(function (l, i) { return !(i === 0 && l === ''); })).join('\n') + '\n\nПришли отчёт одним сообщением, например: <code>написал 15, ответили 3, созвон 1</code>.',
    kb: inline_(rows) };
}

function statsMessage_(snap) {
  const out = ['<b>📊 Сводка на ' + ru_(snap.today) + '</b>'];
  snap.summary.forEach(function (r) {
    if (r.section) { out.push('', '<b>' + esc_(r.label) + '</b>'); return; }
    const nums = ['сег ' + r.today, '7д ' + r.week, 'мес ' + r.month];
    if (r.plan) nums.push('план ' + r.plan + ' (' + r.pct + ')');
    out.push((r.light ? r.light + ' ' : '') + esc_(r.label.trim()) + ': ' + nums.map(esc_).join(', '));
  });
  const stages = Object.keys(snap.funnel);
  if (stages.length) {
    out.push('', '<b>Воронка (кандидаты / работодатели / резиденты)</b>');
    stages.forEach(function (s) { const f = snap.funnel[s]; out.push(esc_(s) + ': ' + f.cand + ' / ' + f.emp + ' / ' + f.res); });
  }
  return out.join('\n');
}

function tasksMessage_(snap) {
  const end = addDays_(mondayOf_(snap.today), 6);
  const mine = snap.tasks.filter(function (t) { return taskOpen_(t) && t.due && t.due <= end; })
    .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id; });
  if (!mine.length) return { text: 'Открытых задач на эту неделю нет. «🗓 Неделя» составит план, «➕ Задача» добавит свою.', kb: null };
  const out = ['<b>🗓 Задачи до конца недели (' + mine.length + ')</b>'], rows = [];
  let cur = null;
  mine.forEach(function (t, i) {
    if (t.due !== cur) {
      cur = t.due;
      out.push('', '<b>' + cap_(wdName_(cur)) + ', ' + short_(cur) + (cur < snap.today ? ' — просрочено' : cur === snap.today ? ' — сегодня' : '') + '</b>');
    }
    out.push('#' + t.id + ' ' + esc_(cut_(t.title, 120)) + (t.direction ? ' [' + esc_(t.direction) + ']' : ''));
    if (i < 10) rows.push([btn_('✅ #' + t.id, 'td:' + t.id), btn_('→ завтра', 'tm:' + t.id), btn_('✖', 'tx:' + t.id)]);
  });
  return { text: out.join('\n'), kb: inline_(rows) };
}

// --- цели года и план недели --------------------------------------------------------------
function periodCovers_(period, iso) {
  const p = isoParts_(iso);
  const m = /^(\d{4})(?:-Q([1-4])|-(\d{2}))?$/.exec(s_(period));
  if (!m || +m[1] !== p.y) return false;
  if (m[2]) return Math.ceil(p.m / 3) === +m[2];
  if (m[3]) return p.m === +m[3];
  return true;
}
function normPeriod_(raw, today) {
  const y = isoParts_(today).y;
  const s = s_(raw).toLowerCase().replace(/\s+/g, ' ');
  let m;
  if ((m = /^(\d{4})$/.exec(s))) return m[1];
  if ((m = /^(\d{4})\s*-?\s*q([1-4])$/.exec(s))) return m[1] + '-Q' + m[2];
  if ((m = /^q([1-4])$/.exec(s))) return y + '-Q' + m[1];
  if ((m = /^([1-4])\s*(?:кв|квартал)/.exec(s))) return y + '-Q' + m[1];
  if ((m = /^(i{1,3}|iv)\s*(?:кв|квартал)/.exec(s))) return y + '-Q' + ({ i: 1, ii: 2, iii: 3, iv: 4 })[m[1]];
  if ((m = /^(\d{4})-(\d{2})$/.exec(s))) return s;
  if ((m = /^(\d{1,2})\.(\d{4})$/.exec(s))) return m[2] + '-' + pad2_(+m[1]);
  const names = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  for (let i = 0; i < 12; i++) if (new RegExp('^' + names[i]).test(s)) return y + '-' + pad2_(i + 1);
  return s_(raw);
}

const DAY_PREFIX_ = /^(каждый день|ежедневно|пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|среда|среду|четверг|пятница|пятницу|суббота|субботу|воскресенье)\s*[:\-–—]\s*/i;
function dayIndexOf_(word) {
  const w = word.toLowerCase();
  const abbr = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  if (abbr.indexOf(w) >= 0) return abbr.indexOf(w);
  for (let i = 0; i < 7; i++) if (WD_RE[i].test(w)) return i;
  return -1;
}
/** «пн: написать 10 работодателям; каждый день: разобрать почту» -> [{ title, days:[0..6] }] */
function parseWeeklyActions_(text) {
  const out = [];
  String(text || '').split(/[;\n]+/).forEach(function (part) {
    let p = part.trim();
    if (!p) return;
    let days = [4]; // по умолчанию к пятнице
    const m = DAY_PREFIX_.exec(p);
    if (m) {
      p = p.slice(m[0].length).trim();
      days = /^(каждый день|ежедневно)/i.test(m[1]) ? [0, 1, 2, 3, 4] : [dayIndexOf_(m[1])];
    }
    if (p) out.push({ title: cap_(p), days: days });
  });
  return out;
}

/** Создаёт задачи недели из «Недельных действий» целей, которые действуют сейчас. Повторно не дублирует. */
function makeWeekTasks_(snap) {
  const monday = mondayOf_(snap.today);
  const source = 'неделя ' + isoWeekLabel_(snap.today);
  const have = {};
  snap.tasks.forEach(function (t) { if (t.source === source) have[t.title + '|' + t.due] = true; });
  const items = [];
  const active = snap.goals.filter(function (g) { return periodCovers_(g.period, snap.today); });
  active.forEach(function (g) {
    parseWeeklyActions_(g.weekly).forEach(function (a) {
      a.days.forEach(function (d) {
        let due = addDays_(monday, d);
        if (due < snap.today) due = snap.today;
        const key = a.title + '|' + due;
        if (have[key]) return;
        have[key] = true;
        items.push({ due: due, title: a.title, direction: g.direction, goalId: g.id });
      });
    });
  });
  const ids = items.length ? addTasks_(items, source) : [];
  return { active: active, items: items, ids: ids, source: source };
}

function weekPlanMessage_(snap, made) {
  const t = snap.today, monday = mondayOf_(t);
  const out = ['<b>🗓 План недели ' + short_(monday) + '–' + short_(addDays_(monday, 6)) + '</b>', ''];
  if (made.active.length) {
    out.push('<b>🎯 Цели, которые действуют сейчас</b>');
    made.active.slice(0, 6).forEach(function (g) {
      const m = [g.metric, g.target, g.unit].filter(Boolean).join(' ');
      out.push('• ' + esc_(g.direction) + ': ' + esc_(cut_(g.goal, 110)) + (m ? ' (' + esc_(m) + ')' : ''));
    });
  } else {
    out.push('ℹ️ В листе «План года» нет целей на этот период. Добавь их кнопкой «🎯 Цели», и план недели начнёт собираться сам.');
  }
  if (made.items.length) {
    out.push('', '<b>Добавил задачи из целей (' + made.items.length + ')</b>');
    let cur = null;
    made.items.map(function (it, i) { return { it: it, id: made.ids[i] }; })
      .sort(function (a, b) { return a.it.due < b.it.due ? -1 : a.it.due > b.it.due ? 1 : a.id - b.id; })
      .forEach(function (x) {
        if (x.it.due !== cur) { cur = x.it.due; out.push('<b>' + cap_(wdName_(cur)) + ', ' + short_(cur) + '</b>'); }
        out.push('#' + x.id + ' ' + esc_(cut_(x.it.title, 110)));
      });
  } else if (made.active.length) {
    out.push('', 'Задачи из целей на эту неделю уже созданы или у целей не заполнены «Недельные действия».');
  }
  const carried = snap.tasks.filter(function (x) { return taskOpen_(x) && x.due && x.due < monday; });
  if (carried.length) out.push('', '↪️ Невыполнено с прошлых недель: ' + carried.length + ' (они в утреннем списке)');
  const lag = laggingRows_(snap.summary).filter(function (r) { return r.perDay; });
  if (lag.length) {
    out.push('', '<b>📊 Нормы на день (отстаём)</b>');
    lag.slice(0, 5).forEach(function (r) { out.push(r.light + ' ' + esc_(r.label.trim()) + ': ' + esc_(r.perDay) + '/день'); });
  }
  out.push('', 'Свои главные задачи недели добавь списком: по одной в строке, можно с днём («пт — отправить КП»).');
  return { text: out.join('\n'), kb: inline_([[btn_('➕ Добавить задачи недели', 'wk:add')], [btn_('🗓 Задачи недели', 'wk:list')]]) };
}

function goalsMessage_(snap) {
  const act = snap.goals.filter(function (g) { return periodCovers_(g.period, snap.today); });
  const out = ['<b>🎯 Цели</b>'];
  if (!snap.goals.length) {
    out.push('', 'План на год пока пуст. Нажми «➕ Добавить цели» и пришли строки вида:',
      '<code>2026-Q4 | Кадры | 20 договоров | договоры | 20 | пн: написать 10 работодателям; пт: отправить КП</code>',
      'Последнее поле («недельные действия») бот превратит в задачи каждую неделю.');
  } else {
    out.push('', 'Действуют сейчас (' + act.length + ' из ' + snap.goals.length + '):');
    act.slice(0, 10).forEach(function (g) {
      out.push('• <b>' + esc_(g.period) + '</b> ' + esc_(g.direction) + ': ' + esc_(cut_(g.goal, 110)) +
        (g.weekly ? ' — каждую неделю: ' + esc_(cut_(g.weekly, 90)) : ''));
    });
    if (!act.length) out.push('Нет целей на текущий период. Проверь колонку «Период» (например 2026-Q4).');
  }
  return { text: out.join('\n'), kb: inline_([[btn_('➕ Добавить цели', 'gl:add')]]) };
}

// --- итоги ---------------------------------------------------------------------------------
function reviewMessage_(kind) {
  const snap = loadSnap_(['tasks', 'summary', 'contacts']);
  const t = snap.today;
  let start, end, title;
  if (kind === 'day') { start = end = t; title = 'Итоги дня ' + ru_(t); }
  else if (kind === 'week') { start = mondayOf_(t); end = addDays_(start, 6); title = 'Итоги недели ' + short_(start) + '–' + short_(end); }
  else { start = monthStart_(t); end = monthEnd_(t); title = 'Итоги месяца ' + short_(start) + '–' + short_(end); }
  const dim = daysInMonth_(t);
  const elapsed = Math.min(diffDays_(t, start) + 1, diffDays_(end, start) + 1);

  const inWin = snap.tasks.filter(function (x) { return x.due && x.due >= start && x.due <= end; });
  const cnt = function (s) { return inWin.filter(function (x) { return x.status === s; }).length; };
  const doneN = cnt('Сделано'), openN = cnt('Открыта'), cancN = cnt('Отменена');
  const out = ['<b>📈 ' + title + '</b>', ''];
  const planned = doneN + openN;
  out.push('Задачи: сделано ' + doneN + (planned ? ' из ' + planned + ' (' + Math.round(100 * doneN / planned) + '%)' : '') +
    (cancN ? ', отменено ' + cancN : '') + '.');
  const notDone = inWin.filter(taskOpen_).slice(0, 5);
  if (notDone.length) out.push('Не сделано: ' + notDone.map(function (x) { return esc_(cut_(x.title, 50)); }).join('; '));

  const lagging = [], okRows = [];
  snap.summary.forEach(function (r) {
    if (r.section) return;
    const plan = num_(r.plan);
    if (!plan) return;
    if (r.goodWhen === '↓') {
      if (kind !== 'day' && num_(r.month) > plan) out.push('⚠️ ' + esc_(r.label.trim()) + ': ' + esc_(r.month) + ' при лимите ' + esc_(r.plan));
      return;
    }
    if (kind === 'day') return;
    const fact = kind === 'week' ? num_(r.week) : num_(r.month);
    const norm = kind === 'week' ? plan * 7 / dim : plan * (kind === 'month' && t === end ? 1 : elapsed / dim);
    if (norm <= 0) return;
    const ratio = fact / norm;
    const line = { r: r, fact: fact, norm: norm, ratio: ratio };
    (ratio < 1 ? lagging : okRows).push(line);
  });
  if (kind === 'day') {
    const today = snap.summary.filter(function (r) { return !r.section && r.today && r.today !== '0' && r.today !== '0%'; });
    out.push('', today.length ? '<b>Цифры дня</b>' : 'В журнале за день пусто. Пришли отчёт.');
    today.slice(0, 12).forEach(function (r) { out.push('• ' + esc_(r.label.trim()) + ': ' + esc_(r.today)); });
  } else {
    lagging.sort(function (a, b) { return a.ratio - b.ratio; });
    out.push('', '<b>Цифры (факт / норма за период)</b>');
    lagging.concat(okRows).slice(0, 10).forEach(function (x) {
      const mark = x.ratio >= 1 ? '🟢' : x.ratio >= SETTINGS.lagThreshold ? '🟡' : '🔴';
      out.push(mark + ' ' + esc_(x.r.label.trim()) + ': ' + fmtNum_(x.fact) + ' / ' + fmtNorm_(x.norm) + ' (' + Math.round(100 * x.ratio) + '%)');
    });
    const focus = [];
    lagging.filter(function (x) { return x.ratio < SETTINGS.lagThreshold; }).slice(0, 3).forEach(function (x) {
      focus.push(esc_(x.r.label.trim()) + (x.r.perDay ? ': нужно ' + esc_(x.r.perDay) + ' в день' : ': догнать норму'));
    });
    const b = buckets_(snap);
    if (b.overdue.length) focus.push('просроченные шаги по людям: ' + b.overdue.length);
    const carried = snap.tasks.filter(function (x) { return taskOpen_(x) && x.due && x.due < start; }).length;
    if (carried) focus.push('невыполненные задачи прошлых периодов: ' + carried);
    out.push('', focus.length ? '<b>🎯 Упор на следующий период</b>' : 'Все показатели в норме. Держим темп.');
    focus.forEach(function (f, i) { out.push((i + 1) + ') ' + f); });
  }
  return out.join('\n');
}

const HELP_ = '<b>Я — личный ассистент «Карьерного юриста».</b>\n\n' +
  '<b>Утром</b> пришлю, кому и по какому вопросу писать, задачи дня и что отстаёт. Нажми ✅ у сделанного.\n' +
  '<b>Вечером</b> напомню про отчёт и незакрытое.\n' +
  '<b>В понедельник</b> соберу план недели из целей года, <b>в воскресенье</b> пришлю итоги недели.\n\n' +
  '<b>Как отчитаться</b> (одним сообщением):\n<code>написал 15, ответили 3, созвон 1, кп 2, часов 6</code>\n' +
  '«вчера: касаний 20» записывает за вчера. «Поправь касаний 20» заменяет число.\n' +
  'Показатели: касания, ответы, созвоны, кп, договоры, резиденты, ушло, мероприятия, участники, посты, расходы, часы, часов на продажи.\n\n' +
  '<b>Задачи:</b> «+ завтра позвонить в Сбер», «+ в пятницу отправить КП». Выполнено: «готово 12 14».\n' +
  '<b>Люди:</b> кнопка «👤 Человек» или строка <code>Иван | работодатель | вакансия юриста | созвониться в пятницу</code>.\n' +
  '<b>Продажа:</b> кнопка «💰 Продажа».\n\n' +
  '/today список на сегодня · /week план недели · /review итоги недели · /month итоги месяца · /stats сводка · /status состояние бота · /cancel отмена';

// ============================================================================
// 8. ДЕЙСТВИЯ: что делают кнопки и команды
// ============================================================================
function heat_(minutes) { setProp_('HOT_UNTIL', nowDate_().getTime() + minutes * 60000); }

function showToday_() {
  const snap = loadSnap_(['contacts', 'tasks', 'summary']);
  try { syncOverdue_(snap.contacts, snap.today); } catch (e) { /* пометки не критичны */ }
  const m = morningMessage_(snap);
  const sent = send_(m.text, m.kb);
  rememberMsg_(sent.message_id, 'm');
  setProp_('BRIEF_MSG', sent.message_id);
}
function showTasks_() {
  const m = tasksMessage_(loadSnap_(['tasks']));
  send_(m.text, m.kb);
}
function showStats_() { send_(statsMessage_(loadSnap_(['summary']))); }
function showReviewMenu_() {
  send_('📊 <b>Итоги</b>: за какой период?', inline_([[btn_('Сегодня', 'rv:day'), btn_('Неделя', 'rv:week'), btn_('Месяц', 'rv:month')]]));
}
function showGoals_() {
  const m = goalsMessage_(loadSnap_(['goals']));
  send_(m.text, m.kb);
}
function showWeek_() { makeWeekPlan_(); }
function makeWeekPlan_() {
  const snap = loadSnap_(['contacts', 'tasks', 'goals', 'summary']);
  const made = makeWeekTasks_(snap);
  const m = weekPlanMessage_(snap, made);
  send_(m.text, m.kb);
}
function showHelp_() { send_(HELP_, mainKb_()); }
function cancelFlow_() { clearState_(); send_('Отменил. Что дальше?', mainKb_()); }

/** Освежает отправленные списки (после нажатия ✅), чтобы сделанное исчезало. */
function refreshBriefs_(extraId) {
  const ids = [];
  [+(prop_('BRIEF_MSG') || 0), extraId].forEach(function (id) { if (id && ids.indexOf(id) < 0) ids.push(id); });
  const kinds = jprop_('MSGKIND', {});
  const todo = ids.filter(function (id) { return kinds[id]; });
  if (!todo.length) return;
  const snap = loadSnap_(['contacts', 'tasks', 'summary']);
  todo.forEach(function (id) {
    const m = kinds[id] === 'e' ? eveningMessage_(snap) : morningMessage_(snap);
    try { edit_(id, m.text, m.kb); } catch (e) { /* сообщение могли удалить */ }
  });
}

// --- отчёт ---------------------------------------------------------------------------------
function startReport_() {
  send_('✍️ <b>Отчёт за день</b>\nНапиши одним сообщением, например:\n' +
    '<code>написал 15, ответили 3, созвон 1, кп 2, часов 6</code>\n' +
    '«вчера: касаний 20»: за вчера. «Поправь касаний 20»: заменить число.',
    inline_([[btn_('🔘 Заполнить по шагам', 'rp:steps')]]));
}

function formatWritten_(iso, w, mode) {
  const lines = ['✅ <b>Записал за ' + ru_(iso) + '</b>'];
  w.lines.forEach(function (l) {
    let val;
    if (mode === 'set') val = l.old === l.nv ? fmtNum_(l.nv) : 'было ' + fmtNum_(l.old) + ' → стало ' + fmtNum_(l.nv);
    else val = l.old ? '+' + fmtNum_(l.delta) + ' → ' + fmtNum_(l.nv) : fmtNum_(l.nv);
    lines.push('• ' + esc_(l.label) + ': ' + val);
  });
  return lines.join('\n');
}
function saveUndo_(cells) { setJprop_('UNDO', { t: nowDate_().getTime(), cells: cells }); }

function applyQuickReport_(q) {
  const today = today_();
  if (q.iso > today) { send_('Дата ' + ru_(q.iso) + ' в будущем. Напиши отчёт за сегодня или за прошедший день.'); return; }
  const w = writeActions_(q.iso, q.items, q.mode);
  saveUndo_(w.undo);
  let text = formatWritten_(q.iso, w, q.mode);
  if (/\d/.test(q.leftover)) text += '\n\n⚠️ Не разобрал: «' + esc_(cut_(q.leftover, 80)) + '». Если там было что-то важное, допиши отдельным сообщением.';
  send_(text, inline_([[btn_('↩️ Отменить', 'un:1')]]));
}

const CORE_STEPS_ = ['touches', 'replies', 'calls', 'proposals', 'contracts', 'new_residents', 'hours_sales', 'expenses'];
function readDay_(iso) {
  const g = readGrid_(SHEET_ACTIONS, 14);
  const header = g.d[0].map(s_);
  const out = {};
  for (let i = 1; i < g.d.length; i++) {
    if (cellIso_(g.v[i][0], g.d[i][0]) !== iso) continue;
    METRICS.forEach(function (m) { const c = header.indexOf(m.header); if (c >= 0) out[m.key] = num_(g.v[i][c]); });
    break;
  }
  return out;
}
function startReportSteps_() {
  const iso = today_();
  setState_('rsteps', 0, { iso: iso, vals: {}, cur: readDay_(iso) });
  askReportStep_();
}
function askReportStep_() {
  const st = getState_();
  const i = st.step, key = CORE_STEPS_[i];
  const cur = st.data.cur[key];
  const nums = [0, 1, 2, 3, 4, 5], big = [7, 10, 15, 20, 30, 50];
  send_('✍️ Шаг ' + (i + 1) + '/' + CORE_STEPS_.length + ': <b>' + esc_(metricHeader_(key)) + '</b>' +
    (cur ? ' (уже записано: ' + fmtNum_(cur) + ')' : '') + '\nСколько добавить? Нажми число или напиши своё.',
    inline_([nums.map(function (n) { return btn_(String(n), 'rp:v:' + n); }),
      big.map(function (n) { return btn_(String(n), 'rp:v:' + n); }),
      [btn_('⏭ Пропустить', 'rp:skip'), btn_('✅ Готово', 'rp:done')]]));
}
function reportStepNext_(value) {
  const st = getState_();
  if (!st) return;
  if (value !== null && value > 0) st.data.vals[CORE_STEPS_[st.step]] = value;
  if (st.step + 1 >= CORE_STEPS_.length) return finishReportSteps_(st);
  setState_('rsteps', st.step + 1, st.data);
  askReportStep_();
}
function finishReportSteps_(st) {
  const items = Object.keys(st.data.vals).map(function (k) { return { key: k, value: st.data.vals[k] }; });
  clearState_();
  if (!items.length) { send_('Ничего не добавил: все значения нулевые.', mainKb_()); return; }
  const w = writeActions_(st.data.iso, items, 'add');
  saveUndo_(w.undo);
  send_(formatWritten_(st.data.iso, w, 'add'), inline_([[btn_('↩️ Отменить', 'un:1')]]));
}
function undoLast_() {
  const u = jprop_('UNDO', null);
  if (!u || nowDate_().getTime() - u.t > 6 * 3600 * 1000) { send_('Отменять нечего: прошло слишком много времени.'); return; }
  undoCells_(u.cells);
  props_().deleteProperty('UNDO');
  send_('↩️ Отменил последнюю запись.');
}

// --- задачи --------------------------------------------------------------------------------
function startTask_() {
  setState_('task', 'text', {});
  send_('➕ <b>Новая задача</b>\nЧто и когда? Например: «завтра позвонить в Сбер» или «в пятницу отправить КП».\n' +
    'Можно несколько, по одной в строке. Без дня задача ставится на сегодня.');
}
function parseTaskLines_(text, today) {
  const out = [];
  String(text).split('\n').forEach(function (line) {
    let l = line.replace(/^\s*(?:[+\-•*–—]|\d+[.)])\s*/, '').trim();
    l = l.replace(/^(?:задачи?|todo)\s*[:\-]\s*/i, '').trim();
    if (!l) return;
    const d = parseDateWords_(l, today);
    out.push({ title: cap_(d.rest || l), due: d.iso || today });
  });
  return out;
}
function addTasksFromText_(text, source) {
  const today = today_();
  const items = parseTaskLines_(text, today);
  if (!items.length) { send_('Не вижу текста задачи. Напиши, например: «+ завтра позвонить в Сбер».'); return; }
  const ids = addTasks_(items.map(function (x) { return { due: x.due, title: x.title }; }), source || 'из бота');
  const out = ['✅ <b>Добавил ' + (items.length === 1 ? 'задачу' : 'задачи (' + items.length + ')') + '</b>'];
  items.forEach(function (x, i) { out.push('#' + ids[i] + ' ' + esc_(x.title) + ' — ' + (x.due === today ? 'сегодня' : wdName_(x.due) + ', ' + short_(x.due))); });
  send_(out.join('\n'));
}
function markTasksDone_(ids) {
  const done = [], miss = [];
  ids.forEach(function (id) { (patchTask_(id, { status: 'Сделано' }) ? done : miss).push(id); });
  send_((done.length ? '✅ Готово: ' + done.map(function (i) { return '#' + i; }).join(', ') : '') +
    (miss.length ? (done.length ? '\n' : '') + 'Не нашёл: ' + miss.map(function (i) { return '#' + i; }).join(', ') : ''));
}

// --- люди ----------------------------------------------------------------------------------
function matchList_(s, list) {
  const x = s_(s).toLowerCase();
  if (!x) return null;
  for (let i = 0; i < list.length; i++) if (list[i].toLowerCase() === x) return list[i];
  for (let i = 0; i < list.length; i++) {
    const y = list[i].toLowerCase();
    if (y.indexOf(x) === 0 || x.indexOf(y.slice(0, Math.max(5, y.length - 2))) === 0) return list[i];
  }
  return null;
}
function stepAndDue_(text, today) {
  const t = s_(text);
  if (!t || t === '-' || t === '—') return { nextStep: '', due: null };
  const d = parseDateWords_(t, today);
  return { nextStep: cap_(d.rest || t), due: d.iso || addDays_(today, 3) };
}
function savePerson_(p) {
  const today = today_();
  const sd = stepAndDue_(p.step, today);
  const row = appendContact_({ name: p.name, who: p.who, source: p.source, request: p.request,
    stage: sd.nextStep ? 'В работе' : 'Новый', nextStep: sd.nextStep, due: sd.due }, today);
  send_('✅ <b>' + esc_(p.name) + '</b> записан(а)' + (sd.nextStep ? '. Следующий шаг: «' + esc_(sd.nextStep) + '» до ' + ru_(sd.due) : '. Следующий шаг не задан') +
    '.\n(строка ' + row + ' листа «Обращения»)', mainKb_());
}
function personFromLine_(text) {
  const lists = readLists_();
  const parts = text.split('|').map(function (x) { return x.trim(); });
  const name = parts[0];
  if (!name) { send_('Не вижу имени. Формат: Имя | кто | запрос | шаг'); return; }
  const who = matchList_(parts[1], lists.who);
  const rest = who ? parts.slice(2) : parts.slice(1);
  savePerson_({ name: name, who: who || '', source: name.charAt(0) === '@' ? 'Телеграм' : 'Другое',
    request: rest[0] || '', step: rest[1] || '' });
}
function startPerson_() {
  setState_('person', 'name', {});
  send_('👤 <b>Новый человек</b>\nКто это? Имя или @ник (можно с организацией).\n' +
    'Быстрее одной строкой: <code>Иван | работодатель | вакансия юриста | созвониться в пятницу</code>');
}
function askChoice_(prompt, list, prefix, extraRows) {
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2).map(function (v, k) { return btn_(v, prefix + ':' + (i + k)); }));
  }
  send_(prompt, inline_(rows.concat(extraRows || [])));
}

// --- следующий шаг по человеку (кнопка ✅ в списке) ----------------------------------------
function askNextStep_(row, h) {
  const c = readContacts_().list.filter(function (x) { return x.row === row; })[0];
  if (!c || hash_(c.name) !== h) { send_('Список изменился: нажми «📋 Сегодня» ещё раз.'); return; }
  const k = function (code) { return 'ns:' + row + ':' + h + ':' + code; };
  send_('<b>' + esc_(cut_(c.name, 60)) + '</b>: сделано. Что дальше?', inline_([
    [btn_('⏳ Ждём ответ 3 дня', k('w3')), btn_('⏳ 7 дней', k('w7'))],
    [btn_('📩 Написать завтра', k('tm')), btn_('✍️ Свой шаг', k('cu'))],
    [btn_('🏁 Закрыто: успех', k('cl')), btn_('❌ Отказ', k('rj'))],
    [btn_('☑️ Без следующего шага', k('no'))]]));
}
function applyNextStep_(row, h, code) {
  const today = today_();
  const was = function (cur) { return 'сделано: ' + (cur.nextStep || 'шаг'); };
  let patch;
  if (code === 'w3' || code === 'w7') patch = { nextStep: 'Дождаться ответа', due: addDays_(today, code === 'w3' ? 3 : 7), comment: was };
  else if (code === 'tm') patch = { nextStep: 'Написать', due: addDays_(today, 1), comment: was };
  else if (code === 'cl') patch = { stage: 'Закрыто', stepDone: true, comment: function (c) { return was(c) + '; закрыто'; } };
  else if (code === 'rj') patch = { stage: 'Отказ', stepDone: true, comment: function (c) { return was(c) + '; отказ'; } };
  else if (code === 'no') patch = { stepDone: true, comment: was };
  else if (code === 'cu') {
    setState_('nstep', 'text', { row: row, h: h });
    send_('Какой следующий шаг и когда? Например: «созвониться в пятницу». «-» значит без шага.');
    return;
  }
  const r = patchContact_(row, h, patch, today);
  send_('✅ <b>' + esc_(cut_(r.name, 50)) + '</b>: ' + (r.nextStep ? esc_(r.nextStep) + ' до ' + ru_(r.due) : 'шаг закрыт'));
}
function postponeContact_(row, h) {
  const today = today_();
  const r = patchContact_(row, h, { due: addDays_(today, 3), comment: 'перенесено на 3 дня' }, today);
  return r;
}

// --- продажи -------------------------------------------------------------------------------
function parseMoney_(text) {
  const m = /(\d+(?:[  ]?\d{3})*(?:[.,]\d+)?)\s*(тыс[а-яё.]*|к(?![а-яё]))?/i.exec(String(text));
  if (!m) return null;
  let v = num_(m[1].replace(/[  ]/g, ''));
  if (m[2]) v *= 1000;
  return v;
}
function startSale_() {
  setState_('sale', 'client', {});
  send_('💰 <b>Новая продажа</b>\nКто клиент? Имя, ник или организация.');
}
function saleFinish_(d) {
  const today = today_();
  const row = appendSale_({ client: d.client, what: d.what, direction: d.direction, amount: d.amount, paid: d.paid, source: d.source }, today);
  clearState_();
  send_('✅ <b>Продажа записана</b>: ' + esc_(d.client) + ', ' + esc_(d.what) + ', ' + fmtNum_(d.amount) + ' ₽ (оплачено ' + fmtNum_(d.paid) + ')' +
    (d.amount - d.paid > 0 ? ', долг ' + fmtNum_(d.amount - d.paid) + ' ₽' : '') + '.\n(строка ' + row + ' листа «Продажи»)', mainKb_());
}

// --- цели ----------------------------------------------------------------------------------
function goalsFromText_(text) {
  const today = today_();
  const lists = readLists_();
  const goals = [];
  String(text).split('\n').forEach(function (line) {
    const l = line.replace(/^\s*(?:цел[ьи]\s*:|[+\-•*]|\d+[.)])\s*/i, '').trim();
    if (!l) return;
    const p = l.split('|').map(function (x) { return x.trim(); });
    if (p.length >= 3) {
      goals.push({ period: normPeriod_(p[0], today), direction: matchList_(p[1], lists.directions) || 'Другое', goal: p[2],
        metric: p[3] || '', target: p[4] || '', weekly: p[5] || '' });
    } else {
      goals.push({ period: String(isoParts_(today).y), direction: 'Другое', goal: l });
    }
  });
  if (!goals.length) { send_('Не вижу целей. Формат: период | направление | цель | метрика | число | недельные действия'); return; }
  appendGoals_(goals);
  send_('✅ <b>Добавил целей: ' + goals.length + '</b> (лист «План года»).\n«🗓 Неделя» соберёт из них задачи недели.', mainKb_());
}
function weekListFromText_(text) {
  const today = today_();
  addTasksFromText_(text, 'неделя ' + isoWeekLabel_(today));
}

// ============================================================================
// 9. РАЗБОР СООБЩЕНИЙ И КНОПОК
// ============================================================================
const MENU_ = {
  '📋 Сегодня': showToday_, '✍️ Отчёт': startReport_, '➕ Задача': startTask_, '👤 Человек': startPerson_,
  '💰 Продажа': startSale_, '🗓 Неделя': showWeek_, '📊 Итоги': showReviewMenu_, '🎯 Цели': showGoals_,
};
const COMMANDS_ = {
  start: showHelp_, help: showHelp_, menu: showHelp_, today: showToday_, report: startReport_, task: startTask_,
  tasks: showTasks_, person: startPerson_, sale: startSale_, week: showWeek_, plan: makeWeekPlan_, review: function () { send_(reviewMessage_('week')); },
  month: function () { send_(reviewMessage_('month')); }, stats: showStats_, goals: showGoals_, status: showStatus_, cancel: cancelFlow_,
};

function onMessage_(msg) {
  if (!msg.text) { send_('Пока понимаю только текст и кнопки. Напиши отчёт словами или нажми кнопку внизу.', mainKb_()); return; }
  onText_(msg.text.trim());
}

function onText_(text) {
  const cmd = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text);
  if (cmd) {
    const f = COMMANDS_[cmd[1].toLowerCase()];
    if (!f) { send_('Не знаю такой команды. /help: что я умею.'); return; }
    clearState_();
    return f(cmd[2] || '');
  }
  if (MENU_[text]) { clearState_(); return MENU_[text](); }
  if (/^(отмена|отменить|cancel)$/i.test(text)) return cancelFlow_();
  const st = getState_();
  if (st) return flowText_(st, text);

  let m;
  if ((m = /^(?:готово|сделал[а-яё]*|выполнил[а-яё]*|✅)\s*[:#]?\s*((?:#?\d+[\s,и]*)+)$/i.exec(text))) {
    return markTasksDone_((m[1].match(/\d+/g) || []).map(Number));
  }
  if (/^(?:\+\s|задачи?\s*[:\-]|todo\s*[:\-])/i.test(text)) return addTasksFromText_(text);
  if (/^цел[ьи]\s*:/i.test(text)) return goalsFromText_(text);
  if (text.indexOf('|') > 0) return personFromLine_(text);
  const q = parseQuickReport_(text, today_());
  if (q) return applyQuickReport_(q);
  setProp_('PENDING_TEXT', text);
  send_('Не уверен, что с этим делать. Если это задача, сохраню её; отчёт пиши так: <code>написал 15, ответили 3, созвон 1</code>.',
    inline_([[btn_('➕ Сохранить как задачу', 'ch:task'), btn_('✖️ Ничего', 'ch:no')]]));
}

/** Ответ на вопрос бота («жду имя человека» и т.п.). */
function flowText_(st, text) {
  const today = today_();
  const d = st.data;
  switch (st.flow) {
    case 'task':
      clearState_();
      return addTasksFromText_(text);
    case 'weeklist':
      clearState_();
      return weekListFromText_(text);
    case 'goals':
      clearState_();
      return goalsFromText_(text);
    case 'nstep': {
      clearState_();
      const sd = stepAndDue_(text, today);
      const r = patchContact_(d.row, d.h, sd.nextStep
        ? { nextStep: sd.nextStep, due: sd.due, comment: function (c) { return 'сделано: ' + (c.nextStep || 'шаг'); } }
        : { stepDone: true, comment: 'шаг выполнен' }, today);
      send_('✅ <b>' + esc_(cut_(r.name, 50)) + '</b>: ' + (r.nextStep ? esc_(r.nextStep) + ' до ' + ru_(r.due) : 'шаг закрыт'));
      refreshBriefs_();
      return;
    }
    case 'rsteps': {
      if (/^\d+(?:[.,]\d+)?$/.test(text)) return reportStepNext_(num_(text));
      const q = parseQuickReport_(text, today);
      if (q) { clearState_(); return applyQuickReport_(q); }
      send_('Напиши число или нажми кнопку. «Отмена»: выйти.');
      return;
    }
    case 'person':
      if (st.step === 'name') {
        if (text.indexOf('|') > 0) { clearState_(); return personFromLine_(text); }
        d.name = text;
        d.lists = readLists_();
        setState_('person', 'who', d);
        return askChoice_('Кто это?', d.lists.who, 'pw');
      }
      if (st.step === 'request') {
        d.request = text === '-' ? '' : text;
        setState_('person', 'next', d);
        return send_('Следующий шаг и срок? Например: «написать в пятницу». «-»: без шага.');
      }
      if (st.step === 'next') {
        d.step = text;
        clearState_();
        return savePerson_(d);
      }
      return send_('Выбери вариант кнопкой выше или напиши «Отмена».');
    case 'sale':
      if (st.step === 'client') { d.client = text; setState_('sale', 'what', d); return send_('Что продано? Например: «резидентство», «рекрутинг».'); }
      if (st.step === 'what') { d.what = text; d.lists = readLists_(); setState_('sale', 'direction', d); return askChoice_('Направление?', d.lists.directions, 'sd'); }
      if (st.step === 'amount') {
        const v = parseMoney_(text);
        if (v === null) return send_('Не понял сумму. Напиши числом, например 3500.');
        d.amount = v;
        setState_('sale', 'paidmode', d);
        return send_('Сколько оплачено?', inline_([[btn_('Полностью', 'sp:full'), btn_('Не оплачено', 'sp:none')], [btn_('Часть: напишу сумму', 'sp:part')]]));
      }
      if (st.step === 'paid') {
        const v = parseMoney_(text);
        if (v === null) return send_('Не понял сумму. Напиши числом, например 1500.');
        d.paid = v;
        setState_('sale', 'source', d);
        return askChoice_('Откуда клиент?', d.lists.sources, 'ss');
      }
      return send_('Выбери вариант кнопкой выше или напиши «Отмена».');
    default:
      clearState_();
      return onText_(text);
  }
}

function onCallback_(cq) {
  answer_(cq.id);
  const p = String(cq.data || '').split(':');
  const mid = cq.message ? cq.message.message_id : 0;
  const today = today_();
  const st = getState_();
  switch (p[0]) {
    case 'cd': return askNextStep_(+p[1], p[2]);
    case 'cp': {
      const r = postponeContact_(+p[1], p[2]);
      send_('⏩ <b>' + esc_(cut_(r.name, 50)) + '</b>: перенёс на ' + ru_(r.due));
      return refreshBriefs_(mid);
    }
    case 'ns': {
      dropKb_(mid);
      applyNextStep_(+p[1], p[2], p[3]);
      return refreshBriefs_();
    }
    case 'td': patchTask_(+p[1], { status: 'Сделано' }); return afterTaskAction_(mid, '✅ Выполнено: #' + p[1]);
    case 'tm': patchTask_(+p[1], { due: addDays_(today, 1) }); return afterTaskAction_(mid, '→ Перенёс #' + p[1] + ' на завтра');
    case 'tx': patchTask_(+p[1], { status: 'Отменена' }); return afterTaskAction_(mid, '✖ Отменил #' + p[1]);
    case 'tk': return startTask_();
    case 'rv': return send_(reviewMessage_(p[1]));
    case 'un': dropKb_(mid); return undoLast_();
    case 'ch': {
      dropKb_(mid);
      if (p[1] === 'task') { const t = prop_('PENDING_TEXT'); if (t) addTasksFromText_(t); }
      props_().deleteProperty('PENDING_TEXT');
      return;
    }
    case 'wk':
      if (p[1] === 'add') { setState_('weeklist', 'text', {}); return send_('Пришли задачи недели списком: по одной в строке, можно с днём («пт — отправить КП»).'); }
      return showTasks_();
    case 'gl':
      setState_('goals', 'text', {});
      return send_('Пришли цели: по одной в строке.\n<code>период | направление | цель | метрика | число | недельные действия</code>\n' +
        'Например: <code>2026-Q4 | Кадры | 20 договоров | договоры | 20 | пн: написать 10 работодателям; пт: отправить КП</code>\n' +
        'Достаточно и короче: просто текст цели, тогда это цель на год.');
    case 'rp':
      if (p[1] === 'go') { clearState_(); return startReport_(); }
      if (p[1] === 'steps') { dropKb_(mid); return startReportSteps_(); }
      if (!st || st.flow !== 'rsteps') return;
      if (p[1] === 'v') return reportStepNext_(+p[2]);
      if (p[1] === 'skip') return reportStepNext_(null);
      if (p[1] === 'done') return finishReportSteps_(st);
      return;
    case 'pw': case 'ps': case 'sd': case 'ss': case 'sp': return choiceCallback_(p, st, mid);
    default: return;
  }
}
function afterTaskAction_(mid, note) {
  refreshBriefs_(mid);
  const kinds = jprop_('MSGKIND', {});
  if (!kinds[mid]) { // сообщение со списком задач недели: перерисуем его
    try { const m = tasksMessage_(loadSnap_(['tasks'])); edit_(mid, m.text, m.kb || { inline_keyboard: [] }); } catch (e) { send_(note); }
  }
}
function choiceCallback_(p, st, mid) {
  if (!st) { send_('Этот выбор устарел. Начни заново кнопкой в меню.'); return; }
  const d = st.data, i = +p[1];
  dropKb_(mid);
  if (p[0] === 'pw' && st.flow === 'person') { d.who = d.lists.who[i]; setState_('person', 'source', d); return askChoice_('Откуда обращение?', d.lists.sources, 'ps'); }
  if (p[0] === 'ps' && st.flow === 'person') { d.source = d.lists.sources[i]; setState_('person', 'request', d); return send_('Суть запроса одной фразой. «-»: пропустить.'); }
  if (p[0] === 'sd' && st.flow === 'sale') { d.direction = d.lists.directions[i]; setState_('sale', 'amount', d); return send_('Сумма продажи, ₽?'); }
  if (p[0] === 'sp' && st.flow === 'sale') {
    if (p[1] === 'part') { setState_('sale', 'paid', d); return send_('Сколько оплачено, ₽?'); }
    d.paid = p[1] === 'full' ? d.amount : 0;
    setState_('sale', 'source', d);
    return askChoice_('Откуда клиент?', d.lists.sources, 'ss');
  }
  if (p[0] === 'ss' && st.flow === 'sale') { d.source = d.lists.sources[i]; return saleFinish_(d); }
  send_('Этот выбор устарел. Начни заново кнопкой в меню.');
}

// ============================================================================
// 10. РАСПИСАНИЕ: проверка Telegram раз в минуту + плановые сообщения
//     (веб-хук не используем: у Apps Script он отвечает редиректом 302, и Telegram шлёт дубли)
// ============================================================================
function pushMorning_() { showToday_(); heat_(3); }
function pushEvening_() {
  const snap = loadSnap_(['contacts', 'tasks', 'summary']);
  const m = eveningMessage_(snap);
  const sent = send_(m.text, m.kb);
  rememberMsg_(sent.message_id, 'e');
  setProp_('BRIEF_MSG', sent.message_id);
  heat_(5);
}
function pushWeekPlan_() { makeWeekPlan_(); heat_(4); }
function pushWeekReview_() { send_(reviewMessage_('week')); }
function pushMonthReview_() { send_(reviewMessage_('month')); }
function pushMonthStart_() {
  const snap = loadSnap_(['goals']);
  const act = snap.goals.filter(function (g) { return periodCovers_(g.period, snap.today); });
  send_('🎯 <b>Новый месяц</b>\nПроверь цели месяца в листе «Планы» (жёлтые клетки): от них зависит светофор.' +
    (act.length ? '\n\nЦели года, которые действуют сейчас:\n' + act.slice(0, 6).map(function (g) { return '• ' + esc_(g.direction) + ': ' + esc_(cut_(g.goal, 100)); }).join('\n') : '') +
    '\n\n<a href="' + ss_().getUrl() + '">Открыть таблицу</a>');
}

const PUSHES_ = [
  { key: 'morning', at: function () { return SETTINGS.morning; }, ok: function () { return true; }, run: pushMorning_ },
  { key: 'weekplan', at: function () { return SETTINGS.weekPlan; }, ok: function (i) { return weekdayIdx_(i.iso) === 0; }, run: pushWeekPlan_ },
  { key: 'monthstart', at: function () { return SETTINGS.monthStart; }, ok: function (i) { return isoParts_(i.iso).d === 1; }, run: pushMonthStart_ },
  { key: 'evening', at: function () { return SETTINGS.evening; }, ok: function () { return true; }, run: pushEvening_ },
  { key: 'weekreview', at: function () { return SETTINGS.weekReview; }, ok: function (i) { return weekdayIdx_(i.iso) === 6; }, run: pushWeekReview_ },
  { key: 'monthreview', at: function () { return SETTINGS.monthReview; }, ok: function (i) { return i.iso === monthEnd_(i.iso); }, run: pushMonthReview_ },
];

/** Отправляет плановые сообщения, время которых наступило (и не позже lateHours часов назад). */
function duePushes_() {
  const info = nowInfo_();
  const sent = jprop_('SENT', {});
  PUSHES_.forEach(function (p) {
    const key = p.key + ':' + info.iso;
    const start = hhmm_(p.at());
    if ((sent[key] || 0) >= 2 || info.min < start || info.min > start + SETTINGS.lateHours * 60 || !p.ok(info)) return;
    sent[key] = (sent[key] || 0) + 1; // считаем попытки заранее: сбой не должен породить поток повторов
    setJprop_('SENT', sent);
    try { p.run(); sent[key] = 99; setJprop_('SENT', sent); }
    catch (e) { reportError_(e, 'Не получилось отправить «' + p.key + '»'); }
  });
  Object.keys(sent).forEach(function (k) {
    if (diffDays_(info.iso, k.split(':')[1]) > 14) delete sent[k];
  });
  setJprop_('SENT', sent);
}

function hotSpentSec_() { const h = jprop_('HOT_SPENT', {}); return h.d === today_() ? h.s : 0; }
function addHotSpent_(sec) { setJprop_('HOT_SPENT', { d: today_(), s: hotSpentSec_() + sec }); }
function hotActive_() {
  return nowDate_().getTime() < +(prop_('HOT_UNTIL') || 0) && hotSpentSec_() < SETTINGS.hotBudgetMinutes * 60;
}

function pollOnce_(timeoutSec) {
  const call = function () {
    return tg_('getUpdates', { offset: +(prop_('OFFSET') || 0), timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] });
  };
  let updates;
  try { updates = call(); }
  catch (e) {
    if (e.tg && /webhook/i.test(e.tg.description || '')) { tg_('deleteWebhook', {}); updates = call(); } else throw e;
  }
  updates.forEach(handleUpdate_);
  return updates.length;
}

function handleUpdate_(u) {
  setProp_('OFFSET', u.update_id + 1); // сначала подтверждаем: «ядовитое» сообщение не должно зациклить бота
  const from = u.message ? u.message.from : (u.callback_query ? u.callback_query.from : null);
  if (!from || String(from.id) !== String(prop_('OWNER_ID'))) return; // чужим не отвечаем
  heat_(SETTINGS.hotMinutes);
  try {
    if (u.callback_query) onCallback_(u.callback_query);
    else if (u.message) onMessage_(u.message);
  } catch (e) {
    setProp_('LAST_ERROR', nowDate_().toISOString() + ' ' + cut_(e && e.message ? e.message : e, 300));
    try { send_('⚠️ ' + esc_(cut_(e && e.message ? e.message : e, 300))); } catch (x) { /* нет связи */ }
  }
}

/** Опрашивает Telegram. После вашего сообщения несколько минут держит «быстрый режим» (ответ почти мгновенно). */
function pollLoop_() {
  const t0 = nowDate_().getTime();
  let hotSec = 0;
  while (true) {
    const hot = hotActive_();
    const s0 = nowDate_().getTime();
    const n = pollOnce_(hot ? 20 : 0);
    const spent = (nowDate_().getTime() - s0) / 1000;
    if (hot) hotSec += spent;
    if (!hotActive_()) break;
    if (nowDate_().getTime() - t0 > 50000) break;
    if (n === 0 && spent < 2) Utilities.sleep(500);
  }
  if (hotSec) addHotSpent_(hotSec);
}

function reportError_(e, where) {
  const msg = cut_((where ? where + ': ' : '') + (e && e.message ? e.message : String(e)), 300);
  setProp_('LAST_ERROR', nowDate_().toISOString() + ' ' + msg);
  const last = +(prop_('ERR_SENT') || 0);
  if (nowDate_().getTime() - last < 30 * 60 * 1000) return; // не заваливаем сообщениями об одной и той же поломке
  setProp_('ERR_SENT', nowDate_().getTime());
  try { send_('⚠️ ' + esc_(msg)); } catch (x) { /* нет связи: расскажем позже */ }
}

/** Точка входа для триггера «раз в минуту». */
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // предыдущая проверка ещё идёт
  try {
    if (!prop_('BOT_TOKEN') || !prop_('OWNER_ID')) return;
    setProp_('LAST_TICK', nowDate_().getTime());
    try { duePushes_(); } catch (e) { reportError_(e, 'Плановые сообщения'); }
    try { pollLoop_(); } catch (e) { reportError_(e, 'Проверка сообщений'); }
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// 11. УСТАНОВКА И СТАТУС (меню «🤖 Ассистент» в таблице)
// ============================================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 Ассистент')
    .addItem('Настроить бота', 'setupBot')
    .addItem('Проверить работу', 'checkBot')
    .addItem('Прислать список на сегодня', 'sendBriefNow')
    .addSeparator()
    .addItem('Остановить бота', 'stopBot')
    .addToUi();
}

function triggerCount_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'tick'; }).length;
}
function installTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
}

function statusText_() {
  const lines = ['<b>🤖 Состояние бота</b>'];
  const last = +(prop_('LAST_TICK') || 0);
  lines.push(last ? 'Последняя проверка: ' + Math.max(0, Math.round((nowDate_().getTime() - last) / 60000)) + ' мин назад'
    : 'Проверок ещё не было');
  lines.push('Проверка раз в минуту: ' + (triggerCount_() ? 'включена' : '<b>ВЫКЛЮЧЕНА</b> (меню «🤖 Ассистент» → «Настроить бота»)'));
  lines.push('Быстрый режим сегодня: ' + Math.round(hotSpentSec_() / 60) + ' из ' + SETTINGS.hotBudgetMinutes + ' мин');
  const err = prop_('LAST_ERROR');
  lines.push('Последняя ошибка: ' + (err ? esc_(cut_(err, 200)) : 'нет'));
  const problems = schemaProblems_();
  lines.push('Таблица: ' + (problems.length ? esc_(problems.join('; ')) : 'структура в порядке'));
  return lines.join('\n');
}
function showStatus_() { send_(statusText_()); }

function setupBot() {
  const ui = SpreadsheetApp.getUi();
  const t = ui.prompt('Настройка бота (шаг 1 из 2)', 'Вставьте токен бота (его прислал @BotFather):', ui.ButtonSet.OK_CANCEL);
  if (t.getSelectedButton() !== ui.Button.OK) return;
  const o = ui.prompt('Настройка бота (шаг 2 из 2)', 'Ваш числовой Telegram ID (его показал @userinfobot):', ui.ButtonSet.OK_CANCEL);
  if (o.getSelectedButton() !== ui.Button.OK) return;
  const token = t.getResponseText().trim(), owner = o.getResponseText().trim();
  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) { ui.alert('Токен выглядит неверно. Он должен быть вида 123456789:AAH… Скопируйте его целиком.'); return; }
  if (!/^\d{5,}$/.test(owner)) { ui.alert('ID должен состоять только из цифр.'); return; }
  setProp_('BOT_TOKEN', token);
  setProp_('OWNER_ID', owner);
  let me;
  try { me = tg_('getMe'); }
  catch (e) { props_().deleteProperty('BOT_TOKEN'); ui.alert('Telegram не принял токен: ' + e.message + '\nПроверьте, что скопировали его целиком.'); return; }
  try { tg_('deleteWebhook', { drop_pending_updates: false }); } catch (e) { /* вебхука не было */ }
  ensureSheets_();
  installTrigger_();
  try {
    tg_('setMyCommands', { commands: [
      { command: 'today', description: 'Список на сегодня' }, { command: 'report', description: 'Отчёт за день' },
      { command: 'task', description: 'Новая задача' }, { command: 'week', description: 'План недели' },
      { command: 'review', description: 'Итоги недели' }, { command: 'month', description: 'Итоги месяца' },
      { command: 'stats', description: 'Сводка и светофор' }, { command: 'help', description: 'Что я умею' } ] });
  } catch (e) { /* подсказки команд не критичны */ }
  try { send_(HELP_, mainKb_()); }
  catch (e) {
    ui.alert('Бот не смог вам написать. Откройте в Telegram @' + me.username + ', нажмите Start и запустите настройку ещё раз.');
    return;
  }
  const problems = schemaProblems_();
  ui.alert('Готово! Бот @' + me.username + ' подключён и написал вам в Telegram. Проверка сообщений идёт раз в минуту.' +
    (problems.length ? '\n\nОбратите внимание на таблицу: ' + problems.join('; ') : ''));
}

function checkBot() {
  const ui = SpreadsheetApp.getUi();
  if (!prop_('BOT_TOKEN')) { ui.alert('Бот ещё не настроен: меню «🤖 Ассистент» → «Настроить бота».'); return; }
  try { const me = tg_('getMe'); send_(statusText_()); ui.alert('Бот @' + me.username + ' отвечает. Состояние отправил вам в Telegram.'); }
  catch (e) { ui.alert('Проблема: ' + e.message); }
}
function sendBriefNow() {
  try { showToday_(); SpreadsheetApp.getUi().alert('Отправил список в Telegram.'); }
  catch (e) { SpreadsheetApp.getUi().alert('Не получилось: ' + e.message); }
}
function stopBot() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  SpreadsheetApp.getUi().alert('Бот остановлен. Чтобы включить снова: «Настроить бота».');
}
