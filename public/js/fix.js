function isDateRow(value){
  const text=String(value||'').trim();
  return text.includes('-//-')||text.includes('//')||/^\d{2}\.\d{2}\.\d{4}$/.test(text);
}

function isSanegLoginActive(){
  return Boolean(document.getElementById('sanegLoginGate'))||document.body?.classList?.contains('saneg-login-active');
}

(function setupCompactAiWidget(){
  if(document.getElementById('segAiCompactWidgetStyle'))return;
  const style=document.createElement('style');
  style.id='segAiCompactWidgetStyle';
  style.textContent='.seg-ai-label,.seg-ai-status,.seg-floating-ai .seg-ai-status{display:none!important}.seg-floating-ai{width:62px!important;height:62px!important;right:18px!important;bottom:18px!important;border-radius:20px!important;padding:3px!important;z-index:10020!important;background:linear-gradient(135deg,rgba(34,211,238,.95),rgba(16,185,129,.92))!important;box-shadow:0 0 18px rgba(34,211,238,.46),0 10px 24px rgba(0,0,0,.42)!important}.seg-floating-ai-inner{border-radius:17px!important}.seg-floating-ai-inner img{object-fit:cover!important;object-position:center top!important}.seg-ai-panel{right:22px!important;bottom:92px!important;width:390px!important;max-width:calc(100vw - 28px)!important;z-index:10010!important}.seg-ai-panel-head{position:relative;padding-right:54px!important}.seg-ai-close{position:absolute;right:14px;top:14px;width:32px;height:32px;border:1px solid rgba(34,211,238,.32);border-radius:12px;background:rgba(2,8,23,.62);color:#eaffff;font-size:18px;cursor:pointer}@media(max-width:680px){.seg-floating-ai{width:56px!important;height:56px!important;right:14px!important;bottom:14px!important}.seg-ai-panel{right:12px!important;bottom:82px!important;width:calc(100vw - 24px)!important}}';
  document.head.appendChild(style);
  function installClose(){
    const panel=document.getElementById('segAiPanel');
    const head=panel?.querySelector('.seg-ai-panel-head');
    if(!panel||!head||head.querySelector('.seg-ai-close'))return;
    const button=document.createElement('button');
    button.type='button';button.className='seg-ai-close';button.textContent='×';button.setAttribute('aria-label','AI oynasini yopish');
    button.onclick=(event)=>{event.stopPropagation();panel.classList.remove('open')};
    head.appendChild(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installClose);else installClose();
})();

(function applySanegplatformBranding(){
  const BRAND='Sanegplatform';
  const RE=/SEG KIP AI Platform|SEG KIP Platform|SEG KIP|KIP Digital Platform|KIP Digital Control System/g;
  const rename=(value)=>String(value||'').replace(RE,BRAND);
  function apply(){
    document.title=rename(document.title||BRAND);
    const logo=document.querySelector('.brand .logo');if(logo)logo.textContent='SANEG';
    const title=document.querySelector('.brand h1');if(title)title.textContent=BRAND;
    const subtitle=document.querySelector('.brand p');if(subtitle)subtitle.textContent='DIGITAL PLATFORM';
    document.querySelectorAll('.side-footer').forEach((node)=>{node.innerHTML='<b>СП ООО “SANOAT ENЕРГЕТИКА GURUHI”</b><br>ТПП “АНДИЖАН” · Sanegplatform'});
    document.querySelectorAll('.assistant-badge h3,.seg-ai-panel-head h3').forEach((node)=>{node.textContent='Sanegplatform Assistant'});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  window.setTimeout(apply,400);
})();

function appendFrameScript(doc,id,src){
  if(!doc||doc.getElementById(id))return;
  const script=doc.createElement('script');
  script.id=id;script.src=src;script.defer=true;doc.head.appendChild(script);
}

(function injectUlchovSheetsModule(){
  function inject(frame){
    try{
      if(isSanegLoginActive())return;
      const doc=frame.contentDocument||frame.contentWindow?.document;
      if(!doc)return;
      appendFrameScript(doc,'segUlchovSheetsScript','/js/ulchov-sheets.js?v=stage6f');
    }catch(_){}
  }
  function bind(){
    if(isSanegLoginActive())return;
    const frame=document.getElementById('claUlchovFrame');if(!frame)return;
    if(frame.dataset.ulchovSheetsBound!=='true'){frame.dataset.ulchovSheetsBound='true';frame.addEventListener('load',()=>inject(frame))}
    inject(frame);
  }
  function setup(){bind();const observer=new MutationObserver(()=>{if(!isSanegLoginActive())bind()});observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

(function injectActsWorkspaceModules(){
  function inject(frame){
    try{
      if(isSanegLoginActive())return;
      const doc=frame.contentDocument||frame.contentWindow?.document;
      const src=String(frame.getAttribute('src')||frame.contentWindow?.location?.pathname||'');
      if(!doc||!src.includes('acts'))return;
      appendFrameScript(doc,'segActsWorkspaceSignersScript','/js/acts-workspace-signers.js?v=stage7f');
      appendFrameScript(doc,'segActsWorkspaceDocumentsScript','/js/acts-workspace-documents.js?v=stage8f');
    }catch(_){}
  }
  function bind(){
    if(isSanegLoginActive())return;
    const frame=document.getElementById('genericModuleFrame');if(!frame)return;
    if(frame.dataset.actsWorkspaceModulesBound!=='true'){frame.dataset.actsWorkspaceModulesBound='true';frame.addEventListener('load',()=>inject(frame))}
    inject(frame);
  }
  function setup(){bind();const observer=new MutationObserver(()=>{if(!isSanegLoginActive())bind()});observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

(function loadSupportScripts(){
  const scripts=[
    ['segReliableAiRendererScript','/js/ai-response-render-fix.js?v=stage9e'],
    ['sanegLoginGateScript','/js/saneg-login-gate-manual.js?v=manual1'],
    ['sanegLoginBlankRightScript','/js/saneg-login-blank-right.js?v=media1c'],
    ['sanegLoginMediaConfigScript','/js/saneg-login-media-config.js?v=slides1b'],
  ];
  scripts.forEach(([id,src])=>{
    if(document.getElementById(id))return;
    const script=document.createElement('script');script.id=id;script.src=src;script.defer=true;document.head.appendChild(script);
  });
})();

(function injectSidebarExtras(){
  if(document.getElementById('sidebarExtrasStyle'))return;
  const style=document.createElement('style');
  style.id='sidebarExtrasStyle';
  style.textContent='.sidebar-extras{margin-top:12px;display:flex;flex-direction:column;gap:8px}.menu-item-settings{min-height:56px;display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.075);cursor:pointer;color:#e2e8f0}.logout-btn-sidebar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:18px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);cursor:pointer;color:#fca5a5;font-size:12px;font-weight:700;width:100%}';
  document.head.appendChild(style);
  function inject(){
    if(isSanegLoginActive()||document.getElementById('sidebarExtrasBlock'))return;
    const nav=document.querySelector('.sidebar nav.menu');if(!nav)return;
    const block=document.createElement('div');block.id='sidebarExtrasBlock';block.className='sidebar-extras';
    block.innerHTML='<div class="menu-item-settings" onclick="window.openWorkspaceSettings?.()"><div class="menu-icon">⚙️</div><div><div class="menu-title">9. WORKSPACE SETTINGS</div><div class="empty-note">Sheet, JSON va obyekt</div></div></div><button class="logout-btn-sidebar" onclick="appLogout()"><span style="font-size:16px">⏻</span> Выйти из системы</button>';
    nav.after(block);
  }
  function setup(){inject();const observer=new MutationObserver(()=>{if(!isSanegLoginActive())inject()});observer.observe(document.body,{childList:true,subtree:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();

async function appLogout(){
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'include'})}catch(_){}
  sessionStorage.removeItem('seg_kip_workspace_access_token');
  // selected Workspace ID and all server-side settings intentionally remain.
  location.reload();
}
