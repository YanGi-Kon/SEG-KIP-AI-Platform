import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {preparePassportUpload} from '../domain/instrumentPassport.js';
import {createInstrumentPassportRepository} from '../repositories/instrumentPassportRepository.js';
test('selected PDF pages retain click order and excluded pages stay out',async()=>{
 const a=await PDFDocument.create();a.addPage([201,300]);a.addPage([202,300]);
 const b=await PDFDocument.create();b.addPage([301,300]);
 const files=[{originalname:'a.pdf',buffer:Buffer.from(await a.save())},{originalname:'b.pdf',buffer:Buffer.from(await b.save())}];
 const order=[{fileIndex:1,pageIndex:0},{fileIndex:0,pageIndex:1}];
 const parsed=await preparePassportUpload(files,{pageOrder:order});
 assert.deepEqual((await PDFDocument.load(parsed.bytes)).getPages().map(p=>p.getWidth()),[301,202]);
 const again=await preparePassportUpload(files,{pageOrder:order});assert.equal(parsed.checksum,again.checksum);
 const legacy=await preparePassportUpload(files);assert.equal(legacy.pageCount,3);
 for(const invalid of [[],null,[{fileIndex:0,pageIndex:2}],[{fileIndex:-1,pageIndex:0}],[{fileIndex:0,pageIndex:'0'}],[order[0],order[0]]]){
   await assert.rejects(preparePassportUpload(files,{pageOrder:invalid}),e=>e.code==='PASSPORT_PAGE_ORDER_INVALID');
 }
});
test('historical PDF retrieval is scoped to workspace, instrument, and document',async()=>{
 const calls=[];const repo=createInstrumentPassportRepository({query:async(sql,args)=>{calls.push({sql,args});return{rows:[]};},withTransaction:async()=>{throw new Error('unused');}});
 assert.equal(await repo.getPassportDocument('workspace-a','instrument-a','not-a-uuid'),null);assert.equal(calls.length,0);
 const id='00000000-0000-4000-8000-000000000001';assert.equal(await repo.getPassportDocument('workspace-a','instrument-a',id),null);
 assert.deepEqual(calls[0].args,['workspace-a','instrument-a',id]);assert.match(calls[0].sql,/p.workspace_id=\$1 AND p.instrument_key=\$2 AND d.id=\$3/);
});
