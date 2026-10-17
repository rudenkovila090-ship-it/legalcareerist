const { makeEnv } = require('./harness');
const env = makeEnv();
env.call('ensureSheets_');
env.at(2026, 10, 17, 9, 0).tick();
console.log(env.tg.texts());
console.log('buttons:', env.tg.buttons(env.tg.last).map(b => b.text + ' -> ' + b.callback_data).join(' | '));
