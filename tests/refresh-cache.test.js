import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const bridge = fs.readFileSync(new URL('../public/js/hisobot-period-bridge.js', import.meta.url), 'utf8');
const kuduk = fs.readFileSync(new URL('../routes/kuduk.js', import.meta.url), 'utf8');
function harness(revision = { spreadsheetId:'sheet', version:3, updatedAt:'stamp' }, user='user-a') {
  const values = new Map([['seg_kip_selected_workspace_id','workspace-a'], ['seg_hisobot_period_v1:workspace-a',JSON.stringify({year:2026,month:5})]]);
  const token = 'header.' + Buffer.from(JSON.stringify({sub:user})).toString('base64url') + '.signature';
  const localStorage = {getItem:k=>values.get(k)||'',setItem:(k,v)=>values.set(k,v)};
  const sessionStorage = {getItem:()=>token};
  const calls=[];
  const context = vm.createContext({console,localStorage,sessionStorage,atob,AbortController,
    document:{readyState:'loading',getElementById:()=>null,addEventListener(){}},
    state:{connected:false},activeWorkspaceId:'',currentSheet:'',
    sessionReady:()=>true,sexId:()=> 'sex_4',renderAll(){},hydrateFromState(){},
    fetchState:async()=>{calls.push('state');context.state={connected:true,spreadsheetId:'sheet',version:4,updatedAt:'new',sheets:{},routes:[]};},
    fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('/revision')?revision:{selector:{year:2026,month:5},rows:[]}};},
    setTimeout,clearTimeout,
  });
  context.window=context;context.parent=context;
  vm.runInContext(bridge.replace('  function init() {','  window.cacheTest = { wrapJournalLifecycle, periodCacheKey };\n  function init() {'), context);
  context.__segKipHisobotPeriodCacheV1 = {'workspace-a|user-a|2026-05':{stateSignature:'sheet|3|stamp',snapshot:{connected:true,spreadsheetId:'sheet',version:3,updatedAt:'stamp',sheets:{Base:[]},routes:[]},data:{baseSheet:'Base',selector:{year:2026,month:5},rows:[{serial:'cached'}]}}};
  context.cacheTest.wrapJournalLifecycle();
  return {context,calls};
}
test('unchanged authenticated revision restores cached rows without full state or period requests',async()=>{
  const {context,calls}=harness();await context.fetchState('workspace-a');
  assert.equal(calls.length,1);assert.match(calls[0],/revision/);assert.equal(context.state.sheets.Base[0].serial,'cached');
});
test('changed revision reloads state and selected period',async()=>{
  const {context,calls}=harness({spreadsheetId:'sheet',version:4,updatedAt:'new'});await context.fetchState('workspace-a');
  assert.ok(calls.includes('state'));assert.ok(calls.includes('/api/hisobot-period/select'));
});
test('another user cannot restore the previous user cache',async()=>{
  const {context,calls}=harness(undefined,'user-b');await context.fetchState('workspace-a');
  assert.ok(calls.includes('state'));assert.notEqual(context.state.sheets.Base?.[0]?.serial,'cached');
});
test('in-progress revision never accepts stale cached rows',async()=>{
  const {context,calls}=harness({spreadsheetId:'sheet',version:3,updatedAt:'stamp',validating:true});await context.fetchState('workspace-a');assert.ok(calls.includes('state'));
});
test('unchanged sync preserves content revision and changed sync emits one update',async()=>{
  const routes=[{title:'Journal',sheet:'Base',a1:'C9',source:'menu'}];
  const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const tenant={sheetsApi:{},spreadsheetId:'sheet',menuSheet:'menu',connected:true,version:3,updatedAt:'stamp',hashes:{__routes:sha(routes.map(r=>({title:r.title,sheet:r.sheet,a1:r.a1,source:r.source}))),Base:'original'},routes,sheets:{Base:[]},statuses:{}};
  let change=false;const emitted=[];
  const context=vm.createContext({loadTenant:async()=>tenant,sha,extractRoutes:async()=>routes,loadMultipleSheets:async()=>{if(change)tenant.hashes.Base='changed';},log(){},publicState:t=>t,IO:{to:()=>({emit:(...args)=>emitted.push(args)})}});
  vm.runInContext(kuduk.slice(kuduk.indexOf('async function syncTenant('),kuduk.indexOf('async function applyConfig(')),context);
  await context.syncTenant('workspace-a');assert.equal(tenant.version,3);assert.equal(tenant.updatedAt,'stamp');assert.equal(emitted.length,0);assert.ok(tenant.lastCheckedAt);
  change=true;await context.syncTenant('workspace-a');assert.equal(tenant.version,4);assert.notEqual(tenant.updatedAt,'stamp');assert.equal(emitted.length,1);
});
