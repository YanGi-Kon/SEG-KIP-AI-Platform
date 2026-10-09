import test from 'node:test';
import assert from 'node:assert/strict';
import { passportFailureRetryable } from '../services/instrumentPassportService.js';
import { AppsScriptPersonalDriveProvider } from '../services/driveProviders/appsScriptPersonalDriveProvider.js';
function setup(response,logger){
 const logs=[];
 const provider=new AppsScriptPersonalDriveProvider({url:'https://script.google.com/macros/s/private-deployment/exec',secret:'private-secret',diagnosticsLogger:logger||((entry)=>logs.push(entry)),fetchImpl:async()=>response});
 return {provider,logs};
}
test('HTML 404 records action, redirect host and correlation without sensitive values',async()=>{
 const {provider,logs}=setup({ok:false,status:404,url:'https://script.googleusercontent.com/macros/echo?user_content_key=private-token',redirected:true,headers:{get:()=> 'text/html; charset=utf-8'},text:async()=>'<html>private-response</html>'});
 let failure;try{await provider.request('save_passport_pdf',{targetFolderId:'private-folder',name:'private-filename',pdfBase64:'private-pdf'});}catch(error){failure=error;}
 assert.equal(failure.code,'DRIVE_APPS_SCRIPT_REDIRECT_FAILED');assert.equal(passportFailureRetryable(failure),true);assert.equal(logs.length,1);
 const entry=logs[0];assert.equal(entry.httpStatus,404);assert.equal(entry.action,'save_passport_pdf');assert.equal(entry.responseHost,'script.googleusercontent.com');assert.equal(entry.redirected,true);assert.equal(entry.responseFormat,'non-json');assert.equal(entry.requestId,failure.driveRequestId);assert.equal(failure.driveRequestAction,'save_passport_pdf');
 const serialized=JSON.stringify(entry);for(const value of ['private-deployment','private-secret','private-token','private-response','private-folder','private-filename','private-pdf','signature'])assert.equal(serialized.includes(value),false);
});
test('HTTP 200 application failure remains an error in diagnostics',async()=>{
 const {provider,logs}=setup({ok:true,status:200,text:async()=>JSON.stringify({ok:false,code:'DRIVE_APPS_SCRIPT_AUTH_FAILED',error:'secret-message',statusCode:403})});
 await assert.rejects(provider.request('passport_capabilities'),{code:'DRIVE_APPS_SCRIPT_AUTH_FAILED'});assert.equal(logs[0].httpStatus,200);assert.equal(logs[0].outcome,'error');assert.equal(logs[0].responseFormat,'json');assert.equal(JSON.stringify(logs).includes('secret-message'),false);
});
test('successful requests are unchanged and log their duration',async()=>{
 const {provider,logs}=setup({ok:true,status:200,text:async()=>JSON.stringify({ok:true,ready:true})});const result=await provider.passportCapabilities();assert.equal(result.ready,true);assert.equal(logs[0].outcome,'success');assert.ok(logs[0].durationMs>=0);assert.ok(logs[0].requestBytes>0);
});
test('a broken diagnostic logger cannot break a successful Drive request',async()=>{
 const {provider}=setup({ok:true,status:200,text:async()=>JSON.stringify({ok:true,ready:true})},()=>{throw new Error('logging failure');});assert.equal((await provider.passportCapabilities()).ready,true);
});
test('network failures are recorded without remote messages',async()=>{
 const logs=[];const provider=new AppsScriptPersonalDriveProvider({url:'https://script.google.com/macros/s/id/exec',secret:'secret',diagnosticsLogger:e=>logs.push(e),fetchImpl:async()=>{throw new Error('private-network-message');}});await assert.rejects(provider.passportCapabilities());assert.equal(logs[0].httpStatus,null);assert.equal(logs[0].responseFormat,'unavailable');assert.equal(JSON.stringify(logs).includes('private-network-message'),false);
});

test('direct deployment 404 stays permanent and does not trigger passport retries',async()=>{
 const {provider}=setup({ok:false,status:404,url:'https://script.google.com/macros/s/id/exec',redirected:false,text:async()=>'<html>Not Found</html>'});
 await assert.rejects(provider.passportCapabilities(),error=>error.code==='DRIVE_APPS_SCRIPT_DEPLOYMENT_NOT_FOUND' && passportFailureRetryable(error)===false);
});
test('legacy upload does not retry a redirected 404 because it can create duplicate files',async()=>{
 const {provider}=setup({ok:false,status:404,url:'https://script.googleusercontent.com/macros/echo',redirected:true,text:async()=>'<html>Not Found</html>'});
 await assert.rejects(provider.uploadPdf('folder','file.pdf',Buffer.from('%PDF-test')),error=>error.code==='DRIVE_APPS_SCRIPT_DEPLOYMENT_NOT_FOUND' && passportFailureRetryable(error)===false);
});
test('only safe actions from the Google response host become retryable',async()=>{
 for(const action of ['passport_capabilities','validate_folder','ensure_subfolder','save_passport_pdf']){
  const {provider}=setup({ok:false,status:404,url:'https://script.googleusercontent.com/macros/echo',redirected:true,text:async()=>'<html>Not Found</html>'});
  await assert.rejects(provider.request(action),error=>error.code==='DRIVE_APPS_SCRIPT_REDIRECT_FAILED' && passportFailureRetryable(error)===true);
 }
 const {provider}=setup({ok:false,status:404,url:'https://other.example/echo',redirected:true,text:async()=>'<html>Not Found</html>'});
 await assert.rejects(provider.passportCapabilities(),{code:'DRIVE_APPS_SCRIPT_DEPLOYMENT_NOT_FOUND'});
});
