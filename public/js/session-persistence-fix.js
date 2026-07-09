// Session and settings persistence patch
// Keeps Workspace/Google Sheets UI state stable across page refreshes.
(function sessionPersistenceFix(){
  if (window.__segSessionPersistenceFixLoaded) return;
  window.__segSessionPersistenceFixLoaded = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const PROTECTED_SELECTORS = ['#workspaceSettingsPage', '.seg-workspace-menu', '#workspaceSignersPanel'];

  function qs(selector, root = document){ return root.querySelector(selector); }

  async function parseResponse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }

  function setAccessToken(token){
    if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  async function refreshSession(){
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const data = await parseResponse(res);
    if (!res.ok || !data.accessToken) throw new Error(data.error || 'Session refresh failed');
    setAccessToken(data.accessToken);
    window.dispatchEvent(new CustomEvent('seg-session-restored', { detail: data }));
    return data;
  }

  function preserveWorkspaceUi(){
    const originalRemove = Element.prototype.remove;
    if (originalRemove.__segWorkspacePreservePatch) return;

    Element.prototype.remove = function patchedRemove(){
      try {
        if (PROTECTED_SELECTORS.some((selector) => this.matches?.(selector))) {
          this.dataset.preserveRequested = 'true';
          return;
        }
      } catch (_) {}
      return originalRemove.call(this);
    };
    Element.prototype.remove.__segWorkspacePreservePatch = true;
  }

  function ensureWorkspaceScripts(){
    if (!document.getElementById('segWorkspaceUiScript')) {
      const script = document.createElement('script');
      script.id = 'segWorkspaceUiScript';
      script.src = '/js/workspace-ui.js?v=session2';
      script.defer = true;
      document.head.appendChild(script);
    }
    if (!document.getElementById('segWorkspaceSessionCleanupScript')) {
      const cleanup = document.createElement('script');
      cleanup.id = 'segWorkspaceSessionCleanupScript';
      cleanup.src = '/js/workspace-session-cleanup.js?v=session2';
      cleanup.defer = true;
      document.head.appendChild(cleanup);
    }
  }

  function updateActsServiceAccountLabel(){
    try {
      const raw = localStorage.getItem('acts_service_account');
      if (!raw) return;
      const service = JSON.parse(raw);
      const box = qs('#serviceFileName');
      if (box && service?.client_email) box.innerHTML = `${service.client_email} ✓`;
    } catch (_) {}
  }

  async function bootstrap(){
    preserveWorkspaceUi();
    ensureWorkspaceScripts();
    updateActsServiceAccountLabel();

    // Note: session refresh is handled by saneg-login-gate.js on boot
    // No need to call refreshSession() here to avoid race conditions

    window.setTimeout(() => {
      ensureWorkspaceScripts();
      updateActsServiceAccountLabel();
      const selected = localStorage.getItem(SELECTED_WORKSPACE_KEY);
      if (selected) window.segWorkspaceUi?.refresh?.();
    }, 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
