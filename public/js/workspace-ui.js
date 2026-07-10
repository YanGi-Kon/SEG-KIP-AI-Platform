// SEG KIP Workspace frontend UI
// Stage 6: browser login, Workspace selector, settings, connection test and activation.
(function setupWorkspaceUi() {
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const DEFAULT_TIME_ZONE = 'Asia/Tashkent';
  const DEFAULT_MAIN_SHEET = 'АКТЛАР_КУНЛИК';
  const REQUIRED_ACT_TABS = ['АКТЛАР_КУНЛИК', 'АКТЛАР_РЕЕСТР', 'ИМЗО_ЧЕКУВЧИЛАР'];

  const state = {
    accessToken: sessionStorage.getItem(ACCESS_TOKEN_KEY) || '',
    user: null,
    workspaces: [],
    selectedWorkspaceId: localStorage.getItem(SELECTED_WORKSPACE_KEY) || '',
    lastSheetTest: null,
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setToken(token) {
    state.accessToken = token || '';
    if (state.accessToken) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, state.accessToken);
    } else {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }

  function selectedWorkspace() {
    return state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId) || null;
  }

  function setStatus(message, tone = 'info') {
    const box = qs('#workspaceStatusBox');
    if (!box) return;
    box.className = `workspace-status ${tone}`;
    box.textContent = message || '';
  }

  function injectStyle() {
    if (qs('#workspaceUiStyle')) return;
    const style = document.createElement('style');
    style.id = 'workspaceUiStyle';
    style.textContent = `
      .workspace-page{display:none;}
      .workspace-page.active{display:block;}
      .workspace-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;margin-bottom:20px;padding:22px;border-radius:28px;background:linear-gradient(120deg,rgba(34,211,238,.14),rgba(16,185,129,.08));border:1px solid rgba(34,211,238,.24);box-shadow:0 18px 42px rgba(0,0,0,.25);}
      .workspace-hero h1{margin:0 0 8px;font-size:34px;letter-spacing:.3px;}
      .workspace-hero p{margin:0;color:#b7d2df;line-height:1.5;max-width:840px;}
      .workspace-hero-badge{padding:12px 16px;border-radius:999px;border:1px solid rgba(16,185,129,.36);background:rgba(16,185,129,.10);color:#d1fae5;white-space:nowrap;font-weight:800;}
      .workspace-grid{display:grid;grid-template-columns:380px minmax(0,1fr);gap:18px;align-items:start;}
      .workspace-card{border-radius:26px;background:rgba(0,0,0,.48);border:1px solid rgba(34,211,238,.20);backdrop-filter:blur(16px);padding:20px;box-shadow:0 18px 40px rgba(0,0,0,.22);}
      .workspace-card h3{margin:0 0 14px;font-size:20px;}
      .workspace-form{display:grid;gap:12px;}
      .workspace-label{display:grid;gap:7px;color:#cde7f0;font-size:13px;font-weight:700;}
      .workspace-input,.workspace-select,.workspace-textarea{width:100%;border:1px solid rgba(34,211,238,.22);background:rgba(2,8,23,.74);color:#f8fafc;border-radius:16px;padding:12px 13px;font-size:14px;outline:none;}
      .workspace-input:focus,.workspace-select:focus,.workspace-textarea:focus{border-color:rgba(34,211,238,.70);box-shadow:0 0 0 3px rgba(34,211,238,.11);}
      .workspace-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;}
      .workspace-btn{border:1px solid rgba(34,211,238,.28);border-radius:16px;background:rgba(34,211,238,.12);color:#eaffff;padding:11px 14px;font-weight:800;cursor:pointer;transition:.2s ease;}
      .workspace-btn:hover{transform:translateY(-1px);border-color:rgba(34,211,238,.70);background:rgba(34,211,238,.20);}
      .workspace-btn.primary{background:linear-gradient(135deg,rgba(34,211,238,.92),rgba(16,185,129,.82));color:#001018;border-color:transparent;}
      .workspace-btn.warning{background:rgba(245,158,11,.16);border-color:rgba(245,158,11,.42);color:#fde68a;}
      .workspace-btn.ghost{background:rgba(255,255,255,.04);}
      .workspace-btn.danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);color:#fecaca;}
      .workspace-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}
      .workspace-user{border-radius:18px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.16);padding:14px;color:#e7fbff;line-height:1.45;}
      .workspace-user small{display:block;color:#a7c6d4;margin-top:4px;}
      .workspace-list{display:grid;gap:10px;max-height:420px;overflow:auto;padding-right:4px;}
      .workspace-list-item{width:100%;text-align:left;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:#e7fbff;border-radius:18px;padding:13px;cursor:pointer;}
      .workspace-list-item.active{border-color:rgba(34,211,238,.70);background:rgba(34,211,238,.13);box-shadow:inset 4px 0 0 #22d3ee;}
      .workspace-list-title{display:flex;justify-content:space-between;gap:10px;font-weight:900;margin-bottom:6px;}
      .workspace-meta{font-size:12px;color:#a7c6d4;line-height:1.45;word-break:break-word;}
      .workspace-chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;border:1px solid rgba(34,211,238,.22);background:rgba(2,8,23,.44);font-size:11px;text-transform:uppercase;white-space:nowrap;}
      .workspace-chip.active{border-color:rgba(16,185,129,.50);color:#bbf7d0;}
      .workspace-chip.draft{border-color:rgba(245,158,11,.44);color:#fde68a;}
      .workspace-editor{display:grid;gap:16px;}
      .workspace-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
      .workspace-editor-grid .wide{grid-column:1 / -1;}
      .workspace-status{min-height:44px;border-radius:18px;padding:12px 14px;border:1px solid rgba(34,211,238,.18);background:rgba(2,8,23,.58);color:#cde7f0;white-space:pre-wrap;line-height:1.45;}
      .workspace-status.ok{border-color:rgba(16,185,129,.42);color:#bbf7d0;background:rgba(16,185,129,.08);}
      .workspace-status.error{border-color:rgba(239,68,68,.44);color:#fecaca;background:rgba(239,68,68,.08);}
      .workspace-status.warn{border-color:rgba(245,158,11,.44);color:#fde68a;background:rgba(245,158,11,.08);}
      .workspace-result{max-height:280px;overflow:auto;border-radius:18px;border:1px solid rgba(255,255,255,.09);background:rgba(2,8,23,.70);padding:13px;color:#dffaff;font-size:12px;line-height:1.45;white-space:pre-wrap;}
      .workspace-note{margin-top:12px;color:#9fb7c7;font-size:12px;line-height:1.45;}
      .seg-workspace-menu{cursor:pointer;}
      @media(max-width:1180px){.workspace-grid{grid-template-columns:1fr}.workspace-hero{grid-template-columns:1fr}.workspace-hero-badge{justify-self:start}}
      @media(max-width:720px){.workspace-editor-grid{grid-template-columns:1fr}.workspace-hero h1{font-size:27px}.workspace-card{padding:16px}}
    `;
    document.head.appendChild(style);
  }

  function injectMenu() {
    const menu = qs('.menu');
    if (!menu || qs('.seg-workspace-menu')) return;
    const item = document.createElement('div');
    item.className = 'menu-item seg-workspace-menu';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.innerHTML = `
      <div class="menu-icon">⚙️</div>
      <div><div class="menu-title">WORKSPACE SETTINGS</div><div class="empty-note">Login, Sheet ва Workspace</div></div>
    `;
    item.addEventListener('click', openWorkspaceSettings);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openWorkspaceSettings();
    });
    menu.appendChild(item);
  }

  function injectPage() {
    if (qs('#workspaceSettingsPage')) return;
    const main = qs('.main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'workspaceSettingsPage';
    section.className = 'workspace-page';
    section.setAttribute('aria-label', 'Workspace settings');
    section.innerHTML = `
      <div class="workspace-hero">
        <div>
          <h1>Workspace Settings</h1>
          <p>Login, Workspace tanlash, Google Sheet URL va mainSheetName tekshirish. Service Account private key brauzerga kiritilmaydi va localStorage’da saqlanmaydi.</p>
        </div>
        <div class="workspace-hero-badge" id="workspaceModeBadge">WORKSPACE MODE</div>
      </div>

      <div class="workspace-grid">
        <div class="workspace-card">
          <h3>👤 Login</h3>
          <form id="workspaceLoginForm" class="workspace-form">
            <label class="workspace-label">Email
              <input class="workspace-input" id="workspaceLoginEmail" type="email" autocomplete="username" placeholder="email@example.com" required>
            </label>
            <label class="workspace-label">Parol
              <input class="workspace-input" id="workspaceLoginPassword" type="password" autocomplete="current-password" placeholder="••••••••••••" required>
            </label>
            <div class="workspace-actions">
              <button class="workspace-btn primary" type="submit">Kirish</button>
              <button class="workspace-btn ghost" id="workspaceRefreshSessionButton" type="button">Session tekshir</button>
              <button class="workspace-btn danger" id="workspaceLogoutButton" type="button">Logout</button>
            </div>
          </form>
          <div class="workspace-note">Access token faqat browser session ichida saqlanadi. Refresh token httpOnly cookie orqali yuradi.</div>
          <div id="workspaceUserBox" class="workspace-user" style="margin-top:14px;">Login qilinmagan.</div>

          <div style="height:18px"></div>
          <h3>📁 Workspace ro‘yxati</h3>
          <div class="workspace-actions" style="margin-bottom:12px;">
            <button class="workspace-btn ghost" id="workspaceLoadListButton" type="button">Ro‘yxatni yangilash</button>
            <button class="workspace-btn ghost" id="workspaceNewButton" type="button">Yangi Workspace</button>
          </div>
          <div id="workspaceList" class="workspace-list"></div>
        </div>

        <div class="workspace-card workspace-editor">
          <div>
            <h3>⚙️ Workspace sozlamalari</h3>
            <div id="workspaceStatusBox" class="workspace-status">Login qiling va Workspace tanlang.</div>
          </div>

          <form id="workspaceSettingsForm" class="workspace-form">
            <div class="workspace-editor-grid">
              <label class="workspace-label wide">Workspace nomi
                <input class="workspace-input" id="workspaceNameInput" placeholder="KIP Staging Test" required>
              </label>
              <label class="workspace-label wide">Google Sheets URL
                <input class="workspace-input" id="workspaceSheetUrlInput" placeholder="https://docs.google.com/spreadsheets/d/.../edit" required>
              </label>
              <label class="workspace-label">mainSheetName
                <input class="workspace-input" id="workspaceMainSheetInput" list="workspaceSheetNames" value="${DEFAULT_MAIN_SHEET}" required>
                <datalist id="workspaceSheetNames">
                  ${REQUIRED_ACT_TABS.map((tab) => `<option value="${escapeHtml(tab)}"></option>`).join('')}
                </datalist>
              </label>
              <label class="workspace-label">Time zone
                <input class="workspace-input" id="workspaceTimeZoneInput" value="${DEFAULT_TIME_ZONE}" required>
              </label>
              <label class="workspace-label wide">Drive folder URL yoki ID, keyingi bosqichlar uchun ixtiyoriy
                <input class="workspace-input" id="workspaceDriveFolderInput" placeholder="https://drive.google.com/drive/folders/...">
              </label>
            </div>

            <div class="workspace-actions">
              <button class="workspace-btn primary" id="workspaceSaveButton" type="submit">Saqlash</button>
              <button class="workspace-btn" id="workspaceTestButton" type="button">Connection test</button>
              <button class="workspace-btn warning" id="workspaceActivateButton" type="button">Activate</button>
            </div>
          </form>

          <pre id="workspaceTestResult" class="workspace-result">Sheet testi natijasi shu yerda chiqadi.</pre>
        </div>
      </div>
    `;
    main.appendChild(section);
  }

  function hideWorkspacePage() {
    qs('#workspaceSettingsPage')?.classList.remove('active');
  }

  function installNavigationGuards() {
    if (window.__segWorkspaceNavigationGuardsInstalled) return;
    window.__segWorkspaceNavigationGuardsInstalled = true;

    const wrap = (name) => {
      const original = window[name];
      if (typeof original !== 'function') return;
      window[name] = function wrappedWorkspaceNavigation(...args) {
        hideWorkspacePage();
        return original.apply(this, args);
      };
    };

    wrap('openModulePage');
    wrap('openUlchovVositalari');
    wrap('openHomeDashboard');
  }

  function setWorkspaceMenuActive() {
    qsa('.menu-item').forEach((item) => item.classList.remove('active'));
    qs('.seg-workspace-menu')?.classList.add('active');
  }

  function openWorkspaceSettings() {
    qs('#journalDashboard') && (qs('#journalDashboard').style.display = 'none');
    qs('#genericModulePage')?.classList.remove('active');
    qs('#ulchovIntegratedPage')?.classList.remove('active');
    qs('#workspaceSettingsPage')?.classList.add('active');
    setWorkspaceMenuActive();

    const title = qs('.topbar h2');
    const subtitle = qs('.topbar p');
    if (title) title.textContent = 'SEG KIP AI Platform — Workspace Settings';
    if (subtitle) subtitle.textContent = 'Login, Workspace, Google Sheet connection va aktivatsiya boshqaruvi';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    bootstrapAuthState();
  }

  async function parseResponse(res) {
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }

  async function refreshSession() {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const data = await parseResponse(res);
    if (!res.ok) {
      setToken('');
      throw Object.assign(new Error(data.error || 'Session yangilanmadi'), { data, status: res.status });
    }
    setToken(data.accessToken || '');
    state.user = data.user || null;
    renderUser();
    return data;
  }

  async function apiFetch(path, options = {}, retry = true) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;

    const res = await fetch(path, {
      ...options,
      headers,
      credentials: 'include',
    });
    const data = await parseResponse(res);

    if (res.status === 401 && retry && !path.includes('/api/auth/login') && !path.includes('/api/auth/refresh')) {
      await refreshSession();
      return apiFetch(path, options, false);
    }

    if (!res.ok) {
      throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status });
    }
    return data;
  }

  function renderUser() {
    const box = qs('#workspaceUserBox');
    if (!box) return;
    if (!state.user) {
      box.innerHTML = 'Login qilinmagan.';
      return;
    }
    box.innerHTML = `
      <strong>${escapeHtml(state.user.fullName || state.user.email)}</strong>
      <small>${escapeHtml(state.user.email || '')}</small>
      <small>platformRole: ${escapeHtml(state.user.platformRole || 'user')} · status: ${escapeHtml(state.user.status || '')}</small>
    `;
  }

  function renderWorkspaceList() {
    const list = qs('#workspaceList');
    if (!list) return;
    if (!state.workspaces.length) {
      list.innerHTML = '<div class="workspace-note">Workspace topilmadi. Yangi Workspace yarating.</div>';
      return;
    }
    list.innerHTML = state.workspaces.map((workspace) => {
      const active = workspace.id === state.selectedWorkspaceId ? ' active' : '';
      const statusClass = workspace.status === 'active' ? 'active' : 'draft';
      return `
        <button class="workspace-list-item${active}" type="button" data-workspace-id="${escapeHtml(workspace.id)}">
          <div class="workspace-list-title">
            <span>${escapeHtml(workspace.name)}</span>
            <span class="workspace-chip ${statusClass}">${escapeHtml(workspace.status)}</span>
          </div>
          <div class="workspace-meta">
            slug: ${escapeHtml(workspace.slug)}<br>
            role: ${escapeHtml(workspace.memberRole || '')} · member: ${escapeHtml(workspace.memberStatus || '')}<br>
            mainSheetName: ${escapeHtml(workspace.mainSheetName || '')}
          </div>
        </button>
      `;
    }).join('');

    qsa('.workspace-list-item', list).forEach((button) => {
      button.addEventListener('click', () => selectWorkspace(button.dataset.workspaceId));
    });
  }

  function setFormWorkspace(workspace) {
    qs('#workspaceNameInput') && (qs('#workspaceNameInput').value = workspace?.name || '');
    qs('#workspaceSheetUrlInput') && (qs('#workspaceSheetUrlInput').value = workspace?.spreadsheetUrl || '');
    qs('#workspaceMainSheetInput') && (qs('#workspaceMainSheetInput').value = workspace?.mainSheetName || DEFAULT_MAIN_SHEET);
    qs('#workspaceTimeZoneInput') && (qs('#workspaceTimeZoneInput').value = workspace?.timeZone || DEFAULT_TIME_ZONE);
    qs('#workspaceDriveFolderInput') && (qs('#workspaceDriveFolderInput').value = workspace?.driveFolderId || '');
  }

  function selectWorkspace(workspaceId) {
    state.selectedWorkspaceId = workspaceId || '';
    if (state.selectedWorkspaceId) localStorage.setItem(SELECTED_WORKSPACE_KEY, state.selectedWorkspaceId);
    else localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    const workspace = selectedWorkspace();
    setFormWorkspace(workspace);
    renderWorkspaceList();
    if (workspace) {
      setStatus(`Tanlandi: ${workspace.name}\nstatus: ${workspace.status}\nrole: ${workspace.memberRole || ''}`, 'ok');
    } else {
      setStatus('Yangi Workspace maʼlumotlarini kiriting.', 'info');
    }
  }

  function collectWorkspaceInput(extra = {}) {
    const body = {
      name: qs('#workspaceNameInput')?.value.trim(),
      spreadsheetUrl: qs('#workspaceSheetUrlInput')?.value.trim(),
      mainSheetName: qs('#workspaceMainSheetInput')?.value.trim(),
      timeZone: qs('#workspaceTimeZoneInput')?.value.trim() || DEFAULT_TIME_ZONE,
      ...extra,
    };
    const driveFolderValue = qs('#workspaceDriveFolderInput')?.value.trim();
    if (driveFolderValue) body.driveFolderUrl = driveFolderValue;
    return body;
  }

  async function login(event) {
    event?.preventDefault();
    const email = qs('#workspaceLoginEmail')?.value.trim();
    const password = qs('#workspaceLoginPassword')?.value || '';
    if (!email || !password) {
      setStatus('Email va parolni kiriting.', 'warn');
      return;
    }
    setStatus('Login qilinyapti...', 'info');
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }, false);
      setToken(data.accessToken || '');
      state.user = data.user || null;
      renderUser();
      qs('#workspaceLoginPassword') && (qs('#workspaceLoginPassword').value = '');
      setStatus('Login muvaffaqiyatli. Workspace ro‘yxati yuklanmoqda...', 'ok');
      await loadWorkspaces();
    } catch (error) {
      setStatus(`Login xato: ${error.message}`, 'error');
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (_) {}
    setToken('');
    state.user = null;
    state.workspaces = [];
    state.selectedWorkspaceId = '';
    localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    renderUser();
    renderWorkspaceList();
    setFormWorkspace(null);
    setStatus('Logout bajarildi.', 'ok');
  }

  async function loadMe() {
    if (!state.accessToken) await refreshSession();
    const data = await apiFetch('/api/auth/me', { method: 'GET' });
    state.user = data.user || null;
    renderUser();
    return data.user;
  }

  async function loadWorkspaces() {
    setStatus('Workspace ro‘yxati yuklanmoqda...', 'info');
    try {
      if (!state.user) await loadMe();
      const data = await apiFetch('/api/workspaces', { method: 'GET' });
      state.workspaces = Array.isArray(data.rows) ? data.rows : [];
      if (!state.workspaces.some((workspace) => workspace.id === state.selectedWorkspaceId)) {
        state.selectedWorkspaceId = state.workspaces[0]?.id || '';
      }
      if (state.selectedWorkspaceId) localStorage.setItem(SELECTED_WORKSPACE_KEY, state.selectedWorkspaceId);
      renderWorkspaceList();
      setFormWorkspace(selectedWorkspace());
      setStatus(state.workspaces.length ? 'Workspace ro‘yxati yuklandi.' : 'Workspace topilmadi. Yangi Workspace yarating.', state.workspaces.length ? 'ok' : 'warn');
    } catch (error) {
      renderUser();
      setStatus(`Workspace ro‘yxati xato: ${error.message}`, 'error');
    }
  }

  async function saveWorkspace(event, options = {}) {
    event?.preventDefault();
    const body = collectWorkspaceInput(options.extra || {});
    if (!body.name || !body.spreadsheetUrl || !body.mainSheetName) {
      setStatus('Workspace nomi, Sheet URL va mainSheetName majburiy.', 'warn');
      return null;
    }

    const id = state.selectedWorkspaceId;
    const method = id ? 'PUT' : 'POST';
    const path = id ? `/api/workspaces/${encodeURIComponent(id)}` : '/api/workspaces';
    setStatus(id ? 'Workspace yangilanmoqda...' : 'Workspace yaratilmoqda...', 'info');

    try {
      const data = await apiFetch(path, { method, body: JSON.stringify(body) });
      const workspace = data.workspace;
      if (workspace?.id) {
        state.selectedWorkspaceId = workspace.id;
        localStorage.setItem(SELECTED_WORKSPACE_KEY, workspace.id);
      }
      await loadWorkspaces();
      setStatus(id ? 'Workspace yangilandi.' : 'Workspace yaratildi.', 'ok');
      return workspace;
    } catch (error) {
      setStatus(`Workspace saqlash xato: ${error.message}`, 'error');
      return null;
    }
  }

  function populateSheetNames(tabs = []) {
    const datalist = qs('#workspaceSheetNames');
    if (!datalist) return;
    const unique = Array.from(new Set([...REQUIRED_ACT_TABS, ...tabs].filter(Boolean)));
    datalist.innerHTML = unique.map((tab) => `<option value="${escapeHtml(tab)}"></option>`).join('');
  }

  function renderSheetTestResult(payload) {
    const resultBox = qs('#workspaceTestResult');
    if (!resultBox) return;
    resultBox.textContent = JSON.stringify(payload, null, 2);
  }

  async function testWorkspaceConnection() {
    if (!state.selectedWorkspaceId) {
      setStatus('Avval Workspace saqlang yoki ro‘yxatdan tanlang.', 'warn');
      return null;
    }
    setStatus('Google Sheet connection test bajarilmoqda...', 'info');
    try {
      const data = await apiFetch(`/api/workspaces/${encodeURIComponent(state.selectedWorkspaceId)}/test`, { method: 'POST' });
      state.lastSheetTest = data;
      const result = data.result || data;
      populateSheetNames(result.tabs || []);
      renderSheetTestResult(data);
      const missing = Array.isArray(result.missingRequiredTabs) ? result.missingRequiredTabs : [];
      if (data.ok && result.accessVerified && result.mainSheetExists && missing.length === 0) {
        setStatus(`Sheet test muvaffaqiyatli.\nTitle: ${result.spreadsheetTitle || ''}\nmainSheetExists: true\nRequired tabs: mavjud`, 'ok');
      } else {
        setStatus(`Sheet test yakunlandi, lekin tekshirish kerak.\nmainSheetExists: ${result.mainSheetExists}\nmissingRequiredTabs: ${missing.join(', ') || 'yo‘q'}`, 'warn');
      }
      return data;
    } catch (error) {
      renderSheetTestResult(error.data || { error: error.message });
      setStatus(`Sheet test xato: ${error.message}`, 'error');
      return null;
    }
  }

  async function activateWorkspace() {
    if (!state.selectedWorkspaceId) {
      setStatus('Activate qilish uchun avval Workspace tanlang.', 'warn');
      return;
    }
    const test = await testWorkspaceConnection();
    if (!test?.ok) {
      setStatus('Activate to‘xtatildi: avval Sheet connection test muvaffaqiyatli bo‘lishi kerak.', 'warn');
      return;
    }
    await saveWorkspace(null, { extra: { status: 'active' } });
    await loadWorkspaces();
    setStatus('Workspace active holatga o‘tkazildi.', 'ok');
  }

  function clearWorkspaceForm() {
    state.selectedWorkspaceId = '';
    localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    setFormWorkspace({ mainSheetName: DEFAULT_MAIN_SHEET, timeZone: DEFAULT_TIME_ZONE });
    renderWorkspaceList();
    renderSheetTestResult('Yangi Workspace uchun maʼlumot kiriting.');
    setStatus('Yangi Workspace yaratish rejimi.', 'info');
  }

  async function bootstrapAuthState() {
    renderUser();
    renderWorkspaceList();
    if (!state.accessToken) {
      try {
        await refreshSession();
      } catch (_) {
        return;
      }
    }
    try {
      await loadMe();
      if (!state.workspaces.length) await loadWorkspaces();
    } catch (_) {
      setToken('');
      state.user = null;
      renderUser();
    }
  }

  function attachEvents() {
    qs('#workspaceLoginForm')?.addEventListener('submit', login);
    qs('#workspaceLogoutButton')?.addEventListener('click', logout);
    qs('#workspaceRefreshSessionButton')?.addEventListener('click', async () => {
      try {
        await refreshSession();
        await loadWorkspaces();
        setStatus('Session yangilandi.', 'ok');
      } catch (error) {
        setStatus(`Session xato: ${error.message}`, 'error');
      }
    });
    qs('#workspaceLoadListButton')?.addEventListener('click', loadWorkspaces);
    qs('#workspaceNewButton')?.addEventListener('click', clearWorkspaceForm);
    qs('#workspaceSettingsForm')?.addEventListener('submit', saveWorkspace);
    qs('#workspaceTestButton')?.addEventListener('click', testWorkspaceConnection);
    qs('#workspaceActivateButton')?.addEventListener('click', activateWorkspace);
  }

  function setup() {
    injectStyle();
    injectMenu();
    injectPage();
    installNavigationGuards();
    attachEvents();
    renderUser();
    renderWorkspaceList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  window.openWorkspaceSettings = openWorkspaceSettings;
  window.segWorkspaceUi = {
    open: openWorkspaceSettings,
    refresh: loadWorkspaces,
    state,
  };
})();
