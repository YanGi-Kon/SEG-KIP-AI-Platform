// Permanent approved-documents Drive folder control for Acts journal.
(function setupActsFinalDocumentsFolder(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  let lastDiagnostic = null;
  let currentWorkspace = null;

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
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
      #approvedDocumentsTab{white-space:nowrap}
      .final-documents-card{display:grid;gap:12px;margin-top:14px;padding:14px;border:1px solid rgba(34,211,238,.24);border-radius:15px;background:rgba(2,8,23,.38)}
      .final-documents-object{display:inline-flex;width:max-content;max-width:100%;padding:7px 11px;border:1px solid rgba(34,211,238,.35);border-radius:999px;background:rgba(34,211,238,.09);color:#dffbff;font-size:12px;font-weight:900}
      .final-documents-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end}
      .final-documents-row label{display:grid;gap:7px;color:#cdeeff;font-size:13px;font-weight:900}
      .final-documents-row input{width:100%;background:#061120;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#fff;padding:12px}
      .final-documents-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .final-documents-status{font-size:12px;color:#cde7f0;line-height:1.45}
      .final-documents-service-account{font-size:11px;color:#b8d8e6;border:1px dashed rgba(34,211,238,.22);border-radius:12px;padding:9px 11px;background:rgba(2,8,23,.35);line-height:1.5}
      @media(max-width:760px){.final-documents-row{grid-template-columns:1fr}.final-documents-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function ensurePermanentButton(){
    const tabs = document.querySelector('.acts-top .tabs');
    if (!tabs || $('approvedDocumentsTab')) return;
    const signersButton = Array.from(tabs.querySelectorAll('button')).find((button) => {
      const onclick = button.getAttribute('onclick') || '';
      return onclick.includes('openSigners') || button.textContent.includes('ИМЗО ЧЕКУВЧИЛАР');
    });
    const button = document.createElement('button');
    button.id = 'approvedDocumentsTab';
    button.type = 'button';
    button.textContent = 'Тасдикланган хужатлар';
    button.addEventListener('click', openApprovedDocuments);
    if (signersButton) signersButton.insertAdjacentElement('afterend', button);
    else tabs.appendChild(button);
  }

  function ensureModal(){
    if ($('approvedDocumentsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'approvedDocumentsModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modalbox">
        <div class="modal-head">
          <div>
            <h2>Тасдикланган хужатлар</h2>
            <p class="note">Барча тасдиқловчилар розилик билдиргач, тайёр PDF шу ерда кўрсатилган Google Drive папкага автоматик сақланади.</p>
          </div>
          <button id="closeApprovedDocumentsBtn" class="btn ghost" type="button">Ёпиш</button>
        </div>
        <div class="final-documents-card">
          <div id="finalDocumentsWorkspaceName" class="final-documents-object">Объект аниқланмоқда...</div>
          <div class="final-documents-row">
            <label>Yakuniy hujjatlar saqlanadigan Google Drive papka URL yoki ID
              <input id="finalDocumentsFolderInput" placeholder="https://drive.google.com/drive/folders/...">
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
        </div>
      </div>`;
    document.body.appendChild(modal);
    $('closeApprovedDocumentsBtn')?.addEventListener('click', closeApprovedDocuments);
    $('saveFinalDocumentsFolderBtn')?.addEventListener('click', saveFinalDocumentsFolder);
    $('testFinalDocumentsFolderBtn')?.addEventListener('click', testFinalDocumentsFolder);
    $('openFinalDocumentsFolderBtn')?.addEventListener('click', openConfiguredFolder);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeApprovedDocuments(); });
  }

  function ensureUi(){
    ensureStyle();
    ensurePermanentButton();
    ensureModal();
    document.querySelectorAll('#objectSignersPanel #finalDocumentsFolderInput, #objectSignersPanel .final-documents-title').forEach((node) => node.remove());
  }

  function setMsg(text, cls=''){
    const el = $('finalDocumentsFolderMessage');
    if (el) el.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
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
    const folderId = String(currentWorkspace?.finalDocumentsFolderId || '').trim();
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
    if (info && lastDiagnostic) {
      info.textContent = `Service account: ${lastDiagnostic.serviceAccountEmail || 'аниқланмади'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}. Сабаб: ${lastDiagnostic.message || lastDiagnostic.code || 'Drive test failed'}`;
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

  async function openApprovedDocuments(){
    ensureUi();
    $('approvedDocumentsModal')?.classList.add('show');
    setMsg('Workspace ва Drive папка маълумоти юкланмоқда...', 'sync');
    try {
      updatePanel(await loadWorkspace());
      setMsg('Папка URL ёки ID ни сақланг ва кейин текширинг.', 'sync');
    } catch (error) {
      updatePanel(null);
      setMsg(error.message, 'bad');
    }
  }

  function closeApprovedDocuments(){
    $('approvedDocumentsModal')?.classList.remove('show');
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
    if (!window.ActsUI) return false;
    window.ActsUI.openApprovedDocuments = openApprovedDocuments;
    window.ActsUI.closeApprovedDocuments = closeApprovedDocuments;
    window.ActsUI.saveFinalDocumentsFolder = saveFinalDocumentsFolder;
    window.ActsUI.testFinalDocumentsFolder = testFinalDocumentsFolder;
    return true;
  }

  function boot(){
    ensureUi();
    exposeApi();
    const timer = setInterval(() => {
      ensureUi();
      if (exposeApi()) clearInterval(timer);
    }, 150);
    setTimeout(() => clearInterval(timer), 8000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();