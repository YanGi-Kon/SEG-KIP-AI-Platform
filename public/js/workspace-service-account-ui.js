// Workspace Service Account JSON upload UI.
// Stores only encrypted JSON on the backend; private_key is never saved in localStorage.
(function setupWorkspaceServiceAccountUi() {
  if (window.__segWorkspaceServiceAccountUiLoaded) return;
  window.__segWorkspaceServiceAccountUiLoaded = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function selectedWorkspaceId() {
    return window.segWorkspaceUi?.state?.selectedWorkspaceId
      || localStorage.getItem(SELECTED_WORKSPACE_KEY)
      || '';
  }

  function selectedWorkspaceFromState() {
    const id = selectedWorkspaceId();
    return (window.segWorkspaceUi?.state?.workspaces || []).find((item) => item.id === id) || null;
  }

  function setStatus(message, tone = 'info') {
    const box = qs('#workspaceStatusBox');
    if (!box) return;
    box.className = `workspace-status ${tone}`;
    box.textContent = message || '';
  }

  function renderStatus(serviceAccount) {
    const box = qs('#workspaceServiceAccountStatus');
    if (!box) return;
    const status = serviceAccount?.status || 'missing';
    if (status === 'configured') {
      box.innerHTML = `✅ Service Account saqlandi:<br><b>${escapeHtml(serviceAccount.clientEmail || '')}</b><br><small>project_id: ${escapeHtml(serviceAccount.projectId || '')}</small>`;
      return;
    }
    box.innerHTML = '⚠️ Service Account JSON hali yuklanmagan. Workspace fallback credential bilan ishlashi mumkin.';
  }

  async function parseResponse(res) {
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }

  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, {
      ...options,
      headers,
      credentials: 'include',
    });
    const data = await parseResponse(res);
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
    return data;
  }

  async function refreshServiceAccountStatus() {
    const id = selectedWorkspaceId();
    if (!id) {
      renderStatus({ status: 'missing' });
      return null;
    }
    try {
      const data = await apiFetch(`/api/workspaces/${encodeURIComponent(id)}/service-account`, { method: 'GET' });
      renderStatus(data.serviceAccount || { status: 'missing' });
      return data.serviceAccount;
    } catch (error) {
      renderStatus(selectedWorkspaceFromState() || { status: 'missing' });
      return null;
    }
  }

  async function uploadServiceAccount() {
    const id = selectedWorkspaceId();
    if (!id) {
      setStatus('Avval Workspace tanlang yoki saqlang.', 'warn');
      return;
    }
    const input = qs('#workspaceServiceAccountFileInput');
    const file = input?.files?.[0];
    if (!file) {
      setStatus('Service Account JSON faylini tanlang.', 'warn');
      return;
    }

    try {
      const text = await file.text();
      const serviceAccount = JSON.parse(text);
      setStatus('Service Account JSON backendga yuborilmoqda...', 'info');
      const data = await apiFetch(`/api/workspaces/${encodeURIComponent(id)}/service-account`, {
        method: 'POST',
        body: JSON.stringify({ serviceAccount }),
      });
      input.value = '';
      renderStatus(data.serviceAccount);
      if (typeof window.segWorkspaceUi?.refresh === 'function') {
        await window.segWorkspaceUi.refresh();
      }
      setStatus(`Service Account saqlandi: ${data.serviceAccount?.clientEmail || ''}`, 'ok');
    } catch (error) {
      setStatus(`Service Account yuklash xato: ${error.message}`, 'error');
    }
  }

  async function clearServiceAccount() {
    const id = selectedWorkspaceId();
    if (!id) {
      setStatus('Avval Workspace tanlang.', 'warn');
      return;
    }
    try {
      setStatus('Service Account o‘chirilmoqda...', 'info');
      const data = await apiFetch(`/api/workspaces/${encodeURIComponent(id)}/service-account`, { method: 'DELETE' });
      renderStatus(data.serviceAccount);
      if (typeof window.segWorkspaceUi?.refresh === 'function') {
        await window.segWorkspaceUi.refresh();
      }
      setStatus('Workspace Service Account o‘chirildi. Endi fallback credential ishlaydi.', 'ok');
    } catch (error) {
      setStatus(`Service Account o‘chirish xato: ${error.message}`, 'error');
    }
  }

  function installControls() {
    const form = qs('#workspaceSettingsForm');
    if (!form || qs('#workspaceServiceAccountPanel')) return Boolean(form);
    const actions = qs('.workspace-actions', form);
    const html = `
      <div id="workspaceServiceAccountPanel" class="workspace-card" style="padding:16px;margin-top:4px;background:rgba(2,8,23,.48);">
        <h3 style="margin:0 0 10px">🔐 Workspace Service Account JSON</h3>
        <div id="workspaceServiceAccountStatus" class="workspace-note">Service Account holati yuklanmoqda...</div>
        <label class="workspace-label wide" style="margin-top:12px">Google Service Account JSON fayli
          <input class="workspace-input" id="workspaceServiceAccountFileInput" type="file" accept=".json,application/json">
        </label>
        <div class="workspace-actions">
          <button class="workspace-btn" id="workspaceServiceAccountUploadButton" type="button">JSON yuklash / almashtirish</button>
          <button class="workspace-btn danger" id="workspaceServiceAccountClearButton" type="button">JSONni o‘chirish</button>
        </div>
        <div class="workspace-note">JSON private_key brauzer localStorage’ida saqlanmaydi. Backend uni WORKSPACE_ENCRYPTION_KEY bilan encrypted qilib DB’da saqlaydi.</div>
      </div>`;
    if (actions) actions.insertAdjacentHTML('beforebegin', html);
    else form.insertAdjacentHTML('beforeend', html);

    qs('#workspaceServiceAccountUploadButton')?.addEventListener('click', uploadServiceAccount);
    qs('#workspaceServiceAccountClearButton')?.addEventListener('click', clearServiceAccount);
    document.addEventListener('click', (event) => {
      if (event.target.closest('.workspace-list-item') || event.target.closest('#workspaceLoadListButton')) {
        window.setTimeout(refreshServiceAccountStatus, 250);
      }
    });
    refreshServiceAccountStatus();
    return true;
  }

  function boot() {
    if (installControls()) return;
    const observer = new MutationObserver(() => {
      if (installControls()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
