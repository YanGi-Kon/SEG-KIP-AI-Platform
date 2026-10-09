import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const workflow = fs.readFileSync(new URL('../public/js/kuduk-workflow.js',import.meta.url),'utf8');
function setup(upload) {
  const classes = new Set();
  const elements = new Map(['kudukDocumentPaper','kudukDocumentStatus','kudukDocumentModal','kudukDocumentPrint','kudukDocumentSavePdf'].map(id=>[id,{innerHTML:'',textContent:'',disabled:true,classList:{add(){},remove(){}},appendChild(){}}]));
  let workspace = 'workspace-a';
  let prints = 0;
  const calls = [];
  const document = {readyState:'loading',addEventListener(){},getElementById:id=>elements.get(id)||null,createElement:()=>({}),body:{classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)}}};
  const window = {addEventListener(){},scrollTo(){},scrollY:0,print(){prints++;},KudukJournalWorkspace:{workspaceId:()=>workspace}};
  vm.runInNewContext(workflow.replace('window.KudukWorkflow = {','window.KudukWorkflow = { renderStoredDocument, saveCurrentDocumentPdf, printCurrentDocument,'),{
    window,document,parent:{},Headers,FormData,URL,
    localStorage:{getItem:()=>''},sessionStorage:{getItem:()=> 'token-a'},
    fetch:async(path,options)=>{calls.push({path,options});if(path.endsWith('/pdf'))return upload?await upload():{ok:true,json:async()=>({result:{fileId:'file-a',url:'https://drive.google.com/file/d/file-a/view'}})};return{ok:true,json:async()=>({rows:[]})};},
  });
  return {ui:window.KudukWorkflow,elements,calls,setWorkspace:value=>workspace=value,printCount:()=>prints};
}
const bundle = {report:{year:2026,month:10},items:[{name:'Манометр'}],batches:[]};

test('document controls save the displayed month and print only when rendering is ready',async()=>{
  const {ui,elements,calls,printCount}=setup();
  ui.printCurrentDocument();
  await ui.saveCurrentDocumentPdf();
  assert.equal(calls.length,0);
  assert.equal(printCount(),0);
  await ui.renderStoredDocument(bundle);
  assert.equal(elements.get('kudukDocumentPrint').disabled,false);
  assert.equal(elements.get('kudukDocumentSavePdf').disabled,false);
  ui.printCurrentDocument();
  assert.equal(printCount(),1);
  await ui.saveCurrentDocumentPdf();
  assert.equal(calls.at(-1).path,'/api/journal-reports/2026/10/pdf');
  assert.equal(calls.at(-1).options.method,'POST');
  assert.equal(calls.at(-1).options.headers.get('x-workspace-id'),'workspace-a');
  assert.match(elements.get('kudukDocumentStatus').textContent,/сақланди/);
});

test('a double click sends one export and a Workspace switch blocks stale document actions',async()=>{
  let resolveUpload;
  const uploadPromise = new Promise(resolve=>resolveUpload=resolve);
  const {ui,calls,setWorkspace}=setup(()=>uploadPromise);
  await ui.renderStoredDocument(bundle);
  const saving=ui.saveCurrentDocumentPdf();
  await ui.saveCurrentDocumentPdf();
  assert.equal(calls.filter(c=>c.path.endsWith('/pdf')).length,1);
  resolveUpload({ok:true,json:async()=>({result:{fileId:'file-a'}})});
  await saving;
  setWorkspace('workspace-b');
  await ui.saveCurrentDocumentPdf();
  assert.equal(calls.filter(c=>c.path.endsWith('/pdf')).length,1);
});

test('Drive errors are shown on the document and the save button is restored',async()=>{
  const {ui,elements}=setup(async()=>({ok:false,status:400,json:async()=>({error:'Folder unavailable'})}));
  await ui.renderStoredDocument(bundle);
  await ui.saveCurrentDocumentPdf();
  assert.match(elements.get('kudukDocumentStatus').textContent,/PDF сақланмади: Folder unavailable/);
  assert.equal(elements.get('kudukDocumentSavePdf').disabled,false);
});
