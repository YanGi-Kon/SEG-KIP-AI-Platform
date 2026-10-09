import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for (const file of ['hisobot-journal.html','kuduk-journal.html']) {
  test(file + ' waits for auth before loading workspace state', async () => {
    const html = fs.readFileSync(new URL('../public/modules/' + file, import.meta.url), 'utf8');
    const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
    const handlers = {};
    const requests = [];
    const sockets = [];
    let token = '';
    let authBoot = true;
    const storage = new Map([['seg_kip_selected_workspace_id','workspace-a']]);
    const localStorage = {getItem:key=>storage.get(key)||'',setItem:(key,value)=>storage.set(key,value)};
    const sessionStorage = {getItem:()=>token};
    const parent = {localStorage,sessionStorage,postMessage(){},document:{documentElement:{classList:{contains:()=>authBoot}}},sanegLoginGate:{state:{user:null}}};
    const elements = new Map();
    const context = {
      Headers, localStorage, sessionStorage, parent, setTimeout,
      document:{getElementById:id=>{if(!elements.has(id))elements.set(id,{style:{},classList:{add(){},remove(){}}});return elements.get(id);}},
      window:{addEventListener:(name,callback)=>handlers[name]=callback},
      fetch:async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>({connected:false,routes:[],sheets:{},statuses:{}})};},
      io:options=>{sockets.push(options);return{disconnect(){},on(){}}}
    };
    vm.runInNewContext(source,context);
    handlers.load();
    await context.window.KudukJournalWorkspace.fetchState();
    handlers.message({data:{type:'SEG_KIP_WORKSPACE_CHANGE',workspaceId:'workspace-a'}});
    assert.equal(requests.length,0);
    assert.equal(sockets.length,0);
    token = 'stale-token';
    handlers.load();
    assert.equal(requests.length,0);
    authBoot = false;
    handlers.load();
    assert.equal(requests.length,0);
    token = 'valid-token';
    parent.sanegLoginGate.state.user = {id:'user-a'};
    handlers.message({data:{type:'SEG_KIP_WORKSPACE_CHANGE',workspaceId:'workspace-a'}});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(requests.length,1);
    assert.equal(sockets.length,1);
    assert.equal(requests[0].options.headers.get('Authorization'),'Bearer valid-token');
    assert.equal(requests[0].options.headers.get('x-workspace-id'),'workspace-a');
  });
}
