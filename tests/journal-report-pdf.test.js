import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJournalReportPdfHtml, exportJournalReportPdf } from '../services/journalReportPdfService.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const signatureId = '11111111-1111-4111-8111-111111111111';
const workspace = { id:'workspace-a', finalDocumentsFolderId:'configured-folder' };
const bundle = { report:{year:2026,month:10}, batches:[{id:'batch-1',documentDate:'2026-10-08'}], items:[{batchId:'batch-1',executor:'Ali Valiyev',name:'Манометр',serial:'<script>alert(1)</script>',signature:'legacy'}] };
const master = {id:'master-a',position:'НЎВваА устаси',status:'active',fullName:'Ali Valiyev',signatureFileId:'db:'+signatureId};
function setup(overrides = {}) {
  const calls = [];
  const provider = {
    validateFolder:async(id,options)=>{calls.push({type:'validate',id,options});},
    uploadPdf:async(folderId,fileName,pdf)=>{calls.push({type:'upload',folderId,fileName,pdf});return{fileId:'file-a',url:'https://drive.google.com/file/d/file-a/view',size:pdf.length,parentFolderId:folderId};},
  };
  const dependencies = {
    getReport:async(id,year,month)=>{calls.push({type:'report',id,year,month});return bundle;},
    getSigners:async(id)=>{calls.push({type:'signers',id});return[master,{...master,id:'inactive',status:'inactive'}];},
    getSignature:async(id,imageId)=>{calls.push({type:'signature',id,imageId});return{mimeType:'image/png',buffer:PNG};},
    createProvider:async(ws)=>{calls.push({type:'provider',id:ws.id});return provider;},
    renderPdf:async(html,options)=>{calls.push({type:'render',html,options});return Buffer.from('%PDF-test');},
    ...overrides,
  };
  return {calls,dependencies,provider};
}

test('journal PDF uses persisted selected-month data, scoped signatures and the configured folder',async()=>{
  const {calls,dependencies} = setup();
  const result = await exportJournalReportPdf(workspace,2026,10,dependencies);
  assert.deepEqual(calls.find(c=>c.type==='report'),{type:'report',id:'workspace-a',year:2026,month:10});
  assert.deepEqual(calls.find(c=>c.type==='signature'),{type:'signature',id:'workspace-a',imageId:signatureId});
  assert.equal(calls.filter(c=>c.type==='signature').length,1);
  const render = calls.find(c=>c.type==='render');
  assert.deepEqual(render.options,{landscape:true,allowMultiPage:true});
  assert.match(render.html,/data:image\/png;base64,/);
  assert.match(render.html,/08\.10\.2026/);
  assert.match(render.html,/Октябрь 2026/);
  assert.doesNotMatch(render.html,/<script>/);
  assert.match(render.html,/&lt;script&gt;/);
  const upload = calls.find(c=>c.type==='upload');
  assert.equal(upload.folderId,'configured-folder');
  assert.equal(upload.fileName,'ЖУРНАЛ УЧЕТА - 2026-10.pdf');
  assert.equal(result.fileId,'file-a');
  assert.equal(result.month,10);
  assert.equal(result.rowCount,1);
});

test('missing final folder fails before report lookup, rendering or upload',async()=>{
  const {calls,dependencies} = setup();
  await assert.rejects(exportJournalReportPdf({id:'workspace-a'},2026,10,dependencies),{code:'FINAL_DOCUMENTS_FOLDER_ID_REQUIRED'});
  assert.equal(calls.length,0);
});

test('missing or empty persisted report never uploads a PDF',async()=>{
  for (const report of [null,{...bundle,items:[]}]) {
    const {calls,dependencies} = setup({getReport:async()=>report});
    await assert.rejects(exportJournalReportPdf(workspace,2026,10,dependencies),{code:report?'JOURNAL_REPORT_ROWS_REQUIRED':'JOURNAL_REPORT_NOT_FOUND'});
    assert.equal(calls.length,0);
  }
});

test('ambiguous active masters are rejected instead of attaching another person signature',async()=>{
  const {calls,dependencies} = setup({getSigners:async()=>[{...master,fullName:'Master B'},{...master,id:'master-c',fullName:'Master C'}]});
  await assert.rejects(exportJournalReportPdf(workspace,2026,10,dependencies),{code:'JOURNAL_SIGNER_AMBIGUOUS'});
  assert.equal(calls.some(c=>c.type==='signature'||c.type==='upload'),false);
});

test('Drive validation failure prevents rendering and upload',async()=>{
  const {calls,dependencies,provider} = setup();
  provider.validateFolder = async()=>{throw Object.assign(new Error('Drive write denied'),{code:'DRIVE_WRITE_PERMISSION_DENIED',statusCode:403});};
  await assert.rejects(exportJournalReportPdf(workspace,2026,10,dependencies),{code:'DRIVE_WRITE_PERMISSION_DENIED',statusCode:403});
  assert.equal(calls.some(c=>c.type==='render'||c.type==='upload'),false);
});

test('renderer failure never uploads placeholder or HTML bytes',async()=>{
  const {calls,dependencies} = setup({renderPdf:async()=>{throw Object.assign(new Error('Chromium missing'),{code:'FINAL_PDF_CHROMIUM_NOT_FOUND',statusCode:500});}});
  await assert.rejects(exportJournalReportPdf(workspace,2026,10,dependencies),{code:'FINAL_PDF_CHROMIUM_NOT_FOUND'});
  assert.equal(calls.some(c=>c.type==='upload'),false);
});

test('monthly table repeats its header and allows rows across landscape A4 pages',()=>{
  const html = buildJournalReportPdfHtml({...bundle,items:Array.from({length:100},()=>bundle.items[0])});
  assert.match(html,/@page\{size:A4 landscape/);
  assert.match(html,/thead\{display:table-header-group\}/);
  assert.equal((html.match(/<tr>/g)||[]).length,101);
});
