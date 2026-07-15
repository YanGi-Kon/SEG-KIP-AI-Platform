// Final documents Drive folder overlay for Acts workspace signer modal.
(function setupActsFinalDocumentsFolder(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  let patched = false;
  let lastDiagnostic = null;

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
  function setMsg(text, cls=''){
    const el = $('signersMsg');
    if (el) el.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  }
  async function parse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw:text }; }
  }
  async function refresh(){
    const res = await fetch('/api/auth/refresh', { method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'include' });
    const data = await parse(res);
    if (!res.ok) throw new Error(data.error || 'Session yangilanmadi');
    if (data.accessToken) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      try { parent.sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken); } catch (_) {}
    }
  }
  async function api(path, options = {}, retry = true){
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
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
    style.textContent = '.final-documents-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin-top:10px}.final-documents-row label{display:grid;gap:6px;color:#cdeeff;font-size:12px;font-weight:900}.final-documents-row input{width:100%;background:#061120;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#fff;padding:10px}.final-documents-status{font-size:11px;color:#cde7f0}.final-documents-title{font-size:11px;color:#67e8f9;font-weight:800;letter-spacing:.4px;text-transform:uppercase;margin-top:6px}.final-documents-service-account{font-size:11px;color:#b8d8e6;border:1px dashed rgba(34,211,238,.22);border-radius:12px;padding:8px 10px;background:rgba(2,8,23,.35);line-height:1.45}';
    document.head.appendChild(style);
  }
  function ensurePanel(){
    ensureStyle();
    const panel = $('objectSignersPanel');
    if (!panel || $('finalDocumentsFolderInput')) return;
    panel.insertAdjacentHTML('beforeend', '<div class="final-documents-title">Yakuniy PDF hujjatlar papkasi</div><div class="final-documents-row"><label>Якуний ҳужжатлар сақланадиган Google Drive папка URL ёки ID<input id="finalDocumentsFolderInput" placeholder="https://drive.google.com/drive/folders/..."></label><div class="signature-folder-actions"><button id="saveFinalDocumentsFolderBtn" class="btn primary" type="button">Папкани сақлаш</button><button id="testFinalDocumentsFolderBtn" class="btn ghost" type="button">Папкани текшириш</button></div></div><div id="finalDocumentsFolderStatus" class="final-documents-status"></div><div id="finalDocumentsServiceAccountInfo" class="final-documents-service-account">Service account: Папкани текширинг. Private key кўрсатилмайди.</div>');
    $('saveFinalDocumentsFolderBtn')?.addEventListener('click', saveFinalDocumentsFolder);
    $('testFinalDocumentsFolderBtn')?.addEventListener('click', testFinalDocumentsFolder);
  }
  async function loadWorkspace(){
    const data = await api(rootPath(), { method:'GET' });
    return data.workspace || null;
  }
  function updatePanel(workspace){
    ensurePanel();
    const input = $('finalDocumentsFolderInput');
    if (input && document.activeElement !== input) input.value = workspace?.finalDocumentsFolderId || '';
    const status = $('finalDocumentsFolderStatus');
    const info = $('finalDocumentsServiceAccountInfo');
    if (lastDiagnostic?.ok) {
      if (status) {
        status.textContent = `✅ Drive папка тайёр: ${lastDiagnostic.folderName || lastDiagnostic.folderId}`;
        status.className = 'final-documents-status ok';
      }
      if (info) info.textContent = `Service account: ${lastDiagnostic.serviceAccountEmail || '-'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}. Final PDF export шу папкадан фойдаланади.`;
      return;
    }
    if (status) {
      status.textContent = workspace?.finalDocumentsFolderId ? 'Drive tekshiruvdan o‘tmasa final PDF export skip qilinadi.' : 'Papka kiritilmagan: final PDF export skip qilinadi.';
      status.className = 'final-documents-status sync';
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
  async function saveFinalDocumentsFolder(){
    try {
      const value = $('finalDocumentsFolderInput')?.value.trim() || '';
      if (!value) return setMsg('Якуний ҳужжатлар папкаси Google Drive URL ёки ID киритинг.', 'bad');
      setMsg('Якуний ҳужжатлар папкаси сақланмоқда...', 'sync');
      const data = await api(`${documentsPath()}/final-folder`, { method:'PUT', body: JSON.stringify({ finalDocumentsFolderUrl:value }) });
      lastDiagnostic = null;
      updatePanel(data.workspace || null);
      setMsg('Якуний ҳужжатлар папкаси сақланди. Энди “Папкани текшириш” тугмасини босинг.', 'ok');
    } catch (error) {
      setMsg(error.message, 'bad');
    }
  }
  async function testFinalDocumentsFolder(){
    try {
      setMsg('Final PDF papkasi, Google Drive API ва service account рухсатлари текширилмоқда...', 'sync');
      const data = await api(`${documentsPath()}/final-folder/test`, { method:'POST', body: JSON.stringify({}) });
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
  function patch(){
    if (patched || !window.ActsUI) return false;
    const originalOpen = window.ActsUI.openSigners;
    const originalLoad = window.ActsUI.loadSigners;
    window.ActsUI.openSigners = function patchedOpenSigners(...args){
      const result = originalOpen?.apply(this, args);
      setTimeout(async () => { try { updatePanel(await loadWorkspace()); } catch (_) { ensurePanel(); } }, 180);
      return result;
    };
    window.ActsUI.loadSigners = async function patchedLoadSigners(...args){
      const result = await originalLoad?.apply(this, args);
      setTimeout(async () => { try { updatePanel(await loadWorkspace()); } catch (_) { ensurePanel(); } }, 120);
      return result;
    };
    window.ActsUI.saveFinalDocumentsFolder = saveFinalDocumentsFolder;
    window.ActsUI.testFinalDocumentsFolder = testFinalDocumentsFolder;
    patched = true;
    return true;
  }
  function boot(){
    if (patch()) return;
    const timer = setInterval(() => { if (patch()) clearInterval(timer); }, 100);
    setTimeout(() => clearInterval(timer), 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
