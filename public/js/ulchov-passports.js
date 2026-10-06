(function installUlchovPassports(){
  'use strict';
  if(window.UlchovPassports)return;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const workspaceId=()=>window.WorkspaceApiClient?.workspaceId()||'';
  const tracked=new Map(), summaries=new Map();
  let selection=null, folderContext=null, pollTimer=null, polling=false, uploading=false;
  async function api(path,options={},expected=workspaceId()){
    if(!expected)throw new Error('Avval Workspace tanlang.');
    const result=await window.WorkspaceApiClient.request(path,{...options,headers:{...options.headers,'x-workspace-id':expected}});
    if(expected!==workspaceId())throw Object.assign(new Error('Workspace almashtirildi.'),{stale:true});
    return result;
  }
  const passportPath=key=>`/api/ulchov/passports/${encodeURIComponent(key)}`;
  const connectionPath=wid=>`/api/workspaces/${encodeURIComponent(wid)}/documents/personal-drive`;
  function message(id,text,tone=''){const el=$(id);if(el){el.className=`passport-message ${tone}`;el.textContent=text;}}
  function statusText(passport){
    if(!passport)return 'Pasport hali yuklanmagan';
    if(passport.status==='completed')return `Pasport yangilandi — ${passport.pageCount} sahifa · v${passport.publishedVersion}`;
    if(passport.status==='failed_permanent')return `PDF yangilanmadi: ${passport.error || 'Qayta urinish kerak'}`;
    if(passport.status==='failed_retryable')return `Qayta urinish kutilmoqda... ${passport.error || ''}`;
    return 'PDF birlashtirilmoqda...';
  }
  function updateCard(key,passport){
    summaries.set(key,passport);
    for(const card of document.querySelectorAll('[data-passport-key]')){
      if(card.dataset.passportKey!==key)continue;
      const status=card.querySelector('.passport-card-status');if(status)status.textContent=statusText(passport);
      const upload=card.querySelector('[data-passport-upload]');if(upload)upload.disabled=folderContext?.canUpload===false || !key;
    }
    const instrument=window.UlchovSheets?.state?.instruments.find(item=>item.passportKey===key);
    if(instrument)instrument.passport=passport;
  }
  function track(key,passport){
    if(passport && !['completed','failed_permanent'].includes(passport.status))tracked.set(key,workspaceId());
    else tracked.delete(key);
    if(tracked.size && !pollTimer)pollTimer=setTimeout(poll,2500);
  }
  function onCardsRendered(data){
    for(const item of data){updateCard(item.passportKey,item.passport || summaries.get(item.passportKey) || null);track(item.passportKey,item.passport);}
  }
  function showDetails(data){
    const passport=data.passport;
    message('passportUploadStatus',statusText(passport),passport?.status==='failed_permanent'?'bad':passport?.status==='completed'?'ok':'');
    const hasDocs=data.documents.length>0;
    $('passportUploadHelp').textContent=hasDocs?'Yangi PDF sahifalari mavjud pasport oxiriga qo‘shiladi. Asl fayllar saqlanadi.':'Birinchi marta mavjud asosiy pasport PDFni yuklang. Keyingi hujjatlar uning oxiriga qo‘shiladi.';
    $('passportHistory').innerHTML=data.documents.length?`<ol>${data.documents.map(doc=>`<li>${esc(doc.filename)} — ${doc.page_count} sahifa<small>${esc(new Date(doc.created_at).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'}))}${doc.sequence===1?' · Asosiy pasport':''}</small></li>`).join('')}</ol>`:'Hujjatlar hali yo‘q.';
    $('passportSubmit').disabled=uploading || !data.canUpload;
    $('passportFile').disabled=uploading || !data.canUpload;
    $('passportRetry').hidden=!data.canUpload || !['failed_retryable','failed_permanent'].includes(passport?.status);
    $('passportPreview').disabled=!passport?.publishedVersion;
    if(!data.canUpload)$('passportUploadHelp').textContent='Siz pasport va tarixni ko‘rishingiz mumkin. PDF yuklash uchun operator yoki administrator roli kerak.';
  }
  async function poll(){
    pollTimer=null;if(polling)return;
    polling=true;
    try{
      for(const [key,wid] of Array.from(tracked)){
        if(wid!==workspaceId()){tracked.delete(key);continue;}
        try{
          const data=await api(passportPath(key),{},wid);
          updateCard(key,data.passport);track(key,data.passport);
          if(selection?.key===key && selection.wid===wid && $('passportUploadModal').classList.contains('open'))showDetails(data);
        }catch(error){if(error.stale)tracked.delete(key);else {tracked.delete(key);if(selection?.key===key)message('passportUploadStatus',error.message,'bad');}}
      }
    }finally{polling=false;if(tracked.size&&!pollTimer)pollTimer=setTimeout(poll,3000);}
  }
  async function openUpload(key){
    if(uploading)return;
    const instrument=window.UlchovSheets?.state?.instruments.find(item=>item.passportKey===key);
    if(!instrument)return;
    const selected={key,wid:workspaceId(),sheetName:window.UlchovSheets.state.loadedSheet};selection=selected;
    $('passportUploadTitle').textContent=`${instrument.name} · ${instrument.serial || instrument.pos}`;
    $('passportFile').value='';$('passportHistory').textContent='';$('passportSubmit').disabled=true;$('passportPreview').disabled=true;$('passportRetry').hidden=true;
    $('passportUploadModal').classList.add('open');
    message('passportUploadStatus','Hujjatlar tarixi yuklanmoqda...');
    try{
      const data=await api(passportPath(key),{},selected.wid);
      if(selection!==selected)return;
      showDetails(data);updateCard(key,data.passport);track(key,data.passport);
    }catch(error){if(!error.stale && selection===selected)message('passportUploadStatus',error.message,'bad');}
  }
  async function upload(){
    if(uploading || !selection)return;
    const selected=selection,file=$('passportFile').files[0];
    if(!file)return message('passportUploadStatus','PDF fayl tanlang.','bad');
    if(file.size>15*1024*1024 || !/\.pdf$/i.test(file.name))return message('passportUploadStatus','15 MBgacha bo‘lgan PDF tanlang.','bad');
    const body=new FormData();body.append('file',file);body.append('sheetName',selected.sheetName);
    uploading=true;$('passportSubmit').disabled=true;$('passportFile').disabled=true;
    message('passportUploadStatus','PDF yuklanmoqda va birlashtirish navbatiga qo‘yilmoqda...');
    try{
      const result=await api(`${passportPath(selected.key)}/documents`,{method:'POST',body},selected.wid);
      const data=await api(passportPath(selected.key),{},selected.wid);
      updateCard(selected.key,data.passport);track(selected.key,data.passport);
      if(selection!==selected)return;
      uploading=false;showDetails(data);$('passportFile').value='';
      if(result.duplicate)message('passportUploadStatus','Bu PDF avval yuklangan. Sahifalar takroran qo‘shilmadi.','ok');
    }catch(error){if(!error.stale && selection===selected)message('passportUploadStatus',error.message,'bad');}
    finally{uploading=false;if(selection===selected){$('passportSubmit').disabled=false;$('passportFile').disabled=false;}}
  }
  async function preview(key){
    const wid=workspaceId(),popup=window.open('about:blank','_blank');
    if(popup)popup.opener=null;
    try{
      const data=await api(passportPath(key),{},wid);
      if(!data.passport?.publishedVersion){popup?.close();return openUpload(key);}
      const response=await fetch(`${passportPath(key)}/pdf`,{headers:{Authorization:`Bearer ${window.WorkspaceApiClient.token()}`,'x-workspace-id':wid},credentials:'include'});
      if(!response.ok)throw new Error('Pasport ochilmadi. Qayta login qiling yoki sahifani yangilang.');
      const blob=await response.blob();if(wid!==workspaceId()){popup?.close();return;}
      const url=URL.createObjectURL(blob);
      if(popup)popup.location.href=url;else {const link=document.createElement('a');link.href=url;link.download='pasport.pdf';link.click();}
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){popup?.close();if(!error.stale){await openUpload(key);message('passportUploadStatus',error.message,'bad');}}
  }
  async function retry(){
    const selected=selection;if(!selected)return;
    $('passportRetry').disabled=true;
    try{await api(`${passportPath(selected.key)}/retry`,{method:'POST'},selected.wid);const data=await api(passportPath(selected.key),{},selected.wid);if(selection!==selected)return;showDetails(data);track(selected.key,data.passport);updateCard(selected.key,data.passport);}
    catch(error){if(!error.stale && selection===selected)message('passportUploadStatus',error.message,'bad');}
    finally{$('passportRetry').disabled=false;}
  }
  async function openFolder(){
    const wid=workspaceId();$('passportFolderModal').classList.add('open');
    message('passportFolderStatus','Papka ma’lumoti yuklanmoqda...');
    $('passportSaveFolder').disabled=true;$('passportTestFolder').disabled=true;$('passportSaveConnection').disabled=true;
    try{
      const context=await api('/api/ulchov/final-folder',{},wid);folderContext=context;
      $('passportFolderInput').value=context.folderUrl;$('passportFolderInput').disabled=!context.canConfigure;
      $('passportSaveFolder').disabled=!context.canConfigure;$('passportTestFolder').disabled=!context.canConfigure;
      $('passportSaveConnection').disabled=!context.canConfigure;$('passportConnectionUrl').disabled=!context.canConfigure;$('passportConnectionSecret').disabled=!context.canConfigure;
      $('passportFolderLink').hidden=!context.folderUrl;$('passportFolderLink').href=context.folderUrl;
      message('passportFolderStatus',context.folderId?`Papka saqlangan${context.inherited?' · Workspace papkasidan olinadi':''}. “Tekshirish”ni bosing.`:'Yakuniy pasportlar uchun Google Drive papka URL yoki ID kiriting.');
      const connection=await api(connectionPath(wid),{},wid);
      $('passportConnectionUrl').value=connection.result?.appsScriptUrl || '';
      $('passportConnectionSecret').value='';
      message('passportConnectionStatus',connection.result?.configured?'Personal Drive ulangan. Yozuvni “Tekshirish” bilan tasdiqlang.':'Shared Drive uchun bu ulanish talab qilinmaydi.');
      for(const [key,summary] of summaries)updateCard(key,summary);
    }catch(error){if(!error.stale)message('passportFolderStatus',error.message,'bad');}
  }
  async function saveFolder(){
    const button=$('passportSaveFolder');button.disabled=true;
    try{
      message('passportFolderStatus','Papka saqlanmoqda...');
      await api('/api/ulchov/final-folder',{method:'PUT',body:JSON.stringify({folderUrl:$('passportFolderInput').value.trim()})});
      await openFolder();message('passportFolderStatus','Papka saqlandi. “Tekshirish” tugmasini bosing.','ok');
    }catch(error){if(!error.stale)message('passportFolderStatus',error.message,'bad');}
    finally{button.disabled=!folderContext?.canConfigure;}
  }
  async function testFolder(){
    const button=$('passportTestFolder');button.disabled=true;
    try{message('passportFolderStatus','Drive yozuvi tekshirilmoqda...');const data=await api('/api/ulchov/final-folder/test',{method:'POST'});message('passportFolderStatus',`Papka tayyor: ${data.result.folderName || data.result.folderId}.`,'ok');}
    catch(error){if(!error.stale)message('passportFolderStatus',error.message,'bad');}
    finally{button.disabled=!folderContext?.canConfigure;}
  }
  async function saveConnection(){
    const wid=workspaceId(),button=$('passportSaveConnection');button.disabled=true;
    try{message('passportConnectionStatus','Ulanish saqlanmoqda...');await api(connectionPath(wid),{method:'PUT',body:JSON.stringify({appsScriptUrl:$('passportConnectionUrl').value.trim(),secret:$('passportConnectionSecret').value})},wid);$('passportConnectionSecret').value='';message('passportConnectionStatus','Ulanish saqlandi. “Tekshirish” tugmasini bosing.','ok');}
    catch(error){if(!error.stale)message('passportConnectionStatus',error.message,'bad');}
    finally{button.disabled=!folderContext?.canConfigure;}
  }
  function reset(){
    selection=null;folderContext=null;tracked.clear();summaries.clear();clearTimeout(pollTimer);pollTimer=null;
    $('passportUploadModal')?.classList.remove('open');$('passportFolderModal')?.classList.remove('open');
    if($('passportFile'))$('passportFile').value='';if($('passportConnectionSecret'))$('passportConnectionSecret').value='';
  }
  function boot(){
    const toolbar=document.createElement('div');toolbar.id='ulchovPassportToolbar';
    toolbar.innerHTML='<button class="passport-settings-button" id="passportFinalDocumentsButton" type="button">6. ЯКУНИЙ ҲУЖЖАТЛАР</button>';
    const existingToolbar=$('ulchovToolbar'),header=document.querySelector('.header');
    if(existingToolbar){existingToolbar.prepend(toolbar.firstElementChild);existingToolbar.style.gap='10px';existingToolbar.style.flexWrap='wrap';}
    else if(header)header.after(toolbar);else document.body.prepend(toolbar);
    const container=document.createElement('div');container.innerHTML=`
      <div class="passport-overlay" id="passportUploadModal"><section class="passport-dialog" role="dialog" aria-modal="true" aria-labelledby="passportUploadTitle"><div class="passport-dialog-head"><h2 id="passportUploadTitle">Asbob pasporti</h2><button class="passport-close" data-passport-close="passportUploadModal" aria-label="Yopish">×</button></div><p id="passportUploadHelp"></p><label>PDF fayl · 15 MBgacha<input id="passportFile" type="file" accept="application/pdf,.pdf"></label><div class="passport-actions"><button class="passport-action primary" id="passportSubmit">PDF yuklash</button><button class="passport-action" id="passportPreview">Pasportni ko‘rish</button><button class="passport-action" id="passportRetry" hidden>Qayta urinish</button></div><div class="passport-message" id="passportUploadStatus" aria-live="polite"></div><div class="passport-history"><strong>Yuklangan hujjatlar</strong><div id="passportHistory"></div></div></section></div>
      <div class="passport-overlay" id="passportFolderModal"><section class="passport-dialog" role="dialog" aria-modal="true" aria-labelledby="passportFolderTitle"><div class="passport-dialog-head"><h2 id="passportFolderTitle">6. ЯКУНИЙ ҲУЖЖАТЛАР</h2><button class="passport-close" data-passport-close="passportFolderModal" aria-label="Yopish">×</button></div><p>Yagona pasport PDFlar shu papka ichidagi PASPORTLAR bo‘limiga saqlanadi.</p><label>Google Drive papka URL yoki ID<input id="passportFolderInput" placeholder="https://drive.google.com/drive/folders/..."></label><div class="passport-actions"><button class="passport-action primary" id="passportSaveFolder">Saqlash</button><button class="passport-action" id="passportTestFolder">Tekshirish</button><a class="passport-action" id="passportFolderLink" target="_blank" rel="noopener noreferrer" hidden>Papkani ochish</a></div><div class="passport-message" id="passportFolderStatus" aria-live="polite"></div><details class="passport-provider"><summary>Personal Drive ulanishi</summary><p>Workspace uchun mavjud ulanish ishlatiladi. Bu sozlama ACT va TO uchun ham umumiy.</p><label>Apps Script /exec URL<input id="passportConnectionUrl" type="url"></label><label>Webhook secret<input id="passportConnectionSecret" type="password" autocomplete="new-password"></label><button class="passport-action" id="passportSaveConnection">Ulash</button><div class="passport-message" id="passportConnectionStatus"></div></details></section></div>`;
    document.body.append(container);
    $('passportFinalDocumentsButton').onclick=openFolder;$('passportSubmit').onclick=upload;$('passportPreview').onclick=()=>selection&&preview(selection.key);$('passportRetry').onclick=retry;
    $('passportSaveFolder').onclick=saveFolder;$('passportTestFolder').onclick=testFolder;$('passportSaveConnection').onclick=saveConnection;
    document.addEventListener('click',event=>{
      const close=event.target.closest('[data-passport-close]');if(close){if(!uploading)$(close.dataset.passportClose).classList.remove('open');return;}
      const button=event.target.closest('[data-passport-upload],[data-passport-view]');if(!button)return;
      const key=button.closest('[data-passport-key]')?.dataset.passportKey;if(!key)return;
      if(button.hasAttribute('data-passport-upload'))openUpload(key);else preview(key);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!uploading){$('passportUploadModal').classList.remove('open');$('passportFolderModal').classList.remove('open');}});
    window.addEventListener('message',event=>{if(event.source===parent && event.data?.type==='SEG_KIP_WORKSPACE_CHANGE')reset();});
    window.addEventListener('seg-kip:workspace-change',reset);
  }
  window.UlchovPassports={onCardsRendered,openFolder,openUpload};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
