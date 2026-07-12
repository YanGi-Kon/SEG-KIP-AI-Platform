// Manual login gate: never restores a session during page boot.
(function sanegManualLoginGate(){
  if (window.__sanegManualLoginGateLoaded) return;
  window.__sanegManualLoginGateLoaded = true;
  window.__segManualLoginRequired = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const LOGIN_EMAIL_KEY = 'seg_kip_last_login_email';
  const state = { accessToken:'', user:null, workspaces:[] };

  function qs(selector, root=document){ return root.querySelector(selector); }
  function setToken(token){
    state.accessToken = token || '';
    if (state.accessToken) sessionStorage.setItem(ACCESS_TOKEN_KEY, state.accessToken);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  function releaseBootGuard(){
    document.documentElement.classList.remove('saneg-auth-boot');
    qs('#sanegAuthBootStyle')?.remove();
    qs('#sanegAuthBootScript')?.remove();
  }
  async function readResponse(response){
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw:text }; }
  }
  function setMessage(message, tone='info'){
    const box = qs('#sanegLoginMsg');
    if (!box) return;
    box.className = `saneg-login-msg ${tone}`;
    box.textContent = message || '';
  }
  async function api(path, options={}){
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
    const response = await fetch(path, { ...options, headers, credentials:'include' });
    const data = await readResponse(response);
    if (!response.ok) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status:response.status, data });
    return data;
  }
  async function loadWorkspaces(){
    const data = await api('/api/workspaces', { method:'GET' });
    state.workspaces = Array.isArray(data.rows) ? data.rows : [];
    const saved = localStorage.getItem(SELECTED_WORKSPACE_KEY) || '';
    const selected = state.workspaces.find((workspace)=>workspace.id===saved)
      || state.workspaces.find((workspace)=>workspace.status==='active')
      || state.workspaces[0]
      || null;
    if (selected?.id) localStorage.setItem(SELECTED_WORKSPACE_KEY, selected.id);
    return selected;
  }

  function injectStyle(){
    if (qs('#sanegManualLoginStyle')) return;
    const style = document.createElement('style');
    style.id = 'sanegManualLoginStyle';
    style.textContent = `
      html.saneg-login-active,body.saneg-login-active{background:#020817!important;overflow:hidden!important}
      #sanegLoginGate{position:fixed;inset:0;z-index:50000;display:grid;grid-template-columns:minmax(370px,42%) minmax(480px,58%);background:#020817;color:#eaffff;font-family:Inter,Arial,sans-serif}
      .saneg-login-left{display:flex;align-items:center;justify-content:center;padding:34px;background:radial-gradient(circle at 12% 8%,rgba(34,211,238,.16),transparent 34%),linear-gradient(180deg,#fff,#eef6fb)}
      .saneg-login-card{width:min(520px,100%);padding:34px;border-radius:28px;background:#fff;color:#071427;box-shadow:0 28px 86px rgba(15,23,42,.18)}
      .saneg-brand{display:flex;align-items:center;gap:15px;margin-bottom:27px}.saneg-logo{width:60px;height:60px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#0ea5e9,#10b981);color:#fff;font-size:28px;font-weight:1000;box-shadow:0 14px 32px rgba(14,165,233,.24)}
      .saneg-brand h1{margin:0;font-size:20px}.saneg-brand p{margin:5px 0 0;color:#64748b;font-size:13px}.saneg-login-title{margin:0 0 8px;font-size:29px}.saneg-login-subtitle{margin:0 0 22px;color:#64748b;font-size:14px;line-height:1.55}
      .saneg-login-form{display:grid;gap:15px}.saneg-field-label{display:grid;gap:7px;font-size:13px;font-weight:900}.saneg-input{width:100%;border:1px solid rgba(15,23,42,.14);border-radius:15px;padding:14px 15px;font-size:14px;outline:none}.saneg-input:focus{border-color:#0ea5e9;box-shadow:0 0 0 4px rgba(14,165,233,.11)}
      .saneg-login-btn{border:0;border-radius:15px;padding:15px 18px;background:linear-gradient(135deg,#075da8,#21c794);color:#fff;font-size:15px;font-weight:1000;cursor:pointer}.saneg-login-btn:disabled{opacity:.6;cursor:not-allowed}
      .saneg-login-msg{min-height:42px;margin-top:14px;padding:11px 12px;border:1px solid rgba(14,165,233,.2);border-radius:15px;background:rgba(14,165,233,.05);color:#334155;font-size:13px;line-height:1.45;white-space:pre-wrap}.saneg-login-msg.ok{border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.08);color:#047857}.saneg-login-msg.error{border-color:rgba(239,68,68,.38);background:rgba(239,68,68,.08);color:#b91c1c}.saneg-login-msg.warn{border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.1);color:#92400e}
      .saneg-login-note{margin-top:16px;text-align:center;color:#64748b;font-size:12px;line-height:1.5}.saneg-login-right{position:relative;display:flex;align-items:center;justify-content:center;padding:42px;overflow:hidden;background:#020817}.saneg-login-right:before{content:'';position:absolute;inset:0;background-image:linear-gradient(135deg,rgba(2,8,23,.22),rgba(2,8,23,.5)),url('/assets/login/saneg-login-hero.svg?v=manual1');background-size:cover;background-position:center}.saneg-login-hero{position:relative;z-index:1;max-width:720px;text-align:center}.saneg-login-hero h2{margin:0 0 14px;font-size:34px}.saneg-login-hero p{margin:0;color:#cde7f0;line-height:1.65}.saneg-login-badges{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:24px}.saneg-login-badges span{padding:9px 12px;border:1px solid rgba(34,211,238,.3);border-radius:999px;background:rgba(2,8,23,.56);font-size:12px;font-weight:800}
      @media(max-width:900px){#sanegLoginGate{grid-template-columns:1fr;overflow:auto}.saneg-login-right{display:none}.saneg-login-left{min-height:100vh;padding:20px}.saneg-login-card{padding:26px}}
    `;
    document.head.appendChild(style);
  }

  function render(){
    injectStyle();
    document.documentElement.classList.add('saneg-login-active');
    document.body.classList.add('saneg-login-active');
    qs('#sanegLoginGate')?.remove();
    const root = document.createElement('div');
    root.id = 'sanegLoginGate';
    root.innerHTML = `
      <section class="saneg-login-left">
        <div class="saneg-login-card">
          <div class="saneg-brand"><div class="saneg-logo">S</div><div><h1>Sanegplatform</h1><p>SEG-KIP-AI industrial workspace</p></div></div>
          <h2 class="saneg-login-title">Tizimga kirish</h2>
          <p class="saneg-login-subtitle">Har yangi sahifa yuklanishida login va parol qayta so‘raladi. Workspace va Google Sheets sozlamalari serverda saqlanib qoladi.</p>
          <form id="sanegLoginForm" class="saneg-login-form">
            <label class="saneg-field-label">Email<input id="sanegLoginEmail" class="saneg-input" type="email" autocomplete="username" required></label>
            <label class="saneg-field-label">Parol<input id="sanegLoginPassword" class="saneg-input" type="password" autocomplete="current-password" required></label>
            <button id="sanegLoginButton" class="saneg-login-btn" type="submit">Kirish</button>
          </form>
          <div id="sanegLoginMsg" class="saneg-login-msg">Login va parolni kiriting.</div>
          <div class="saneg-login-note">Access token faqat joriy browser session ichida saqlanadi. Service Account private_key brauzer xotirasiga yozilmaydi.</div>
        </div>
      </section>
      <section class="saneg-login-right"><div class="saneg-login-hero"><h2>Sanegplatform — raqamli KIP boshqaruvi</h2><p>Har bir obyekt o‘z Workspace, Google Sheet va shifrlangan Service Account credentiali bilan mustaqil ishlaydi.</p><div class="saneg-login-badges"><span>Workspace isolation</span><span>Google Sheets</span><span>Encrypted JSON</span><span>Acts Journal</span></div></div></section>`;
    document.body.appendChild(root);
    releaseBootGuard();
    qs('#sanegLoginEmail').value = localStorage.getItem(LOGIN_EMAIL_KEY) || '';
    qs('#sanegLoginForm')?.addEventListener('submit', login);
    setTimeout(()=>qs('#sanegLoginEmail')?.focus(), 40);
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
      const session = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ email, password }) });
      setToken(session.accessToken || '');
      state.user = session.user || null;
      localStorage.setItem(LOGIN_EMAIL_KEY, email);
      const workspace = await loadWorkspaces();
      if (!workspace) {
        setMessage('Login muvaffaqiyatli, lekin Workspace topilmadi.', 'warn');
        return;
      }
      setMessage(`Kirish muvaffaqiyatli. Workspace: ${workspace.name}`, 'ok');
      window.setTimeout(()=>{
        document.documentElement.classList.remove('saneg-login-active');
        document.body.classList.remove('saneg-login-active');
        qs('#sanegLoginGate')?.remove();
        window.dispatchEvent(new CustomEvent('seg:manual-login-success', { detail:{ user:state.user, workspace } }));
      }, 300);
    } catch (error) {
      setToken('');
      setMessage(`Login xato: ${error.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
      const passwordInput = qs('#sanegLoginPassword');
      if (passwordInput) passwordInput.value = '';
    }
  }

  function boot(){
    // A page refresh must always require credentials again.
    setToken('');
    fetch('/api/auth/logout', { method:'POST', credentials:'include' }).catch(()=>{});
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.sanegLoginGate = { render, state };
})();
