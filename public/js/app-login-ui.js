// SEG KIP entry login gate
// Shows Email/Password when the project opens, then selects the first available Workspace automatically.
(function setupAppLoginUi(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const LOGIN_EMAIL_KEY = 'seg_kip_last_login_email';
  const state = { accessToken: sessionStorage.getItem(ACCESS_TOKEN_KEY) || '', user: null, workspaces: [] };

  function qs(selector, root = document){ return root.querySelector(selector); }
  function esc(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function setToken(token){
    state.accessToken = token || '';
    if (state.accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, state.accessToken);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  function setMessage(message, tone = 'info'){
    const box = qs('#segEntryLoginMsg');
    if (!box) return;
    box.className = `seg-entry-login-msg ${tone}`;
    box.textContent = message || '';
  }
  async function parseResponse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  async function apiFetch(path, options = {}, retry = true){
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
    const res = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await parseResponse(res);
    if (res.status === 401 && retry && !path.includes('/api/auth/login') && !path.includes('/api/auth/refresh')) {
      await refreshSession();
      return apiFetch(path, options, false);
    }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status });
    return data;
  }
  async function refreshSession(){
    const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
    const data = await parseResponse(res);
    if (!res.ok) {
      setToken('');
      throw new Error(data.error || 'Session topilmadi');
    }
    setToken(data.accessToken || '');
    state.user = data.user || null;
    return data;
  }
  async function loadWorkspacesAndSelect(){
    const data = await apiFetch('/api/workspaces', { method: 'GET' });
    state.workspaces = Array.isArray(data.rows) ? data.rows : [];
    const currentId = localStorage.getItem(SELECTED_WORKSPACE_KEY) || '';
    const current = state.workspaces.find((workspace) => workspace.id === currentId);
    const preferred = current
      || state.workspaces.find((workspace) => workspace.status === 'active')
      || state.workspaces[0]
      || null;
    if (preferred?.id) localStorage.setItem(SELECTED_WORKSPACE_KEY, preferred.id);
    else localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    return preferred;
  }
  function injectStyle(){
    if (qs('#segEntryLoginStyle')) return;
    const style = document.createElement('style');
    style.id = 'segEntryLoginStyle';
    style.textContent = `
      .seg-entry-login-overlay{position:fixed;inset:0;z-index:30000;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(2,8,23,.86);backdrop-filter:blur(12px);}
      .seg-entry-login-overlay.open{display:flex;}
      .seg-entry-login-card{width:min(460px,100%);border:1px solid rgba(34,211,238,.38);border-radius:30px;padding:26px;background:linear-gradient(145deg,rgba(4,18,32,.98),rgba(5,13,26,.98));box-shadow:0 28px 90px rgba(0,0,0,.62),0 0 42px rgba(34,211,238,.13);color:#eaffff;}
      .seg-entry-login-brand{display:flex;align-items:center;gap:13px;margin-bottom:18px;}
      .seg-entry-login-logo{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;border:1px solid rgba(34,211,238,.42);background:rgba(34,211,238,.10);font-size:24px;font-weight:900;}
      .seg-entry-login-card h2{margin:0;font-size:26px;letter-spacing:.2px;}
      .seg-entry-login-card p{margin:5px 0 0;color:#a7c6d4;line-height:1.45;font-size:13px;}
      .seg-entry-login-form{display:grid;gap:13px;margin-top:18px;}
      .seg-entry-login-label{display:grid;gap:7px;color:#cde7f0;font-size:13px;font-weight:800;}
      .seg-entry-login-input{width:100%;border:1px solid rgba(34,211,238,.26);background:#061120;color:#f8fafc;border-radius:16px;padding:13px 14px;font-size:14px;outline:none;}
      .seg-entry-login-input:focus{border-color:rgba(34,211,238,.75);box-shadow:0 0 0 3px rgba(34,211,238,.13);}
      .seg-entry-login-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:4px;}
      .seg-entry-login-btn{border:0;border-radius:16px;background:linear-gradient(135deg,#22d3ee,#10b981);color:#001018;padding:12px 17px;font-weight:900;cursor:pointer;}
      .seg-entry-login-btn:disabled{opacity:.6;cursor:not-allowed;}
      .seg-entry-login-msg{min-height:43px;border:1px dashed rgba(34,211,238,.22);border-radius:16px;padding:11px 12px;margin-top:14px;color:#cde7f0;background:rgba(2,8,23,.56);line-height:1.4;white-space:pre-wrap;}
      .seg-entry-login-msg.ok{border-color:rgba(16,185,129,.42);color:#bbf7d0;background:rgba(16,185,129,.08);}
      .seg-entry-login-msg.error{border-color:rgba(239,68,68,.44);color:#fecaca;background:rgba(239,68,68,.08);}
      .seg-entry-login-msg.warn{border-color:rgba(245,158,11,.44);color:#fde68a;background:rgba(245,158,11,.08);}
      body.seg-login-blocked .main,body.seg-login-blocked .sidebar{pointer-events:none;filter:brightness(.72);}
    `;
    document.head.appendChild(style);
  }
  function injectModal(){
    if (qs('#segEntryLoginOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'segEntryLoginOverlay';
    overlay.className = 'seg-entry-login-overlay';
    overlay.innerHTML = `
      <div class="seg-entry-login-card" role="dialog" aria-modal="true" aria-label="SEG KIP login">
        <div class="seg-entry-login-brand">
          <div class="seg-entry-login-logo">SEG</div>
          <div>
            <h2>SEG KIP Platform</h2>
            <p>Loyihaga kirish uchun login va parolni kiriting.</p>
          </div>
        </div>
        <form id="segEntryLoginForm" class="seg-entry-login-form">
          <label class="seg-entry-login-label">Email
            <input id="segEntryLoginEmail" class="seg-entry-login-input" type="email" autocomplete="username" required>
          </label>
          <label class="seg-entry-login-label">Parol
            <input id="segEntryLoginPassword" class="seg-entry-login-input" type="password" autocomplete="current-password" required>
          </label>
          <div class="seg-entry-login-actions">
            <button id="segEntryLoginButton" class="seg-entry-login-btn" type="submit">Kirish</button>
          </div>
        </form>
        <div id="segEntryLoginMsg" class="seg-entry-login-msg">Session tekshirilmoqda...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    qs('#segEntryLoginEmail').value = localStorage.getItem(LOGIN_EMAIL_KEY) || '';
    qs('#segEntryLoginForm')?.addEventListener('submit', login);
  }
  function showLogin(message = 'Login va parolni kiriting.', tone = 'info'){
    injectStyle();
    injectModal();
    document.body.classList.add('seg-login-blocked');
    qs('#segEntryLoginOverlay')?.classList.add('open');
    setMessage(message, tone);
    setTimeout(() => (qs('#segEntryLoginEmail')?.focus()), 50);
  }
  function hideLogin(){
    document.body.classList.remove('seg-login-blocked');
    qs('#segEntryLoginOverlay')?.classList.remove('open');
  }
  async function login(event){
    event?.preventDefault();
    const email = qs('#segEntryLoginEmail')?.value.trim() || '';
    const password = qs('#segEntryLoginPassword')?.value || '';
    const button = qs('#segEntryLoginButton');
    if (!email || !password) return setMessage('Email va parolni kiriting.', 'warn');
    try {
      if (button) button.disabled = true;
      setMessage('Login tekshirilmoqda...', 'info');
      const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
      setToken(data.accessToken || '');
      state.user = data.user || null;
      localStorage.setItem(LOGIN_EMAIL_KEY, email);
      const workspace = await loadWorkspacesAndSelect();
      if (!workspace) {
        showLogin('Login muvaffaqiyatli, lekin sizga biriktirilgan Workspace topilmadi.', 'warn');
        return;
      }
      setMessage(`Kirish muvaffaqiyatli. Workspace: ${workspace.name}`, 'ok');
      setTimeout(hideLogin, 350);
    } catch (error) {
      setToken('');
      showLogin(`Login xato: ${error.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
      const passwordInput = qs('#segEntryLoginPassword');
      if (passwordInput) passwordInput.value = '';
    }
  }
  async function boot(){
    injectStyle();
    injectModal();
    showLogin('Session tekshirilmoqda...', 'info');
    try {
      await refreshSession();
      const workspace = await loadWorkspacesAndSelect();
      if (workspace) {
        setMessage(`Session faol. Workspace: ${workspace.name}`, 'ok');
        setTimeout(hideLogin, 250);
      } else {
        showLogin('Session faol, lekin Workspace topilmadi. Administratorga murojaat qiling.', 'warn');
      }
    } catch (_) {
      showLogin('Login va parolni kiriting.', 'info');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.segEntryLogin = { show: showLogin, hide: hideLogin, refresh: loadWorkspacesAndSelect, state };
})();
