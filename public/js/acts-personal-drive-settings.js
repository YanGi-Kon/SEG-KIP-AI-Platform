(function setupPersonalDriveSettings(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  let mountQueue = Promise.resolve();
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
    const ready=Boolean(result.configured&&result.ready);
    if($('personalDriveConfigured')) $('personalDriveConfigured').textContent=ready?'✅ Sozlangan':result.needsReconfiguration?'⚠ Qayta ulash kerak':'Ulanmagan';
    if($('personalDriveAppsScriptUrl')&&document.activeElement!==$('personalDriveAppsScriptUrl')) $('personalDriveAppsScriptUrl').value=result.appsScriptUrl||'';
    message(ready?'Secret o‘qildi. Drive yozuvini “Tekshirish” tugmasi orqali tasdiqlang.':result.needsReconfiguration?(result.recommendedFix||result.message||'Apps Script URL va webhook secretni qayta ulang.'):'Apps Script URL va unga mos secretni kiriting.',ready?'ok':result.needsReconfiguration?'bad':'sync');
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
  function removePanels(){document.querySelectorAll('[id="personalDriveSettingsPanel"]').forEach((panel)=>panel.remove());}
  async function mount(){
    const requestedWorkspaceId=workspaceId();
    const host=$('finalDocumentsFolderPanel');if(!host||!requestedWorkspaceId)return;
    try{const workspace=(await api(`/api/workspaces/${encodeURIComponent(requestedWorkspaceId)}`,{method:'GET'})).workspace||{};if(requestedWorkspaceId!==workspaceId())return;removePanels();const liveHost=$('finalDocumentsFolderPanel');if(!liveHost)return;const canConfigure=['owner','administrator'].includes(String(workspace.memberRole||'').toLowerCase());liveHost.insertAdjacentHTML('afterend',markup(canConfigure));$('savePersonalDriveBtn')?.addEventListener('click',save);$('clearPersonalDriveBtn')?.addEventListener('click',clear);await loadStatus();}catch(error){console.warn('[personal-drive-settings]',error.message);}
  }
  function queueMount(){mountQueue=mountQueue.catch(()=>{}).then(mount);return mountQueue;}
  function remount(){removePanels();queueMount();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueMount,{once:true});else queueMount();
  window.addEventListener('seg-kip:workspace-change',remount);
  window.addEventListener('message',(event)=>{if(event.data?.type==='SEG_KIP_WORKSPACE_CHANGE')remount();});
})();
