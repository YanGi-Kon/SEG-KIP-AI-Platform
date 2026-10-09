import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const workflow = fs.readFileSync(new URL('../public/js/kuduk-workflow.js',import.meta.url),'utf8');
const repository = fs.readFileSync(new URL('../repositories/journalReportRepository.js',import.meta.url),'utf8');
function setup(confirm=true,upload=null){
 let wid='workspace-a';const calls=[];const alerts=[];
 const window={confirm:()=>confirm,alert:m=>alerts.push(m),KudukJournalWorkspace:{workspaceId:()=>wid}};
 vm.runInNewContext(workflow.replace('window.KudukWorkflow = {','window.KudukWorkflow = { deleteStoredReport,'),{window,parent:{},document:{readyState:'loading',addEventListener(){},getElementById:()=>null},localStorage:{getItem:()=>''},sessionStorage:{getItem:()=> 'token'},Headers,FormData,
 fetch:async(path,options)=>{calls.push({path,options});return upload?await upload():{ok:true,json:async()=>({ok:true})};}});
 return {ui:window.KudukWorkflow,calls,alerts,switchWorkspace:()=>{wid='workspace-b';}};
}
const button=()=>({disabled:false,dataset:{year:'2026',month:'5'}});
test('cancelled report deletion makes no request',async()=>{const h=setup(false);await h.ui.deleteStoredReport(button());assert.equal(h.calls.length,0);});
test('confirmed deletion is scoped to the month and workspace',async()=>{const h=setup();const b=button();await h.ui.deleteStoredReport(b);assert.equal(h.calls[0].path,'/api/journal-reports/2026/5');assert.equal(h.calls[0].options.method,'DELETE');assert.equal(h.calls[0].options.headers.get('x-workspace-id'),'workspace-a');assert.equal(b.disabled,false);});
test('double click sends only one delete and errors restore the button',async()=>{let resolve;const pending=new Promise(r=>resolve=r);const h=setup(true,()=>pending);const b=button();const first=h.ui.deleteStoredReport(b);await h.ui.deleteStoredReport(b);assert.equal(h.calls.length,1);resolve({ok:false,status:403,json:async()=>({error:'Permission denied'})});await first;assert.equal(b.disabled,false);assert.match(h.alerts[0],/Permission denied/);});
test('delete repository uses workspace and period and rejects completed reports',async()=>{const calls=[];const context=vm.createContext({query:async(sql,args)=>{calls.push({sql,args});return{rows:[{id:'report'}]};},getJournalReportByKey:async()=>({status:'completed'})});vm.runInContext(repository.slice(repository.indexOf('export async function deleteJournalReport')).replace('export ',''),context);const result=await context.deleteJournalReport('workspace-a',2026,5);assert.equal(result.deleted,true);assert.match(calls[0].sql,/workspace_id = \$1/);assert.match(calls[0].sql,/status = 'draft'/);assert.equal(JSON.stringify(calls[0].args),JSON.stringify(['workspace-a',2026,5]));context.query=async()=>({rows:[]});await assert.rejects(context.deleteJournalReport('workspace-a',2026,5),e=>e.statusCode===409);context.getJournalReportByKey=async()=>null;await assert.rejects(context.deleteJournalReport('workspace-b',2026,5),e=>e.statusCode===404);});
