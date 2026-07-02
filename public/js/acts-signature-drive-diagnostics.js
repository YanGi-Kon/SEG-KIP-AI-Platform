// Stage 7.5b: Drive diagnostics overlay for 3. АКТЛАР ЖУРНАЛИ → 5. ИМЗО ЧЕКУВЧИЛАР.
(function setupActsSignatureDriveDiagnostics(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  let patched = false;
  let lastDiagnostic = null;

  function $(id){ return document.getElementById(id); }
  function esc(value){ return String(value ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function parentStorage(storageName, key){ try { return parent?.[storageName]?.getItem(key) || ''; } catch (_) { return ''; } }
  function workspaceId(){ return localStorage.getItem(SELECTED_WORKSPACE_KEY) || parentStorage('localStorage', SELECTED_WORKSPACE_KEY) || ''; }
  function token(){ return sessionStorage.getItem(ACCESS_TOKEN_KEY) || parentStorage('sessionStorage', ACCESS_TOKEN_KEY) || ''; }
  function rootPath(){
    const id = workspaceId();
    if (!id) throw new Error('Объект аниқланмади. Қайта login қилинг ёки администраторга мурожаат қилинг.');
    return `/api/workspaces/${encodeURIComponent(id)}`;
  }
  function signersPath(){ return `${rootPath()}/signers`; }
  function setMsg(text, cls=''){
    const el = $('signersMsg');
    if (el) el.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  }
  async function parse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  async function refresh(){
    const res = await fetch('/api/auth/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include' });
    const data = await parse(res);
    if (!res.ok) throw new Error(data.error || 'Session yangilanmadi');
    if (data.accessToken) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      try { parent.sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken); } catch (_) {}
    }
  }
  async function api(path, options={}, retry=true){
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
    if ($('actsDriveDiagnosticStyle')) return;
    const style = document.createElement('style');
    style.id = 'actsDriveDiagnosticStyle';
    style.textContent = '.signature-service-account{font-size:11px;color:#b8d8e6;border:1px dashed rgba(34,211,238,.22);border-radius:12px;padding:8px 10px;background:rgba(2,8,23,.35);line-height:1.45}.signature-folder-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.signature-drive-code{font-size:11px;color:#fef3c7}';
    document.head.appendChild(style);
  }
  function enhancePanel(){
    ensureStyle();
    const panel = $('objectSignersPanel');
    if (!panel) return;
    const saveBtn = $('saveSignatureFolderBtn');
    if (saveBtn && !$('testSignatureFolderBtn')) {
      const wrap = document.createElement('div');
      wrap.className = 'signature-folder-actions';
      saveBtn.parentNode.insertBefore(wrap, saveBtn);
      wrap.appendChild(saveBtn);
      const testBtn = document.createElement('button');
      testBtn.id = 'testSignatureFolderBtn';
      testBtn.type = 'button';
      testBtn.className = 'btn ghost';
      testBtn.textContent = 'Папкани текшириш';
      testBtn.onclick = testSignatureFolder;
      wrap.appendChild(testBtn);
    }
    if (!$('signatureServiceAccountInfo')) {
      const info = document.createElement('div');
      info.id = 'signatureServiceAccountInfo';
      info.className = 'signature-service-account';
      info.textContent = 'Service account: Папкани текширинг. Private key кўрсатилмайди, фақат client_email чиқади.';
      panel.appendChild(info);
    }
    updateDiagnosticUi();
  }
  function updateDiagnosticUi(){
    const status = $('signatureFolderStatus');
    const info = $('signatureServiceAccountInfo');
    if (lastDiagnostic?.ok) {
      if (status) {
        status.textContent = `✅ Drive папка тайёр: ${lastDiagnostic.folderName || lastDiagnostic.folderId}`;
        status.className = 'signature-status ok';
      }
      if (info) info.textContent = `Service account: ${lastDiagnostic.serviceAccountEmail || '-'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}. IMZOLAR папкасини шу email билан Editor қилиб share қилинг.`;
      return;
    }
    if (lastDiagnostic && info) {
      info.textContent = `Service account: ${lastDiagnostic.serviceAccountEmail || 'аниқланмади'}${lastDiagnostic.serviceAccountProjectId ? ` | Project: ${lastDiagnostic.serviceAccountProjectId}` : ''}. Сабаб: ${lastDiagnostic.message || lastDiagnostic.code || 'Drive test failed'}`;
    }
  }
  async function testSignatureFolder(){
    try {
      setMsg('Drive папка, Google Drive API ва service account рухсатлари текширилмоқда...', 'sync');
      const data = await api(`${signersPath()}/signature-folder/test`, { method:'POST', body: JSON.stringify({}) });
      lastDiagnostic = data.result || null;
      enhancePanel();
      setMsg(`✅ Drive papka tayyor: ${lastDiagnostic?.folderName || lastDiagnostic?.folderId || 'IMZOLAR'}. Yozish testi muvaffaqiyatli.`, 'ok');
    } catch (err) {
      const data = err.data || {};
      lastDiagnostic = {
        ok: false,
        code: data.driveErrorCode || data.code || '',
        message: data.driveErrorMessage || data.error || err.message,
        serviceAccountEmail: data.serviceAccountEmail || '',
        serviceAccountProjectId: data.serviceAccountProjectId || '',
      };
      enhancePanel();
      const code = lastDiagnostic.code;
      const friendly = code === 'DRIVE_API_DISABLED'
        ? '❌ Google Drive API yoqilmagan.'
        : code === 'DRIVE_FOLDER_NOT_FOUND'
          ? '❌ Folder ID noto‘g‘ri yoki service account bilan share qilinmagan.'
          : code === 'DRIVE_FOLDER_NOT_A_FOLDER'
            ? '❌ Bu Google Drive papka emas.'
            : code === 'DRIVE_WRITE_PERMISSION_DENIED'
              ? '❌ Service account bu papkaga yoza olmaydi. Editor qilib share qiling.'
              : `❌ ${lastDiagnostic.message}`;
      setMsg(`${friendly} ${lastDiagnostic.message ? `(${lastDiagnostic.message})` : ''}`, 'bad');
    }
  }
  function rowById(id){ return Array.from($('signersRows')?.querySelectorAll('tr') || []).find((tr) => tr.dataset.signerId === id); }
  async function uploadFile(file, position, fullName){
    if (!file) return null;
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) throw new Error('Faqat PNG файл қабул қилинади');
    if (file.size > 2 * 1024 * 1024) throw new Error('PNG hajmi 2 MB dan oshmasligi kerak');
    const form = new FormData();
    form.append('signature', file);
    form.append('position', position || '');
    form.append('fullName', fullName || '');
    const data = await api(`${signersPath()}/signature`, { method:'POST', body: form });
    return {
      signatureUrl: data.webViewLink || '',
      signatureFileId: data.fileId || '',
      storage: data.storage || '',
      fallbackReason: data.fallbackReason || '',
      driveErrorCode: data.driveErrorCode || '',
      driveErrorMessage: data.driveErrorMessage || '',
    };
  }
  async function saveSigner(id){
    const tr = rowById(id);
    if (!tr) return;
    const position = tr.querySelector('[data-field="position"]')?.value.trim() || '';
    const fullName = tr.querySelector('[data-field="fio"]')?.value.trim() || '';
    const email = tr.querySelector('[data-field="gmail"]')?.value.trim() || '';
    const file = tr.querySelector('[data-field="file"]')?.files?.[0] || null;
    if (!position || !fullName || !email) return setMsg('Lavozimi, F.I.O va Gmail to‘ldirilishi shart.', 'bad');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMsg('Gmail/email formati noto‘g‘ri.', 'bad');
    try {
      setMsg('PNG yuklanmoqda va imzo chekuvchi saqlanmoqda...', 'sync');
      let signatureUrl = tr.dataset.signatureUrl || '';
      let signatureFileId = tr.dataset.signatureFileId || '';
      const uploaded = await uploadFile(file, position, fullName);
      if (uploaded) {
        signatureUrl = uploaded.signatureUrl;
        signatureFileId = uploaded.signatureFileId;
      }
      if (!signatureUrl && !signatureFileId) throw new Error('PNG imzo tanlanmagan');
      const payload = { position, fullName, email, signatureUrl, signatureFileId, status: 'active' };
      if (tr.dataset.new === '1') await api(signersPath(), { method:'POST', body: JSON.stringify(payload) });
      else await api(`${signersPath()}/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(payload) });
      await window.ActsUI.loadSigners();
      if (uploaded?.storage === 'database') {
        setMsg(`Имзо чекувчи сақланди. PostgreSQL zaxira — ${uploaded.fallbackReason || uploaded.driveErrorMessage || 'Drive ishlamadi'}.`, 'ok');
      } else if (uploaded?.storage === 'drive') {
        setMsg('Имзо чекувчи сақланди. PNG Google Drive папкага юкланди.', 'ok');
      } else {
        setMsg('Имзо чекувчи сақланди.', 'ok');
      }
    } catch (err) {
      setMsg(err.message, 'bad');
    }
  }
  function decorateStorageLabels(){
    document.querySelectorAll('[data-saved-preview] .signature-status').forEach((node) => {
      if (node.textContent.trim() === 'PostgreSQL zaxira') {
        node.textContent = 'PostgreSQL zaxira — sababni ko‘rish uchun “Папкани текшириш” bosing';
      }
    });
  }
  function patch(){
    if (patched || !window.ActsUI) return false;
    const originalOpen = window.ActsUI.openSigners;
    const originalLoad = window.ActsUI.loadSigners;
    window.ActsUI.openSigners = function patchedOpenSigners(...args){
      const result = originalOpen?.apply(this, args);
      setTimeout(() => { enhancePanel(); decorateStorageLabels(); }, 150);
      return result;
    };
    window.ActsUI.loadSigners = async function patchedLoadSigners(...args){
      const result = await originalLoad?.apply(this, args);
      setTimeout(() => { enhancePanel(); decorateStorageLabels(); }, 100);
      return result;
    };
    window.ActsUI.testSignatureFolder = testSignatureFolder;
    window.ActsUI.saveSigner = saveSigner;
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
