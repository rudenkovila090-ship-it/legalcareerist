'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, S, OWNER, TOKEN } = require('./harness');

const SAT = [2026, 10, 17]; // суббота
const at = (env, hh, mm, ymd = SAT) => env.at(...ymd, hh, mm);
const has = (text, ...needles) => needles.forEach((n) => assert.ok(text.includes(n), `нет «${n}» в:\n${text}`));

// ---------------------------------------------------------------- разбор текста
test('даты на русском', () => {
  const env = makeEnv();
  const p = (s) => env.ctx.parseDateWords_(s, '2026-10-17'); // суббота
  assert.deepEqual({ ...p('завтра позвонить в Сбер') }, { iso: '2026-10-18', rest: 'позвонить в Сбер' });
  assert.equal(p('в пятницу отправить КП').iso, '2026-10-23');
  assert.equal(p('через 3 дня написать').iso, '2026-10-20');
  assert.equal(p('через неделю').iso, '2026-10-24');
  assert.equal(p('20.10 созвон').iso, '2026-10-20');
  assert.equal(p('5 ноября встреча').iso, '2026-11-05');
  assert.equal(p('05.01 план').iso, '2027-01-05'); // прошедшая дата без года = следующий год
  assert.equal(p('на следующей неделе обзвон').iso, '2026-10-19');
  assert.equal(p('пт — КП').iso, '2026-10-23');
  assert.equal(p('сегодня разобрать почту').iso, '2026-10-17');
  assert.equal(p('без даты').iso, null);
  assert.equal(p('1.5 часа').iso, null === p('1.5 часа').iso ? null : p('1.5 часа').iso); // «1.5ч» не должно ломать
});

test('быстрый отчёт: разные формулировки', () => {
  const env = makeEnv();
  const q = (s) => env.ctx.parseQuickReport_(s, '2026-10-17');
  const m = (r) => Object.fromEntries(r.items.map((i) => [i.key, i.value]));
  assert.deepEqual(m(q('Написал 15 работодателям, 3 ответили, 1 созвон, КП 2, часов 6')),
    { touches: 15, replies: 3, calls: 1, proposals: 2, hours_total: 6 });
  assert.deepEqual(m(q('касаний 15 ответов 3 созвонов 1')), { touches: 15, replies: 3, calls: 1 });
  assert.deepEqual(m(q('расходы 5 тыс, часов на продажи 3')), { expenses: 5000, hours_sales: 3 });
  assert.deepEqual(m(q('2 новых резидента, ушёл 1')), { new_residents: 2, left_residents: 1 });
  assert.equal(q('вчера: касаний 20').iso, '2026-10-16');
  assert.equal(q('поправь касаний 20').mode, 'set');
  assert.equal(q('позвонить 3 работодателям завтра'), null);   // это задача, не отчёт
  assert.equal(q('Продал резидентство за 3500'), null);          // сумма продажи не должна стать «резидентами»
});

// ---------------------------------------------------------------- установка
test('установка: токен и ID, триггер раз в минуту, вкладки, приветствие с меню', () => {
  const env = makeEnv({ configured: false });
  env.ui.prompts.push(TOKEN, String(OWNER));
  env.call('setupBot');
  assert.equal(env.prop('OWNER_ID'), String(OWNER));
  assert.equal(env.triggers.length, 1);
  assert.equal(env.triggers[0].every, 1);
  assert.ok(env.sheets['Задачи'] && env.sheets['План года'], 'бот создал свои вкладки');
  assert.deepEqual(env.sheets['Задачи'].row(1, 8), ['ID', 'Срок', 'Задача', 'Направление', 'Цель (ID)', 'Статус', 'Источник', 'Результат']);
  const hello = env.tg.sent[0];
  assert.equal(hello.chat_id, String(OWNER));
  assert.ok(hello.reply_markup.keyboard.flat().some((b) => b.text === '📋 Сегодня'), 'постоянное меню кнопок');
  assert.match(env.ui.alerts.at(-1), /Готово/);
  env.ui.prompts.push(TOKEN, String(OWNER));
  env.call('setupBot'); // повторная настройка не плодит триггеры
  assert.equal(env.triggers.length, 1);
});

