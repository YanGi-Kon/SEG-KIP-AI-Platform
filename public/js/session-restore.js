// Stable session restore for refresh navigation.
(function stableSessionRestore(){
  if (window.__segStableSessionRestoreLoaded) return;
  window.__segStableSessionRestoreLoaded = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';

  function byId(id){ return document.getElementById(id); }

  async function parseResponse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }

  function saveAccessToken(token){
    if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  }

  function showDashboardWhenSessionExists(){
    if (!sessionStorage.getItem(ACCESS_TOKEN_KEY)) return;
    document.documentElement.classList.remove('saneg-auth-boot', 'saneg-login-active');
    document.body?.classList?.remove('saneg-login-active');
    const authStyle = byId('sanegAuthBootStyle');
    if (authStyle) authStyle.disabled = true;
    const loginGate = byId('sanegLoginGate');
    if (loginGate) loginGate.style.display = 'none';
  }

  function scheduleDashboardRelease(){
    [0, 120, 350, 800, 1500, 2500].forEach((delay) => {
      window.setTimeout(showDashboardWhenSessionExists, delay);
    });
  }

  async function refreshSession(){
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const data = await parseResponse(res);
    if (!res.ok || !data.accessToken) throw new Error(data.error || 'Session refresh failed');
    saveAccessToken(data.accessToken);
    scheduleDashboardRelease();
    return data;
  }

  function loadWorkspaceUi(){
    if (!byId('segWorkspaceUiScript')) {
      const script = document.createElement('script');
      script.id = 'segWorkspaceUiScript';
      script.src = '/js/workspace-ui.js?v=session3';
      script.defer = true;
      document.head.appendChild(script);
    }
    if (!byId('segWorkspaceSessionCleanupScript')) {
      const cleanup = document.createElement('script');
      cleanup.id = 'segWorkspaceSessionCleanupScript';
      cleanup.src = '/js/workspace-session-cleanup.js?v=session3';
      cleanup.defer = true;
      document.head.appendChild(cleanup);
    }
  }

  function markLoadedServiceAccount(){
    try {
      const raw = localStorage.getItem('acts_service_account');
      if (!raw) return;
      const service = JSON.parse(raw);
      const box = byId('serviceFileName');
      if (box && service?.client_email) box.textContent = `${service.client_email} ✓`;
    } catch (_) {}
  }

  async function boot(){
    loadWorkspaceUi();
    markLoadedServiceAccount();

    if (sessionStorage.getItem(ACCESS_TOKEN_KEY)) {
      scheduleDashboardRelease();
    } else {
      try { await refreshSession(); } catch (_) {}
    }

    window.setTimeout(() => {
      loadWorkspaceUi();
      markLoadedServiceAccount();
      if (localStorage.getItem(SELECTED_WORKSPACE_KEY)) window.segWorkspaceUi?.refresh?.();
    }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
