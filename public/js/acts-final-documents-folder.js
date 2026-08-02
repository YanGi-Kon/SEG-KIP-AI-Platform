// Workspace-level final PDF Google Drive folder control on the Acts journal main screen.
(function setupActsFinalDocumentsFolder(){
  'use strict';

  const PANEL_ID = 'finalDocumentsFolderPanel';
  let lastDiagnostic = null;
  let currentWorkspace = null;
  let loadPromise = null;

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m])); }
  function workspaceId(){ return window.WorkspaceApiClient?.workspaceId() || ''; }
  function rootPath(){
    const id = workspaceId();
    if (!id) throw new Error('Объект аниқланмади. Қайта login қилинг ёки администраторга мурожаат қилинг.');
    return `/api/workspaces/${encodeURIComponent(id)}`;
  }
  function documentsPath(){ return `${rootPath()}/documents`; }

  async function api(path, options = {}){
    if (!window.WorkspaceApiClient) throw new Error('Workspace API client yuklanmadi.');
    return window.WorkspaceApiClient.request(path, options);
  }

  function ensureStyle(){
    if ($('actsFinalDocumentsFolderStyle')) return;
    const style = document.createElement('style');
    style.id = 'actsFinalDocumentsFolderStyle';
    style.textContent = `
      .final-documents-card{width:100%;display:grid;gap:10px;margin-top:16px;padding:14px;border:1px solid rgba(34,211,238,.30);border-radius:13px;background:rgba(4,18,34,.74);box-shadow:0 12px 30px rgba(0,0,0,.16)}
      .final-documents-title-row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
      .final-documents-title{color:#e6faff;font-size:12px;font-weight:900}
      .final-documents-object{color:#9fd8e8;font-size:10px;font-weight:800}
      .final-documents-row{display:grid;grid-template-columns:minmax(210px,1fr) auto;gap:7px;align-items:center}
      .final-documents-row label{display:grid;gap:4px;color:#cdeeff;font-size:11px;font-weight:900}
      .final-documents-row input{width:100%;height:38px;background:#061120;border:1px solid rgba(255,255,255,.16);border-radius:10px;color:#fff;padding:8px 10px;font-size:12px}
      .final-documents-actions{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .final-documents-actions .btn{padding:8px 10px;font-size:11px}
      .final-documents-status{font-size:10px;color:#cde7f0;line-height:1.35}
      .final-documents-service-account{font-size:10px;color:#b8d8e6;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #finalDocumentsFolderMessage{margin-top:0;padding:6px 8px;font-size:10px}
      @media(max-width:760px){.final-documents-row{grid-template-columns:1fr}.final-documents-actions{justify-content:flex-start}.final-documents-service-account{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyUi(){
    $('approvedDocumentsTab')?.remove();
    $('approvedDocumentsModal')?.remove();
    document.querySelector('#signersModal #finalDocumentsFolderPanel')?.remove();
  }

  function panelMarkup(){
    return `
      <div class="final-documents-title-row">
        <div class="final-documents-title">Yakuniy hujjatlar Drive papkasi</div>
        <div id="finalDocumentsWorkspaceName" class="final-documents-object">Объект аниқланмоқда...</div>
      </div>
      <div class="final-documents-row">
        <label>Google Drive papka URL yoki ID
          <input id="finalDocumentsFolderInput" placeholder="https://drive.google.com/drive/folders/... yoki folder ID">
        </label>
        <div class="final-documents-actions">
          <button id="saveFinalDocumentsFolderBtn" class="btn primary" type="button">Сақлаш</button>
          <button id="testFinalDocumentsFolderBtn" class="btn ghost" type="button">Текшириш</button>
          <button id="openFinalDocumentsFolderBtn" class="btn ghost" type="button" disabled>Drive</button>
        </div>
      </div>
      <div id="finalDocumentsFolderStatus" class="final-documents-status sync">Папка маълумоти юкланмоқда...</div>
      <div id="finalDocumentsServiceAccountInfo" class="final-documents-service-account">Service account: текшириш тугмасини босинг.</div>
      <div id="finalDocumentsFolderMessage" class="msg">Final PDF шу папка ичидаги «ХУЖАТЛАР» папкасига сақланади.</div>
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
    let panel = $(PANEL_ID);
    if (!panel) return { mounted:false, created:false };
    bindPanelEvents(panel);
    console.info('[acts-final-documents-folder] mounted', {
      workspaceId: workspaceId(),
      location: 'final-documents-modal',
      created:false,
    });
    return { mounted:true, created:false };
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

  function canConfigureWorkspace(){
    return ['owner', 'administrator'].includes(String(currentWorkspace?.memberRole || '').toLowerCase());
  }

  function updatePanel(workspace){
    currentWorkspace = workspace || currentWorkspace;
    const input = $('finalDocumentsFolderInput');
    const folderId = configuredFolderId();
    if (input && document.activeElement !== input) input.value = folderId;
    if (input) input.readOnly = !canConfigureWorkspace();
    const objectName = $('finalDocumentsWorkspaceName');
    if (objectName) objectName.textContent = `Объект: ${currentWorkspace?.name || 'Аниқланмади'}`;
    const status = $('finalDocumentsFolderStatus');
    const info = $('finalDocumentsServiceAccountInfo');
    const openButton = $('openFinalDocumentsFolderBtn');
    if (openButton) openButton.disabled = !folderId;
    setBusy(false);

    if (lastDiagnostic?.ok) {
      if (status) {
        status.textContent = `✅ Drive папка тайёр: ${lastDiagnostic.folderName || lastDiagnostic.folderId}`;
        status.className = 'final-documents-status ok';
      }
      if (info) {
        info.textContent = `Service account: ${lastDiagnostic.serviceAccountEmail || '-'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}`;
      }
      return;
    }

    if (status) {
      status.textContent = folderId
        ? 'Папка сақланган. Ёзиш ҳуқуқини “Текшириш” орқали тасдиқланг.'
        : 'Папка киритилмаган: final PDF export ўтказиб юборилади.';
      status.className = `final-documents-status ${folderId ? 'sync' : 'bad'}`;
    }
    if (info) {
      info.textContent = lastDiagnostic
        ? `Service account: ${lastDiagnostic.serviceAccountEmail || 'аниқланмади'}. Сабаб: ${lastDiagnostic.message || lastDiagnostic.code || 'Drive test failed'}`
        : 'Service account: текшириш тугмасини босинг. Private key кўрсатилмайди.';
    }
  }

  function friendlyError(diag){
    const code = diag?.code || '';
    if (code === 'DRIVE_SHARED_DRIVE_REQUIRED') return '❌ Oddiy My Drive papkasi qo‘llab-quvvatlanmaydi. Shared Drive papkasini tanlang.';
    if (code === 'SERVICE_ACCOUNT_NO_STORAGE_QUOTA') return '❌ Service account’da Drive storage quota yo‘q. Shared Drive ishlating.';
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
    if (!canConfigureWorkspace()) return setMsg('Sizning workspace rolingiz Drive papkasini o‘zgartirishga ruxsat bermaydi.', 'bad');
    setBusy(true);
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
      setMsg('Папка сақланди. Энди “Текшириш” тугмасини босинг.', 'ok');
    } catch (error) {
      setMsg(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function testFinalDocumentsFolder(){
    if (!canConfigureWorkspace()) return setMsg('Sizning workspace rolingiz Drive ulanishini tekshirishga ruxsat bermaydi.', 'bad');
    setBusy(true);
    try {
      setMsg('Google Drive папка ва ёзиш ҳуқуқи текширилмоқда...', 'sync');
      const data = await api(`${documentsPath()}/final-folder/test`, {
        method:'POST',
        body:JSON.stringify({}),
      });
      lastDiagnostic = data.result || null;
      updatePanel(await loadWorkspace());
      setMsg(`✅ Final PDF папка тайёр: ${lastDiagnostic?.folderName || lastDiagnostic?.folderId || 'ХУЖАТЛАР'}.`, 'ok');
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
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy){
    ['saveFinalDocumentsFolderBtn', 'testFinalDocumentsFolderBtn'].forEach((id) => {
      const button = $(id);
      if (button) button.disabled = Boolean(busy) || !canConfigureWorkspace();
    });
  }

  function exposeApi(){
    if (!window.ActsUI) return false;
    window.ActsUI.saveFinalDocumentsFolder = saveFinalDocumentsFolder;
    window.ActsUI.testFinalDocumentsFolder = testFinalDocumentsFolder;
    window.ActsUI.openFinalDocumentsFolder = openConfiguredFolder;
    window.ActsUI.openFinalDocumentsFolderSettings = openFinalDocumentsFolderSettings;
    window.ActsUI.closeFinalDocumentsFolderSettings = closeFinalDocumentsFolderSettings;
    return true;
  }

  function openFinalDocumentsFolderSettings(){
    $('finalDocumentsFolderModal')?.classList.add('show');
    loadPanelWorkspace();
  }

  function closeFinalDocumentsFolderSettings(){
    $('finalDocumentsFolderModal')?.classList.remove('show');
  }

  function boot(){
    console.info('[acts-final-documents-folder] loaded');
    mountFinalDocumentsFolderPanel();
    exposeApi();
    loadPanelWorkspace();
    window.addEventListener('seg-kip:workspace-change', () => {
      currentWorkspace = null;
      lastDiagnostic = null;
      loadPanelWorkspace();
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'SEG_KIP_WORKSPACE_CHANGE') return;
      currentWorkspace = null;
      lastDiagnostic = null;
      loadPanelWorkspace();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
