// Add this file to the existing Apps Script project; enable Advanced Drive service v3.
// Code.gs retains its existing ACT/TO actions and HMAC authentication.
function handlePassportRequest_(body) {
  if (body.action !== 'passport_capabilities' && body.action !== 'save_passport_pdf') return null;
  if (typeof Drive === 'undefined') throw new Error('PASSPORT_ADVANCED_DRIVE_REQUIRED');
  if (body.action === 'passport_capabilities') return {ok:true,ready:true};
  var payload = body.payload || {};
  var targetFolderId = clean_(payload.targetFolderId);
  folder_(targetFolderId);
  var key = clean_(payload.operationKey);
  if (!/^[a-zA-Z0-9:_-]{1,200}$/.test(key)) throw new Error('PASSPORT_OPERATION_KEY_INVALID');
  var bytes = Utilities.base64Decode(clean_(payload.pdfBase64));
  if (!bytes.length || bytes.length > 60 * 1024 * 1024 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) throw new Error('DRIVE_PDF_SIGNATURE_INVALID');
  var name = clean_(payload.name) || 'pasport.pdf';
  var blob = Utilities.newBlob(bytes,'application/pdf',name);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var escapedFolderId = targetFolderId.replace(/'/g,"\\'");
    var files = Drive.Files.list({q:"'"+escapedFolderId+"' in parents and trashed=false and appProperties has { key='segPassportKey' and value='"+key+"' }",fields:'files(id,mimeType)',pageSize:2,supportsAllDrives:true,includeItemsFromAllDrives:true}).files || [];
    if (files.length > 1) throw new Error('PASSPORT_DRIVE_DUPLICATE');
    if (files.length && files[0].mimeType !== 'application/pdf') throw new Error('DRIVE_PDF_MIME_TYPE_INVALID');
    var file = files.length
      ? Drive.Files.update({name:name},files[0].id,blob,{fields:'id,size,webViewLink',supportsAllDrives:true})
      : Drive.Files.create({name:name,mimeType:'application/pdf',parents:[targetFolderId],appProperties:{segPassportKey:key}},blob,{fields:'id,size,webViewLink',supportsAllDrives:true});
    return {ok:true,fileId:file.id,size:Number(file.size),url:file.webViewLink || 'https://drive.google.com/file/d/'+file.id+'/view',parentFolderId:targetFolderId};
  } finally {lock.releaseLock();}
}
