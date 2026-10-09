(function installUlchovPassports(){
  'use strict';
  if(window.UlchovPassports)return;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const workspaceId=()=>window.WorkspaceApiClient?.workspaceId()||'';
  const cp1252Reverse=new Map([
    ['€',0x80],['‚',0x82],['ƒ',0x83],['„',0x84],['…',0x85],['†',0x86],['‡',0x87],['ˆ',0x88],
    ['‰',0x89],['Š',0x8a],['‹',0x8b],['Œ',0x8c],['Ž',0x8e],['‘',0x91],['’',0x92],['“',0x93],
    ['”',0x94],['•',0x95],['–',0x96],['—',0x97],['˜',0x98],['™',0x99],['š',0x9a],['›',0x9b],
    ['œ',0x9c],['ž',0x9e],['Ÿ',0x9f],
  ]);
  function repairFilename(value){
    const raw=String(value??'');
    if(!/[ÃÂÐÑ]/.test(raw))return raw;
    try{
      const bytes=[];
      for(const char of Array.from(raw)){
        const point=char.codePointAt(0);
        if(point<=255)bytes.push(point);
        else if(cp1252Reverse.has(char))bytes.push(cp1252Reverse.get(char));
        else return raw;
      }
      return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes))||raw;
    }catch(_){return raw;}
  }
  function passportFailureMessage(passport){
    const code=String(passport?.errorCode||'');
    if(code==='WORKSPACE_SECRET_DECRYPT_FAILED'||code==='WORKSPACE_SECRET_INVALID'){
      return 'Personal Drive webhook secretini server ocholmadi. 6. YAKUNIY HUJJATLAR → Personal Drive ulanishida Apps Script URL va webhook secretni qayta saqlang, so‘ng “Qayta urinish”ni bosing.';
    }
    if(code==='WORKSPACE_ENCRYPTION_KEY_REQUIRED'){
      return 'Serverda WORKSPACE_ENCRYPTION_KEY sozlanmagan. Kamida 32 belgili barqaror kalitni sozlang, serverni qayta ishga tushiring va Personal Drive ulanishini qayta saqlang.';
    }
    if(code==='PASSPORT_APPS_SCRIPT_UPDATE_REQUIRED'){
      return 'Apps Script eskirgan. Passport.gs ni qo‘shing va /exec deploymentni yangi versiya bilan yangilang.';
    }
    if(code==='PASSPORT_ADVANCED_DRIVE_REQUIRED'){
      return 'Apps Script loyihasida Drive API v3 xizmatini yoqing va /exec deploymentni qayta deploy qiling.';
    }
    return passport?.error||'Qayta urinish kerak';
  }
  const tracked=new Map(), summaries=new Map();
  let selection=null, folderContext=null, pollTimer=null, polling=false, uploading=false;

  const candidates=[], chosen=[], previewUrls=new Set();
  let importing=false, galleryEpoch=0, galleryNextId=0, canUpload=false, historySignature='', savedDocuments=[];
  function objectUrl(blob){const url=URL.createObjectURL(blob);previewUrls.add(url);return url;}
  function clearGallery(){galleryEpoch++;candidates.length=0;chosen.length=0;historySignature='';savedDocuments=[];for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls.clear();$('passportMediaViewer')?.replaceChildren();renderGallery();}
  function renderGallery(){
    const el=$('passportSelectedFiles');if(!el)return;
    $('passportSelectionCount').textContent=chosen.length+' ta sahifa tanlandi';
    el.innerHTML=candidates.map((item,index)=>{
      const order=chosen.indexOf(item.id),disabled=uploading||importing||!canUpload;
      return '<article class="passport-media-card '+(order>=0?'selected':'')+'"><button type="button" class="passport-media-select" data-gallery-toggle="'+index+'" aria-pressed="'+(order>=0)+'" '+(disabled?'disabled':'')+' aria-label="'+esc(item.file.name)+' · '+(item.pageIndex+1)+'-sahifani tanlash">'+(item.image?'<img loading="lazy" src="'+item.url+'" alt="'+esc(item.file.name)+'">':'<span class="passport-pdf-icon">PDF<br>'+(item.pageIndex+1)+'-sahifa</span>')+'<span class="passport-selection-badge">'+(order>=0?order+1:'○')+'</span></button><small>'+esc(item.file.name)+(item.image?'':' · '+(item.pageIndex+1)+'-sahifa')+'</small><div class="passport-media-tools"><button type="button" data-gallery-view="'+index+'">Ko‘rish</button>'+(order>=0?'<button type="button" data-gallery-move="'+index+'" data-offset="-1" aria-label="Oldinga surish" '+(disabled||order===0?'disabled':'')+'>←</button><button type="button" data-gallery-move="'+index+'" data-offset="1" aria-label="Keyinga surish" '+(disabled||order===chosen.length-1?'disabled':'')+'>→</button><button type="button" data-gallery-first="'+index+'" '+(disabled||order===0?'disabled':'')+'>Birinchi</button>':'')+'</div></article>';
    }).join('');
    $('passportSubmit').disabled=uploading||importing||!canUpload;
    $('passportFile').disabled=uploading||importing||!canUpload;
    for(const id of ['passportChooseFiles','passportSelectAll','passportSelectNone'])$(id).disabled=uploading||importing||!canUpload;
  }
  async function importFiles(){
    const files=Array.from($('passportFile').files),epoch=galleryEpoch;
    $('passportFile').value='';if(!files.length)return;
    if(candidates.filter((item,i,array)=>array.findIndex(x=>x.file===item.file)===i).length+files.length>20)return message('passportUploadStatus','20 tagacha JPG yoki PDF qo‘shing.','bad');
    importing=true;renderGallery();
    try{
      for(const file of files){
        if(!/\.(pdf|jpe?g)$/i.test(file.name)||file.size>15*1024*1024||!file.size)throw new Error('Har bir fayl JPG yoki PDF, 15 MBgacha bo‘lsin.');
        if(candidates.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;
        let count=1;
        if(/\.pdf$/i.test(file.name)){
          if(!window.PDFLib)throw new Error('PDF vositasi yuklanmadi. Sahifani yangilang.');
          const pdf=await window.PDFLib.PDFDocument.load(await file.arrayBuffer());count=pdf.getPageCount();
        }
        if(epoch!==galleryEpoch)return;
        if(!count||candidates.length+count>500)throw new Error('Galereya 500 sahifadan oshmasin.');
        const url=objectUrl(file),image=/\.jpe?g$/i.test(file.name);
        for(let pageIndex=0;pageIndex<count;pageIndex++){
          const item={id:galleryEpoch+':'+galleryNextId++,file,pageIndex,url,image};candidates.push(item);chosen.push(item.id);
        }
      }
      message('passportUploadStatus','Raqamlar PDF tartibini bildiradi. Belgini bosib sahifani tanlang yoki bekor qiling.');
    }catch(error){if(epoch===galleryEpoch)message('passportUploadStatus',error.message||'Fayl ochilmadi.','bad');}
    finally{if(epoch===galleryEpoch){importing=false;renderGallery();}}
  }
  function showMedia(url,image,title,page=1){
    const viewer=$('passportMediaViewer');viewer.hidden=false;
    viewer.innerHTML='<div class="passport-dialog-head"><strong>'+esc(title)+'</strong><button class="passport-close" type="button" id="passportCloseMedia" aria-label="Ko‘rishni yopish">×</button></div>'+(image?'<img src="'+url+'" alt="'+esc(title)+'">':'<iframe title="'+esc(title)+'" src="'+url+'#page='+page+'&view=FitH"></iframe><a class="passport-action" href="'+url+'#page='+page+'" target="_blank" rel="noopener">Katta oynada ochish</a>');
    $('passportCloseMedia').onclick=()=>{viewer.hidden=true;viewer.replaceChildren();};
    viewer.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  async function viewSaved(index){
    const doc=savedDocuments[index],selected=selection;if(!doc||!selected)return;
    const button=$('passportHistory').querySelector('[data-saved-view="'+index+'"]');if(button)button.disabled=true;
    try{
      if(!doc.previewUrl){
        const response=await window.WorkspaceApiClient.request(passportPath(selected.key)+'/documents/'+encodeURIComponent(doc.id)+'/pdf',{headers:{'x-workspace-id':selected.wid},rawResponse:true});
        if(selection!==selected||selected.wid!==workspaceId())return;
        const blob=await response.blob();if(selection!==selected||selected.wid!==workspaceId())return;
        doc.previewUrl=objectUrl(blob);
      }
      showMedia(doc.previewUrl,false,repairFilename(doc.filename));
    }catch(error){if(selection===selected)message('passportUploadStatus',error.message||'Hujjat ochilmadi.','bad');}
    finally{if(button)button.disabled=false;}
  }

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
    if(passport.status==='failed_permanent')return `PDF yangilanmadi: ${passportFailureMessage(passport)}`;
    if(passport.status==='failed_retryable')return `Qayta urinish kutilmoqda... ${passportFailureMessage(passport)}`;
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
    $('passportUploadHelp').textContent=hasDocs?'Avval saqlangan sahifalar pastdagi tarixda ko‘rinadi. Yangi tanlangan sahifalar raqamlar tartibida pasport oxiriga qo‘shiladi.':'Surat yoki PDF qo‘shing. Sahifalarni belgilang: 1 — birinchi, 2 — keyingi sahifa. Belgilanmagan sahifalar saqlanmaydi.';
    canUpload=data.canUpload;
    const nextHistory=JSON.stringify(data.documents);
    if(historySignature!==nextHistory){historySignature=nextHistory;savedDocuments=data.documents;
    $('passportHistory').innerHTML=data.documents.length?`<ol>${data.documents.map(doc=>`<li>${esc(repairFilename(doc.filename))} — ${doc.page_count} sahifa<small>${esc(new Date(doc.created_at).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'}))}${doc.sequence===1?' · Asosiy pasport':''}</small><button class="passport-action" type="button" data-saved-view="${data.documents.indexOf(doc)}">Sahifalarni ko‘rish</button></li>`).join('')}</ol>`:'Hujjatlar hali yo‘q.';
    }
    $('passportSubmit').disabled=uploading || !data.canUpload;
    $('passportFile').disabled=uploading || !data.canUpload;
    $('passportRetry').hidden=!data.canUpload || !['failed_retryable','failed_permanent'].includes(passport?.status);
    $('passportPreview').disabled=!passport?.publishedVersion;
    if(!data.canUpload)$('passportUploadHelp').textContent='Siz pasport va tarixni ko‘rishingiz mumkin. PDF yuklash uchun operator yoki administrator roli kerak.';
    renderGallery();
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
        }catch(error){if(error.stale || [401,403,404].includes(error.status))tracked.delete(key);else if(selection?.key===key)message('passportUploadStatus','Aloqa vaqtincha uzildi. Pasport holati qayta tekshirilmoqda...');}
      }
    }finally{polling=false;if(tracked.size&&!pollTimer)pollTimer=setTimeout(poll,3000);}
  }
  async function openUpload(key,chooseFiles=false){
    if(uploading||importing)return;
    const instrument=window.UlchovSheets?.state?.instruments.find(item=>item.passportKey===key);
    if(!instrument)return;
    const selected={key,wid:workspaceId(),sheetName:window.UlchovSheets.state.loadedSheet};selection=selected;
    $('passportUploadTitle').textContent=`${instrument.name} · ${instrument.serial || instrument.pos}`;
    clearGallery();canUpload=false;importing=false;$('passportMediaViewer').hidden=true;
    $('passportFile').value='';$('passportSelectedFiles').textContent='';$('passportHistory').textContent='';$('passportSubmit').disabled=true;$('passportPreview').disabled=true;$('passportRetry').hidden=true;
    $('passportUploadModal').classList.add('open');
    if(chooseFiles){canUpload=true;$('passportFile').disabled=false;$('passportFile').click();}
    message('passportUploadStatus','Hujjatlar tarixi yuklanmoqda...');
    try{
      const data=await api(passportPath(key),{},selected.wid);
      if(selection!==selected)return;
      showDetails(data);updateCard(key,data.passport);track(key,data.passport);
    }catch(error){if(!error.stale && selection===selected)message('passportUploadStatus',error.message,'bad');}
  }
  async function upload(){
    if(uploading || importing || !selection)return;
    const selected=selection,items=chosen.map(id=>candidates.find(item=>item.id===id));
    const files=[...new Set(items.map(item=>item.file))];
    const pageOrder=items.map(item=>({fileIndex:files.indexOf(item.file),pageIndex:item.pageIndex}));
    if(!files.length)return message('passportUploadStatus','JPG yoki PDF fayllar tanlang.','bad');
    if(files.length>20 || files.some(file=>file.size>15*1024*1024 || !/\.(pdf|jpe?g)$/i.test(file.name)))return message('passportUploadStatus','20 tagacha JPG yoki PDF tanlang. Har biri 15 MBgacha bo‘lsin.','bad');
    if(files.reduce((sum,file)=>sum+file.size,0)>60*1024*1024)return message('passportUploadStatus','Fayllar jami 60 MBdan oshmasin.','bad');
    const body=new FormData();for(const file of files)body.append('file',file);body.append('sheetName',selected.sheetName);body.append('pageOrder',JSON.stringify(pageOrder));
    uploading=true;renderGallery();
    message('passportUploadStatus','PDF yuklanmoqda va birlashtirish navbatiga qo‘yilmoqda...');
    try{
      const result=await api(`${passportPath(selected.key)}/documents`,{method:'POST',body},selected.wid);
      const data=await api(passportPath(selected.key),{},selected.wid);
      updateCard(selected.key,data.passport);track(selected.key,data.passport);
      if(selection!==selected)return;
      uploading=false;for(const item of items){const i=chosen.indexOf(item.id);if(i>=0)chosen.splice(i,1);}
      for(let i=candidates.length-1;i>=0;i--)if(items.includes(candidates[i]))candidates.splice(i,1);
      showDetails(data);$('passportFile').value='';renderGallery();
      if(result.duplicate)message('passportUploadStatus','Bu PDF avval yuklangan. Sahifalar takroran qo‘shilmadi.','ok');
    }catch(error){if(!error.stale && selection===selected)message('passportUploadStatus',error.message,'bad');}
    finally{uploading=false;if(selection===selected)renderGallery();}
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
      const driveStatus=connection.result||{};
      if(driveStatus.needsReconfiguration){
        message('passportConnectionStatus',driveStatus.recommendedFix||driveStatus.message||'Personal Drive ulanishini qayta sozlang.','bad');
      }else if(driveStatus.configured&&driveStatus.ready){
        message('passportConnectionStatus','Personal Drive ulangan. Yozuvni “Tekshirish” bilan tasdiqlang.','ok');
      }else{
        message('passportConnectionStatus','Shared Drive uchun bu ulanish talab qilinmaydi.');
      }
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
    try{
      message('passportFolderStatus','Drive yozuvi tekshirilmoqda...');
      const data=await api('/api/ulchov/final-folder/test',{method:'POST'});
      const folderName=data.result.folderName || data.result.folderId;
      if(data.passportReady===false){
        const warning=data.passportWarning || 'Pasport PDF adapteri tayyor emas.';
        message('passportFolderStatus',`Papka yozuvi ishlaydi: ${folderName}. Pasport PDF uchun Apps Script yangilanishi kerak.`,'bad');
        message('passportConnectionStatus',data.passportRecommendedFix || warning,'bad');
      }else{
        message('passportFolderStatus',`Papka tayyor: ${folderName}.`,'ok');
      }
    }
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
    clearGallery();importing=false;canUpload=false;selection=null;folderContext=null;tracked.clear();summaries.clear();clearTimeout(pollTimer);pollTimer=null;
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
      <div class="passport-overlay" id="passportUploadModal"><section class="passport-dialog passport-gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="passportUploadTitle"><div class="passport-dialog-head"><h2 id="passportUploadTitle">Asbob pasporti</h2><button class="passport-close" data-passport-close="passportUploadModal" aria-label="Yopish">×</button></div><p id="passportUploadHelp"></p><p>JPG / PDF · har biri 15 MBgacha · jami 60 MB · 20 tagacha fayl</p><input id="passportFile" type="file" accept="image/jpeg,application/pdf,.jpg,.jpeg,.pdf" multiple hidden><div class="passport-actions"><button class="passport-action" id="passportChooseFiles" type="button">＋ Fayllar qo‘shish</button><button class="passport-action" id="passportSelectAll" type="button">Barchasini tanlash</button><button class="passport-action" id="passportSelectNone" type="button">Tanlovni bekor qilish</button></div><p id="passportSelectionCount" aria-live="polite">0 ta sahifa tanlandi</p><div id="passportSelectedFiles" class="passport-gallery"></div><div id="passportMediaViewer" class="passport-media-viewer" hidden></div><div class="passport-actions"><button class="passport-action primary" id="passportSubmit">Saqlash</button><button class="passport-action" id="passportPreview">Pasportni ko‘rish</button><button class="passport-action" id="passportRetry" hidden>Qayta urinish</button></div><div class="passport-message" id="passportUploadStatus" aria-live="polite"></div><div class="passport-history"><strong>Yuklangan hujjatlar</strong><div id="passportHistory"></div></div></section></div>
      <div class="passport-overlay" id="passportFolderModal"><section class="passport-dialog" role="dialog" aria-modal="true" aria-labelledby="passportFolderTitle"><div class="passport-dialog-head"><h2 id="passportFolderTitle">6. ЯКУНИЙ ҲУЖЖАТЛАР</h2><button class="passport-close" data-passport-close="passportFolderModal" aria-label="Yopish">×</button></div><p>Yagona pasport PDFlar shu papka ichidagi PASPORTLAR bo‘limiga saqlanadi.</p><label>Google Drive papka URL yoki ID<input id="passportFolderInput" placeholder="https://drive.google.com/drive/folders/..."></label><div class="passport-actions"><button class="passport-action primary" id="passportSaveFolder">Saqlash</button><button class="passport-action" id="passportTestFolder">Tekshirish</button><a class="passport-action" id="passportFolderLink" target="_blank" rel="noopener noreferrer" hidden>Papkani ochish</a></div><div class="passport-message" id="passportFolderStatus" aria-live="polite"></div><details class="passport-provider"><summary>Personal Drive ulanishi</summary><p>Workspace uchun mavjud ulanish ishlatiladi. Bu sozlama ACT va TO uchun ham umumiy.</p><label>Apps Script /exec URL<input id="passportConnectionUrl" type="url"></label><label>Webhook secret<input id="passportConnectionSecret" type="password" autocomplete="new-password"></label><button class="passport-action" id="passportSaveConnection">Ulash</button><div class="passport-message" id="passportConnectionStatus"></div></details></section></div>`;
    document.body.append(container);
    $('passportFile').onchange=importFiles;
    $('passportChooseFiles').onclick=()=>$('passportFile').click();
    $('passportSelectAll').onclick=()=>{for(const item of candidates)if(!chosen.includes(item.id))chosen.push(item.id);renderGallery();};
    $('passportSelectNone').onclick=()=>{chosen.length=0;renderGallery();};
    $('passportSelectedFiles').onclick=event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.galleryView!==undefined){const item=candidates[Number(button.dataset.galleryView)];if(item)showMedia(item.url,item.image,item.file.name,item.pageIndex+1);return;}
      if(uploading||importing||!canUpload)return;
      const index=Number(button.dataset.galleryToggle??button.dataset.galleryMove??button.dataset.galleryFirst),item=candidates[index];if(!item)return;
      const order=chosen.indexOf(item.id);
      if(button.dataset.galleryToggle!==undefined){if(order<0)chosen.push(item.id);else chosen.splice(order,1);}
      else if(order>=0){const next=button.dataset.galleryFirst!==undefined?0:order+Number(button.dataset.offset);if(next>=0&&next<chosen.length){chosen.splice(order,1);chosen.splice(next,0,item.id);}}
      renderGallery();
    };
    $('passportHistory').onclick=event=>{const button=event.target.closest('[data-saved-view]');if(button)viewSaved(Number(button.dataset.savedView));};
    $('passportFinalDocumentsButton').onclick=openFolder;$('passportSubmit').onclick=upload;$('passportPreview').onclick=()=>selection&&preview(selection.key);$('passportRetry').onclick=retry;
    $('passportSaveFolder').onclick=saveFolder;$('passportTestFolder').onclick=testFolder;$('passportSaveConnection').onclick=saveConnection;
    document.addEventListener('click',event=>{
      const close=event.target.closest('[data-passport-close]');if(close){if(!uploading&&!importing)$(close.dataset.passportClose).classList.remove('open');return;}
      const button=event.target.closest('[data-passport-upload],[data-passport-view]');if(!button)return;
      const key=button.closest('[data-passport-key]')?.dataset.passportKey;if(!key)return;
      if(button.hasAttribute('data-passport-upload'))openUpload(key,true);else preview(key);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!uploading&&!importing){$('passportUploadModal').classList.remove('open');$('passportFolderModal').classList.remove('open');}});
    window.addEventListener('message',event=>{if(event.source===parent && event.data?.type==='SEG_KIP_WORKSPACE_CHANGE')reset();});
    window.addEventListener('seg-kip:workspace-change',reset);
  }
  window.UlchovPassports={onCardsRendered,openFolder,openUpload};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
