const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { build } = require('../scripts/build');

test('release files load together in one Apps Script-style global scope', () => {
  const { version, files } = build();
  assert.match(files['Code.gs'], new RegExp(`google-cal-lead-time v${version.replace(/\./g, '\\.')}`));
  assert.doesNotMatch(files['Code.gs'], /const SETTINGS/);
  assert.match(files['Config.gs'], /^\/\*\*[\s\S]*?\*\/\n\nconst SETTINGS = \{/);
  assert.doesNotMatch(files['Config.gs'], /src\/Config\.js/);

  // Apps Script runs files in project order; try both orders.
  for (const order of [['Code.gs', 'Config.gs'], ['Config.gs', 'Code.gs']]) {
    const ctx = vm.createContext({ console, Intl });
    for (const name of order) vm.runInContext(files[name], ctx, { filename: name });
    const config = vm.runInContext('readConfig_()', ctx);
    assert.equal(config.feeds.length, 1);
    for (const fn of ['syncLeadTimes', 'previewLeadTimes', 'installTrigger', 'removeTrigger', 'deleteAllLeadTimeEvents']) {
      assert.equal(vm.runInContext(`typeof ${fn}`, ctx), 'function', fn);
    }
  }
});
