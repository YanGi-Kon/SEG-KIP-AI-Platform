// Adds a protected Archive action to the Workspace Settings UI.
(function setupWorkspaceArchiveAction() {
  const TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_KEY = 'seg_kip_selected_workspace_id';

  function setStatus(message, tone) {
    const box = document.getElementById('workspaceStatusBox');
    if (!box) return;
    box.className = `workspace-status ${tone || 'info'}`;
    box.textContent = message;
  }

  function setResult(payload) {
    const result = document.getElementById('workspaceTestResult');
    if (!result) return;
    result.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  }

  async function archiveSelectedWorkspace() {
    const workspaceId = localStorage.getItem(SELECTED_KEY) || window.segWorkspaceUi?.state?.selectedWorkspaceId || '';
    const token = sessionStorage.getItem(TOKEN_KEY) || window.segWorkspaceUi?.state?.accessToken || '';
    const workspaceName = document.getElementById('workspaceNameInput')?.value?.trim() || workspaceId;

    if (!workspaceId) {
      setStatus('Archive qilish uchun avval Workspace tanlang.', 'warn');
      return;
    }
    if (!token) {
      setStatus('Archive qilish uchun avval login qiling.', 'warn');
      return;
    }

    const ok = window.confirm(`Workspace archive qilinsinmi?\n\n${workspaceName}\n\nBu action asosiy ro‘yxatdan olib tashlaydi. Real Workspace’da faqat ishonch bilan bosing.`);
    if (!ok) return;

    setStatus('Workspace archive qilinmoqda...', 'info');
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      localStorage.removeItem(SELECTED_KEY);
      if (window.segWorkspaceUi?.state) window.segWorkspaceUi.state.selectedWorkspaceId = '';
      setStatus('Workspace archive qilindi. Ro‘yxat yangilanmoqda...', 'ok');
      setResult(data);
      if (typeof window.segWorkspaceUi?.refresh === 'function') {
        await window.segWorkspaceUi.refresh();
      }
    } catch (error) {
      setStatus(`Archive xato: ${error.message}`, 'error');
      setResult({ error: error.message });
    }
  }

  function installButton() {
    if (document.getElementById('workspaceArchiveButton')) return;
    const activateButton = document.getElementById('workspaceActivateButton');
    const actions = activateButton?.closest('.workspace-actions');
    if (!actions) return;

    const button = document.createElement('button');
    button.id = 'workspaceArchiveButton';
    button.className = 'workspace-btn danger';
    button.type = 'button';
    button.textContent = 'Archive';
    button.addEventListener('click', archiveSelectedWorkspace);
    actions.appendChild(button);
  }

  function setup() {
    installButton();
    const observer = new MutationObserver(installButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
