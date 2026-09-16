(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  let lastDiagnostic = null;

  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function parentStorage(store, key) {
    try { return parent?.[store]?.getItem(key) || ''; } catch (_) { return ''; }
  }

  function workspaceId() {
    return clean(
      window.ToJournalWorkspace?.state?.workspaceId
      || localStorage.getItem(WORKSPACE_ID_KEY)
      || parentStorage('localStorage', WORKSPACE_ID_KEY),
    );
  }

  function token() {
    try {
      return sessionStorage.getItem(WORKSPACE_TOKEN_KEY)
        || parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY)
        || sessionStorage.getItem(ADMIN_TOKEN_KEY)
        || parentStorage('sessionStorage', ADMIN_TOKEN_KEY)
        || '';
    } catch (_) {
      return '';
    }
  }

  async function refreshSession() {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Workspace sessiyasi yangilanmadi');
    sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken);
    try { parent.sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken); } catch (_) {}
    return data.accessToken;
  }

  async function api(path, options = {}, retry = true) {
    const id = workspaceId();
    if (!id) throw new Error('Workspace aniqlanmadi.');
    const headers = new Headers(options.headers || {});
    const auth = token();
    if (auth) headers.set('Authorization', `Bearer ${auth}`);
    headers.set('x-workspace-id', id);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && retry) {
      await refreshSession();
      return api(path, options, false);
    }
    if (!response.ok || data.error) {
      throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { data, status: response.status });
    }
    return data;
  }

  function injectStyle() {
    if ($('toFinalDocumentsStyle')) return;
    const style = document.createElement('style');
    style.id = 'toFinalDocumentsStyle';
    style.textContent = `
      .to-final-modal{position:fixed;inset:0;z-index:130;display:none;background:rgba(0,0,0,.78);padding:16px;font-family:Arial,sans-serif;color:#eaf7ff}
      .to-final-modal.show{display:flex;align-items:center;justify-content:center}
      .to-final-shell{width:min(760px,100%);background:#071427;border:1px solid rgba(34,211,238,.30);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.48);overflow:hidden}
      .to-final-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.09)}
      .to-final-head h2{margin:0;font-size:20px}.to-final-body{padding:18px;display:grid;gap:14px}
      .to-final-card{display:grid;gap:10px;padding:14px;border:1px solid rgba(34,211,238,.25);border-radius:13px;background:rgba(4,18,34,.72)}
      .to-final-card label{display:grid;gap:5px;font-size:12px;font-weight:800;color:#cdeeff}
      .to-final-card input{width:100%;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#061120;color:#fff;padding:8px 10px}
      .to-final-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .to-final-status{font-size:12px;line-height:1.45;color:#cdeeff}.to-final-status.ok{color:#86efac}.to-final-status.bad{color:#fca5a5}.to-final-status.sync{color:#fde68a}
      .to-final-note{font-size:12px;color:#9fb7c7;line-height:1.5}
      .to-final-diag{font-size:11px;color:#b8d8e6;word-break:break-word}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if ($('toFinalDocumentsModal')) return;
    const modal = document.createElement('div');
    modal.id = 'toFinalDocumentsModal';
    modal.className = 'to-final-modal';
    modal.innerHTML = `
      <div class="to-final-shell">
        <div class="to-final-head">
          <div>
            <h2>6. ЯКУНИЙ ҲУЖЖАТЛАР</h2>
            <div class="to-final-note">Барча 7 та имзо тайёр бўлганда TO ҳужжати A4 PDF кўринишида Drive'га сақланади.</div>
          </div>
          <button id="toFinalCloseBtn" class="btn" type="button">✕</button>
        </div>
        <div class="to-final-body">
          <div class="to-final-card">
            <label>Google Drive papka URL yoki ID
              <input id="toFinalFolderInput" placeholder="https://drive.google.com/drive/folders/... yoki folder ID">
            </label>
            <div class="to-final-actions">
              <button id="toFinalSaveBtn" class="btn primary workspace-admin-only" type="button">Сақлаш</button>
              <button id="toFinalTestBtn" class="btn workspace-admin-only" type="button">Текшириш</button>
              <button id="toFinalOpenDriveBtn" class="btn" type="button">Drive</button>
            </div>
            <div id="toFinalStatus" class="to-final-status sync">Papka holati tekshirilmagan.</div>
            <div id="toFinalDiag" class="to-final-diag"></div>
          </div>
          <div class="to-final-note">Final PDF shu papka ichidagi <b>ХУЖАТЛАР</b> papkasiga saqlanadi. Email orqali imzo talab qilinadigan hujjat yuborilishidan oldin ushbu Drive papka tayyorligi tekshiriladi.</div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    $('toFinalCloseBtn')?.addEventListener('click', close);
    $('toFinalSaveBtn')?.addEventListener('click', () => void save());
    $('toFinalTestBtn')?.addEventListener('click', () => void test());
    $('toFinalOpenDriveBtn')?.addEventListener('click', openDrive);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  }

  function currentWorkspace() {
    return window.ToJournalWorkspace?.state?.workspace || null;
  }

  function configuredFolderId() {
    return clean(currentWorkspace()?.finalDocumentsFolderId || $('toFinalFolderInput')?.value);
  }

  function syncFromWorkspace() {
    const workspace = currentWorkspace();
    const input = $('toFinalFolderInput');
    if (input && document.activeElement !== input) input.value = clean(workspace?.finalDocumentsFolderId);
    const folderId = clean(workspace?.finalDocumentsFolderId);
    const status = $('toFinalStatus');
    const drive = $('toFinalOpenDriveBtn');
    if (drive) drive.disabled = !folderId;
    if (status) {
      status.textContent = folderId
        ? `Drive papka sozlangan: ${folderId}`
        : 'Drive papka sozlanmagan.';
      status.className = `to-final-status ${folderId ? 'sync' : 'bad'}`;
    }
  }

  function setStatus(text, tone = 'sync') {
    const el = $('toFinalStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `to-final-status ${tone}`;
  }

  function setDiag(text = '') {
    const el = $('toFinalDiag');
    if (el) el.textContent = text;
  }

  function rootPath() {
    const id = workspaceId();
    if (!id) throw new Error('Workspace aniqlanmadi.');
    return `/api/workspaces/${encodeURIComponent(id)}/documents`;
  }

  async function save() {
    const value = clean($('toFinalFolderInput')?.value);
    if (!value) return setStatus('Yakuniy hujjatlar uchun Drive papka URL yoki ID kiriting.', 'bad');
    setStatus('Drive papka saqlanmoqda...', 'sync');
    setDiag('');
    try {
      const data = await api(`${rootPath()}/final-folder`, {
        method: 'PUT',
        body: JSON.stringify({ finalDocumentsFolderUrl: value }),
      });
      const workspace = currentWorkspace();
      if (workspace) workspace.finalDocumentsFolderId = clean(data.finalDocumentsFolderId || data.workspace?.finalDocumentsFolderId);
      syncFromWorkspace();
      setStatus('✅ Yakuniy hujjatlar Drive papkasi saqlandi.', 'ok');
    } catch (error) {
      setStatus(error.message, 'bad');
    }
  }

  async function test() {
    setStatus('Google Drive papka va yozish huquqi tekshirilmoqda...', 'sync');
    setDiag('');
    try {
      const data = await api(`${rootPath()}/final-folder/test`, {
        method: 'POST',
        body: '{}',
      });
      lastDiagnostic = data.result || data;
      setStatus(`✅ Final PDF papka tayyor: ${clean(lastDiagnostic.folderName || lastDiagnostic.folderId || 'ХУЖАТЛАР')}`, 'ok');
      setDiag(lastDiagnostic.serviceAccountEmail ? `Service account: ${lastDiagnostic.serviceAccountEmail}` : '');
    } catch (error) {
      const data = error?.data || {};
      setStatus(error.message, 'bad');
      setDiag(clean(data.recommendedFix || data.driveErrorMessage || data.code));
    }
  }

  function openDrive() {
    const folderId = configuredFolderId();
    if (!folderId) return setStatus('Avval Google Drive papkasini saqlang.', 'bad');
    window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`, '_blank', 'noopener,noreferrer');
  }

  function open() {
    injectStyle();
    injectUi();
    syncFromWorkspace();
    $('toFinalDocumentsModal')?.classList.add('show');
  }

  function close() {
    $('toFinalDocumentsModal')?.classList.remove('show');
  }

  function init() {
    injectStyle();
    injectUi();
    syncFromWorkspace();
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SEG_KIP_WORKSPACE_CHANGE') {
      lastDiagnostic = null;
      window.setTimeout(syncFromWorkspace, 0);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.ToFinalDocuments = { open, close, save, test, openDrive };
})();
