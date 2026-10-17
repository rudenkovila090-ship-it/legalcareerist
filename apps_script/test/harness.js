'use strict';
// Имитация Google Apps Script и Telegram: прогоняем настоящий Code.gs без Google.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TZ = 'Europe/Moscow';
const OWNER = 400995287;
const TOKEN = '123456789:AAFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE00';
const CODE = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function serial(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); }
const S = (d, m) => serial(2026, m, d); // 2026-й

function fmtDisplay(v, f) {
  if (f === 'dd.mm.yyyy' && typeof v === 'number') {
    const t = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
  }
  return v === null || v === undefined ? '' : String(v);
}

class FakeRange {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  _each(fn) {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(fn(this.r - 1 + i, this.c - 1 + j));
      out.push(row);
    }
    return out;
  }
  getValues() { return this._each((i, j) => (this.sh.v[i] ? (this.sh.v[i][j] === undefined ? '' : this.sh.v[i][j]) : '')); }
  getDisplayValues() { return this._each((i, j) => fmtDisplay(this.sh.v[i] && this.sh.v[i][j], this.sh.f[i] && this.sh.f[i][j])); }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) {
      throw new Error(`The number of rows/columns in the data does not match the range: range ${this.nr}x${this.nc}, data ${vals.length}x${(vals[0] || []).length}`);
    }
    vals.forEach((row, i) => row.forEach((x, j) => this.sh._set(this.r - 1 + i, this.c - 1 + j, x)));
    return this;
  }
  setValue(x) { this.sh._set(this.r - 1, this.c - 1, x); return this; }
  setNumberFormat(fmt) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._fmt(this.r - 1 + i, this.c - 1 + j, fmt);
    return this;
  }
  setFontWeight() { return this; }
}

class FakeSheet {
  constructor(name, rows = [], maxRows = 1000, maxCols = 26) {
    this.name = name;
    this.v = []; this.f = [];
    for (let i = 0; i < maxRows; i++) { this.v.push(new Array(maxCols).fill('')); this.f.push(new Array(maxCols).fill('')); }
    rows.forEach((row, i) => row.forEach((x, j) => { this.v[i][j] = x; }));
    this.writes = 0;
  }
  _set(i, j, x) {
    if (this.formulaCols && i >= 1 && this.formulaCols.includes(j + 1)) throw new Error(`Запись в колонку-формулу ${this.name}!${String.fromCharCode(64 + j + 1)}${i + 1} сломала бы ARRAYFORMULA`);
    if (i >= this.v.length) throw new Error('write beyond grid: row ' + (i + 1));
    if (typeof x === 'string') {
      if (x[0] === "'") x = x.slice(1);                       // апостроф = «хранить как текст», сам не сохраняется
      else if (/^[=]/.test(x)) x = { formula: x };            // иначе как при ручном вводе
      else if (/^[+-]?\d+([.,]\d+)?$/.test(x.replace(/\s/g, '')) && x.trim() !== '') x = Number(x.replace(/\s/g, '').replace(',', '.'));
      else if (/^\+\d/.test(x)) x = Number(x.replace(/[^\d]/g, ''));
    }
    this.v[i][j] = x; this.writes++;
  }
  _fmt(i, j, fmt) { if (i < this.f.length) this.f[i][j] = fmt; }
  fmtCol(c, from, to, fmt) { for (let i = from - 1; i < to; i++) this.f[i][c - 1] = fmt; return this; }
  getMaxRows() { return this.v.length; }
  getLastColumn() { let m = 1; this.v.forEach((r) => r.forEach((x, j) => { if (x !== '') m = Math.max(m, j + 1); })); return m; }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  insertRowsAfter(after, n) { for (let k = 0; k < n; k++) { this.v.push(new Array(26).fill('')); this.f.push(new Array(26).fill('')); } }
  setFrozenRows() {}
  cell(r, c) { return this.v[r - 1][c - 1]; }
  row(r, n) { return this.v[r - 1].slice(0, n); }
}

