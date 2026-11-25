const test=require('node:test');
const assert=require('node:assert/strict');
const {uiContext}=require('./helpers/ui-context.cjs');

test('timezone fields are selects filled with IANA zones',async()=>{
  const ui=await uiContext('options.js');
  assert.ok(ui.element('rule-timezone').children.length>300,'rule timezone select populated');
  assert.equal(ui.element('rule-timezone').value,'');
  ui.element('default-mode').value='fixed';
  ui.element('default-mode').listeners.change();
  await ui.flush();
  assert.ok(ui.element('default-timezone').children.length>300,'default timezone select populated');
  ui.element('default-timezone').value='Europe/Berlin';
  ui.element('default-timezone').listeners.change();
  await ui.flush();
  assert.equal(ui.calls.at(-1).settings.defaultTimezone,'Europe/Berlin');
});
