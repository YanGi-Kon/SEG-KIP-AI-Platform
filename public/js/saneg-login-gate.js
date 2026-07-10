// Stable Sanegplatform login gate
// Purpose: render a reliable manual login screen without auto refresh, reload loops, or repeated script injection.
(function sanegLoginGate(){
  if (window.__sanegStableLoginGateLoaded) return;
  window.__sanegStableLoginGateLoaded = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const LOGIN_EMAIL_KEY = 'seg_kip_last_login_email';
  const state = { accessToken: '', user: null, workspaces: [] };

  function qs(selector, root = document){ return root.querySelector(selector); }
  function setToken(token){
    state.accessToken = token || '';
    if (state.accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, state.accessToken);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  function releaseAuthBootGuard(){
    document.documentElement.classList.remove('saneg-auth-boot');
    qs('#sanegAuthBootStyle')?.remove();
    qs('#sanegAuthBootScript')?.remove();
  }
  function parseJsonSafe(text){
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  async function readResponse(res){
    const text = await res.text();
    return parseJsonSafe(text);
  }
  function setMessage(message, tone = 'info'){
    const box = qs('#sanegLoginMsg');
    if (!box) return;
    box.className = `saneg-login-msg ${tone}`;
    box.textContent = message || '';
  }

  async function api(path, options = {}){
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
    const res = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await readResponse(res);
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
    return data;
  }

  async function loadWorkspaces(){
    const data = await api('/api/workspaces', { method: 'GET' });
    state.workspaces = Array.isArray(data.rows) ? data.rows : [];
    const saved = localStorage.getItem(SELECTED_WORKSPACE_KEY) || '';
    const selected = state.workspaces.find((item) => item.id === saved)
      || state.workspaces.find((item) => item.status === 'active')
      || state.workspaces[0]
      || null;
    if (selected?.id) localStorage.setItem(SELECTED_WORKSPACE_KEY, selected.id);
    else localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    return selected;
  }

  function injectStyle(){
    if (qs('#sanegLoginGateStyle')) return;
    const style = document.createElement('style');
    style.id = 'sanegLoginGateStyle';
    style.textContent = `
      html.saneg-login-active,body.saneg-login-active{background:#020817 !important;}
      body.saneg-login-active .main,body.saneg-login-active .sidebar{pointer-events:none;filter:brightness(.55);}
      #sanegLoginGate{position:fixed;inset:0;z-index:50000;display:flex;background:#020817;color:#eaffff;font-family:Inter,Arial,Helvetica,sans-serif;}
      .saneg-login-shell{width:100%;min-height:100vh;display:grid;grid-template-columns:minmax(390px,42%) minmax(520px,58%);background:linear-gradient(135deg,#f8fafc 0%,#eef6fb 39%,#03111f 39%,#020817 100%);}
      .saneg-login-left{display:flex;align-items:center;justify-content:center;padding:36px;background:radial-gradient(circle at 10% 8%,rgba(34,211,238,.16),transparent 34%),linear-gradient(180deg,#fff,#f3f8fb);}
      .saneg-login-card{width:min(520px,100%);border:1px solid rgba(15,23,42,.08);border-radius:28px;padding:34px;background:rgba(255,255,255,.95);box-shadow:0 28px 86px rgba(15,23,42,.16);color:#071427;}
      .saneg-brand{display:flex;align-items:center;gap:16px;margin-bottom:30px;}
      .saneg-logo{width:62px;height:62px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#0ea5e9,#10b981);box-shadow:0 14px 32px rgba(14,165,233,.24);}
      .saneg-logo:before{content:'S';width:40px;height:40px;border-radius:13px;display:grid;place-items:center;border:4px solid rgba(255,255,255,.85);color:#fff;font-size:26px;font-weight:1000;line-height:1;}
      .saneg-brand h1{margin:0;font-size:18px;letter-spacing:-.3px;color:#061427;font-weight:1000;}
      .saneg-brand p{margin:5px 0 0;color:#516172;font-size:14px;}
      .saneg-login-title{margin:0 0 8px;font-size:28px;font-weight:1000;color:#071427;}
      .saneg-login-subtitle{margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.55;}
      .saneg-login-form{display:grid;gap:15px;margin-top:18px;}
      .saneg-field-label{display:grid;gap:7px;color:#0f2438;font-size:13px;font-weight:900;}
      .saneg-field{position:relative;display:flex;align-items:center;}
      .saneg-field-icon{position:absolute;left:14px;color:#64748b;font-size:17px;pointer-events:none;}
      .saneg-input{width:100%;border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;border-radius:15px;padding:14px 44px;font-size:14px;outline:none;}
      .saneg-input:focus{border-color:rgba(14,165,233,.72);box-shadow:0 0 0 4px rgba(14,165,233,.11);}
      .saneg-eye{position:absolute;right:12px;border:0;background:transparent;color:#64748b;cursor:pointer;font-size:16px;padding:5px;border-radius:10px;}
      .saneg-select{appearance:none;background:#fff;cursor:pointer;}
      .saneg-select-wrap:after{content:'⌄';position:absolute;right:15px;top:50%;transform:translateY(-55%);color:#64748b;font-weight:900;pointer-events:none;}
      .saneg-login-btn{border:0;border-radius:15px;background:linear-gradient(135deg,#075da8,#21c794);color:white;padding:15px 18px;font-size:15px;font-weight:1000;cursor:pointer;box-shadow:0 14px 28px rgba(14,165,233,.24);}
      .saneg-login-btn:disabled{opacity:.65;cursor:not-allowed;}
      .saneg-secure{display:flex;align-items:center;justify-content:center;gap:10px;margin:17px 0 0;color:#0f766e;font-weight:900;font-size:13px;}
      .saneg-login-msg{min-height:42px;border:1px solid rgba(14,165,233,.20);border-radius:15px;padding:11px 12px;margin-top:14px;color:#334155;background:rgba(14,165,233,.05);line-height:1.4;white-space:pre-wrap;font-size:13px;}
      .saneg-login-msg.ok{border-color:rgba(16,185,129,.34);color:#047857;background:rgba(16,185,129,.08);}
      .saneg-login-msg.error{border-color:rgba(239,68,68,.38);color:#b91c1c;background:rgba(239,68,68,.08);}
      .saneg-login-msg.warn{border-color:rgba(245,158,11,.40);color:#92400e;background:rgba(245,158,11,.10);}
      .saneg-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(15,23,42,.13),transparent);margin:23px 0 16px;}
      .saneg-note{display:flex;align-items:center;justify-content:center;gap:12px;color:#64748b;font-size:13px;line-height:1.45;}
      .saneg-note-icon{width:36px;height:36px;border-radius:13px;display:grid;place-items:center;border:1px dashed rgba(14,165,233,.45);color:#0ea5e9;background:rgba(14,165,233,.06);font-size:17px;}
      .saneg-copy{margin-top:18px;text-align:center;color:#94a3b8;font-size:12px;}
      .saneg-login-right{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:42px;background:#020817;}
      .saneg-login-right-bg{position:absolute;inset:0;background-image:url('/assets/login/saneg-login-hero.svg?v=hero1a');background-size:cover;background-position:center;background-repeat:no-repeat;transform:scale(1.015);filter:saturate(1.05) contrast(1.05);}
      .saneg-login-right-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(2,8,23,.22),rgba(2,8,23,.08) 48%,rgba(2,8,23,.32)),radial-gradient(circle at 20% 20%,rgba(14,165,233,.12),transparent 30%),radial-gradient(circle at 80% 42%,rgba(16,185,129,.10),transparent 28%);}
      .saneg-login-right-content{position:relative;z-index:2;width:min(960px,100%);min-height:650px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:20px;}
      .saneg-servers,.saneg-server{display:none !important;}
      .saneg-hero h2{margin:0;color:#f8fafc;font-size:30px;text-align:center;text-shadow:0 2px 18px rgba(0,0,0,.38);}
      .saneg-hero p{margin:0;color:#d7e7f0;text-align:center;line-height:1.5;text-shadow:0 2px 16px rgba(0,0,0,.42);}
      .saneg-orbit{position:relative;width:min(780px,88vw);height:340px;display:grid;place-items:center;margin:8px 0 4px;}
      .saneg-plant{display:none;}
      .saneg-flow-hub{position:absolute;top:0;left:50%;transform:translateX(-50%);width:118px;height:92px;border-radius:28px;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 50% 20%,rgba(34,211,238,.32),rgba(2,8,23,.78));border:1px solid rgba(34,211,238,.38);box-shadow:0 0 36px rgba(34,211,238,.25);}
      .saneg-sheets-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#22c55e,#10b981);box-shadow:0 0 22px rgba(16,185,129,.45);font-size:26px;}
      .saneg-flow-hub small{display:block;color:#eaffff;font-weight:1000;margin-top:6px;font-size:12px;}
      .saneg-flow-hub span{display:block;color:#b8d4e3;font-size:11px;margin-top:2px;}
      .saneg-flow-line{position:absolute;left:14%;right:14%;top:85px;height:78px;border-top:2px solid rgba(34,211,238,.62);border-radius:120px 120px 0 0;opacity:.95;filter:drop-shadow(0 0 8px rgba(34,211,238,.45));}
      .saneg-flow-line:before,.saneg-flow-line:after{content:'';position:absolute;top:-5px;width:10px;height:10px;border-radius:50%;background:#5eead4;box-shadow:0 0 14px #5eead4;}.saneg-flow-line:before{left:0;}.saneg-flow-line:after{right:0;}
      .saneg-info{position:absolute;min-width:210px;max-width:245px;border:1px solid rgba(125,211,252,.35);border-radius:18px;padding:17px;background:linear-gradient(180deg,rgba(15,23,42,.82),rgba(2,8,23,.68));box-shadow:0 18px 50px rgba(0,0,0,.30),0 0 24px rgba(34,211,238,.08);backdrop-filter:blur(12px);}
      .saneg-info b{display:block;color:#fff;font-size:16px;margin-bottom:12px;}.saneg-info span{display:block;color:#d3e5ef;font-size:12px;line-height:1.45;margin-top:5px;}.saneg-info small{display:block;color:#34d399;font-size:12px;margin-top:12px;font-weight:900;}
      .saneg-info.registry{left:0;top:105px;}.saneg-info.monitor{left:50%;top:145px;transform:translateX(-50%);}.saneg-info.approval{right:0;top:105px;}.saneg-info.ai{right:8px;bottom:0;min-width:220px;max-width:230px;}
      .saneg-ai-face{width:58px;height:45px;border-radius:20px;background:linear-gradient(180deg,#ecfeff,#93c5fd);margin:8px auto 12px;box-shadow:0 0 26px rgba(34,211,238,.38);}
      .saneg-card-icon{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:13px;margin-bottom:10px;background:linear-gradient(135deg,rgba(34,211,238,.22),rgba(16,185,129,.32));box-shadow:0 0 18px rgba(34,211,238,.20);}
      .saneg-mini-label{position:absolute;color:#7dd3fc;font-weight:900;font-size:12px;text-shadow:0 0 12px rgba(34,211,238,.55);}.saneg-mini-label.sync{left:100px;bottom:92px;}.saneg-mini-label.approve{right:136px;bottom:76px;}
      .saneg-nav{width:min(820px,96%);display:grid;grid-template-columns:repeat(6,1fr);gap:8px;border:1px solid rgba(34,211,238,.25);border-radius:20px;padding:10px;background:rgba(2,8,23,.52);backdrop-filter:blur(12px);box-shadow:0 14px 44px rgba(0,0,0,.22);}
      .saneg-nav span{display:flex;align-items:center;justify-content:center;gap:7px;color:#eaffff;font-weight:800;font-size:12px;white-space:nowrap;}
      .saneg-compliance{display:flex;align-items:center;gap:10px;color:#d8eaf2;font-size:13px;margin-top:10px;text-shadow:0 2px 16px rgba(0,0,0,.42);}
      @media(max-width:1180px){.saneg-info.ai{display:none}.saneg-orbit{width:min(680px,88vw)}.saneg-info.registry{left:0}.saneg-info.approval{right:0}}
      @media(max-width:980px){.saneg-login-shell{grid-template-columns:1fr;background:linear-gradient(135deg,#f8fafc,#eef6fb)}.saneg-login-right{display:none}.saneg-login-left{min-height:100vh}.saneg-login-card{padding:28px}.saneg-brand h1{font-size:26px}}
      @media(max-width:520px){.saneg-login-left{padding:18px}.saneg-login-card{border-radius:22px;padding:22px}.saneg-logo{width:52px;height:52px}.saneg-login-title{font-size:24px}}
    `;
    document.head.appendChild(style);
  }

  function render(){
    injectStyle();
    document.documentElement.classList.add('saneg-login-active');
    document.body.classList.add('saneg-login-active');
    document.querySelectorAll('#segEntryLoginOverlay,#sanegLoginGate').forEach((node) => node.remove());
    setToken('');

    const root = document.createElement('div');
    root.id = 'sanegLoginGate';
    root.innerHTML = `
      <div class="saneg-login-shell">
        <section class="saneg-login-left">
          <div class="saneg-login-card">
            <div class="saneg-brand"><div class="saneg-logo"></div><div><h1>Sanegplatform</h1><p>KIP Raqamli Boshqaruv Tizimi</p></div></div>
            <h2 class="saneg-login-title">Kirish tizimi</h2>
            <p class="saneg-login-subtitle">Hisobingizga kirish uchun ma’lumotlaringizni kiriting.</p>
            <form id="sanegLoginForm" class="saneg-login-form">
              <label class="saneg-field-label">Login<div class="saneg-field"><span class="saneg-field-icon">👤</span><input id="sanegLoginEmail" class="saneg-input" type="email" autocomplete="username" placeholder="Login kiriting" required></div></label>
              <label class="saneg-field-label">Parol<div class="saneg-field"><span class="saneg-field-icon">🔒</span><input id="sanegLoginPassword" class="saneg-input" type="password" autocomplete="current-password" placeholder="Parol kiriting" required><button id="sanegPasswordToggle" class="saneg-eye" type="button" aria-label="Parolni ko‘rsatish">👁</button></div></label>
              <label class="saneg-field-label">Til / Language<div class="saneg-field saneg-select-wrap"><span class="saneg-field-icon">🌐</span><select class="saneg-input saneg-select"><option>O‘zbekcha (Uzbek)</option><option>Русский</option><option>English</option></select></div></label>
              <button id="sanegLoginButton" class="saneg-login-btn" type="submit">↪ Kirish</button>
            </form>
            <div class="saneg-secure">🛡 Xavfsiz korporativ kirish</div>
            <div id="sanegLoginMsg" class="saneg-login-msg">Login va parolni kiriting. Avtomatik kirish o‘chirildi.</div>
            <div class="saneg-divider"></div>
            <div class="saneg-note"><span class="saneg-note-icon">▣</span><span>Sanoat AI monitoringi<br>va hujjat jarayoni</span></div>
            <div class="saneg-copy">© 2026 Sanegplatform. Barcha huquqlar himoyalangan.</div>
          </div>
        </section>
        <section class="saneg-login-right">
          <div class="saneg-login-right-bg" aria-hidden="true"></div>
          <div class="saneg-login-right-overlay" aria-hidden="true"></div>
          <div class="saneg-login-right-content saneg-hero">
            <div><h2>KIP Raqamli Boshqaruv Tizimi</h2><p>Google Sheets asosida monitoring, hujjat yuritish va aqlli boshqaruv</p></div>
            <div class="saneg-orbit">
              <div class="saneg-flow-hub"><div><div class="saneg-sheets-icon">▦</div><small>Google Sheets</small><span>ma’lumot manbai</span></div></div>
              <div class="saneg-flow-line"></div>
              <div class="saneg-info registry"><span class="saneg-card-icon">📋</span><b>Asboblar reyestri</b><span>Google Sheets bilan yuritiladi</span><span>Obyektlar bo‘yicha yangilanadi</span><small>Sinxronlash</small></div>
              <div class="saneg-info monitor"><span class="saneg-card-icon">📈</span><b>Real vaqt monitoringi</b><span>Ko‘rsatkichlar doimiy kuzatiladi</span><span>Holat avtomatik yangilanadi</span></div>
              <div class="saneg-info approval"><span class="saneg-card-icon">✅</span><b>Hujjat tasdiqlash</b><span>Tasdiqlash jarayoni nazoratda</span><span>Statuslar bosqichma-bosqich kuzatiladi</span></div>
              <div class="saneg-plant"></div>
              <div class="saneg-mini-label sync">Sinxronlash</div>
              <div class="saneg-mini-label approve">Tasdiqlash</div>
              <div class="saneg-info ai"><b>AI yordamchi</b><div class="saneg-ai-face"></div><span>Tahlil, hisobot va operatsion savollar bo‘yicha yordam beradi.</span><small>AI yordamchini ochish →</small></div>
            </div>
            <div class="saneg-nav"><span>◉ Monitoring</span><span>⌁ Tahlil</span><span>⚠ Ogohlantirishlar</span><span>▤ Hujjatlar</span><span>▥ Hisobotlar</span><span>⌘ Jarayonlar</span></div>
            <div class="saneg-compliance">🛡 Korporativ darajadagi xavfsizlik va nazorat</div>
          </div>
        </section>
      </div>`;
    document.body.appendChild(root);
    releaseAuthBootGuard();

    qs('#sanegLoginEmail').value = localStorage.getItem(LOGIN_EMAIL_KEY) || '';
    qs('#sanegPasswordToggle')?.addEventListener('click', () => {
      const input = qs('#sanegLoginPassword');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    qs('#sanegLoginForm')?.addEventListener('submit', login);
    setTimeout(() => qs('#sanegLoginEmail')?.focus(), 50);
  }

  async function login(event){
    event?.preventDefault();
    const email = qs('#sanegLoginEmail')?.value.trim() || '';
    const password = qs('#sanegLoginPassword')?.value || '';
    const button = qs('#sanegLoginButton');
    if (!email || !password) return setMessage('Login va parolni kiriting.', 'warn');
    try {
      if (button) button.disabled = true;
      setMessage('Login tekshirilmoqda...', 'info');
      const session = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(session.accessToken || '');
      state.user = session.user || null;
      localStorage.setItem(LOGIN_EMAIL_KEY, email);
      const workspace = await loadWorkspaces();
      if (!workspace) {
        setMessage('Login muvaffaqiyatli, lekin Workspace topilmadi. Administratorga murojaat qiling.', 'warn');
        return;
      }
      setMessage(`Kirish muvaffaqiyatli. Workspace: ${workspace.name}`, 'ok');
      setTimeout(() => {
        document.documentElement.classList.remove('saneg-login-active');
        document.body.classList.remove('saneg-login-active');
        qs('#sanegLoginGate')?.remove();
      }, 350);
    } catch (error) {
      setToken('');
      setMessage(`Login xato: ${error.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
      const pass = qs('#sanegLoginPassword');
      if (pass) pass.value = '';
    }
  }

  async function tryAutoLogin(){
    // Try to restore session via refresh token (cookie-based)
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) throw new Error('refresh failed');
      const data = await res.json();
      if (!data.accessToken) throw new Error('no token');
      setToken(data.accessToken);
      state.user = data.user || null;
      // Also load workspaces silently so workspace-ui works
      try { await loadWorkspaces(); } catch (_) {}
      // Session restored — don't show login screen
      releaseAuthBootGuard();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function boot(){
    const restored = await tryAutoLogin();
    if (!restored) render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.sanegLoginGate = { render, state };
})();