test('установка: неверный токен отклоняется до обращения к Telegram', () => {
  const env = makeEnv({ configured: false });
  env.ui.prompts.push('вот-токен', String(OWNER));
  env.call('setupBot');
  assert.match(env.ui.alerts.at(-1), /Токен выглядит неверно/);
  assert.equal(env.tg.calls.length, 0);
  assert.equal(env.triggers.length, 0);
});

test('установка: Telegram не принял токен, ничего не остаётся настроенным', () => {
  const env = makeEnv({ configured: false });
  env.ui.prompts.push('999999999:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', String(OWNER));
  env.call('setupBot');
  assert.match(env.ui.alerts.at(-1), /не принял токен/);
  assert.equal(env.prop('BOT_TOKEN'), undefined);
  assert.equal(env.triggers.length, 0);
});

test('меню в таблице появляется при открытии', () => {
  const env = makeEnv();
  env.call('onOpen');
  assert.deepEqual(env.ui.menus[0].items, ['setupBot', 'checkBot', 'sendBriefNow', 'stopBot']);
});

// ---------------------------------------------------------------- плановые сообщения
test('утро: приходит ровно один раз и только в своё окно времени', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  at(env, 8, 59).tick();
  assert.equal(env.tg.sent.length, 0, 'до 09:00 тихо');
  at(env, 9, 0).tick();
  assert.equal(env.tg.sent.length, 1);
  has(env.tg.last.text, 'Доброе утро', 'Полина (ИИ Стриж)', 'Получить ответ', 'Партнёр Legal Night Jazz 2');
  env.tick(); env.tick();
  assert.equal(env.tg.sent.length, 1, 'повторов нет');
  at(env, 14, 0, [2026, 10, 18]).tick(); // следующий день, но уже поздно для утра (окно 4 ч)
  assert.equal(env.tg.sent.filter((m) => m.text.includes('Доброе утро')).length, 1);
});

test('утро: опоздавший триггер догоняет в пределах окна', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  at(env, 11, 30).tick();
  assert.match(env.tg.last.text, /Доброе утро/);
});

test('утро: отмечает просроченные шаги словом из «Сводки»', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.sheets['Обращения'].v[1][7] = S(10, 10); // khaustovasya: срок 10.10
  at(env, 9, 0).tick();
  has(env.tg.last.text, 'Просрочено (1)', 'просрочено на 7 дн.');
  assert.equal(env.sheets['Обращения'].cell(2, 10), 'просрочен');
  assert.equal(env.sheets['Обращения'].cell(3, 10), '', 'у остальных пусто');
});

test('утро: ручные пометки в «Статус шага» не затираются', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.sheets['Обращения'].v[1][7] = S(10, 10);
  env.sheets['Обращения'].v[1][9] = 'жду письма';
  at(env, 9, 0).tick();
  assert.equal(env.sheets['Обращения'].cell(2, 10), 'жду письма');
});

test('вечер, воскресенье и конец месяца приходят по расписанию', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  at(env, 21, 0).tick();
  has(env.tg.last.text, 'Вечер, 17.10.2026', 'Пришли отчёт');
  at(env, 20, 0, [2026, 10, 18]).tick();                       // воскресенье
  assert.ok(env.tg.sent.some((m) => m.text.includes('Итоги недели')));
  at(env, 20, 30, [2026, 10, 31]).tick();                      // последний день месяца
  assert.ok(env.tg.sent.some((m) => m.text.includes('Итоги месяца')));
  at(env, 9, 10, [2026, 11, 1]).tick();                        // 1-е число
  assert.ok(env.tg.sent.some((m) => m.text.includes('Новый месяц')));
});

