import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/js/local-state-transfer.js',import.meta.url),'utf8');
function run(port,stored={},hash=''){
  const values=new Map(Object.entries(stored));
  const elements={transferStatus:{},transferButton:{hidden:true},homeButton:{hidden:true}};
  const location={hostname:'localhost',port,hash,pathname:'/local-state-transfer.html',href:''};
  const context={location,history:{replaceState(){}},document:{getElementById:id=>elements[id]},localStorage:{get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},TextEncoder,TextDecoder,Uint8Array,Date,btoa:value=>Buffer.from(value,'binary').toString('base64'),atob:value=>Buffer.from(value,'base64').toString('binary'),Object,Set,JSON};
  vm.runInNewContext(source,context);return {values,elements,location};
}
test('local transfer excludes secrets and imports safe settings from 3002 into 3001',()=>{
  const from=run('3002',{ulchov_sheet_name:'Asboblar',seg_kip_lang:'uz',acts_service_account:'secret',seg_kip_workspace_access_token:'token'});
  from.elements.transferButton.onclick();
  assert.match(from.location.href,/^http:\/\/localhost:3001\/local-state-transfer\.html#/);
  const payload=new URL(from.location.href).hash;
  const to=run('3001',{},payload);
  assert.equal(to.values.get('ulchov_sheet_name'),'Asboblar');
  assert.equal(to.values.get('seg_kip_lang'),'uz');
  assert.equal(to.values.has('acts_service_account'),false);
  assert.equal(to.values.has('seg_kip_workspace_access_token'),false);
  assert.match(to.elements.transferStatus.textContent,/2 ta sozlama/);
});
