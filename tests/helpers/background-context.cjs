const { createBackground } = require('../../src/background/app.ts');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function backgroundContext(options = {}) {
  const data = options.data || {
    sync: {settings:{defaultMode:'auto', defaultTimezone:'',  siteRules:{}}},
    local: {timezone:'Europe/Berlin'}, session: {}
  };
  const listeners = {};
  const event = name => ({addListener(fn) { listeners[name] = fn; }});
  const storage = Object.fromEntries(['sync', 'local', 'session'].map(area => [area, {
    async get(keys) {
      const snapshot = structuredClone(data[area]);
      if (options.beforeGet) await options.beforeGet(area, keys);
      if (typeof keys === 'string') return {[keys]:snapshot[keys]};
      return Object.fromEntries(keys.map(key=>[key,snapshot[key]]));
    },
    async set(value) {
      const snapshot = structuredClone(value);
      if (options.beforeSet) await options.beforeSet(area, snapshot);
      Object.assign(data[area], snapshot);
    }
  }]));
  const chrome = {
    storage,
    runtime:{onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
    alarms:{onAlarm:event('alarm'),create(){}},
    webNavigation:{onBeforeNavigate:event('navigate')},
    tabs:{
      onRemoved:event('removed'),
      async query(){return options.activeTab === null ? [] : [options.activeTab || {id:1,url:'https://example.com/'}];},
      async get(id){return options.activeTab?.id === id ? options.activeTab : {id,url:'https://example.com/'};}
    }
  };
  const background = createBackground(chrome, {
    fetch: options.fetch || (async()=>{throw new Error('offline');}),
    apiTimeoutMs: options.apiTimeoutMs
  });
  const scope = { TZC_SHARED: background.shared, ...background };
  const names = Object.keys(scope);
  return {
    data, listeners, background,
    // Evaluates internals by name so tests can reach worker functions directly.
    run: expression => new Function(...names, `return (${expression})`)(...names.map(name => scope[name])),
    message: (msg,sender={})=>new Promise((resolve,reject)=>{
      try {
        const pending=listeners.message(msg,sender,resolve);
        if(pending !== true) resolve(undefined);
      } catch(error) { reject(error); }
    })
  };
}

module.exports = { backgroundContext, deferred };
