import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Apps Script passport adapter preserves file IDs, folder scope and existing upload actions',()=>{
  const files=[];const drivePdfs=[];let authenticated=0,legacyUploads=0,locks=0,failNextPdfCreate=false;
  const context=vm.createContext({
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    Utilities:{base64Decode:text=>[...Buffer.from(text,'base64')],newBlob:(bytes,mimeType,name)=>({bytes,mimeType,name})},
    LockService:{getScriptLock:()=>({waitLock:()=>{locks++;},releaseLock:()=>{locks--;}})},
    DriveApp:{getFolderById:id=>({getId:()=>id,getFilesByName:name=>{const matches=drivePdfs.filter(file=>file.parentFolderId===id&&file.name===name&&!file.trashed);let index=0;return{hasNext:()=>index<matches.length,next:()=>matches[index++]};},createFile:blob=>{if(failNextPdfCreate){failNextPdfCreate=false;throw new Error('simulated Drive create failure');}legacyUploads++;const file={id:`legacy-${legacyUploads}`,name:blob.name,mimeType:blob.mimeType,parentFolderId:id,trashed:false,getId(){return this.id;},getMimeType(){return this.mimeType;},setTrashed(value){this.trashed=value;}};drivePdfs.push(file);return file;}})},
    Drive:{Files:{
      list:({q})=>{const folder=q.match(/^'([^']+)' in parents/)[1];const key=q.match(/value='([^']+)'/)[1];return {files:files.filter(file=>file.parents.includes(folder)&&file.appProperties.segPassportKey===key)};},
      create:(metadata,blob)=>{const file={...metadata,id:`file-${files.length+1}`,size:blob.bytes.length};files.push(file);return file;},
      update:(metadata,id,blob)=>{const file=files.find(file=>file.id===id);Object.assign(file,metadata,{size:blob.bytes.length});return file;},
    }},
  });
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Passport.gs',import.meta.url),'utf8'),context);
  context.authenticate_=()=>{authenticated++;};
  const request=(action,payload={})=>context.doPost({postData:{contents:JSON.stringify({action,payload})}});
  assert.equal(request('passport_capabilities').ready,true);
  const payload={targetFolderId:'folder-a',name:'pasport.pdf',operationKey:'current:passport-id',pdfBase64:Buffer.from('%PDF-test').toString('base64')};
  const first=request('save_passport_pdf',payload);
  assert.equal(first.ok,true,JSON.stringify(first));
  assert.equal(request('save_passport_pdf',payload).fileId,first.fileId);
  assert.notEqual(request('save_passport_pdf',{...payload,targetFolderId:'folder-b'}).fileId,first.fileId);
  assert.equal(files.length,2);assert.equal(locks,0);
  assert.equal(request('save_passport_pdf',{...payload,operationKey:"unsafe'key"}).code,'PASSPORT_OPERATION_KEY_INVALID');
  const unrelated={id:'unrelated',name:'other.pdf',mimeType:'application/pdf',parentFolderId:'folder-a',trashed:false,getId(){return this.id;},getMimeType(){return this.mimeType;},setTrashed(value){this.trashed=value;}};drivePdfs.push(unrelated);
  const oldPdf={id:'old-month',name:'ЖУРНАЛ - 2026-10.pdf',mimeType:'application/pdf',parentFolderId:'folder-a',trashed:false,getId(){return this.id;},getMimeType(){return this.mimeType;},setTrashed(value){this.trashed=value;}};drivePdfs.push(oldPdf);
  failNextPdfCreate=true;
  const failedUpload=request('upload_pdf_base64',{...payload,name:'ЖУРНАЛ - 2026-10.pdf'});
  assert.equal(failedUpload.ok,false);assert.equal(oldPdf.trashed,false);
  const firstUpload=request('upload_pdf_base64',{...payload,name:'ЖУРНАЛ - 2026-10.pdf'});
  assert.equal(firstUpload.ok,true);assert.equal(firstUpload.replaced,true);assert.equal(oldPdf.trashed,true);
  const secondUpload=request('upload_pdf_base64',{...payload,name:'ЖУРНАЛ - 2026-10.pdf'});
  assert.equal(secondUpload.ok,true);assert.equal(secondUpload.replaced,true);
  assert.equal(secondUpload.removedDuplicates,1);
  assert.equal(drivePdfs.filter(file=>file.name==='ЖУРНАЛ - 2026-10.pdf'&&!file.trashed).length,1);
  assert.equal(unrelated.trashed,false);
  assert.equal(legacyUploads,2);
  assert.equal(authenticated,8);
  delete context.Drive;
  assert.equal(request('passport_capabilities').code,'PASSPORT_ADVANCED_DRIVE_REQUIRED');
});