class FakeBook {
  constructor(sheets) { this.sheets = sheets; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { this.sheets[n] = new FakeSheet(n, [], 500, 12); return this.sheets[n]; }
  getSpreadsheetTimeZone() { return TZ; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/TEST/edit'; }
}

class FakeTelegram {
  constructor(clock) {
    this.clock = clock; this.updates = []; this.uid = 100; this.mid = 1000;
    this.sent = []; this.edits = []; this.kbDrops = []; this.answers = []; this.calls = [];
    this.failFetch = false; this.parseFailOnce = false; this.webhookActive = false;
  }
  say(text, from = OWNER) { this.updates.push({ update_id: ++this.uid, message: { message_id: ++this.mid, from: { id: from }, chat: { id: from }, text } }); }
  tap(data, messageId, from = OWNER) {
    this.updates.push({ update_id: ++this.uid, callback_query: { id: 'cb' + this.uid, from: { id: from }, data, message: { message_id: messageId || 1 } } });
  }
  get last() { return this.sent[this.sent.length - 1]; }
  texts() { return this.sent.map((m) => m.text).join('\n----\n'); }
  buttons(msg) {
    const kb = msg.reply_markup && msg.reply_markup.inline_keyboard;
    return kb ? kb.flat() : [];
  }
  fetch(url, opts) {
    if (this.failFetch) throw new Error('DNS failure for ' + url); // как настоящий UrlFetchApp: в тексте адрес с токеном
    const m = /\/bot([^/]+)\/(\w+)$/.exec(url);
    const method = m[2];
    const body = opts.payload ? JSON.parse(opts.payload) : {};
    this.calls.push({ method, body });
    const ok = (result) => ({ getContentText: () => JSON.stringify({ ok: true, result }) });
    const fail = (description) => ({ getContentText: () => JSON.stringify({ ok: false, description }) });
    if (m[1] !== TOKEN) return fail('Unauthorized');
    switch (method) {
      case 'getMe': return ok({ id: 1, username: 'AssistantKQRudBot' });
      case 'deleteWebhook': this.webhookActive = false; return ok(true);
      case 'setMyCommands': return ok(true);
      case 'getUpdates': {
        if (this.webhookActive) return fail("Conflict: can't use getUpdates method while webhook is active");
        this.updates = this.updates.filter((u) => u.update_id >= (body.offset || 0));
        const out = this.updates.slice();
        if (!out.length && body.timeout) this.clock.ms += body.timeout * 1000; // долгий опрос «висит»
        return ok(out);
      }
      case 'sendMessage': {
        if (this.parseFailOnce && body.parse_mode === 'HTML') { this.parseFailOnce = false; return fail("Bad Request: can't parse entities"); }
        const msg = { ...body, message_id: ++this.mid };
        this.sent.push(msg);
        return ok({ message_id: msg.message_id });
      }
      case 'editMessageText': this.edits.push(body); return ok(true);
      case 'editMessageReplyMarkup': this.kbDrops.push(body); return ok(true);
      case 'answerCallbackQuery': this.answers.push(body); return ok(true);
      default: return fail('unknown method ' + method);
    }
  }
}

/** Всё окружение бота. Часы стоят на 2026-10-17 (суббота) 15:00 по Москве: вне окон плановых сообщений, пока тест их не сдвинет. */
function makeEnv(opts = {}) {
  const clock = { ms: Date.UTC(2026, 9, 17, 12, 0) };
  const tg = new FakeTelegram(clock);
  const sheets = opts.sheets || defaultSheets();
  const book = new FakeBook(sheets);
  const props = new Map();
  const triggers = [];
  const ui = { prompts: [], alerts: [], menus: [] };
  const logs = [];

  const Utilities = {
    formatDate(date, tz, pattern) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(date.getTime()));
      const g = (t) => parts.find((p) => p.type === t).value;
      if (pattern === 'yyyy-MM-dd') return `${g('year')}-${g('month')}-${g('day')}`;
      if (pattern === 'yyyy-MM-dd HH:mm') return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
      throw new Error('pattern not faked: ' + pattern);
    },
    sleep(ms) { clock.ms += ms; },
  };
  const sandbox = {
    console, Logger: { log: (x) => logs.push(x) }, Utilities,
    __NOW__: () => clock.ms,
    UrlFetchApp: { fetch: (u, o) => tg.fetch(u, o) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, String(v)); },
      deleteProperty: (k) => { props.delete(k); },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => { const t = { getHandlerFunction: () => fn, every: null };
        const b = { timeBased: () => b, everyMinutes: (n) => { t.every = n; return b; }, create: () => { triggers.push(t); return t; } };
        return b; },
    },
    SpreadsheetApp: {
      getActive: () => book,
      getUi: () => ({
        ButtonSet: { OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK', CANCEL: 'CANCEL' },
        prompt: (title, text) => { const r = ui.prompts.shift(); ui.lastPrompt = { title, text };
          return { getSelectedButton: () => (r === null ? 'CANCEL' : 'OK'), getResponseText: () => r }; },
        alert: (msg) => { ui.alerts.push(msg); },
        createMenu: (n) => { const m = { name: n, items: [] }; ui.menus.push(m);
          const b = { addItem: (t, f) => { m.items.push(f); return b; }, addSeparator: () => b, addToUi: () => b }; return b; },
      }),
    },
  };
  const ctx = vm.createContext(sandbox);
  const code = CODE.replace(/^const SIMPLE = (true|false);/m, 'const SIMPLE = ' + !!opts.simple + ';');
  vm.runInContext(code, ctx, { filename: 'Code.gs' });

  const env = {
    ctx, tg, book, sheets, props, triggers, ui, clock, logs,
    call: (fn, ...a) => ctx[fn](...a),
    at(y, m, d, hh = 0, mm = 0) { clock.ms = Date.UTC(y, m - 1, d, hh - 3, mm); return env; }, // по Москве
    advance(sec) { clock.ms += sec * 1000; return env; },
    /** Один запуск триггера «раз в минуту» + прошла минута. */
    tick() { ctx.tick(); clock.ms += 60000; return env; },
    configure() { props.set('BOT_TOKEN', TOKEN); props.set('OWNER_ID', String(OWNER)); return env; },
    prop: (k) => props.get(k),
  };
  if (opts.configured !== false) env.configure();
  return env;
}

