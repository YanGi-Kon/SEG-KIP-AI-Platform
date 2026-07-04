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
      .saneg-brand h1{margin:0;font-size:30px;letter-spacing:-.6px;color:#061427;font-weight:1000;}
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
      .saneg-login-right{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;padding:44px;background:radial-gradient(circle at 62% 42%,rgba(16,185,129,.26),transparent 26%),radial-gradient(circle at 20% 18%,rgba(14,165,233,.25),transparent 30%),linear-gradient(135deg,#020817,#031525 45%,#020817);}
      .saneg-login-right:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(34,211,238,.05) 0 1px,transparent 1px 96px),repeating-linear-gradient(0deg,rgba(16,185,129,.035) 0 1px,transparent 1px 86px);opacity:.85;}
      .saneg-servers{position:absolute;inset:0;display:grid;grid-template-columns:repeat(8,1fr);gap:18px;padding:24px 28px;opacity:.56;}
      .saneg-server{border:1px solid rgba(34,211,238,.10);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.72),rgba(2,8,23,.62));position:relative;overflow:hidden;}
      .saneg-server:before{content:'';position:absolute;inset:18px 9px;background:repeating-linear-gradient(180deg,rgba(34,211,238,.45) 0 3px,transparent 3px 16px);opacity:.22;}
      .saneg-hero{position:relative;z-index:2;width:min(900px,100%);min-height:650px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;}
      .saneg-hero h2{margin:0;color:#f8fafc;font-size:30px;text-align:center;}
      .saneg-hero p{margin:0;color:#b8d4e3;text-align:center;line-height:1.5;}
      .saneg-orbit{position:relative;width:min(620px,84vw);height:300px;display:grid;place-items:center;margin:12px 0;}
      .saneg-plant{width:280px;height:180px;border-radius:50%;border:1px solid rgba(34,211,238,.55);background:radial-gradient(circle,rgba(16,185,129,.16),rgba(14,165,233,.08) 48%,transparent 70%);box-shadow:0 0 42px rgba(34,211,238,.28),inset 0 0 32px rgba(16,185,129,.14);}
      .saneg-info{position:absolute;min-width:190px;border:1px solid rgba(125,211,252,.32);border-radius:18px;padding:15px;background:linear-gradient(180deg,rgba(15,23,42,.82),rgba(2,8,23,.72));box-shadow:0 18px 50px rgba(0,0,0,.28);backdrop-filter:blur(14px);}
      .saneg-info b{display:block;color:#fff;font-size:13px;margin-bottom:10px;}.saneg-info strong{display:block;color:#fff;font-size:28px;}.saneg-info span{display:block;color:#a7c6d4;font-size:12px;margin-top:3px;}.saneg-info small{display:block;color:#34d399;font-size:12px;margin-top:10px;font-weight:900;}
      .saneg-info.registry{left:0;top:20px;}.saneg-info.monitor{left:35%;top:72px;}.saneg-info.approval{right:0;top:28px;}.saneg-info.ai{right:18px;bottom:0;min-width:215px;}
      .saneg-ai-face{width:58px;height:45px;border-radius:20px;background:linear-gradient(180deg,#ecfeff,#93c5fd);margin:8px auto 12px;box-shadow:0 0 26px rgba(34,211,238,.38);}
      .saneg-nav{width:min(760px,96%);display:grid;grid-template-columns:repeat(6,1fr);gap:8px;border:1px solid rgba(34,211,238,.22);border-radius:20px;padding:10px;background:rgba(2,8,23,.56);backdrop-filter:blur(14px);}
      .saneg-nav span{display:flex;align-items:center;justify-content:center;gap:7px;color:#eaffff;font-weight:800;font-size:12px;white-space:nowrap;}
      .saneg-compliance{display:flex;align-items:center;gap:10px;color:#b8d4e3;font-size:13px;margin-top:10px;}
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
            <div class="saneg-brand"><div class="saneg-logo"></div><div><h1>Sanegplatform</h1><p>KIP Digital Control System</p></div></div>
            <h2 class="saneg-login-title">Kirish tizimi</h2>
            <p class="saneg-login-subtitle">Hisobingizga kirish uchun ma’lumotlaringizni kiriting.</p>
            <form id="sanegLoginForm" class="saneg-login-form">
              <label class="saneg-field-label">Login<div class="saneg-field"><span class="saneg-field-icon">👤</span><input id="sanegLoginEmail" class="saneg-input" type="email" autocomplete="username" placeholder="Login kiriting" required></div></label>
              <label class="saneg-field-label">Parol<div class="saneg-field"><span class="saneg-field-icon">🔒</span><input id="sanegLoginPassword" class="saneg-input" type="password" autocomplete="current-password" placeholder="Parol kiriting" required><button id="sanegPasswordToggle" class="saneg-eye" type="button" aria-label="Parolni ko‘rsatish">👁</button></div></label>
              <label class="saneg-field-label">Til / Language<div class="saneg-field saneg-select-wrap"><span class="saneg-field-icon">🌐</span><select class="saneg-input saneg-select"><option>O‘zbekcha (Uzbek)</option><option>Русский</option><option>English</option></select></div></label>
              <button id="sanegLoginButton" class="saneg-login-btn" type="submit">↪ Kirish</button>
            </form>
            <div class="saneg-secure">🛡 Secure corporate access</div>
            <div id="sanegLoginMsg" class="saneg-login-msg">Login va parolni kiriting. Avtomatik kirish o‘chirildi.</div>
            <div class="saneg-divider"></div>
            <div class="saneg-note"><span class="saneg-note-icon">▣</span><span>Industrial AI monitoring<br>and document workflow</span></div>
            <div class="saneg-copy">© 2026 Sanegplatform. All rights reserved.</div>
          </div>
        </section>
        <section class="saneg-login-right">
          <div class="saneg-servers"><div class="saneg-server"></div><div class="saneg-server"></div><div class="saneg-server"></div><div class="saneg-server"></div><div class="saneg-server"></div><div class="saneg-server"></div><div class="saneg-server"></div><div class="saneg-server"></div></div>
          <div class="saneg-hero"><div><h2>KIP Digital Control System</h2><p>Real vaqt monitoringi · Aqlli qarorlar · Sanoat samaradorligi</p></div><div class="saneg-orbit"><div class="saneg-info registry"><b>📋 Asboblar reyestri</b><strong>2,489</strong><span>Jami asboblar</span><small>Faol · 2,156</small></div><div class="saneg-info monitor"><b>📈 Real vaqt monitoringi</b><strong>98.6%</strong><span>Tizim uzluksizligi</span><small>Barqaror ishlamoqda</small></div><div class="saneg-info approval"><b>✅ Akt tasdiqlash</b><strong>124</strong><span>Kutilayotgan tasdiqlar</span><small>Shu hafta +18%</small></div><div class="saneg-plant"></div><div class="saneg-info ai"><b>AI yordamchi</b><div class="saneg-ai-face"></div><span>Tahlil, hisobot va operatsion ma’lumotlar bo‘yicha yordam beradi.</span></div></div><div class="saneg-nav"><span>◉ Monitoring</span><span>⌁ Tahlil</span><span>⚠ Ogohlantirish</span><span>▤ Hujjatlar</span><span>▥ Hisobotlar</span><span>⌘ Jarayonlar</span></div><div class="saneg-compliance">🛡 Korporativ darajadagi xavfsizlik va muvofiqlik</div></div>
        </section>
      </div>`;
    document.body.appendChild(root);

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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();

  window.sanegLoginGate = { render, state };
})();
