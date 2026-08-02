function isDateRow(v){
  v=String(v||'').trim();
  return v.includes('-//-') || v.includes('//') || /^\d{2}\.\d{2}\.\d{4}$/.test(v);
}

function isSanegLoginActive(){
  return Boolean(document.getElementById('sanegLoginGate')) || document.body?.classList?.contains('saneg-login-active');
}

(function setupCompactAiWidget(){
  const css = `
    .seg-ai-label,.seg-ai-status,.seg-floating-ai .seg-ai-status{display:none !important;}
    .seg-floating-ai{width:62px !important;height:62px !important;right:18px !important;bottom:18px !important;border-radius:20px !important;padding:3px !important;z-index:10020 !important;background:linear-gradient(135deg,rgba(34,211,238,.95),rgba(16,185,129,.92)) !important;box-shadow:0 0 18px rgba(34,211,238,.46),0 10px 24px rgba(0,0,0,.42) !important;}
    .seg-floating-ai:hover{transform:translateY(-3px) scale(1.05) !important;box-shadow:0 0 28px rgba(34,211,238,.72),0 16px 34px rgba(0,0,0,.52) !important;}
    .seg-floating-ai-inner{border-radius:17px !important;}
    .seg-floating-ai-inner img{object-fit:cover !important;object-position:center top !important;}
    .seg-floating-ai::after{display:none !important;content:'' !important;}
    .seg-ai-panel{right:22px !important;bottom:92px !important;width:390px !important;max-width:calc(100vw - 28px) !important;z-index:10010 !important;}
    .seg-ai-panel-head{position:relative;padding-right:54px !important;}
    .seg-ai-close{position:absolute;right:14px;top:14px;width:32px;height:32px;border:1px solid rgba(34,211,238,.32);border-radius:12px;background:rgba(2,8,23,.62);color:#eaffff;font-size:18px;line-height:1;cursor:pointer;}
    .seg-ai-close:hover{background:rgba(34,211,238,.18);color:#67e8f9;}
    @media(max-width:680px){.seg-floating-ai{width:56px !important;height:56px !important;right:14px !important;bottom:14px !important;border-radius:18px !important;}.seg-floating-ai-inner{border-radius:15px !important;}.seg-ai-panel{right:12px !important;bottom:82px !important;width:calc(100vw - 24px) !important;}}
  `;
  function injectStyle(){
    if (document.getElementById('segAiCompactWidgetStyle')) return;
    const style = document.createElement('style');
    style.id = 'segAiCompactWidgetStyle';
    style.textContent = css;
    document.head.appendChild(style);
  }
  function installCloseButton(){
    const panel = document.getElementById('segAiPanel');
    const head = panel?.querySelector('.seg-ai-panel-head');
    if (!panel || !head || head.querySelector('.seg-ai-close')) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'seg-ai-close';
    close.setAttribute('aria-label', 'AI oynasini yopish');
    close.textContent = '×';
    close.addEventListener('click', (event) => { event.stopPropagation(); panel.classList.remove('open'); });
    head.appendChild(close);
  }
  function setup(){
    injectStyle();
    installCloseButton();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.getElementById('segAiPanel')?.classList.remove('open');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

(function applySanegplatformBranding(){
  const BRAND = 'Sanegplatform';
  const RE = /SEG KIP AI Platform|SEG KIP Platform|SEG KIP|KIP Digital Platform|KIP Digital Control System/g;
  const renameText = (value) => String(value || '').replace(RE, BRAND);
  const setText = (selector, text) => {
    const node = document.querySelector(selector);
    if (node && node.textContent !== text) node.textContent = text;
  };
  function setFooter(){
    const target = '<b>СП ООО “SANOAT ENЕРГЕТИКА GURUHI”</b><br>ТПП “АНДИЖАН” · Sanegplatform';
    document.querySelectorAll('.side-footer').forEach((node) => {
      if (node.innerHTML !== target) node.innerHTML = target;
    });
  }
  function applyBranding(){
    const nextTitle = renameText(document.title || BRAND);
    if (document.title !== nextTitle) document.title = nextTitle;
    setText('.brand .logo', 'SANEG');
    setText('.brand h1', BRAND);
    setText('.brand p', 'DIGITAL PLATFORM');
    const topTitle = document.querySelector('.topbar h2');
    if (topTitle) {
      const next = renameText(topTitle.textContent || BRAND);
      if (topTitle.textContent !== next) topTitle.textContent = next;
    }
    setFooter();
    document.querySelectorAll('.assistant-badge h3, .seg-ai-panel-head h3').forEach((node) => {
      if (node.textContent !== 'Sanegplatform Assistant') node.textContent = 'Sanegplatform Assistant';
    });
    document.querySelectorAll('.assistant-badge p, .seg-ai-panel-head p').forEach((node) => {
      if (node.textContent !== 'Industrial AI Engineer · Sanegplatform') node.textContent = 'Industrial AI Engineer · Sanegplatform';
    });
    document.querySelectorAll('[onclick]').forEach((node) => {
      const current = node.getAttribute('onclick') || '';
      const next = renameText(current);
      if (next !== current) node.setAttribute('onclick', next);
    });
  }
  function wrapTitleFunction(name){
    const original = window[name];
    if (typeof original !== 'function' || original.__sanegBrandWrapped) return;
    const wrapped = function(...args){
      if (typeof args[1] === 'string') args[1] = renameText(args[1]);
      const result = original.apply(this, args);
      setTimeout(applyBranding, 0);
      return result;
    };
    wrapped.__sanegBrandWrapped = true;
    window[name] = wrapped;
  }
  function setup(){
    applyBranding();
    ['setTopbar','openModulePage','openDashboard','openHomeDashboard','openUlchovVositalari'].forEach(wrapTitleFunction);
    setTimeout(applyBranding, 250);
    setTimeout(applyBranding, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once:true });
  else setup();
})();

(function injectUlchovSheetsModule(){
  function inject(frame){
    try {
      if (isSanegLoginActive()) return;
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc || doc.getElementById('segUlchovSheetsScript')) return;
      const script = doc.createElement('script');
      script.id = 'segUlchovSheetsScript';
      script.src = '/js/ulchov-sheets.js?v=stage6e';
      script.defer = true;
      doc.head.appendChild(script);
    } catch (_) {}
  }
  function bind(){
    if (isSanegLoginActive()) return;
    const frame = document.getElementById('claUlchovFrame');
    if (!frame) return;
    if (frame.dataset.ulchovSheetsBound !== 'true') {
      frame.dataset.ulchovSheetsBound = 'true';
      frame.addEventListener('load', () => inject(frame));
    }
    inject(frame);
  }
  function setup(){
    bind();
    const observer = new MutationObserver(() => { if (!isSanegLoginActive()) bind(); });
    observer.observe(document.body, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

(function injectActsWorkspaceModules(){
  function appendScript(doc, id, src){
    if (!doc || doc.getElementById(id)) return;
    const script = doc.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    doc.head.appendChild(script);
  }
  function inject(frame){
    try {
      if (isSanegLoginActive()) return;
      const doc = frame.contentDocument || frame.contentWindow?.document;
      const src = String(frame.getAttribute('src') || frame.contentWindow?.location?.pathname || '');
      if (!doc || !src.includes('acts')) return;
      appendScript(doc, 'segActsWorkspaceSignersScript', '/js/acts-workspace-signers.js?v=stage7e');
      appendScript(doc, 'segActsWorkspaceDocumentsScript', '/js/acts-workspace-documents.js?v=stage8e');
    } catch (_) {}
  }
  function bind(){
    if (isSanegLoginActive()) return;
    const frame = document.getElementById('genericModuleFrame');
    if (!frame) return;
    if (frame.dataset.actsWorkspaceModulesBound !== 'true') {
      frame.dataset.actsWorkspaceModulesBound = 'true';
      frame.addEventListener('load', () => inject(frame));
    }
    inject(frame);
  }
  function setup(){
    bind();
    const observer = new MutationObserver(() => { if (!isSanegLoginActive()) bind(); });
    observer.observe(document.body, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

(function loadReliableAiResponseRenderer(){
  if (document.getElementById('segReliableAiRendererScript')) return;
  const script = document.createElement('script');
  script.id = 'segReliableAiRendererScript';
  script.src = 'js/ai-response-render-fix.js?v=stage9d';
  script.defer = true;
  document.head.appendChild(script);
})();

(function loadStableSanegLoginGate(){
  document.querySelectorAll('#segEntryLoginScript,#sanegLoginGateScript').forEach((node) => node.remove());
  const script = document.createElement('script');
  script.id = 'sanegLoginGateScript';
  script.src = 'js/saneg-login-gate.js?v=stage1e';
  script.async = false;
  script.defer = true;
  document.head.appendChild(script);
})();

(function loadSanegLoginMediaStage(){
  if (document.getElementById('sanegLoginBlankRightScript')) return;
  const script = document.createElement('script');
  script.id = 'sanegLoginBlankRightScript';
  script.src = 'js/saneg-login-blank-right.js?v=media1b';
  script.async = false;
  script.defer = true;
  document.head.appendChild(script);
})();

(function loadSanegLoginMediaConfig(){
  if (document.getElementById('sanegLoginMediaConfigScript')) return;
  const script = document.createElement('script');
  script.id = 'sanegLoginMediaConfigScript';
  script.src = 'js/saneg-login-media-config.js?v=slides1a';
  script.async = false;
  script.defer = true;
  document.head.appendChild(script);
})();

(function injectSidebarExtras(){
  const CSS = `
    .sidebar-extras{margin-top:12px;display:flex;flex-direction:column;gap:8px;}
    .menu-item-settings{min-height:56px;display:flex;align-items:center;gap:14px;padding:12px 16px;
      border-radius:18px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.075);
      cursor:pointer;transition:all .22s;color:#e2e8f0;}
    .menu-item-settings:hover{background:rgba(34,211,238,.12);border-color:rgba(34,211,238,.35);}
    .menu-item-settings.active{background:rgba(34,211,238,.18);border-color:rgba(34,211,238,.55);box-shadow:0 0 18px rgba(34,211,238,.18);}
    .menu-item-settings .menu-icon{font-size:20px;flex-shrink:0;}
    .menu-item-settings .menu-title{font-size:11px;font-weight:700;letter-spacing:.5px;color:#eaffff;}
    .menu-item-settings .empty-note{font-size:10px;color:#64748b;margin-top:2px;}
    .logout-btn-sidebar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:18px;
      background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);cursor:pointer;
      color:#fca5a5;font-size:12px;font-weight:700;transition:all .22s;width:100%;text-align:left;}
    .logout-btn-sidebar:hover{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.5);color:#fecaca;}
  `;
  function injectStyle(){
    if (document.getElementById('sidebarExtrasStyle')) return;
    const s = document.createElement('style');
    s.id = 'sidebarExtrasStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function inject(){
    if (isSanegLoginActive()) return;
    if (document.getElementById('sidebarExtrasBlock')) return;
    const nav = document.querySelector('.sidebar nav.menu');
    if (!nav) return;
    const block = document.createElement('div');
    block.id = 'sidebarExtrasBlock';
    block.className = 'sidebar-extras';
    block.innerHTML = `
      <div class="menu-item-settings" onclick="openModulePage('settings','Настройки')">
        <div class="menu-icon">⚙️</div>
        <div><div class="menu-title">9. НАСТРОЙКИ</div><div class="empty-note">Язык и параметры</div></div>
      </div>
      <button class="logout-btn-sidebar" onclick="appLogout()">
        <span style="font-size:16px">⏻</span> Выйти из системы
      </button>
    `;
    nav.after(block);
  }
  function setup(){
    injectStyle();
    inject();
    const obs = new MutationObserver(() => { if (!isSanegLoginActive()) inject(); });
    obs.observe(document.body, { childList:true, subtree:true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();

async function appLogout(){
  try { await fetch('/api/auth/logout', { method:'POST', credentials:'include' }); } catch(_){}
  sessionStorage.removeItem('seg_kip_workspace_access_token');
  localStorage.removeItem('seg_kip_selected_workspace_id');
  location.reload();
}