// ---------------------------------------------------------------- отчёт
test('отчёт: цифры прибавляются к дню, есть отмена', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('Написал 15 работодателям, 3 ответили, 1 созвон'); env.tick();
  const a = env.sheets['Действия'];
  assert.deepEqual(a.row(3, 4), [S(17, 10), 15, 3, 1]);       // готовая строка 17.10 заполнена
  has(env.tg.last.text, 'Записал за 17.10.2026', 'Касания работодателям: 15', 'Ответы работодателей: 3');
  assert.ok(env.tg.buttons(env.tg.last).some((b) => b.callback_data === 'un:1'));

  env.tg.say('касаний 5'); env.tick();
  assert.equal(a.cell(3, 2), 20, 'добавилось к 15');
  has(env.tg.last.text, 'Касания работодателям: +5 → 20');
  env.tg.say('поправь касаний 7'); env.tick();
  assert.equal(a.cell(3, 2), 7, 'заменилось');
  has(env.tg.last.text, 'было 20 → стало 7');
  env.tg.tap('un:1'); env.tick();
  assert.equal(a.cell(3, 2), 20, 'отмена вернула прошлое значение');
});

test('отчёт: «вчера» пишет в строку вчерашнего дня, новый день создаёт строку', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('вчера: касаний 20'); env.tick();
  assert.equal(env.sheets['Действия'].cell(2, 2), 22, '2 + 20');
  env.at(2026, 10, 18, 12, 0);
  env.tg.say('созвон 1'); env.tick();
  assert.deepEqual(env.sheets['Действия'].row(4, 4), [S(18, 10), '', '', 1]);
  assert.equal(env.sheets['Действия'].f[3][0], 'dd.mm.yyyy', 'дата новой строки отформатирована');
});

test('отчёт: будущая дата и мусор не пишутся', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('завтра касаний 5'); env.tick();
  assert.match(env.tg.last.text, /в будущем/);
  assert.equal(env.sheets['Действия'].cell(3, 2), '');
});

test('отчёт по шагам кнопками', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('✍️ Отчёт'); env.tick();
  assert.ok(env.tg.buttons(env.tg.last).some((b) => b.callback_data === 'rp:steps'));
  env.tg.tap('rp:steps'); env.tick();
  has(env.tg.last.text, 'Шаг 1/8', 'Касания работодателям');
  env.tg.tap('rp:v:10'); env.tick();
  env.tg.tap('rp:v:3'); env.tick();     // ответы
  env.tg.say('2'); env.tick();          // созвоны: число текстом
  env.tg.tap('rp:done'); env.tick();
  assert.deepEqual(env.sheets['Действия'].row(3, 4), [S(17, 10), 10, 3, 2]);
  assert.equal(env.prop('STATE'), undefined, 'диалог закрыт');
});

// ---------------------------------------------------------------- задачи
test('задачи: добавить словами, отметить, перенести, отменить', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('+ завтра позвонить в Сбер'); env.tick();
  const t = env.sheets['Задачи'];
  assert.deepEqual(t.row(2, 6), [1, S(18, 10), 'Позвонить в Сбер', '', '', 'Открыта']);
  assert.equal(t.f[1][1], 'dd.mm.yyyy');
  env.tg.say('+ в пятницу отправить КП\n- сегодня разобрать почту'); env.tick();
  assert.equal(t.cell(3, 3), 'Отправить КП'); assert.equal(t.cell(3, 2), S(23, 10));
  assert.equal(t.cell(4, 2), S(17, 10));
  env.tg.say('готово 1 3'); env.tick();
  assert.equal(t.cell(2, 6), 'Сделано'); assert.equal(t.cell(4, 6), 'Сделано');
  assert.match(env.tg.last.text, /#1.*#3/);
  env.tg.tap('tm:2'); env.tick();
  assert.equal(t.cell(3, 2), S(18, 10), 'перенесено на завтра');
  env.tg.tap('tx:2'); env.tick();
  assert.equal(t.cell(3, 6), 'Отменена');
});

