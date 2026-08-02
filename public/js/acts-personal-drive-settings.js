(function setupPersonalDriveSettings(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  const workspaceId = () => window.WorkspaceApiClient?.workspaceId() || '';
  const path = () => `/api/workspaces/${encodeURIComponent(workspaceId())}/documents/personal-drive`;
  const api = (url, options = {}) => window.WorkspaceApiClient.request(url, options);
  function markup(canConfigure){
    return `<section id="personalDriveSettingsPanel" class="final-documents-card" aria-live="polite">
      <div class="final-documents-title-row"><div class="final-documents-title">Bepul Personal Drive ulanishi</div><div id="personalDriveConfigured" class="final-documents-object">Tekshirilmoqda...</div></div>
      ${canConfigure ? `<div class="final-documents-row"><label>Apps Script /exec URL<input id="personalDriveAppsScriptUrl" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec"></label></div>
      <div class="final-documents-row"><label>Webhook secret (kamida 32 belgi)<input id="personalDriveSecret" type="password" autocomplete="new-password" placeholder="Saqlangan secret qayta ko‘rsatilmaydi"></label><div class="final-documents-actions"><button id="savePersonalDriveBtn" class="btn primary" type="button">Ulash</button><button id="clearPersonalDriveBtn" class="btn ghost" type="button">Uzish</button></div></div>` : '<div class="note">Drive ulanishini faqat workspace owner yoki administrator sozlaydi.</div>'}
      <div id="personalDriveMessage" class="msg">Har bir workspace o‘z Google akkaunti va papkasidan foydalanadi.</div></section>`;
  }
  function message(text, cls = ''){ const el=$('personalDriveMessage'); if(el) el.innerHTML=`<span class="${cls}">${String(text||'')}</span>`; }
  async function loadStatus(){
    const result=(await api(path(),{method:'GET'})).result||{};
    if($('personalDriveConfigured')) $('personalDriveConfigured').textContent=result.configured?'✅ Ulangan':'Ulanmagan';
    if($('personalDriveAppsScriptUrl')&&document.activeElement!==$('personalDriveAppsScriptUrl')) $('personalDriveAppsScriptUrl').value=result.appsScriptUrl||'';
    message(result.configured?'Secret shifrlangan. PDF shu workspace Drive’iga yuboriladi.':'Apps Script URL va unga mos secretni kiriting.',result.configured?'ok':'sync');
  }
  async function save(){
    const appsScriptUrl=$('personalDriveAppsScriptUrl')?.value.trim()||'', secret=$('personalDriveSecret')?.value||'';
    if(!appsScriptUrl||secret.length<32)return message('To‘g‘ri /exec URL va kamida 32 belgili secret kiriting.','bad');
    try{message('Ulanish saqlanmoqda...','sync');await api(path(),{method:'PUT',body:JSON.stringify({appsScriptUrl,secret})});$('personalDriveSecret').value='';await loadStatus();}catch(error){message(error.message,'bad');}
  }
  async function clear(){
    if(!confirm('Bu workspace Personal Drive ulanishini uzishni tasdiqlaysizmi?'))return;
    try{await api(path(),{method:'PUT',body:JSON.stringify({appsScriptUrl:'',secret:''})});await loadStatus();}catch(error){message(error.message,'bad');}
  }
  async function mount(){
    const host=$('finalDocumentsFolderPanel');if(!host||$('personalDriveSettingsPanel')||!workspaceId())return;
    try{const workspace=(await api(`/api/workspaces/${encodeURIComponent(workspaceId())}`,{method:'GET'})).workspace||{};const canConfigure=['owner','administrator'].includes(String(workspace.memberRole||'').toLowerCase());host.insertAdjacentHTML('afterend',markup(canConfigure));$('savePersonalDriveBtn')?.addEventListener('click',save);$('clearPersonalDriveBtn')?.addEventListener('click',clear);await loadStatus();}catch(error){console.warn('[personal-drive-settings]',error.message);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  window.addEventListener('seg-kip:workspace-change',()=>{$('personalDriveSettingsPanel')?.remove();setTimeout(mount,0);});
})();
