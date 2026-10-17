'use strict';
// Простой режим (по умолчанию в Code.gs): только напоминания и галочки.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, S } = require('./harness');

const mk = () => { const env = makeEnv({ simple: true }); env.call('ensureSheets_'); return env; };
const has = (text, ...n) => n.forEach((x) => assert.ok(text.includes(x), `нет «${x}» в:\n${text}`));
const hasNot = (text, ...n) => n.forEach((x) => assert.ok(!text.includes(x), `лишнее «${x}» в:\n${text}`));
const TASK = 'Свести бизнес-планы в единую систему целей: Карьерный юрист, Кадры, Сообщество, Мероприятия, Маркетинг, Legal Tech. Убрать расхождения между ними';

test('/start: меню из 4 кнопок, короткая справка и короткий список команд', () => {
  const env = mk();
  env.tg.say('/start'); env.tick();
  const kb = env.tg.last.reply_markup.keyboard.flat().map((b) => b.text);
  assert.deepEqual(kb, ['📋 Сегодня', '➕ Задача', '✍️ Отчёт', '👤 Человек']);
  has(env.tg.last.text, 'Я напоминаю, что сделать сегодня');
  hasNot(env.tg.last.text, 'план недели', 'Итоги', 'Цели');
  const cmds = env.tg.calls.find((c) => c.method === 'setMyCommands').body.commands.map((c) => c.command);
  assert.deepEqual(cmds, ['today', 'task', 'tasks', 'report', 'help']);
});

test('утро: люди и задачи, без планов и «темпа месяца», с кнопками ✅', () => {
  const env = mk();
  env.call('addTasks_', [{ due: '2026-10-17', title: 'Позвонить в Сбер' }], 'тест');
  env.at(2026, 10, 17, 9, 0).tick();
  const m = env.tg.sent.find((x) => x.text.includes('Доброе утро'));
  has(m.text, 'Полина (ИИ Стриж)', 'Получить ответ', '#1 Позвонить в Сбер');
  hasNot(m.text, 'Темп месяца', 'нужно 13', 'Цели');
  const data = env.tg.buttons(m).map((b) => b.callback_data);
  assert.ok(data.includes('td:1') && data.some((d) => d.startsWith('cd:')));
});

test('утро работает без листа «Сводка»: от него бот больше не зависит', () => {
  const env = mk();
  delete env.sheets['Сводка'];
  env.at(2026, 10, 17, 9, 0).tick();
  assert.ok(env.tg.sent.some((m) => m.text.includes('Доброе утро')));
  assert.equal(env.tg.sent.filter((m) => m.text.startsWith('⚠️')).length, 0);
});

test('приходят только утро и вечер: план недели, итоги и «новый месяц» отключены', () => {
  const env = mk();
  env.at(2026, 10, 19, 9, 5).tick();                    // понедельник: раньше приходил план недели
  assert.ok(!env.tg.sent.some((m) => m.text.includes('План недели')));
  env.at(2026, 10, 18, 20, 0).tick();                   // воскресенье: раньше итоги недели
  env.at(2026, 10, 31, 20, 30).tick();                  // конец месяца
  env.at(2026, 11, 1, 9, 10).tick();                    // 1-е число
  assert.ok(!env.tg.sent.some((m) => /Итоги|Новый месяц|План недели/.test(m.text)));
  env.at(2026, 10, 20, 9, 0).tick();
  assert.ok(env.tg.sent.some((m) => m.text.includes('Доброе утро')), 'а утро приходит');
});

test('поставленная в чате задача придёт в понедельник утром', () => {
  const env = mk();
  env.call('addTasks_', [{ due: '2026-10-19', title: TASK }], 'из чата');
  env.at(2026, 10, 17, 9, 0).tick();                    // суббота: ещё рано
  assert.ok(!env.tg.sent.some((m) => m.text.includes('Свести бизнес-планы') && m.text.includes('Доброе утро')));
  env.at(2026, 10, 19, 9, 0).tick();
  const m = env.tg.sent.find((x) => x.text.includes('Доброе утро') && x.text.includes('Свести бизнес-планы'));
  assert.ok(m, 'задача в утреннем списке');
  const done = env.tg.buttons(m).find((b) => b.callback_data === 'td:1');
  env.tg.tap(done.callback_data, m.message_id); env.tick();
  assert.equal(env.sheets['Задачи'].cell(2, 6), 'Сделано', 'отметили галочкой');
});

test('вечер: что не закрыто, или «всё закрыто»', () => {
  const env = mk();
  env.call('addTasks_', [{ due: '2026-10-17', title: 'Отправить КП' }], 'тест');
  env.at(2026, 10, 17, 21, 0).tick();
  const m = env.tg.sent.find((x) => x.text.includes('Вечер'));
  has(m.text, 'Не закрыто', '#1 Отправить КП', 'Полина');
  assert.ok(env.tg.buttons(m).some((b) => b.callback_data === 'td:1'));
  hasNot(m.text, 'В журнале за сегодня');
  const env2 = mk();
  env2.sheets['Обращения'].v[5][7] = S(30, 10);          // у единственной «сегодняшней» ушёл срок вперёд
  env2.at(2026, 10, 17, 21, 0).tick();
  has(env2.tg.sent.find((x) => x.text.includes('Вечер')).text, 'Всё закрыто');
});

test('/tasks показывает все открытые задачи, в том числе на далёкие даты', () => {
  const env = mk();
  env.call('addTasks_', [{ due: '2026-10-19', title: 'Задача А' }, { due: '2026-12-15', title: 'Задача Б' }], 'тест');
  env.tg.say('/tasks'); env.tick();
  has(env.tg.last.text, 'Открытые задачи (2)', 'Задача А', 'Задача Б');
});

test('убранные функции недоступны, старые кнопки обновляют меню', () => {
  const env = mk();
  env.tg.say('/plan'); env.tg.say('/week'); env.tg.say('/review'); env.tick();
  assert.equal(env.tg.sent.filter((m) => m.text.includes('Не знаю такой команды')).length, 3);
  env.tg.say('🗓 Неделя'); env.tick();                   // кнопка из старого меню
  has(env.tg.last.text, 'Я напоминаю, что сделать сегодня');
  assert.equal(env.tg.last.reply_markup.keyboard.flat().length, 4, 'меню обновилось');
  assert.equal(env.sheets['Задачи'].cell(2, 3), '', 'ничего не создалось');
});

test('то, что нужно, продолжает работать: задачи, отчёт, люди', () => {
  const env = mk();
  env.tg.say('+ завтра позвонить в Сбер'); env.tick();
  assert.equal(env.sheets['Задачи'].cell(2, 3), 'Позвонить в Сбер');
  env.tg.say('написал 15, ответили 3, созвон 1'); env.tick();
  assert.deepEqual(env.sheets['Действия'].row(3, 4), [S(17, 10), 15, 3, 1]);
  env.tg.say('Иван | работодатель | вакансия | написать завтра'); env.tick();
  assert.equal(env.sheets['Обращения'].cell(7, 4), 'Иван');
  env.tg.say('готово 1'); env.tick();
  assert.equal(env.sheets['Задачи'].cell(2, 6), 'Сделано');
});
