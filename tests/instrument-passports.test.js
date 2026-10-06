import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { instrumentPassportKey, normalizePassportFilename, readPassportPdf, mergePassportPdfs, preparePassportUpload } from '../domain/instrumentPassport.js';
import { createInstrumentPassportRepository } from '../repositories/instrumentPassportRepository.js';
import { buildPassportJob, passportFailureRetryable } from '../services/instrumentPassportService.js';
import { SharedDriveServiceAccountProvider, resolveDriveCredentials } from '../services/driveProviders/sharedDriveServiceAccountProvider.js';
import { AppsScriptPersonalDriveProvider } from '../services/driveProviders/appsScriptPersonalDriveProvider.js';

async function makePdf(widths) {
  const pdf=await PDFDocument.create();for(const width of widths)pdf.addPage([width,200]);return Buffer.from(await pdf.save());
}
test('instrument identity survives row and location changes and remains sheet-specific',()=>{
  const original={serial:'CBFV88',brand:'WIKA',name:'Manometr',pos:'1',location:'A'};
  assert.equal(instrumentPassportKey('Manometr',original),instrumentPassportKey('Manometr',{...original,pos:'99',location:'B'}));
  assert.notEqual(instrumentPassportKey('Manometr',original),instrumentPassportKey('Other',original));
});
test('passport filenames repair UTF-8 names decoded as latin1 by multipart parsers',()=>{
  assert.equal(normalizePassportFilename('ÐœÐ°Ð½Ð¾Ð¼ÐµÑ‚Ñ€.pdf'),'Манометр.pdf');
  assert.equal(normalizePassportFilename('passport.pdf'),'passport.pdf');
});

test('PDF merge keeps all source pages in order and rejects invalid input',async()=>{
  const merged=await mergePassportPdfs([{pdf:await makePdf([100,110])},{pdf:await makePdf([120])}]);
  const pdf=await PDFDocument.load(merged.bytes);
  assert.deepEqual(pdf.getPages().map(page=>page.getWidth()),[100,110,120]);
  await assert.rejects(readPassportPdf(Buffer.from('not PDF')),{code:'PASSPORT_PDF_INVALID'});
  await assert.rejects(readPassportPdf(Buffer.from('%PDF-broken')),{code:'PASSPORT_PDF_UNREADABLE'});
  await assert.rejects(readPassportPdf(await makePdf([100]),1),{code:'PASSPORT_PDF_SIZE_INVALID'});
});

test('a single multi-page PDF is preserved byte for byte; multiple uploads keep page order',async()=>{
  const source=await makePdf([120,130]);
  const single=await preparePassportUpload([{originalname:'passport.pdf',buffer:source}]);
  assert.deepEqual(single.bytes,source);
  assert.deepEqual((await mergePassportPdfs([{pdf:single.bytes}])).bytes,source);
  const batch=[{originalname:'first.pdf',buffer:source},{originalname:'second.pdf',buffer:await makePdf([140])}];
  const merged=await preparePassportUpload(batch);
  assert.deepEqual(merged.pdf.getPages().map(page=>page.getWidth()),[120,130,140]);
  assert.equal((await preparePassportUpload(batch)).checksum,merged.checksum);
  await assert.rejects(preparePassportUpload([{originalname:'fake.jpg',buffer:source}]),{code:'PASSPORT_JPG_INVALID'});
  await assert.rejects(preparePassportUpload([{originalname:'file.txt',buffer:source}]),{code:'PASSPORT_FILE_TYPE_INVALID'});
});