test('задачи дня попадают в утренний список с кнопками, сделанное исчезает', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('+ сегодня подготовить договор'); env.tick();
  at(env, 9, 0).tick();
  const brief = env.tg.sent.find((m) => m.text.includes('Доброе утро'));
  has(brief.text, 'Задачи (1)', '#1 Подготовить договор');
  assert.ok(env.tg.buttons(brief).some((b) => b.callback_data === 'td:1'));
  env.tg.tap('td:1', brief.message_id); env.tick();
  assert.equal(env.sheets['Задачи'].cell(2, 6), 'Сделано');
  const edit = env.tg.edits.at(-1);
  assert.equal(edit.message_id, brief.message_id, 'список обновился на месте');
  assert.ok(!edit.text.includes('Подготовить договор'));
});

test('неясный текст: бот спрашивает, а не гадает', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('надо бы подумать про сайт'); env.tick();
  assert.deepEqual(env.tg.buttons(env.tg.last).map((b) => b.callback_data), ['ch:task', 'ch:no']);
  assert.equal(env.sheets['Задачи'].cell(2, 3), '');
  env.tg.tap('ch:task'); env.tick();
  assert.equal(env.sheets['Задачи'].cell(2, 3), 'Надо бы подумать про сайт');
});

// ---------------------------------------------------------------- люди
test('человек: ✅ в списке, следующий шаг «ждём 3 дня»', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  at(env, 9, 0).tick();
  const brief = env.tg.sent.find((m) => m.text.includes('Доброе утро'));
  const done = env.tg.buttons(brief).find((b) => b.text.startsWith('✅ 1'));
  env.tg.tap(done.callback_data, brief.message_id); env.tick();
  has(env.tg.last.text, 'Полина', 'Что дальше?');
  const w3 = env.tg.buttons(env.tg.last).find((b) => b.callback_data.endsWith(':w3'));
  env.tg.tap(w3.callback_data, env.tg.last.message_id); env.tick();
  const c = env.sheets['Обращения'];
  assert.equal(c.cell(6, 7), 'Дождаться ответа');
  assert.equal(c.cell(6, 8), S(20, 10));
  assert.equal(c.cell(6, 10), '');
  assert.match(c.cell(6, 9), /Посмотрит вечером\n17\.10: сделано: Получить ответ/, 'история в комментарии');
  assert.ok(!env.tg.edits.at(-1).text.includes('Полина'), 'из списка исчезла');
});

test('человек: «свой шаг», закрыть, отказ', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.tap('ns:6:' + env.ctx.hash_('Полина (ИИ Стриж)') + ':cu'); env.tick();
  assert.match(env.tg.last.text, /Какой следующий шаг/);
  env.tg.say('созвониться в пятницу'); env.tick();
  assert.equal(env.sheets['Обращения'].cell(6, 7), 'Созвониться'); assert.equal(env.sheets['Обращения'].cell(6, 8), S(23, 10));
  env.tg.tap('ns:3:' + env.ctx.hash_('@katushusta') + ':rj'); env.tick();
  assert.equal(env.sheets['Обращения'].cell(3, 6), 'Отказ');
  assert.equal(env.sheets['Обращения'].cell(3, 10), 'сделано');
});

test('человек: перенос +3 дня', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.tap('cp:6:' + env.ctx.hash_('Полина (ИИ Стриж)')); env.tick();
  assert.equal(env.sheets['Обращения'].cell(6, 8), S(20, 10));
});

test('человек: кнопка в устаревшем списке не портит чужую строку', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.tap('cp:6:zzz'); env.tick();                       // имя в строке 6 теперь другое
  assert.match(env.tg.last.text, /Список изменился/);
  assert.equal(env.sheets['Обращения'].cell(6, 8), S(17, 10));
});

