import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Apps Script passport adapter preserves file IDs, folder scope and existing upload actions',()=>{
  const files=[];let authenticated=0,legacyUploads=0,locks=0;
  const context=vm.createContext({
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
    Utilities:{base64Decode:text=>[...Buffer.from(text,'base64')],newBlob:(bytes,mimeType,name)=>({bytes,mimeType,name})},
    LockService:{getScriptLock:()=>({waitLock:()=>{locks++;},releaseLock:()=>{locks--;}})},
    DriveApp:{getFolderById:id=>({getId:()=>id,createFile:()=>{legacyUploads++;return {getId:()=>`legacy-${id}`};}})},
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
  assert.equal(request('upload_pdf_base64',payload).ok,true);assert.equal(legacyUploads,1);
  assert.equal(authenticated,6);
  delete context.Drive;
  assert.equal(request('passport_capabilities').code,'PASSPORT_ADVANCED_DRIVE_REQUIRED');
});
