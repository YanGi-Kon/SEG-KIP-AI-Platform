import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../public/js/app-loader.js',import.meta.url),'utf8');
const loginGate=fs.readFileSync(new URL('../public/js/saneg-login-gate.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');

function createLoader({navigationType='navigate',pendingReload=false}={}){
  const classes=new Set(['is-hidden']);
  const element={style:{display:'none'},classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},setAttribute(){}};
  const listeners=new Map();
  const timers=new Map();
  const storage=new Map(pendingReload?[['seg_quiet_reload_once','1']]:[]);
  let nextTimerId=1;
  const state={loginVisible:false};
  const window={
    performance:{getEntriesByType:()=>[{type:navigationType}]},
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    addEventListener:(name,callback)=>listeners.set(name,callback),
    setTimeout:(callback,delay)=>{const id=nextTimerId++;timers.set(id,{callback,delay});return id;},
    clearTimeout:id=>timers.delete(id),
  };
  const document={getElementById:id=>id==='segAppLoader'?element:id==='segAppLoaderStatus'?{textContent:''}:id==='sanegLoginGate'&&state.loginVisible?{}:null};
  vm.runInNewContext(loader,{window,document});
  function runAllTimers(){
    let remaining=100;
    while(timers.size&&remaining--){
      const [id,timer]=[...timers.entries()].sort((a,b)=>a[1].delay-b[1].delay)[0];
      if(!timers.delete(id))continue;
      timer.callback();
    }
    assert.ok(remaining>0,'fake timer queue did not settle');
  }
  return {window,listeners,timers,state,element,classes,storage,runAllTimers};
}

test('startup loader shows the supplied GIF above its status',()=>{
  assert.match(index,/id="segAppLoader"/);
  assert.match(index,/Sanegplatform yuklanmoqda\.\.\./);
  assert.match(index,/<img class="seg-loader-animation"[^>]+src="assets\/images\/saneg-loading\.gif"[^>]*>\s*<div id="segAppLoaderStatus"/);
  const animation=fs.readFileSync(new URL('../public/assets/images/saneg-loading.gif',import.meta.url));
  assert.match(animation.subarray(0,6).toString(),/^GIF8[79]a$/);
  assert.doesNotMatch(index,/seg-loader-dots/);
  assert.doesNotMatch(loader,/setInterval/);
  assert.doesNotMatch(loader,/canvas/);
  assert.doesNotMatch(loader,/pump/i);
});

test('loader disappears when auth boot destination becomes ready',()=>{
  assert.match(loader,/seg:auth-ready/);
  assert.match(loader,/seg:login-ready/);
  assert.match(loader,/classList\.add\('is-hidden'\)/);
  assert.match(loginGate,/dispatchEvent\(new CustomEvent\('seg:auth-ready'\)\)/);
});

test('auth boot guard keeps loader visible during startup',()=>{
  assert.match(server,/#segAppLoader/);
  assert.match(server,/#segAppLoader \*/);
});

test('loader force-hides after 10 seconds if a busy status never clears',()=>{
  const env=createLoader();
  env.window.segAppLoader.setBusy(true);
  env.listeners.get('seg:auth-ready')();
  assert.equal(env.classes.has('is-hidden'),false);
  env.runAllTimers();
  assert.equal(env.classes.has('is-hidden'),true);
  assert.equal(env.element.style.display,'none');
  env.window.segAppLoader.setBusy(true);
  assert.equal(env.classes.has('is-hidden'),true,'stale busy text must not reopen the loader');
  env.window.segAppLoader.setBusy(false);
  env.window.segAppLoader.setBusy(true);
  assert.equal(env.classes.has('is-hidden'),false,'a new busy state can show the loader after a clear state');
});

test('manual login clears background work and restores loading after sign-in',()=>{
  const env=createLoader();
  env.window.segAppLoader.setBusy(true);
  env.state.loginVisible=true;
  env.listeners.get('seg:login-ready')();
  env.runAllTimers();
  assert.equal(env.element.style.display,'none');
  env.window.segAppLoader.setBusy(true);
  assert.equal(env.element.style.display,'none');
  env.state.loginVisible=false;
  env.window.segAppLoader.setBusy(true);
  assert.equal(env.element.style.display,'grid');
  env.window.segAppLoader.setBusy(false);
  assert.equal(env.classes.has('is-hidden'),true);
});

test('refresh has no kachalka until the user starts an operation',()=>{
  assert.match(index,/<div id="segAppLoader" class="is-hidden" style="display:none"/);
  const env=createLoader({navigationType:'navigate',pendingReload:true});
  env.window.segAppLoader.show('Startup');
  env.window.segAppLoader.setBusy(true);
  env.listeners.get('seg:auth-ready')();
  env.window.segAppLoader.setBusy(true);
  assert.equal(env.element.style.display,'none');
  assert.equal(env.classes.has('is-hidden'),true);
  env.listeners.get('pointerdown')();
  env.window.segAppLoader.setBusy(true);
  assert.equal(env.element.style.display,'grid');
  env.window.segAppLoader.setBusy(false);
  assert.equal(env.classes.has('is-hidden'),true);
  env.runAllTimers();
  assert.equal(env.element.style.display,'none');
  assert.equal(env.storage.has('seg_quiet_reload_once'),false,'the one-shot refresh marker is consumed');
});

test('page exit marks the next document as a quiet refresh',()=>{
  const env=createLoader();
  env.listeners.get('pagehide')({persisted:false});
  assert.equal(env.storage.get('seg_quiet_reload_once'),'1');
  const bfcacheEnv=createLoader();
  bfcacheEnv.listeners.get('pagehide')({persisted:true});
  assert.equal(bfcacheEnv.storage.has('seg_quiet_reload_once'),false,'back/forward cache navigation is left alone');
});