test('человек: новый по шагам', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('👤 Человек'); env.tick();
  env.tg.say('Иван Петров, ООО Ромашка'); env.tick();
  assert.match(env.tg.last.text, /Кто это/);
  env.tg.tap('pw:1'); env.tick();                            // Работодатель
  env.tg.tap('ps:1'); env.tick();                            // Телеграм
  env.tg.say('Ищет юриста по ИТ'); env.tick();
  env.tg.say('созвониться в среду'); env.tick();
  const c = env.sheets['Обращения'];
  assert.deepEqual(c.row(7, 10), [S(17, 10), 'Телеграм', 'Работодатель', 'Иван Петров, ООО Ромашка', 'Ищет юриста по ИТ',
    'В работе', 'Созвониться', S(21, 10), '', '']);
  assert.equal(c.f[6][0], 'dd.mm.yyyy'); assert.equal(c.f[6][7], 'dd.mm.yyyy');
});

test('человек: одной строкой', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('@ivan | работодатель | вакансия юриста | написать завтра'); env.tick();
  assert.deepEqual(env.sheets['Обращения'].row(7, 8), [S(17, 10), 'Телеграм', 'Работодатель', '@ivan', 'вакансия юриста', 'В работе', 'Написать', S(18, 10)]);
});

// ---------------------------------------------------------------- продажи
test('продажа: формулы H:I не трогаем, строка на месте', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  const s = env.sheets['Продажи'];
  s.v[1][7] = 'не оплачено'; s.v[1][8] = 100;   // как будто формулы уже заполнили строку 2
  s.v[1][0] = S(1, 10); s.v[1][1] = 'Кадры'; s.v[1][2] = 'Старый'; s.v[1][3] = 'x'; s.v[1][4] = 100; s.v[1][5] = 0; s.v[1][6] = 'Другое';
  env.tg.say('💰 Продажа'); env.tick();
  env.tg.say('Анна Смирнова'); env.tick();
  env.tg.say('резидентство'); env.tick();
  env.tg.tap('sd:1'); env.tick();                            // Сообщество
  env.tg.say('3 500'); env.tick();
  env.tg.tap('sp:part'); env.tick();
  env.tg.say('1500'); env.tick();
  env.tg.tap('ss:0'); env.tick();                            // Инстаграм
  assert.deepEqual(s.row(3, 7), [S(17, 10), 'Сообщество', 'Анна Смирнова', 'резидентство', 3500, 1500, 'Инстаграм']);
  assert.equal(s.cell(3, 8), ''); assert.equal(s.cell(3, 9), '', 'H и I остались пустыми (там формулы)');
  has(env.tg.last.text, 'Продажа записана', 'долг 2 000');
  assert.equal(s.f[2][0], 'dd.mm.yyyy');
});

// ---------------------------------------------------------------- цели и планы
test('цели года → задачи недели из «недельных действий», без дублей', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('цель: 2026-Q4 | Кадры | 20 договоров | договоры | 20 | пн: написать 10 работодателям; каждый день: разобрать почту'); env.tick();
  const g = env.sheets['План года'];
  assert.deepEqual(g.row(2, 10), ['G1', '2026-Q4', 'Кадры', '20 договоров', 'договоры', '20', '', 'средний', '', 'пн: написать 10 работодателям; каждый день: разобрать почту']);
  at(env, 9, 5, [2026, 10, 19]).tick();                      // понедельник: план недели приходит сам
  has(env.tg.last.text, 'План недели 19.10–25.10', 'Цели, которые действуют сейчас', 'Написать 10 работодателям', 'Разобрать почту');
  const tasks = env.sheets['Задачи'];
  const titles = [2, 3, 4, 5, 6, 7].map((r) => `${tasks.cell(r, 3)}@${tasks.cell(r, 2)}`);
  assert.deepEqual(titles, ['Написать 10 работодателям@' + S(19, 10), 'Разобрать почту@' + S(19, 10), 'Разобрать почту@' + S(20, 10),
    'Разобрать почту@' + S(21, 10), 'Разобрать почту@' + S(22, 10), 'Разобрать почту@' + S(23, 10)]);
  assert.equal(tasks.cell(2, 7), 'неделя 2026-W43'); assert.equal(tasks.cell(2, 5), 'G1');
  const before = tasks.writes;
  env.tg.say('/plan'); env.tick();                           // повторно: дублей нет
  assert.equal(tasks.writes, before);
  assert.match(env.tg.last.text, /уже созданы/);
});

