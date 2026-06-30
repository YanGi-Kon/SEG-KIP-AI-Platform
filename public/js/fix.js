function isDateRow(v){
  v=String(v||'').trim();
  return v.includes('-//-') || v.includes('//') || /^\d{2}\.\d{2}\.\d{4}$/.test(v);
}

(function setupCompactAiWidget(){
  const css = `
    .seg-ai-label{display:none !important;}
    .seg-floating-ai{
      width:62px !important;
      height:62px !important;
      right:18px !important;
      bottom:18px !important;
      border-radius:20px !important;
      padding:3px !important;
      z-index:10020 !important;
      background:linear-gradient(135deg,rgba(34,211,238,.95),rgba(16,185,129,.92)) !important;
      box-shadow:0 0 18px rgba(34,211,238,.46),0 10px 24px rgba(0,0,0,.42) !important;
    }
    .seg-floating-ai:hover{
      transform:translateY(-3px) scale(1.05) !important;
      box-shadow:0 0 28px rgba(34,211,238,.72),0 16px 34px rgba(0,0,0,.52) !important;
    }
    .seg-floating-ai-inner{border-radius:17px !important;}
    .seg-floating-ai-inner img{object-fit:cover !important; object-position:center top !important;}
    .seg-floating-ai::after{
      content:'AI';
      position:absolute;
      right:-4px;
      top:-7px;
      min-width:24px;
      height:18px;
      padding:0 5px;
      border-radius:999px;
      display:grid;
      place-items:center;
      font-size:10px;
      font-weight:900;
      color:#001018;
      background:#22d3ee;
      border:2px solid #03111f;
      box-shadow:0 0 12px rgba(34,211,238,.65);
    }
    .seg-ai-panel{
      right:22px !important;
      bottom:92px !important;
      width:390px !important;
      max-width:calc(100vw - 28px) !important;
      z-index:10010 !important;
    }
    .seg-ai-panel-head{position:relative; padding-right:54px !important;}
    .seg-ai-close{
      position:absolute;
      right:14px;
      top:14px;
      width:32px;
      height:32px;
      border:1px solid rgba(34,211,238,.32);
      border-radius:12px;
      background:rgba(2,8,23,.62);
      color:#eaffff;
      font-size:18px;
      line-height:1;
      cursor:pointer;
    }
    .seg-ai-close:hover{background:rgba(34,211,238,.18); color:#67e8f9;}
    @media(max-width:680px){
      .seg-floating-ai{width:56px !important;height:56px !important;right:14px !important;bottom:14px !important;border-radius:18px !important;}
      .seg-floating-ai-inner{border-radius:15px !important;}
      .seg-ai-panel{right:12px !important;bottom:82px !important;width:calc(100vw - 24px) !important;}
    }
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
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      panel.classList.remove('open');
    });
    head.appendChild(close);
  }

  function setup(){
    injectStyle();
    installCloseButton();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') document.getElementById('segAiPanel')?.classList.remove('open');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

(function preventActsLegacyCacheLeak(){
  const hiddenLegacyKeys = ['acts_service_account', 'seg_kip_admin_jwt'];

  function clearHiddenLegacyActsSettings(){
    hiddenLegacyKeys.forEach((key) => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
  }

  function install(){
    const original = window.openModulePage;
    if (typeof original !== 'function' || original.__actsLegacyCacheGuard) return;
    function guardedOpenModulePage(moduleName, ...args){
      if (moduleName === 'acts') clearHiddenLegacyActsSettings();
      return original.call(this, moduleName, ...args);
    }
    guardedOpenModulePage.__actsLegacyCacheGuard = true;
    window.openModulePage = guardedOpenModulePage;
  }

  clearHiddenLegacyActsSettings();
  install();
  window.clearActsHiddenLegacySettings = clearHiddenLegacyActsSettings;
})();

(function injectUlchovSheetsModule(){
  function inject(frame){
    try {
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
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

(function injectActsWorkspaceSignersModule(){
  function inject(frame){
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      const src = String(frame.getAttribute('src') || frame.contentWindow?.location?.pathname || '');
      if (!doc || doc.getElementById('segActsWorkspaceSignersScript') || !src.includes('acts')) return;
      const script = doc.createElement('script');
      script.id = 'segActsWorkspaceSignersScript';
      script.src = '/js/acts-workspace-signers.js?v=stage7b';
      script.defer = true;
      doc.head.appendChild(script);
    } catch (_) {}
  }

  function bind(){
    const frame = document.getElementById('genericModuleFrame');
    if (!frame) return;
    if (frame.dataset.actsWorkspaceSignersBound !== 'true') {
      frame.dataset.actsWorkspaceSignersBound = 'true';
      frame.addEventListener('load', () => inject(frame));
    }
    inject(frame);
  }

  function setup(){
    bind();
    const observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

(function removeWorkspaceSettingsUi(){
  function removeExistingUi(){
    document.querySelectorAll('.seg-workspace-menu, #workspaceSettingsPage, #workspaceSignersPanel').forEach((node) => node.remove());
  }

  function setup(){
    removeExistingUi();
    const observer = new MutationObserver(removeExistingUi);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
