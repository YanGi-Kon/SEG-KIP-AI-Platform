// Workspace-level final PDF Google Drive folder control inside the existing signers modal.
(function setupActsFinalDocumentsFolder(){
  'use strict';

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const PANEL_ID = 'finalDocumentsFolderPanel';
  let lastDiagnostic = null;
  let currentWorkspace = null;
  let loadPromise = null;

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
  function parentStorage(storageName, key){ try { return parent?.[storageName]?.getItem(key) || ''; } catch (_) { return ''; } }
  function workspaceId(){ return localStorage.getItem(SELECTED_WORKSPACE_KEY) || parentStorage('localStorage', SELECTED_WORKSPACE_KEY) || ''; }
  function token(){ return sessionStorage.getItem(ACCESS_TOKEN_KEY) || parentStorage('sessionStorage', ACCESS_TOKEN_KEY) || ''; }
  function rootPath(){
    const id = workspaceId();
    if (!id) throw new Error('Объект аниқланмади. Қайта login қилинг ёки администраторга мурожаат қилинг.');
    return `/api/workspaces/${encodeURIComponent(id)}`;
  }
  function documentsPath(){ return `${rootPath()}/documents`; }

  async function parse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw:text }; }
  }

  async function refresh(){
    const res = await fetch('/api/auth/refresh', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
    });
    const data = await parse(res);
    if (!res.ok) throw new Error(data.error || 'Session yangilanmadi');
    if (data.accessToken) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      try { parent.sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken); } catch (_) {}
    }
  }

  async function api(path, options = {}, retry = true){
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const currentToken = token();
    if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
    const res = await fetch(path, { ...options, headers, credentials:'include' });
    const data = await parse(res);
    if (res.status === 401 && retry) {
      await refresh();
      return api(path, options, false);
    }
    if (!res.ok || data.error) {
      const error = new Error(data.error || `HTTP ${res.status}`);
      error.data = data;
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function ensureStyle(){
    if ($('actsFinalDocumentsFolderStyle')) return;
    const style = document.createElement('style');
    style.id = 'actsFinalDocumentsFolderStyle';
    style.textContent = `
      .final-documents-card{display:grid;gap:10px;margin-top:2px;padding:12px;border:1px solid rgba(34,211,238,.24);border-radius:13px;background:rgba(4,18,34,.58)}
      .final-documents-title-row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
      .final-documents-title{color:#e6faff;font-size:13px;font-weight:900}
      .final-documents-object{color:#9fd8e8;font-size:11px;font-weight:800}
      .final-documents-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}
      .final-documents-row label{display:grid;gap:6px;color:#cdeeff;font-size:12px;font-weight:900}
      .final-documents-row input{width:100%;background:#061120;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#fff;padding:10px}
      .final-documents-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .final-documents-status{font-size:11px;color:#cde7f0;line-height:1.45}
      .final-documents-service-account{font-size:11px;color:#b8d8e6;border:1px dashed rgba(34,211,238,.22);border-radius:12px;padding:8px 10px;background:rgba(2,8,23,.35);line-height:1.45}
      #finalDocumentsFolderMessage{margin-top:0}
      @media(max-width:760px){.final-documents-row{grid-template-columns:1fr}.final-documents-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyUi(){
    $('approvedDocumentsTab')?.remove();
    $('approvedDocumentsModal')?.remove();
  }

  function findSignerSettingsContainer(){
    const objectPanel = $('objectSignersPanel') || $('signersModal')?.querySelector('.object-signers-panel');
    if (objectPanel) return { host:objectPanel, mode:'object-panel' };
    const modalBox = $('signersModal')?.querySelector('.modalbox');
    return modalBox ? { host:modalBox, mode:'modal-box' } : null;
  }

  function panelMarkup(){
    return `
      <div class="final-documents-title-row">
        <div class="final-documents-title">Yakuniy hujjatlar Google Drive papkasi</div>
        <div id="finalDocumentsWorkspaceName" class="final-documents-object">Объект аниқланмоқда...</div>
      </div>
      <div class="final-documents-row">
        <label>Yakuniy hujjatlar saqlanadigan Google Drive papka URL yoki ID
          <input id="finalDocumentsFolderInput" placeholder="https://drive.google.com/drive/folders/... yoki folder ID">
        </label>
        <div class="final-documents-actions">
          <button id="saveFinalDocumentsFolderBtn" class="btn primary" type="button">Папкани сақлаш</button>
          <button id="testFinalDocumentsFolderBtn" class="btn ghost" type="button">Папкани текшириш</button>
          <button id="openFinalDocumentsFolderBtn" class="btn ghost" type="button" disabled>Drive папкани очиш</button>
        </div>
      </div>
      <div id="finalDocumentsFolderStatus" class="final-documents-status sync">Папка маълумоти юкланмоқда...</div>
      <div id="finalDocumentsServiceAccountInfo" class="final-documents-service-account">Service account: Папкани текширинг. Private key кўрсатилмайди.</div>
      <div id="finalDocumentsFolderMessage" class="msg">Google Drive папка URL ёки ID киритинг.</div>
    `;
  }

  function bindPanelEvents(panel){
    if (!panel || panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    $('saveFinalDocumentsFolderBtn')?.addEventListener('click', saveFinalDocumentsFolder);
    $('testFinalDocumentsFolderBtn')?.addEventListener('click', testFinalDocumentsFolder);
    $('openFinalDocumentsFolderBtn')?.addEventListener('click', openConfiguredFolder);
  }

  function mountFinalDocumentsFolderPanel(){
    ensureStyle();
    removeLegacyUi();
    const target = findSignerSettingsContainer();
    if (!target) return { mounted:false, created:false };
    const { host, mode } = target;

    let panel = $(PANEL_ID);
    let created = false;
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'final-documents-card';
      panel.innerHTML = panelMarkup();
      created = true;
    }

    if (mode === 'object-panel') {
      const signatureInfo = $('signatureServiceAccountInfo');
      if (signatureInfo?.parentElement === host) signatureInfo.insertAdjacentElement('afterend', panel);
      else if (panel.parentElement !== host) host.appendChild(panel);
    } else if (panel.parentElement !== host) {
      const toolbar = host.querySelector('.signer-toolbar');
      if (toolbar) toolbar.insertAdjacentElement('beforebegin', panel);
      else host.appendChild(panel);
    }

    bindPanelEvents(panel);
    console.info('[acts-final-documents-folder] mounted', {
      workspaceId: workspaceId(),
      containerFound: true,
      containerMode: mode,
      created,
    });
    return { mounted:true, created };
  }

  function setMsg(text, cls=''){
    const el = $('finalDocumentsFolderMessage');
    if (el) el.innerHTML = `<span class="${esc(cls)}">${esc(text)}</span>`;
  }

  async function loadWorkspace(){
    const data = await api(rootPath(), { method:'GET' });
    currentWorkspace = data.workspace || null;
    return currentWorkspace;
  }

  function configuredFolderId(){
    return String(currentWorkspace?.finalDocumentsFolderId || '').trim();
  }

  function updatePanel(workspace){
    currentWorkspace = workspace || currentWorkspace;
    const input = $('finalDocumentsFolderInput');
    const folderId = configuredFolderId();
    if (input && document.activeElement !== input) input.value = folderId;
    const objectName = $('finalDocumentsWorkspaceName');
    if (objectName) objectName.textContent = `Объект: ${currentWorkspace?.name || 'Аниқланмади'}`;
    const status = $('finalDocumentsFolderStatus');
    const info = $('finalDocumentsServiceAccountInfo');
    const openButton = $('openFinalDocumentsFolderBtn');
    if (openButton) openButton.disabled = !folderId;

    if (lastDiagnostic?.ok) {
      if (status) {
        status.textContent = `✅ Drive папка тайёр: ${lastDiagnostic.folderName || lastDiagnostic.folderId}`;
        status.className = 'final-documents-status ok';
      }
      if (info) {
        info.textContent = `Service account: ${lastDiagnostic.serviceAccountEmail || '-'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}. Final PDF export шу папкадан фойдаланади.`;
      }
      return;
    }

    if (status) {
      status.textContent = folderId
        ? 'Папка сақланган. Ёзиш ҳуқуқини тасдиқлаш учун “Папкани текшириш” тугмасини босинг.'
        : 'Папка киритилмаган: final PDF export ўтказиб юборилади.';
      status.className = `final-documents-status ${folderId ? 'sync' : 'bad'}`;
    }
    if (info) {
      info.textContent = lastDiagnostic
        ? `Service account: ${lastDiagnostic.serviceAccountEmail || 'аниқланмади'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}. Сабаб: ${lastDiagnostic.message || lastDiagnostic.code || 'Drive test failed'}`
        : 'Service account: Папкани текширинг. Private key кўрсатилмайди.';
    }
  }

  function friendlyError(diag){
    const code = diag?.code || '';
    if (code === 'SERVICE_ACCOUNT_NO_STORAGE_QUOTA') return '❌ Service account’da Drive storage quota yo‘q. Shared Drive ishlating yoki real user nomidan yuklashga o‘ting.';
    if (code === 'DRIVE_API_DISABLED') return '❌ Google Drive API yoqilmagan.';
    if (code === 'DRIVE_FOLDER_NOT_FOUND') return '❌ Folder ID noto‘g‘ri yoki service account bilan share qilinmagan.';
    if (code === 'DRIVE_FOLDER_NOT_A_FOLDER') return '❌ Bu Google Drive papka emas.';
    if (code === 'DRIVE_WRITE_PERMISSION_DENIED') return '❌ Service account bu papkaga yoza olmaydi. Editor qilib share qiling.';
    return `❌ ${diag?.message || 'Drive test failed'}`;
  }

  async function loadPanelWorkspace(){
    const mount = mountFinalDocumentsFolderPanel();
    if (!mount.mounted) return null;
    if (loadPromise) return loadPromise;
    setMsg('Workspace ва Drive папка маълумоти юкланмоқда...', 'sync');
    loadPromise = loadWorkspace()
      .then((workspace) => {
        updatePanel(workspace);
        setMsg('Папка URL ёки ID ни сақланг ва кейин текширинг.', 'sync');
        return workspace;
      })
      .catch((error) => {
        updatePanel(null);
        setMsg(error.message, 'bad');
        return null;
      })
      .finally(() => { loadPromise = null; });
    return loadPromise;
  }

  function openConfiguredFolder(){
    const folderId = configuredFolderId();
    if (!folderId) return setMsg('Аввал Google Drive папкасини сақланг.', 'bad');
    window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`, '_blank', 'noopener,noreferrer');
  }

  async function saveFinalDocumentsFolder(){
    try {
      const value = $('finalDocumentsFolderInput')?.value.trim() || '';
      if (!value) return setMsg('Якуний ҳужжатлар папкаси Google Drive URL ёки ID киритинг.', 'bad');
      setMsg('Якуний ҳужжатлар папкаси сақланмоқда...', 'sync');
      const data = await api(`${documentsPath()}/final-folder`, {
        method:'PUT',
        body:JSON.stringify({ finalDocumentsFolderUrl:value }),
      });
      lastDiagnostic = null;
      updatePanel(data.workspace || null);
      setMsg('Якуний ҳужжатлар папкаси сақланди. Энди “Папкани текшириш” тугмасини босинг.', 'ok');
    } catch (error) {
      setMsg(error.message, 'bad');
    }
  }

  async function testFinalDocumentsFolder(){
    try {
      setMsg('Final PDF папкаси, Google Drive API ва service account рухсатлари текширилмоқда...', 'sync');
      const data = await api(`${documentsPath()}/final-folder/test`, {
        method:'POST',
        body:JSON.stringify({}),
      });
      lastDiagnostic = data.result || null;
      updatePanel(await loadWorkspace());
      setMsg(`✅ Final PDF папка тайёр: ${lastDiagnostic?.folderName || lastDiagnostic?.folderId || 'ХУЖАТЛАР'}. Yozish testi muvaffaqiyatli.`, 'ok');
    } catch (error) {
      const data = error.data || {};
      lastDiagnostic = {
        ok:false,
        code:data.driveErrorCode || data.code || '',
        message:data.driveErrorMessage || data.error || error.message,
        serviceAccountEmail:data.serviceAccountEmail || '',
        serviceAccountProjectId:data.serviceAccountProjectId || '',
      };
      updatePanel(await loadWorkspace().catch(() => null));
      setMsg(friendlyError(lastDiagnostic), 'bad');
    }
  }

  function exposeApi(){
    if (!window.ActsUI) return;
    window.ActsUI.saveFinalDocumentsFolder = saveFinalDocumentsFolder;
    window.ActsUI.testFinalDocumentsFolder = testFinalDocumentsFolder;
    window.ActsUI.openFinalDocumentsFolder = openConfiguredFolder;
  }

  function observeSignersModal(){
    const modal = $('signersModal');
    if (!modal || modal.dataset.finalDocumentsObserved === '1') return;
    modal.dataset.finalDocumentsObserved = '1';
    const observer = new MutationObserver((mutations) => {
      let shouldLoad = false;
      let shouldMount = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') shouldMount = true;
        if (mutation.type === 'attributes' && mutation.attributeName === 'class' && modal.classList.contains('show')) {
          shouldMount = true;
          shouldLoad = true;
        }
      }
      const result = shouldMount ? mountFinalDocumentsFolderPanel() : { mounted:false, created:false };
      if ((shouldLoad || result.created) && modal.classList.contains('show')) loadPanelWorkspace();
    });
    observer.observe(modal, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  }

  function boot(){
    console.info('[acts-final-documents-folder] loaded');
    removeLegacyUi();
    ensureStyle();
    exposeApi();
    observeSignersModal();
    const result = mountFinalDocumentsFolderPanel();
    if (result.mounted && $('signersModal')?.classList.contains('show')) loadPanelWorkspace();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