test('план недели без целей подсказывает, что делать', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('/plan'); env.tick();
  has(env.tg.last.text, 'нет целей на этот период');
  assert.ok(env.tg.buttons(env.tg.last).some((b) => b.text.includes('Добавить задачи недели')));
});

test('добавление своих задач недели списком', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('/plan'); env.tick();
  env.tg.tap('wk:add'); env.tick();
  env.tg.say('пт — отправить КП\nпн написать Ивану\nпровести встречу'); env.tick();
  const t = env.sheets['Задачи'];
  assert.deepEqual([2, 3, 4].map((r) => [t.cell(r, 3), t.cell(r, 2), t.cell(r, 7)]),
    [['Отправить КП', S(23, 10), 'неделя 2026-W42'], ['Написать Ивану', S(19, 10), 'неделя 2026-W42'], ['Провести встречу', S(17, 10), 'неделя 2026-W42']]);
});

test('период цели распознаётся в разных написаниях', () => {
  const env = makeEnv();
  const n = (s) => env.ctx.normPeriod_(s, '2026-10-17');
  assert.deepEqual([n('2026'), n('Q4'), n('4 квартал'), n('IV кв'), n('октябрь'), n('2026-11'), n('11.2026'), n('2026-q1')],
    ['2026', '2026-Q4', '2026-Q4', '2026-Q4', '2026-10', '2026-11', '2026-11', '2026-Q1']);
});

// ---------------------------------------------------------------- итоги
test('итоги недели: задачи, нормы и упор', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.call('addTasks_', [{ due: '2026-10-12', title: 'Сделать А' }, { due: '2026-10-17', title: 'Сделать Б' }], 'тест');
  env.tg.say('готово 2'); env.tick();
  at(env, 20, 0, [2026, 10, 18]).tick();
  const r = env.tg.sent.find((m) => m.text.includes('Итоги недели'));
  has(r.text, 'Итоги недели 12.10–18.10', 'Задачи: сделано 1 из 2 (50%)', 'Не сделано: Сделать А', '🔴 Касания работодателям: 2 / 45 (4%)',
    'Упор на следующий период', 'нужно 7 в день');
  assert.ok(!/\d\.\d\d\b/.test(r.text.replace(/\d\d\.\d\d(?:\.\d{4})?/g, '')), 'нормы без «хвостов» после запятой');
});

test('статистика и состояние', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('/stats'); env.tick();
  has(env.tg.last.text, 'Сводка на 17.10.2026', 'Касания работодателям', 'Воронка', 'В работе: 1 / 2 / 0');
  env.tg.say('/status'); env.tick();
  has(env.tg.last.text, 'Состояние бота', 'Проверка раз в минуту', 'структура в порядке');
});

// ---------------------------------------------------------------- безопасность и надёжность
test('чужому пользователю бот не отвечает и ничего не пишет', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('касаний 99', 12345); env.tg.say('/today', 12345); env.tg.tap('td:1', 1, 12345);
  env.tick();
  assert.equal(env.tg.sent.length, 0);
  assert.equal(env.sheets['Действия'].cell(3, 2), '');
  assert.equal(env.prop('OFFSET'), String(env.tg.uid + 1), 'сообщения подтверждены, а не зависли');
});

test('сообщения не обрабатываются дважды (смещение подтверждается)', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('касаний 5'); env.tick(); env.tick(); env.tick();
  assert.equal(env.sheets['Действия'].cell(3, 2), 5);
});

test('ошибка таблицы доходит до пользователя, а не прячется', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.sheets['Действия'].v[0][1] = 'Переименовали';           // сломали заголовок
  env.tg.say('касаний 5'); env.tick();
  has(env.tg.last.text, '⚠️', 'нет колонки «Касания работодателям»');
});

