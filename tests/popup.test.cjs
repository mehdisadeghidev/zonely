const test=require('node:test');
const assert=require('node:assert/strict');
const {uiContext}=require('./helpers/ui-context.cjs');

test('popup shows the persisted IP timezone without requesting a lookup',async()=>{
  const ui=await uiContext();
  assert.equal(ui.element('timezone').textContent,'Europe/Berlin');
  assert.equal(ui.element('effective-timezone').textContent,'UTC');
  assert.equal(ui.element('rule-source').textContent,'Tab override');
  assert.equal(ui.calls.some(msg=>msg.action==='refresh'),false);
});

test('popup has no rule editor',async()=>{
  const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/popup/index.html'),'utf8');
  assert.equal(/rule-(scope|mode|timezone)|apply-rule/.test(html),false);
});

test('unsupported pages show no fake timezone and keep global actions',async()=>{
  const ui=await uiContext('popup.js',{status:{supported:false,tabId:1,hostname:'',timezone:'',source:'unsupported',siteRule:null,tabOverride:null}});
  assert.equal(ui.element('effective-timezone').textContent,'Not available');
  assert.equal(ui.element('current-mode').textContent,'Not available');
  assert.equal(ui.element('page-message').hidden,false);
  assert.match(ui.element('page-message').textContent,/not available on this page/i);
  await ui.element('refresh-btn').listeners.click();
  assert.equal(ui.calls.some(msg=>msg.action==='refresh'),true);
  await ui.element('open-options-btn').listeners.click();
  assert.equal(ui.openedOptions.length,1);
});

test('transport errors restore refresh button and are visible',async()=>{
  const ui=await uiContext();ui.transportError();
  await ui.element('refresh-btn').listeners.click();
  assert.equal(ui.element('refresh-btn').disabled,false);
  assert.ok(ui.element('status-message').textContent.length>0);
});

test('rule pattern input accepts comma separated patterns',async()=>{
  const ui=await uiContext('options.js');
  ui.element('rule-pattern').value=' example.com , *.example.com , example.com ';
  ui.element('rule-mode').value='disable';
  await ui.element('add-rule-btn').listeners.click();
  const write=ui.calls.find(msg=>msg.action==='tzc:update-settings');
  assert.deepEqual(Object.keys(write.settings.siteRules),['example.com','*.example.com']);
  assert.equal(ui.element('rule-pattern').value,'');
});

test('failed options save preserves user input and shows the error',async()=>{
  const ui=await uiContext('options.js');ui.fail();
  ui.element('rule-pattern').value='example.com';
  ui.element('rule-mode').value='fixed';ui.element('rule-timezone').value='Not/AZone';
  await ui.element('add-rule-btn').listeners.click();
  assert.equal(ui.element('rule-timezone').value,'Not/AZone');
  assert.equal(ui.element('rule-pattern').value,'example.com');
  assert.ok(ui.element('status-message').textContent.length>0);
});
