import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/js/workspace-api-client.js',import.meta.url),'utf8');
const jwt=exp=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.sig';
function storage(value){const values=new Map([['seg_kip_workspace_access_token',value]]);return{getItem:k=>values.get(k)||'',setItem:(k,v)=>values.set(k,v)};}
function client(parent,fetchImpl,localToken){const window={};vm.runInNewContext(source,{window,parent,fetch:fetchImpl,Headers,FormData,atob,Date,localStorage:{getItem:()=>''},sessionStorage:storage(localToken)});return window.WorkspaceApiClient;}
const reply=(status,data)=>({status,ok:status<400,text:async()=>JSON.stringify(data)});
test('two iframe requests refresh an expiring token once and both use the parent token',async()=>{
 const old=jwt(1),fresh=jwt(Math.floor(Date.now()/1000)+3600);const parent={sessionStorage:storage(old)};let refreshes=0;const calls=[];
 const fetchImpl=async(path,options)=>{if(path==='/api/auth/refresh'){refreshes++;await new Promise(r=>setTimeout(r,5));return reply(200,{accessToken:fresh});}calls.push(options.headers.get('Authorization'));return reply(200,{ok:true});};
 const a=client(parent,fetchImpl,old),b=client(parent,fetchImpl,old);await Promise.all([a.request('/one'),b.request('/two')]);assert.equal(refreshes,1);assert.deepEqual(calls,['Bearer '+fresh,'Bearer '+fresh]);assert.equal(b.token(),fresh);
});
test('concurrent 401 responses share one refresh and retry the original requests',async()=>{
 const old='old-token',fresh='new-token',parent={sessionStorage:storage(old)};let refreshes=0;
 const fetchImpl=async(path,options)=>{if(path==='/api/auth/refresh'){refreshes++;await new Promise(r=>setTimeout(r,5));return reply(200,{accessToken:fresh});}return options.headers.get('Authorization')==='Bearer '+old?reply(401,{error:'expired'}):reply(200,{ok:true});};
 const api=client(parent,fetchImpl,old);const result=await Promise.all([api.request('/one'),api.request('/two')]);assert.equal(refreshes,1);assert.equal(result.every(r=>r.ok),true);
});
test('failed refresh releases the shared promise for a subsequent attempt',async()=>{
 const old=jwt(1),fresh=jwt(Math.floor(Date.now()/1000)+3600),parent={sessionStorage:storage(old)};let refreshes=0;
 const fetchImpl=async(path)=>path==='/api/auth/refresh'?(++refreshes===1?reply(401,{error:'expired'}):reply(200,{accessToken:fresh})):reply(200,{ok:true});const api=client(parent,fetchImpl,old);
 await assert.rejects(api.request('/one'));assert.equal((await api.request('/one')).ok,true);assert.equal(refreshes,2);
});

test('PDF responses remain unread and a 401 still refreshes authorization',async()=>{
 const parent={sessionStorage:storage('old-token')};let calls=0;let parsed=false;const pdf={status:200,ok:true,blob:async()=>({pdf:true}),text:async()=>{parsed=true;throw new Error('binary response consumed');}};
 const api=client(parent,async(path,options)=>{if(path==='/api/auth/refresh')return reply(200,{accessToken:'fresh-token'});calls++;assert.equal('rawResponse' in options,false);return calls===1?reply(401,{error:'expired'}):pdf;},'old-token');
 assert.equal(await api.request('/pdf',{rawResponse:true}),pdf);assert.equal(parsed,false);assert.equal(calls,2);
});
