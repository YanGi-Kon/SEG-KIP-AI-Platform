import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { renderHtmlToA4Pdf, inspectPdfBuffer } from '../services/pdfRendererService.js';

async function fixture(width,height,pageCount=1) {
  const document=await PDFDocument.create();
  for(let i=0;i<pageCount;i++)document.addPage([width,height]);
  return document.save();
}
function mockRenderer(bytes) {
  const state={closed:false};
  const page={setDefaultTimeout(){},emulateMediaType:async()=>{},setContent:async()=>{},evaluate:async()=>{},pdf:async(options)=>{state.options=options;return bytes;}};
  const launch=async()=>({newPage:async()=>page,close:async()=>{state.closed=true;}});
  return {state,launch};
}

test('landscape journals use A4 horizontal pages and allow monthly tables to span pages',async()=>{
  const {state,launch}=mockRenderer(await fixture(841.89,595.28,2));
  const pdf=await renderHtmlToA4Pdf('<p>ЖУРНАЛ УЧЕТА</p>',{executablePath:'test-chromium',landscape:true,allowMultiPage:true,launch});
  assert.equal(state.options.landscape,true);
  assert.equal(state.options.preferCSSPageSize,true);
  assert.equal((await inspectPdfBuffer(pdf)).pageCount,2);
  assert.equal(state.closed,true);
});

test('landscape export rejects portrait output and still closes Chromium',async()=>{
  const {state,launch}=mockRenderer(await fixture(595.28,841.89));
  await assert.rejects(renderHtmlToA4Pdf('<p>Journal</p>',{executablePath:'test-chromium',landscape:true,allowMultiPage:true,launch}),{code:'FINAL_PDF_PAGE_SIZE_INVALID'});
  assert.equal(state.closed,true);
});

test('existing portrait export keeps its orientation and A4 dimensions',async()=>{
  const {state,launch}=mockRenderer(await fixture(595.28,841.89));
  await renderHtmlToA4Pdf('<p>Act</p>',{executablePath:'test-chromium',allowMultiPage:true,launch});
  assert.equal(state.options.landscape,false);
  assert.equal(state.closed,true);
});