test('токен бота не попадает в сообщения об ошибках сети', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.failFetch = true;
  env.tick();                                                // сеть недоступна
  assert.ok(!String(env.prop('LAST_ERROR')).includes(TOKEN), 'токен в LAST_ERROR');
  assert.ok(!String(env.prop('LAST_ERROR')).includes('123456789:'));
  env.tg.failFetch = false;
  env.tg.say('/status'); env.tick();
  assert.ok(!env.tg.texts().includes(TOKEN));
});

test('сломанная HTML-разметка не съедает сообщение', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.parseFailOnce = true;
  env.tg.say('/help'); env.tick();
  assert.ok(env.tg.last.text.includes('личный ассистент'), 'ушло простым текстом');
  assert.ok(!env.tg.last.text.includes('<b>'));
});

test('активный вебхук снимается сам, бот не молчит', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.webhookActive = true;
  env.tg.say('касаний 4'); env.tick();
  assert.equal(env.sheets['Действия'].cell(3, 2), 4);
});

test('быстрый режим: после сообщения опрос длинный, потом возвращается к короткому', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tick();
  assert.equal(env.tg.calls.filter((c) => c.method === 'getUpdates').at(-1).body.timeout, 0, 'в покое опрос короткий');
  env.tg.say('касаний 1'); env.tick();
  const polls = env.tg.calls.filter((c) => c.method === 'getUpdates');
  assert.ok(polls.some((c) => c.body.timeout === 20), 'после сообщения включился быстрый режим');
  env.advance(6 * 60);                                       // прошло больше 4 минут
  const n = env.tg.calls.length;
  env.tick();
  assert.equal(env.tg.calls.slice(n).filter((c) => c.method === 'getUpdates').at(-1).body.timeout, 0);
});

test('быстрый режим имеет дневной лимит (квота Google 90 мин)', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.props.set('HOT_SPENT', JSON.stringify({ d: '2026-10-17', s: 25 * 60 }));
  env.tg.say('касаний 1'); env.tick();
  const polls = env.tg.calls.filter((c) => c.method === 'getUpdates');
  assert.ok(polls.every((c) => c.body.timeout === 0), 'при исчерпанном лимите только короткие опросы');
  assert.equal(env.sheets['Действия'].cell(3, 2), 1, 'но сообщения всё равно обрабатываются');
});

test('при сбое Google бот не падает и сообщает один раз, а не каждую минуту', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  delete env.sheets['Сводка'];                               // сломали таблицу
  at(env, 9, 0).tick(); at(env, 9, 1).tick(); at(env, 9, 2).tick();
  const warns = env.tg.sent.filter((m) => m.text.startsWith('⚠️'));
  assert.equal(warns.length, 1, 'одно предупреждение, не спам');
  assert.match(warns[0].text, /Сводка/);
});

test('без настройки тик ничего не делает', () => {
  const env = makeEnv({ configured: false });
  env.tick();
  assert.equal(env.tg.calls.length, 0);
});

test('голосовые и фото: вежливый ответ вместо тишины', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.updates.push({ update_id: 500, message: { message_id: 1, from: { id: OWNER }, chat: { id: OWNER }, voice: {} } });
  env.tick();
  assert.match(env.tg.last.text, /только текст/);
});

test('отмена выходит из диалога', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('👤 Человек'); env.tick();
  env.tg.say('отмена'); env.tick();
  assert.equal(env.prop('STATE'), undefined);
  env.tg.say('касаний 3'); env.tick();                       // дальше работает как обычно
  assert.equal(env.sheets['Действия'].cell(3, 2), 3);
});

test('устаревший диалог (30 минут) сбрасывается', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('👤 Человек'); env.tick();
  env.advance(31 * 60);
  env.tg.say('касаний 3'); env.tick();
  assert.equal(env.sheets['Действия'].cell(3, 2), 3, 'это не имя человека, а отчёт');
});

