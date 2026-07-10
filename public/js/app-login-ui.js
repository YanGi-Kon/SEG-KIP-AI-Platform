// Sanegplatform entry login gate
// Manual login is required on every fresh page open. Stored refresh sessions do not auto-enter the platform.
(function setupAppLoginUi(){
  if (window.__sanegEntryLoginLoaded) return;
  window.__sanegEntryLoginLoaded = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const LOGIN_EMAIL_KEY = 'seg_kip_last_login_email';
  const state = { accessToken: '', user: null, workspaces: [], manualLoginStarted: false };

  function qs(selector, root = document){ return root.querySelector(selector); }
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
    const isAuthPath = path.includes('/api/auth/login') || path.includes('/api/auth/refresh');
    if (res.status === 401 && retry && !isAuthPath) {
      if (!state.manualLoginStarted) {
        setToken('');
        throw Object.assign(new Error('Manual login required'), { status: 401, data: { code: 'MANUAL_LOGIN_REQUIRED' } });
      }
      await refreshSession();
      return apiFetch(path, options, false);
    }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status });
    return data;
  }
  async function refreshSession(){
    if (!state.manualLoginStarted) {
      setToken('');
      throw Object.assign(new Error('Manual login required'), { status: 401, data: { code: 'LOGIN_REFRESH_BLOCKED' } });
    }
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
    const data = await apiFetch('/api/workspaces', { method: 'GET' }, false);
    state.workspaces = Array.isArray(data.rows) ? data.rows : [];
    const currentId = localStorage.getItem(SELECTED_WORKSPACE_KEY) || '';
    const current = state.workspaces.find((workspace) => workspace.id === currentId);
    const preferred = current || state.workspaces.find((workspace) => workspace.status === 'active') || state.workspaces[0] || null;
    if (preferred?.id) localStorage.setItem(SELECTED_WORKSPACE_KEY, preferred.id);
    else localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    return preferred;
  }

  function injectStyle(){
    if (qs('#segEntryLoginStyle')) return;
    const style = document.createElement('style');
    style.id = 'segEntryLoginStyle';
    style.textContent = `
      .seg-entry-login-overlay{position:fixed;inset:0;z-index:30000;display:none;background:#020817;color:#eaffff;font-family:Inter,Arial,Helvetica,sans-serif;overflow:auto;}
      .seg-entry-login-overlay.open{display:flex;}
      .seg-entry-login-shell{width:100%;min-height:100vh;display:grid;grid-template-columns:minmax(390px,42%) minmax(520px,58%);background:linear-gradient(135deg,#f8fafc 0%,#eef6fb 38%,#03111f 38%,#020817 100%);}
      .seg-entry-login-left{display:flex;align-items:center;justify-content:center;padding:36px;background:radial-gradient(circle at 10% 10%,rgba(34,211,238,.15),transparent 34%),linear-gradient(180deg,#fff,#f3f8fb);}
      .seg-entry-login-card{width:min(520px,100%);border:1px solid rgba(15,23,42,.08);border-radius:28px;padding:34px;background:rgba(255,255,255,.94);box-shadow:0 28px 86px rgba(15,23,42,.14);color:#071427;backdrop-filter:blur(18px);}
      .seg-entry-login-brand{display:flex;align-items:center;gap:16px;margin-bottom:30px;}.seg-entry-login-logo{width:62px;height:62px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#0ea5e9,#10b981);box-shadow:0 14px 32px rgba(14,165,233,.24);}.seg-entry-login-logo::before{content:'S';width:40px;height:40px;border-radius:13px;display:grid;place-items:center;border:4px solid rgba(255,255,255,.85);color:#fff;font-size:26px;font-weight:1000;line-height:1;}
      .seg-entry-login-card h2{margin:0;font-size:18px;letter-spacing:-.3px;color:#061427;font-weight:1000;}.seg-entry-login-card p{margin:4px 0 0;color:#516172;line-height:1.45;font-size:12px;}.seg-entry-login-title{margin:0 0 8px;font-size:28px;font-weight:1000;color:#071427;}.seg-entry-login-subtitle{margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.55;}
      .seg-entry-login-form{display:grid;gap:15px;margin-top:18px;}.seg-entry-login-label{display:grid;gap:7px;color:#0f2438;font-size:13px;font-weight:900;}.seg-entry-login-field{position:relative;display:flex;align-items:center;}.seg-entry-login-icon{position:absolute;left:14px;color:#64748b;font-size:17px;pointer-events:none;}.seg-entry-login-input{width:100%;border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;border-radius:15px;padding:14px 44px;font-size:14px;outline:none;}.seg-entry-login-input:focus{border-color:rgba(14,165,233,.72);box-shadow:0 0 0 4px rgba(14,165,233,.11);}.seg-entry-login-eye{position:absolute;right:12px;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:16px;padding:5px;border-radius:10px;}.seg-entry-login-select{appearance:none;background:#fff;cursor:pointer;}.seg-entry-login-select-wrap::after{content:'⌄';position:absolute;right:15px;top:50%;transform:translateY(-55%);color:#64748b;font-weight:900;pointer-events:none;}
      .seg-entry-login-actions{display:grid;margin-top:8px;}.seg-entry-login-btn{border:0;border-radius:15px;background:linear-gradient(135deg,#075da8,#21c794);color:white;padding:15px 18px;font-size:15px;font-weight:1000;cursor:pointer;box-shadow:0 14px 28px rgba(14,165,233,.24);}.seg-entry-login-btn:disabled{opacity:.65;cursor:not-allowed;}.seg-entry-login-security{display:flex;align-items:center;justify-content:center;gap:10px;margin:17px 0 0;color:#0f766e;font-weight:900;font-size:13px;}
      .seg-entry-login-msg{min-height:42px;border:1px solid rgba(14,165,233,.20);border-radius:15px;padding:11px 12px;margin-top:14px;color:#334155;background:rgba(14,165,233,.05);line-height:1.4;white-space:pre-wrap;font-size:13px;}.seg-entry-login-msg.ok{border-color:rgba(16,185,129,.34);color:#047857;background:rgba(16,185,129,.08);}.seg-entry-login-msg.error{border-color:rgba(239,68,68,.38);color:#b91c1c;background:rgba(239,68,68,.08);}.seg-entry-login-msg.warn{border-color:rgba(245,158,11,.40);color:#92400e;background:rgba(245,158,11,.10);}
      .seg-entry-login-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(15,23,42,.13),transparent);margin:23px 0 16px;}.seg-entry-login-footnote{display:flex;align-items:center;justify-content:center;gap:12px;color:#64748b;font-size:13px;line-height:1.45;}.seg-entry-login-chip{width:36px;height:36px;border-radius:13px;display:grid;place-items:center;border:1px dashed rgba(14,165,233,.45);color:#0ea5e9;background:rgba(14,165,233,.06);font-size:17px;}.seg-entry-login-copy{margin-top:18px;text-align:center;color:#94a3b8;font-size:12px;}
      .seg-entry-login-right{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:44px;background:radial-gradient(circle at 62% 42%,rgba(16,185,129,.26),transparent 26%),radial-gradient(circle at 20% 18%,rgba(14,165,233,.25),transparent 30%),linear-gradient(135deg,#020817,#031525 45%,#020817);}.seg-entry-login-right::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(34,211,238,.05) 0 1px,transparent 1px 96px),repeating-linear-gradient(0deg,rgba(16,185,129,.035) 0 1px,transparent 1px 86px);opacity:.85;}
      .seg-entry-servers{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);gap:18px;padding:24px 28px;opacity:.56;}.seg-entry-server{border:1px solid rgba(34,211,238,.10);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(2,8,23,.62));position:relative;overflow:hidden;}.seg-entry-server::before{content:'';position:absolute;inset:18px 9px;background:repeating-linear-gradient(180deg,rgba(34,211,238,.45) 0 3px,transparent 3px 16px);opacity:.22;}.seg-entry-hero{position:relative;z-index:2;width:min(900px,100%);min-height:650px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;}.seg-entry-hero h3{margin:0;color:#f8fafc;font-size:30px;text-align:center;}.seg-entry-hero p{margin:0;color:#b8d4e3;text-align:center;line-height:1.5;}
      .seg-entry-orbit{position:relative;width:min(620px,84vw);height:300px;display:grid;place-items:center;margin:12px 0;}.seg-entry-plant{width:280px;height:180px;border-radius:50%;border:1px solid rgba(34,211,238,.55);background:radial-gradient(circle,rgba(16,185,129,.16),rgba(14,165,233,.08) 48%,transparent 70%);box-shadow:0 0 42px rgba(34,211,238,.28),inset 0 0 32px rgba(16,185,129,.14);}.seg-entry-card{position:absolute;min-width:190px;border:1px solid rgba(125,211,252,.32);border-radius:18px;padding:15px;background:linear-gradient(180deg,rgba(15,23,42,.82),rgba(2,8,23,.72));box-shadow:0 18px 50px rgba(0,0,0,.28);backdrop-filter:blur(14px);}.seg-entry-card b{display:block;color:#fff;font-size:13px;margin-bottom:10px;}.seg-entry-card strong{display:block;color:#fff;font-size:28px;}.seg-entry-card span{display:block;color:#a7c6d4;font-size:12px;margin-top:3px;}.seg-entry-card small{display:block;color:#34d399;font-size:12px;margin-top:10px;font-weight:900;}.seg-entry-card.registry{left:0;top:20px;}.seg-entry-card.monitor{left:35%;top:72px;}.seg-entry-card.approval{right:0;top:28px;}.seg-entry-card.ai{right:18px;bottom:0;min-width:215px;}.seg-entry-ai-face{width:58px;height:45px;border-radius:20px;background:linear-gradient(180deg,#ecfeff,#93c5fd);margin:8px auto 12px;box-shadow:0 0 26px rgba(34,211,238,.38);}
      .seg-entry-nav{width:min(760px,96%);display:grid;grid-template-columns:repeat(6,1fr);gap:8px;border:1px solid rgba(34,211,238,.22);border-radius:20px;padding:10px;background:rgba(2,8,23,.56);backdrop-filter:blur(14px);}.seg-entry-nav span{display:flex;align-items:center;justify-content:center;gap:7px;color:#eaffff;font-weight:800;font-size:12px;white-space:nowrap;}.seg-entry-compliance{display:flex;align-items:center;gap:10px;color:#b8d4e3;font-size:13px;margin-top:10px;}body.seg-login-blocked .main,body.seg-login-blocked .sidebar{pointer-events:none;filter:brightness(.72);}
      @media(max-width:980px){.seg-entry-login-shell{grid-template-columns:1fr;background:linear-gradient(135deg,#f8fafc,#eef6fb)}.seg-entry-login-right{display:none}.seg-entry-login-left{min-height:100vh}.seg-entry-login-card{padding:28px}.seg-entry-login-card h2{font-size:26px}}@media(max-width:520px){.seg-entry-login-left{padding:18px}.seg-entry-login-card{border-radius:22px;padding:22px}.seg-entry-login-logo{width:52px;height:52px}.seg-entry-login-title{font-size:24px}}
    `;
    document.head.appendChild(style);
  }

  function injectModal(){
    if (qs('#segEntryLoginOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'segEntryLoginOverlay';
    overlay.className = 'seg-entry-login-overlay';
    overlay.innerHTML = `
      <div class="seg-entry-login-shell" role="dialog" aria-modal="true" aria-label="Sanegplatform login"><section class="seg-entry-login-left"><div class="seg-entry-login-card"><div class="seg-entry-login-brand"><div class="seg-entry-login-logo" aria-hidden="true"></div><div><h2>Sanegplatform</h2><p>KIP Digital Control System</p></div></div><h3 class="seg-entry-login-title">Kirish tizimi</h3><p class="seg-entry-login-subtitle">Hisobingizga kirish uchun ma’lumotlaringizni kiriting.</p><form id="segEntryLoginForm" class="seg-entry-login-form"><label class="seg-entry-login-label">Login<div class="seg-entry-login-field"><span class="seg-entry-login-icon">👤</span><input id="segEntryLoginEmail" class="seg-entry-login-input" type="email" autocomplete="username" placeholder="Login kiriting" required></div></label><label class="seg-entry-login-label">Parol<div class="seg-entry-login-field"><span class="seg-entry-login-icon">🔒</span><input id="segEntryLoginPassword" class="seg-entry-login-input" type="password" autocomplete="current-password" placeholder="Parol kiriting" required><button id="segEntryPasswordToggle" class="seg-entry-login-eye" type="button" aria-label="Parolni ko‘rsatish">👁</button></div></label><label class="seg-entry-login-label">Til / Language<div class="seg-entry-login-field seg-entry-login-select-wrap"><span class="seg-entry-login-icon">🌐</span><select id="segEntryLoginLanguage" class="seg-entry-login-input seg-entry-login-select"><option>O‘zbekcha (Uzbek)</option><option>Русский</option><option>English</option></select></div></label><div class="seg-entry-login-actions"><button id="segEntryLoginButton" class="seg-entry-login-btn" type="submit">↪ Kirish</button></div></form><div class="seg-entry-login-security">🛡 Secure corporate access</div><div id="segEntryLoginMsg" class="seg-entry-login-msg">Login va parolni kiriting.</div><div class="seg-entry-login-divider"></div><div class="seg-entry-login-footnote"><span class="seg-entry-login-chip">▣</span><span>Industrial AI monitoring<br>and document workflow</span></div><div class="seg-entry-login-copy">© 2026 Sanegplatform. All rights reserved.</div></div></section><section class="seg-entry-login-right" aria-label="Sanegplatform KIP infographic"><div class="seg-entry-servers"><div class="seg-entry-server"></div><div class="seg-entry-server"></div><div class="seg-entry-server"></div><div class="seg-entry-server"></div><div class="seg-entry-server"></div><div class="seg-entry-server"></div><div class="seg-entry-server"></div><div class="seg-entry-server"></div></div><div class="seg-entry-hero"><div><h3>KIP Digital Control System</h3><p>Real vaqt monitoringi · Aqlli qarorlar · Sanoat samaradorligi</p></div><div class="seg-entry-orbit"><div class="seg-entry-card registry"><b>📋 Asboblar reyestri</b><strong>2,489</strong><span>Jami asboblar</span><small>Faol · 2,156</small></div><div class="seg-entry-card monitor"><b>📈 Real vaqt monitoringi</b><strong>98.6%</strong><span>Tizim uzluksizligi</span><small>Barqaror ishlamoqda</small></div><div class="seg-entry-card approval"><b>✅ Akt tasdiqlash</b><strong>124</strong><span>Kutilayotgan tasdiqlar</span><small>Shu hafta +18%</small></div><div class="seg-entry-plant" aria-hidden="true"></div><div class="seg-entry-card ai"><b>AI yordamchi</b><div class="seg-entry-ai-face"></div><span>Tahlil, hisobot va operatsion ma’lumotlar bo‘yicha yordam beradi.</span></div></div><div class="seg-entry-nav"><span>◉ Monitoring</span><span>⌁ Tahlil</span><span>⚠ Ogohlantirish</span><span>▤ Hujjatlar</span><span>▥ Hisobotlar</span><span>⌘ Jarayonlar</span></div><div class="seg-entry-compliance">🛡 Korporativ darajadagi xavfsizlik va muvofiqlik</div></div></section></div>`;
    document.body.appendChild(overlay);
    qs('#segEntryLoginEmail').value = localStorage.getItem(LOGIN_EMAIL_KEY) || '';
    qs('#segEntryLoginForm')?.addEventListener('submit', login);
    qs('#segEntryPasswordToggle')?.addEventListener('click', () => {
      const input = qs('#segEntryLoginPassword');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
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
    if (!email || !password) return setMessage('Login va parolni kiriting.', 'warn');
    try {
      state.manualLoginStarted = true;
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
    // Try to silently restore session via refresh token cookie
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await parseResponse(res);
      if (res.ok && data.accessToken) {
        setToken(data.accessToken);
        state.user = data.user || null;
        state.manualLoginStarted = true;
        // Load workspaces silently
        try { await loadWorkspacesAndSelect(); } catch (_) {}
        // Session restored — stay logged in, don't show login screen
        return;
      }
    } catch (_) {}
    // Refresh failed — show login screen
    injectStyle();
    injectModal();
    showLogin('Login va parolni kiriting.', 'info');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.segEntryLogin = { show: showLogin, hide: hideLogin, refresh: loadWorkspacesAndSelect, state };
})();