test('passport migration and durable queue work with PostgreSQL, including crash recovery',async t=>{
  const db=await PGlite.create({extensions:{citext,pgcrypto}});
  t.after(()=>db.close());
  const migrations=new URL('../db/migrations/',import.meta.url);
  for(const file of fs.readdirSync(migrations).filter(name=>/^\d.*\.sql$/.test(name)).sort())await db.exec(fs.readFileSync(new URL(file,migrations),'utf8'));
  const query=db.query.bind(db);
  const repo=createInstrumentPassportRepository({query,withTransaction:callback=>db.transaction(callback)});
  const user=(await query("INSERT INTO users(full_name,email,password_hash) VALUES('Test User','passport@example.com','test') RETURNING id")).rows[0].id;
  const workspace=(await query("INSERT INTO workspaces(owner_id,name,slug,spreadsheet_id,spreadsheet_url,module_settings) VALUES($1,'Passport tests','passport-tests','abcdefghijklmnopqrst','test','{\"another_setting\":\"preserve\"}') RETURNING id",[user])).rows[0].id;
  const other=(await query("INSERT INTO workspaces(owner_id,name,slug,spreadsheet_id,spreadsheet_url) VALUES($1,'Other workspace','other-workspace','abcdefghijklmnopqrst','test') RETURNING id",[user])).rows[0].id;
  const instrument={serial:'CBFV88',brand:'WIKA',name:'Manometr',pos:'1'};
  const key=instrumentPassportKey('Manometr',instrument);
  const first=await readPassportPdf(await makePdf([100,110]));
  const input={workspaceId:workspace,key,sheetName:'Manometr',instrument,filename:'pasport.pdf',parsed:first,userId:user,rootFolderId:'target-folder-id'};
  let firstJob,secondJob;
  await t.test('upload and outbox job commit together; duplicates do not append pages',async()=>{
    const saved=await repo.savePassportDocument(input);
    assert.equal(saved.passport.version,1);
    const duplicate=await repo.savePassportDocument(input);
    assert.equal(duplicate.duplicate,true);
    assert.equal((await repo.passportDetails(workspace,key)).documents.length,1);
    assert.equal((await repo.duePassportJobs()).length,1);
    firstJob=await repo.claimPassportJob(saved.jobId,{query});
  });
  await t.test('Workspace separation and rollback preserve document ownership',async()=>{
    assert.equal(await repo.getPassport(other,key),null);
    assert.equal((await repo.passportDetails(other,key)).documents.length,0);
    const badKey=instrumentPassportKey('Other',instrument);
    await assert.rejects(repo.savePassportDocument({...input,key:badKey,userId:'00000000-0000-4000-8000-000000000099'}));
    assert.equal(await repo.getPassport(workspace,badKey),null);
    await repo.saveUlchovFolder(workspace,'custom-folder');
    const settings=(await query('SELECT module_settings FROM workspaces WHERE id=$1',[workspace])).rows[0].module_settings;
    assert.equal(settings.another_setting,'preserve');assert.equal(settings.ulchov_final_documents_folder_id,'custom-folder');
  });
  const driveFiles=new Map();let failAfterCurrent=false,currentWrites=0;
  const provider={
    passportCapabilities:async()=>({ready:true}),
    validateFolder:async()=>({ok:true}),
    ensureSubfolder:async(parent,name)=>({folderId:`${parent}/${name}`}),
    savePassportPdf:async(folder,name,bytes,operationKey)=>{
      const fileKey=folder+':'+operationKey;
      const fileId=driveFiles.get(fileKey)?.fileId || `file-${driveFiles.size+1}`;
      driveFiles.set(fileKey,{fileId,bytes:Buffer.from(bytes),name});
      if(operationKey.startsWith('current:')){currentWrites++;if(failAfterCurrent){failAfterCurrent=false;throw Object.assign(new Error('Connection interrupted after Drive write'),{statusCode:503});}}
      return {fileId,url:'https://drive.google.com/file/d/'+fileId+'/view'};
    },
  };
  const options={repo,providerFactory:async()=>provider,workspaceLoader:async()=>({id:workspace,status:'active'})};
  let firstFileId;
  await t.test('first passport publishes; subsequent upload appends and archives the old output',async()=>{
    await buildPassportJob(firstJob,options);
    const old=await repo.getPassport(workspace,key);firstFileId=old.current_file_id;
    assert.equal(old.page_count,2);assert.equal(old.published_version,1);
    const next=await repo.savePassportDocument({...input,filename:'inspection.pdf',parsed:await readPassportPdf(await makePdf([120]))});
    secondJob=await repo.claimPassportJob(next.jobId,{query});
    const history=await repo.passportDetails(workspace,key);assert.equal(history.documents.length,2);
  });
  await t.test('retry after Drive committed but response was lost keeps one current file and no duplicate pages',async()=>{
    failAfterCurrent=true;
    await assert.rejects(buildPassportJob(secondJob,options));
    await repo.failPassportJob(secondJob,new Error('connection lost'),true);
    const failed=await repo.passportDetails(workspace,key);assert.equal(failed.passport.status,'failed_retryable');
    const retried=await repo.retryPassport(workspace,key);assert.ok(retried);
    secondJob=await repo.claimPassportJob(retried.id,{query});
    await buildPassportJob(secondJob,options);
    const current=await repo.getPassport(workspace,key);
    assert.equal(current.current_file_id,firstFileId);assert.equal(current.page_count,3);
    assert.deepEqual((await PDFDocument.load(current.merged_pdf)).getPages().map(page=>page.getWidth()),[100,110,120]);
    assert.equal([...driveFiles.keys()].filter(k=>k.includes(':current:')).length,1);
    assert.equal([...driveFiles.keys()].filter(k=>k.includes(':archive:')).length,1);
    assert.equal([...driveFiles.keys()].filter(k=>k.includes(':original:')).length,2);
  });
  await t.test('an old job never replaces a newer published passport',async()=>{
    const before=currentWrites;
    await buildPassportJob(firstJob,options);
    assert.equal(currentWrites,before);
    assert.equal((await repo.getPassport(workspace,key)).published_version,2);
  });
  await t.test('row claiming and stale-job recovery prevent duplicate claims',async()=>{
    const input2={...input,key:instrumentPassportKey('Second',instrument)};
    const saved=await repo.savePassportDocument(input2);
    assert.ok(await repo.claimPassportJob(saved.jobId,{query}));
    assert.equal(await repo.claimPassportJob(saved.jobId,{query}),undefined);
    await query("UPDATE outbox_jobs SET locked_at=NOW()-INTERVAL '16 minutes' WHERE id=$1",[saved.jobId]);
    assert.ok((await repo.duePassportJobs()).some(job=>job.id===saved.jobId));
    assert.ok(await repo.claimPassportJob(saved.jobId,{query}));
    assert.equal((await query("SELECT pg_try_advisory_lock(hashtextextended('passport-test',0)) AS locked")).rows[0].locked,true);
    await query("SELECT pg_advisory_unlock(hashtextextended('passport-test',0))");
  });
});
test('Shared Drive updates the same canonical file and isolates its deterministic key to the target folder',async()=>{
  let creates=0,updates=0;
  const drive={files:{list:async({q})=>{assert.match(q,/'target' in parents/);return {data:{files:creates?[{id:'canonical',mimeType:'application/pdf'}]:[]}};},create:async()=>{creates++;return {data:{id:'canonical'}};},update:async({fileId})=>{assert.equal(fileId,'canonical');updates++;return {data:{id:fileId}};}}};
  const provider=new SharedDriveServiceAccountProvider({drive});
  const pdf=await makePdf([100]);
  await provider.savePassportPdf('target','pasport.pdf',pdf,'current:id');
  await provider.savePassportPdf('target','pasport.pdf',pdf,'current:id');
  assert.equal(creates,1);assert.equal(updates,1);
});
test('Personal Drive explains an outdated script and verifies PDF write receipts',async()=>{
  const provider=new AppsScriptPersonalDriveProvider({url:'https://example.com',secret:'test',fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({ok:false,code:'DRIVE_APPS_SCRIPT_ACTION_INVALID',error:'Old script',statusCode:400})})});
  await assert.rejects(provider.passportCapabilities(),error=>{
    assert.equal(error.code,'PASSPORT_APPS_SCRIPT_UPDATE_REQUIRED');
    assert.match(error.recommendedFix,/Passport\.gs/);
    assert.match(error.recommendedFix,/Drive API v3/);
    return true;
  });
  provider.request=async()=>{throw Object.assign(new Error('Drive advanced service missing'),{code:'PASSPORT_ADVANCED_DRIVE_REQUIRED',statusCode:400});};
  await assert.rejects(provider.passportCapabilities(),error=>{
    assert.equal(error.code,'PASSPORT_ADVANCED_DRIVE_REQUIRED');
    assert.match(error.recommendedFix,/Drive API v3/);
    return true;
  });
  assert.equal(passportFailureRetryable({code:'PASSPORT_APPS_SCRIPT_UPDATE_REQUIRED'}),false);
  assert.equal(passportFailureRetryable({code:'DRIVE_APPS_SCRIPT_TIMEOUT',statusCode:504}),true);
  assert.equal(passportFailureRetryable({code:'DRIVE_WRITE_PERMISSION_DENIED',statusCode:403}),false);
  provider.request=async()=>({fileId:'id',size:1,parentFolderId:'target'});
  await assert.rejects(provider.savePassportPdf('target','pasport.pdf',await makePdf([100]),'current:id'),{code:'DRIVE_UPLOAD_RESULT_INVALID'});
});
test('Workspace Drive credentials do not silently fall back when a configured credential is invalid',()=>{
  assert.throws(()=>resolveDriveCredentials({serviceAccountBase64:'bad'}),{code:'GOOGLE_SERVICE_ACCOUNT_INVALID'});
  const serviceAccount={client_email:'workspace@example.com',project_id:'test',private_key:'-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----'};
  assert.equal(resolveDriveCredentials({serviceAccountBase64:Buffer.from(JSON.stringify(serviceAccount)).toString('base64')}).credentialSource,'WORKSPACE');
});