function defaultSheets() {
  const metricHeaders = ['Дата', 'Касания работодателям', 'Ответы работодателей', 'Созвоны и встречи', 'КП отправлено',
    'Договоры подписаны (новые клиенты)', 'Новые резиденты', 'Ушло резидентов', 'Мероприятий проведено',
    'Участников пришло', 'Посты и контент, шт', 'Расходы за день, ₽', 'Часы работы', 'Часы на продажи'];
  const contactCols = ['Дата', 'Источник', 'Кто обратился', 'Имя или ник', 'Запрос', 'Этап', 'Следующий шаг', 'Срок шага', 'Комментарий', 'Статус шага'];
  const salesCols = ['Дата', 'Направление', 'Клиент', 'Что продано', 'Сумма, ₽', 'Оплачено, ₽', 'Источник', 'Статус оплаты', 'Долг, ₽', 'Комментарий'];

  const actions = new FakeSheet('Действия', [metricHeaders, [S(16, 10), 2], [S(17, 10)]]);
  actions.fmtCol(1, 2, 3, 'dd.mm.yyyy');

  const contacts = new FakeSheet('Обращения', [contactCols,
    [S(15, 10), 'Инстаграм', 'Кандидат', 'khaustovasya', 'Студентка 2 курса, хочет онлайн-стажировку', 'В работе', 'Предложить карьерную консультацию', '', 'Предложение сделано'],
    [S(16, 10), 'Телеграм', 'Работодатель', '@katushusta', 'Рекрутинг: юрист в Сбер', 'В работе', 'Дождаться ответа', '', 'Написал с предложением'],
    [S(16, 10), 'Другое', 'Работодатель', 'FTL Advisers Ltd', 'Рекрутинг: старший юрист', 'В работе', 'Дождаться ответа', '', 'Канал: почта'],
    [S(16, 10), 'Другое', 'Партнёр', 'Ориана Полуновский (Институт адвокатуры)', 'Партнёр Legal Night Jazz 2', 'В работе', 'Написать и напомнить', S(24, 10), 'Обсудит с коллегами'],
    [S(16, 10), 'Другое', 'Партнёр', 'Полина (ИИ Стриж)', 'Партнёр Legal Night Jazz 2', 'В работе', 'Получить ответ', S(17, 10), 'Посмотрит вечером'],
  ]);
  contacts.fmtCol(1, 2, 6, 'dd.mm.yyyy').fmtCol(8, 2, 6, 'dd.mm.yyyy');

  const sales = new FakeSheet('Продажи', [salesCols]);
  sales.formulaCols = [8, 9]; // H:I это ARRAYFORMULA («Статус оплаты», «Долг»)
  sales.fmtCol(1, 2, 20, 'dd.mm.yyyy');

  const plans = new FakeSheet('Планы', [
    ['Планы на месяц и списки для меню'],
    ['Показатель', 'План на месяц', 'Хорошо когда', 'Примечание', '', 'Источник', 'Кто обратился', 'Этап', 'Направление'],
    ['Выручка Кадры, ₽', 150000, '↑', '', '', 'Инстаграм', 'Кандидат', 'Новый', 'Кадры'],
    ['Выручка Сообщество, ₽', 35000, '↑', '', '', 'Телеграм', 'Работодатель', 'В работе', 'Сообщество'],
    ['Касания работодателям', 200, '↑', '', '', 'Сарафан', 'Резидент', 'Интервью', 'Мероприятия'],
    ['Расходы, не больше, ₽', 25000, '↓', '', '', 'Мероприятие', 'Участник мероприятия', 'Оффер', 'Другое'],
    ['', '', '', '', '', 'Реклама', 'Партнёр', 'Выход'],
    ['', '', '', '', '', 'Амбассадор', 'Другое', 'Отказ'],
    ['', '', '', '', '', 'Прямые продажи', '', 'Закрыто'],
    ['', '', '', '', '', 'Другое'],
  ]);

  const H = ['Показатель', 'Сегодня', '7 дней', 'Месяц', 'План на месяц', '% плана', 'Нужно в день до конца месяца', 'Светофор', 'Хорошо когда'];
  const summary = new FakeSheet('Сводка', [
    ['КЮ: сводка по дням, неделям и месяцам'], [], [], [], [], [], [], [],
    H,
    ['Деньги'],
    ['Выручка итого (по дате продажи)', '0', '0', '0', '195,000', '0%', '13,000', '🔴', '↑'],
    ['Расходы', '0', '0', '0', '25,000', '0%', '', '🟢', '↓'],
    ['Продажи работодателям (Кадры)'],
    ['Касания работодателям', '0', '2', '2', '200', '1%', '13', '🔴', '↑'],
    ['Ответы работодателей', '0', '0', '0', '100', '0%', '7', '🔴', '↑'],
    ['Созвоны и встречи', '0', '0', '0', '80', '0%', '5', '🔴', '↑'],
    ['Новые резиденты', '0', '0', '0', '8', '0%', '1', '🟡', '↑'],
    [],
    ['Воронка по людям: сколько сейчас на каждом этапе'],
    ['Этап', 'Кандидаты', 'Работодатели', 'Резиденты'],
    ['Новый', '0', '0', '0'], ['В работе', '1', '2', '0'],
  ]);

  return { 'Действия': actions, 'Обращения': contacts, 'Продажи': sales, 'Планы': plans, 'Сводка': summary };
}

module.exports = { makeEnv, S, OWNER, TOKEN, serial, FakeSheet };