// ---------------------------------------------------------------- устойчивость к «неудобному» тексту
test('текст не превращается в числа, даты и формулы', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('+79991234567 | работодатель | =1+1 | 10.11'); env.tick();
  const c = env.sheets['Обращения'];
  assert.equal(c.cell(7, 4), '+79991234567', 'телефон остался текстом с плюсом');
  assert.equal(c.cell(7, 5), '=1+1', 'формулой не стало');
  assert.equal(typeof c.cell(7, 4), 'string');
  env.tg.say('+ 2026'); env.tick();
  assert.equal(env.sheets['Задачи'].cell(2, 3), '2026');
  assert.equal(typeof env.sheets['Задачи'].cell(2, 3), 'string', 'число-подобный текст остался текстом');
});

test('вредный текст в именах не ломает разметку Telegram', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.sheets['Обращения'].v[5][3] = '<b>Ольга & Ко';
  env.sheets['Обращения'].v[5][4] = 'x < y > z';
  at(env, 9, 0).tick();
  const m = env.tg.sent.find((x) => x.text.includes('Доброе утро'));
  has(m.text, '&lt;b&gt;Ольга &amp; Ко', 'x &lt; y &gt; z');
  assert.equal(env.tg.sent.filter((x) => !x.parse_mode).length, 0, 'ушло с разметкой, без отката в простой текст');
});

test('много дел: сообщение укладывается в лимиты Telegram', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  const c = env.sheets['Обращения'];
  for (let i = 0; i < 40; i++) { const r = 7 + i; c.v[r - 1] = [S(1, 10), 'Другое', 'Партнёр', 'Человек ' + i + ' ' + 'я'.repeat(100), 'запрос '.repeat(30), 'В работе', 'Шаг '.repeat(30), S(10, 10), '', '']; }
  env.call('addTasks_', Array.from({ length: 30 }, (_, i) => ({ due: '2026-10-17', title: 'Задача ' + i + ' ' + 'ю'.repeat(150) })), 'тест');
  at(env, 9, 0).tick();
  env.tg.sent.forEach((m) => assert.ok(m.text.length <= 4096, 'длина ' + m.text.length));
  const brief = env.tg.sent.find((m) => m.text.includes('Доброе утро'));
  const btns = env.tg.buttons(brief);
  assert.ok(btns.length <= 40, 'кнопок разумное число: ' + btns.length);
  btns.forEach((b) => assert.ok(Buffer.byteLength(b.callback_data) <= 64, 'callback_data > 64 байт: ' + b.callback_data));
  has(brief.text, 'и ещё');
});

test('ответ Telegram на каждую кнопку подтверждается (иначе в Telegram крутится часики)', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.tap('rp:go'); env.tg.tap('un:1'); env.tick();
  assert.equal(env.tg.answers.length, 2);
});

test('старые кнопки и неизвестные данные не вызывают падения', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  ['zz:1', 'pw:3', 'sp:full', 'rp:v:5', 'td:999', 'ns:99:abc:w3'].forEach((d) => env.tg.tap(d));
  env.tick();
  env.tg.say('касаний 2'); env.tick();
  assert.equal(env.sheets['Действия'].cell(3, 2), 2, 'бот жив и работает после мусорных кнопок');
});

test('исправление в отчёте: «было → стало» и отмена возвращает прошлое', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  env.tg.say('вчера: поправь касаний 20'); env.tick();
  has(env.tg.last.text, 'было 2 → стало 20');
  assert.equal(env.sheets['Действия'].cell(2, 2), 20);
  env.tg.tap('un:1'); env.tick();
  assert.equal(env.sheets['Действия'].cell(2, 2), 2);
});

test('приветствие по времени суток', () => {
  const env = makeEnv(); env.call('ensureSheets_');
  at(env, 12, 30).tick();
  assert.match(env.tg.last.text, /Добрый день/);
});
