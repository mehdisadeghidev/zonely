const { createPopup } = require('../../src/popup/main.ts');
const { createOptions } = require('../../src/options/main.ts');

async function uiContext(file='popup.js', options={}) {
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{
      value:'',textContent:'',className:'',style:{},hidden:false,disabled:false,children:[],listeners:{},
      addEventListener(name,fn){this.listeners[name]=fn;},
      append(...children){this.children.push(...children);},
      appendChild(child){this.children.push(child);},
      replaceChildren(...children){this.children=[...children];},
      setAttribute(){}
    });
    return elements.get(id);
  };
  const status={supported:true,tabId:1,hostname:'example.com',mode:'disable',timezone:'UTC',source:'tabOverride',
    siteRule:{mode:'fixed',timezone:'Asia/Tokyo'},tabOverride:{mode:'disable',timezone:''},...options.status};
  const calls=[],reloads=[],openedOptions=[];
  let fail=false,transportError=!!options.transportError;
  const chrome={
    runtime:{
      sendMessage(msg,cb){
        calls.push(msg);
        queueMicrotask(async()=>{
          if(options.beforeMessage) await options.beforeMessage(msg);
          if(transportError){chrome.runtime.lastError={message:'worker unavailable'};cb();delete chrome.runtime.lastError;return;}
          cb(msg.action==='tzc:get-settings'?{settings:{defaultMode:'auto',defaultTimezone:'',siteRules:{}},runtime:{timezone:'Europe/Berlin'}}:
            msg.action==='tzc:get-tab-status'?status:fail?{ok:false,error:'invalid-timezone'}:{ok:true,success:true});
        });
      }, async openOptionsPage(){openedOptions.push(true);}
    },
    tabs:{async query(){return [{id:1,url:'https://example.com'}];},async reload(id){reloads.push(id);}}
  };
  const document={getElementById:element,createElement:()=>element(Symbol())};
  const create=file.startsWith('options')?createOptions:createPopup;
  create({document,chrome}).start();
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();
  return {element,status,calls,reloads,openedOptions,flush,fail:()=>{fail=true;},transportError:()=>{transportError=true;}};
}
module.exports={uiContext};
