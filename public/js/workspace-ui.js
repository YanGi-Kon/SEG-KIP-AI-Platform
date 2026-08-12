// SEG KIP Workspace frontend UI
// Stage 6: browser login, Workspace selector, settings, connection test and activation.
(function setupWorkspaceUi() {
  if (window.__segWorkspaceUiInstalled) return;
  window.__segWorkspaceUiInstalled = true;

  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const DEFAULT_TIME_ZONE = 'Asia/Tashkent';
  const DEFAULT_MAIN_SHEET = 'АКТЛАР_КУНЛИК';
  const REQUIRED_ACT_TABS = ['АКТЛАР_КУНЛИК', 'АКТЛАР_РЕЕСТР', 'ИМЗО_ЧЕКУВЧИЛАР'];

  const state = {
    accessToken: sessionStorage.getItem(ACCESS_TOKEN_KEY) || '',
    user: null,
    workspaces: [],
    members: [],
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
      .workspace-members-card{grid-column:1 / -1;display:grid;gap:14px;}
      .workspace-member-add-grid{display:grid;grid-template-columns:minmax(240px,1fr) 220px auto;gap:10px;align-items:end;}
      .workspace-member-list{display:grid;gap:10px;}
      .workspace-member-row{display:grid;grid-template-columns:minmax(220px,1fr) 190px 160px auto;gap:10px;align-items:center;padding:13px;border:1px solid rgba(255,255,255,.10);border-radius:18px;background:rgba(255,255,255,.04);}
      .workspace-member-identity strong,.workspace-member-identity small{display:block;}
      .workspace-member-identity small{margin-top:4px;color:#9fb7c7;word-break:break-word;}
      .workspace-member-actions{display:flex;gap:8px;justify-content:flex-end;}
      .seg-workspace-menu{cursor:pointer;}
      @media(max-width:1180px){.workspace-grid{grid-template-columns:1fr}.workspace-hero{grid-template-columns:1fr}.workspace-hero-badge{justify-self:start}.workspace-member-row{grid-template-columns:1fr 1fr}.workspace-member-actions{justify-content:flex-start}}
      @media(max-width:720px){.workspace-editor-grid,.workspace-member-add-grid,.workspace-member-row{grid-template-columns:1fr}.workspace-hero h1{font-size:27px}.workspace-card{padding:16px}}
      .workspace-delete-zone{text-align:center;margin-top:6px;}
      .workspace-delete-link{background:none;border:none;color:rgba(255,255,255,0.3);font-size:11px;cursor:pointer;text-decoration:underline;padding:6px 12px;letter-spacing:0.03em;transition:color .2s;}
      .workspace-delete-link:hover{color:#ff4d4f;}
    `;
    document.head.appendChild(style);
  }

  function injectMenu() {
    const menu = qs('.menu');
    if (!menu || qs('.seg-workspace-menu')) return;
    const item = document.createElement('div');
    item.className = 'menu-item seg-workspace-menu workspace-admin-only';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.innerHTML = `
      <div class="menu-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-briefcase"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
      </div>
      <div>
        <div style="font-weight:900;color:#fff;font-size:13px;margin-bottom:2px" data-i18n="menu:workspace">WORKSPACE SETTINGS</div>
        <div style="color:#64748b;font-size:11px" data-i18n="menu:workspaceDesc">Platform workspaces</div>
      </div>
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
          <p>Login, Workspace tanlash, Google Sheet URL tekshirish. Service Account private key brauzerga kiritilmaydi va localStorage’da saqlanmaydi.</p>
        </div>
        <div class="workspace-hero-badge" id="workspaceModeBadge">WORKSPACE MODE</div>
      </div>

      <div class="workspace-grid">
        <div class="workspace-card">
          <div id="workspaceUserBox" class="workspace-user"></div>

          <div style="margin: 16px 0;">
            <button class="workspace-btn primary super-admin-only" id="workspaceNewButton" type="button" style="width: 100%; padding: 12px; font-size: 14px;">➕ Yangi Workspace yaratish</button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="margin: 0;">📁 Workspace ro‘yxati</h3>
            <button class="workspace-btn ghost" id="workspaceLoadListButton" type="button" style="padding: 4px 10px; font-size: 11px;">🔄 Yangilash</button>
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
              <label class="workspace-label">Time zone
                <input class="workspace-input" id="workspaceTimeZoneInput" value="${DEFAULT_TIME_ZONE}" required>
              </label>
              <label class="workspace-label wide" style="margin-top: 12px;">Service Account JSON (individual)
                <input type="file" id="workspaceServiceAccountInput" accept=".json" class="workspace-input">
                <div id="workspaceServiceAccountStatus" style="font-size: 13px; margin-top: 4px; color: #555;"></div>
              </label>

            </div>

            <div class="workspace-actions">
              <button class="workspace-btn primary" id="workspaceSaveButton" type="submit">Saqlash</button>
              <button class="workspace-btn" id="workspaceTestButton" type="button">Connection test</button>
              <button class="workspace-btn warning" id="workspaceActivateButton" type="button">Activate</button>
            </div>
            <div class="workspace-delete-zone">
              <button class="workspace-delete-link" id="workspaceDeleteButton" type="button" style="display:none;">Workspace'ni o'chirish</button>
            </div>
          </form>

          <pre id="workspaceTestResult" class="workspace-result">Sheet testi natijasi shu yerda chiqadi.</pre>
        </div>

        <div class="workspace-card workspace-members-card">
          <div>
            <h3>👥 Workspace aʼzolari</h3>
            <div class="workspace-note">Mavjud platforma foydalanuvchisini email orqali workspaceʼga qo‘shing. Owner o‘zgarmaydi; administrator faqat o‘zidan past rollarni boshqaradi.</div>
          </div>
          <form id="workspaceMemberAddForm" class="workspace-member-add-grid">
            <label class="workspace-label">Foydalanuvchi emaili
              <select class="workspace-select" id="workspaceMemberEmailInput" required>
                <option value="">Foydalanuvchini tanlang...</option>
              </select>
            </label>
            <label class="workspace-label">Workspace roli
              <select class="workspace-select" id="workspaceMemberRoleInput"></select>
            </label>
            <button class="workspace-btn primary" id="workspaceMemberAddButton" type="submit">Aʼzo qo‘shish</button>
          </form>
          <div id="workspaceMemberStatus" class="workspace-status">Workspace tanlang.</div>
          <div id="workspaceMemberList" class="workspace-member-list"></div>
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

  async function loadPlatformUsersDirectory() {
    try {
      if (!state.accessToken) return;
      const data = await apiFetch('/api/users/directory', { method: 'GET' }, false);
      const selectEl = qs('#workspaceMemberEmailInput');
      if (selectEl && data.users) {
        selectEl.innerHTML = '<option value="">Foydalanuvchini tanlang...</option>' + data.users.map((u) =>
          `<option value="${escapeHtml(u.email)}">${escapeHtml(u.fullName || u.email)} (${escapeHtml(u.email)})</option>`
        ).join('');
      }
    } catch (err) {
      console.error('Failed to load users directory:', err);
    }
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
          <div class="workspace-meta" style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="opacity: 0.7;">👤 Rolingiz:</span> 
              <strong style="color: #dffaff;">${escapeHtml(MEMBER_ROLE_LABELS[String(workspace.memberRole || '').toLowerCase()] || workspace.memberRole || 'Aniqlanmadi')}</strong>
            </div>
          </div>
        </button>
      `;
    }).join('');

    qsa('.workspace-list-item', list).forEach((button) => {
      button.addEventListener('click', () => selectWorkspace(button.dataset.workspaceId));
    });

    const topbarSelect = document.getElementById('topbarWorkspaceSwitcher');
    if (topbarSelect) {
      if (state.workspaces.length > 0) {
        topbarSelect.style.display = 'block';
        topbarSelect.innerHTML = state.workspaces.map(w => 
          `<option value="${escapeHtml(w.id)}" ${w.id === state.selectedWorkspaceId ? 'selected' : ''}>${escapeHtml(w.name)}</option>`
        ).join('');
      } else {
        topbarSelect.style.display = 'none';
      }
    }
  }

  window.topbarSelectWorkspace = function(workspaceId) {
    if (workspaceId) {
      selectWorkspace(workspaceId);
    }
  };

  const MEMBER_ROLE_LABELS = Object.freeze({
    owner: 'Owner',
    administrator: 'Administrator',
    operator: 'Operator',
    viewer: 'Faqat ko‘rish',
  });

  const MEMBER_ROLE_RANK = Object.freeze({
    owner: 4,
    administrator: 3,
    operator: 2,
    viewer: 1,
  });

  function setMemberStatus(message, tone = 'info') {
    const box = qs('#workspaceMemberStatus');
    if (!box) return;
    box.className = `workspace-status ${tone}`;
    box.textContent = message || '';
  }

  function canReadMembers(workspace = selectedWorkspace()) {
    return ['owner', 'administrator'].includes(String(workspace?.memberRole || '').toLowerCase());
  }

  function canManageMembers(workspace = selectedWorkspace()) {
    if (!workspace) return false;
    return ['owner', 'administrator'].includes(String(workspace.memberRole || '').toLowerCase());
  }

  function canConfigureWorkspace(workspace = selectedWorkspace()) {
    if (!workspace) return true;
    return ['owner', 'administrator', 'workspace_manager'].includes(String(workspace.memberRole || '').toLowerCase());
  }

  function applyWorkspaceSettingsAccess(workspace = selectedWorkspace()) {
    const isExisting = Boolean(workspace && workspace.id);
    const readOnly = isExisting && !canConfigureWorkspace(workspace);
    [
      '#workspaceNameInput',
      '#workspaceSheetUrlInput',
      '#workspaceMainSheetInput',
      '#workspaceTimeZoneInput',
      '#workspaceServiceAccountInput',
    ].forEach((selector) => {
      const input = qs(selector);
      if (input) input.readOnly = readOnly;
    });
    ['#workspaceSaveButton', '#workspaceTestButton'].forEach((selector) => {
      const button = qs(selector);
      if (button) button.disabled = readOnly;
    });
    const deleteBtn = qs('#workspaceDeleteButton');
    if (deleteBtn) deleteBtn.style.display = (isExisting && !readOnly) ? 'inline-block' : 'none';
  }

  function canManageMemberRole(actorRole, targetRole) {
    const actor = MEMBER_ROLE_RANK[String(actorRole || '').toLowerCase()] || 0;
    const target = MEMBER_ROLE_RANK[String(targetRole || '').toLowerCase()] || 0;
    return actor >= MEMBER_ROLE_RANK.administrator && target > 0 && target < actor && targetRole !== 'owner';
  }

  function assignableRoles(actorRole) {
    return Object.keys(MEMBER_ROLE_LABELS).filter((role) => canManageMemberRole(actorRole, role));
  }

  function roleOptions(actorRole, selectedRole = '') {
    return assignableRoles(actorRole).map((role) => (
      `<option value="${role}"${role === selectedRole ? ' selected' : ''}>${escapeHtml(MEMBER_ROLE_LABELS[role])}</option>`
    )).join('');
  }

  function renderWorkspaceMembers() {
    const list = qs('#workspaceMemberList');
    const addForm = qs('#workspaceMemberAddForm');
    const roleInput = qs('#workspaceMemberRoleInput');
    if (!list || !addForm || !roleInput) return;

    const workspace = selectedWorkspace();
    const actorRole = String(workspace?.memberRole || '').toLowerCase();
    const roles = assignableRoles(actorRole);
    const canManage = roles.length > 0;
    addForm.style.display = canManage ? 'grid' : 'none';
    roleInput.innerHTML = roleOptions(actorRole, roles.at(-1) || '');

    if (!workspace) {
      list.innerHTML = '<div class="workspace-note">Aʼzolarni ko‘rish uchun workspace tanlang.</div>';
      return;
    }
    if (!canReadMembers(workspace)) {
      list.innerHTML = '<div class="workspace-note">Sizning workspace rolingiz aʼzolar ro‘yxatini ko‘rishga ruxsat bermaydi.</div>';
      return;
    }
    if (!state.members.length) {
      list.innerHTML = '<div class="workspace-note">Workspace aʼzolari topilmadi.</div>';
      return;
    }

    list.innerHTML = state.members.map((member) => {
      const editable = canManageMemberRole(actorRole, member.role);
      const roleControl = editable
        ? `<select class="workspace-select" data-member-role="${escapeHtml(member.id)}">${roleOptions(actorRole, member.role)}</select>`
        : `<span class="workspace-chip">${escapeHtml(MEMBER_ROLE_LABELS[member.role] || member.role)}</span>`;
      const statusControl = editable
        ? `<select class="workspace-select" data-member-status="${escapeHtml(member.id)}">
             <option value="active"${member.status === 'active' ? ' selected' : ''}>Active</option>
             <option value="disabled"${member.status === 'disabled' ? ' selected' : ''}>Disabled</option>
             <option value="invited"${member.status === 'invited' ? ' selected' : ''}>Invited</option>
           </select>`
        : `<span class="workspace-chip ${member.status === 'active' ? 'active' : 'draft'}">${escapeHtml(member.status)}</span>`;
      const actions = editable
        ? `<div class="workspace-member-actions">
             <button class="workspace-btn" type="button" data-member-action="save" data-member-id="${escapeHtml(member.id)}">Saqlash</button>
             <button class="workspace-btn danger" type="button" data-member-action="remove" data-member-id="${escapeHtml(member.id)}">O‘chirish</button>
           </div>`
        : '<div class="workspace-member-actions"></div>';
      return `
        <div class="workspace-member-row">
          <div class="workspace-member-identity">
            <strong>${escapeHtml(member.fullName || member.email)}</strong>
            <small>${escapeHtml(member.email || '')}</small>
          </div>
          ${roleControl}
          ${statusControl}
          ${actions}
        </div>`;
    }).join('');
  }

  async function loadWorkspaceMembers() {
    const workspace = selectedWorkspace();
    state.members = [];
    renderWorkspaceMembers();
    if (!workspace) return;
    if (!canReadMembers(workspace)) {
      setMemberStatus('Sizning workspace rolingiz a‘zolar ro‘yxatini ko‘rishga ruxsat bermaydi.', 'warn');
      return;
    }
    setMemberStatus('Workspace aʼzolari yuklanmoqda...', 'info');
    try {
      const data = await apiFetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/members`, { method: 'GET' });
      state.members = Array.isArray(data.rows) ? data.rows : [];
      renderWorkspaceMembers();
      setMemberStatus(`${state.members.length} ta workspace aʼzosi topildi.`, 'ok');
    } catch (error) {
      renderWorkspaceMembers();
      setMemberStatus(`Aʼzolarni yuklash xato: ${error.message}`, 'error');
    }
  }

  async function addWorkspaceMember(event) {
    event?.preventDefault();
    const workspace = selectedWorkspace();
    const email = qs('#workspaceMemberEmailInput')?.value.trim();
    const role = qs('#workspaceMemberRoleInput')?.value;
    if (!workspace || !email || !role) {
      setMemberStatus('Workspace, email va rol majburiy.', 'warn');
      return;
    }
    setMemberStatus('Workspace aʼzosi qo‘shilmoqda...', 'info');
    try {
      await apiFetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role, status: 'active' }),
      });
      qs('#workspaceMemberEmailInput') && (qs('#workspaceMemberEmailInput').value = '');
      await loadWorkspaceMembers();
      setMemberStatus('Foydalanuvchi workspaceʼga qo‘shildi.', 'ok');
    } catch (error) {
      setMemberStatus(`Aʼzo qo‘shish xato: ${error.message}`, 'error');
    }
  }

  async function updateWorkspaceMemberFromRow(memberId) {
    const workspace = selectedWorkspace();
    const list = qs('#workspaceMemberList');
    const role = qsa('[data-member-role]', list).find((input) => input.dataset.memberRole === memberId)?.value;
    const status = qsa('[data-member-status]', list).find((input) => input.dataset.memberStatus === memberId)?.value;
    if (!workspace || !role || !status) return;
    setMemberStatus('Workspace aʼzosi yangilanmoqda...', 'info');
    try {
      await apiFetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(memberId)}`, {
        method: 'PUT',
        body: JSON.stringify({ role, status }),
      });
      await loadWorkspaceMembers();
      setMemberStatus('Workspace aʼzosi yangilandi.', 'ok');
    } catch (error) {
      setMemberStatus(`Aʼzoni yangilash xato: ${error.message}`, 'error');
    }
  }

  async function removeWorkspaceMember(memberId) {
    const workspace = selectedWorkspace();
    if (!workspace || !window.confirm('Bu foydalanuvchini workspaceʼdan o‘chirishni tasdiqlaysizmi?')) return;
    setMemberStatus('Workspace aʼzosi o‘chirilmoqda...', 'info');
    try {
      await apiFetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
      });
      await loadWorkspaceMembers();
      setMemberStatus('Foydalanuvchi workspaceʼdan o‘chirildi.', 'ok');
    } catch (error) {
      setMemberStatus(`Aʼzoni o‘chirish xato: ${error.message}`, 'error');
    }
  }

  function setFormWorkspace(workspace) {
    if (qs('#workspaceNameInput')) qs('#workspaceNameInput').value = workspace?.name || '';
    if (qs('#workspaceSheetUrlInput')) qs('#workspaceSheetUrlInput').value = workspace?.spreadsheetUrl || '';
    if (qs('#workspaceTimeZoneInput')) qs('#workspaceTimeZoneInput').value = workspace?.timeZone || DEFAULT_TIME_ZONE;
    const saInput = qs('#workspaceServiceAccountInput');
    const saStatus = qs('#workspaceServiceAccountStatus');
    if (saInput) saInput.value = '';
    if (saStatus) {
      saStatus.textContent = workspace?.hasServiceAccount
        ? '✅ Individual JSON ulangan'
        : 'Sistemadagi global kalit ishlatilmoqda';
    }


    applyWorkspaceSettingsAccess(workspace || null);
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
      const sidebarName = document.getElementById('activeWorkspaceNameSidebar');
      if (sidebarName) sidebarName.textContent = workspace.name;
    } else {
      setStatus('Yangi Workspace maʼlumotlarini kiriting.', 'info');
      const sidebarName = document.getElementById('activeWorkspaceNameSidebar');
      if (sidebarName) sidebarName.textContent = 'Workspace tanlanmagan';
    }
    const topbarSelect = document.getElementById('topbarWorkspaceSwitcher');
    if (topbarSelect && topbarSelect.value !== state.selectedWorkspaceId) {
      topbarSelect.value = state.selectedWorkspaceId;
    }
    
    if (workspace && workspace.memberRole) {
      document.body.setAttribute('data-workspace-role', workspace.memberRole);
    } else {
      document.body.removeAttribute('data-workspace-role');
    }
    
    // Inject module settings into localStorage for legacy modules (acts, ulchov)
    if (workspace && workspace.moduleSettings) {
      if (workspace.moduleSettings.acts_sheet_name) {
        localStorage.setItem('acts_sheet_name', workspace.moduleSettings.acts_sheet_name);
      } else {
        localStorage.removeItem('acts_sheet_name');
      }
      
      if (workspace.moduleSettings.ulchov_sheet_name) {
        localStorage.setItem('ulchov_sheet_name', workspace.moduleSettings.ulchov_sheet_name);
      } else {
        localStorage.removeItem('ulchov_sheet_name');
      }
      
      if (workspace.moduleSettings.ulchov_menu_sheet_map) {
        localStorage.setItem('ulchov_menu_sheet_map', workspace.moduleSettings.ulchov_menu_sheet_map);
      } else {
        localStorage.removeItem('ulchov_menu_sheet_map');
      }
    }
    
    const detail = { 
      workspaceId: state.selectedWorkspaceId, 
      workspace: workspace,
      isAdmin: canConfigureWorkspace(workspace),
      platformRole: state.user?.platformRole || 'user'
    };
    window.dispatchEvent(new CustomEvent('seg-kip:workspace-change', { detail }));
    document.querySelectorAll('iframe').forEach((frame) => {
      try { frame.contentWindow?.postMessage({ type: 'SEG_KIP_WORKSPACE_CHANGE', ...detail }, '*'); } catch (_) {}
      syncIframeRoles(frame);
    });
    void loadWorkspaceMembers();
  }

  function syncIframeRoles(frame) {
    try {
      const idoc = frame.contentDocument || frame.contentWindow?.document;
      if (!idoc || !idoc.body) return;
      
      const ws = selectedWorkspace();
      const platformRole = state.user?.platformRole || 'user';
      const workspaceRole = ws?.memberRole || '';
      
      idoc.body.setAttribute('data-platform-role', platformRole);
      if (workspaceRole) {
        idoc.body.setAttribute('data-workspace-role', workspaceRole);
      } else {
        idoc.body.removeAttribute('data-workspace-role');
      }

      if (!idoc.querySelector('link[href*="style.css"]')) {
        const link = idoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = '../css/style.css?v=2';
        idoc.head.appendChild(link);
      }
    } catch (e) {}
  }

  function collectWorkspaceInput(extra = {}) {
    const body = {
      name: String(qs('#workspaceNameInput')?.value || '').trim(),
      spreadsheetUrl: String(qs('#workspaceSheetUrlInput')?.value || '').trim(),
      timeZone: String(qs('#workspaceTimeZoneInput')?.value || '').trim() || DEFAULT_TIME_ZONE,
      ...extra,
    };
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
      if (state.user) document.body.setAttribute('data-platform-role', state.user.platformRole || 'user');
      else document.body.removeAttribute('data-platform-role');
      renderUser();
      qs('#workspaceLoginPassword') && (qs('#workspaceLoginPassword').value = '');
      setStatus('Login muvaffaqiyatli. Workspace ro‘yxati yuklanmoqda...', 'ok');
      await loadWorkspaces();
    } catch (error) {
      setStatus(`Login xato: ${error.message}`, 'error');
    }
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
      if (state.selectedWorkspaceId) {
        localStorage.setItem(SELECTED_WORKSPACE_KEY, state.selectedWorkspaceId);
      }
      renderWorkspaceList();
      setFormWorkspace(selectedWorkspace());
      await loadWorkspaceMembers();
      void loadPlatformUsersDirectory();
      
      // Broadcast to iframes in case they loaded before workspaces were fetched
      const ws = selectedWorkspace();
      if (ws) {
        const detail = { 
          workspaceId: ws.id, 
          workspace: ws,
          isAdmin: canConfigureWorkspace(ws),
          platformRole: state.user?.platformRole || 'user'
        };
        document.querySelectorAll('iframe').forEach((frame) => {
          try { frame.contentWindow?.postMessage({ type: 'SEG_KIP_WORKSPACE_CHANGE', ...detail }, '*'); } catch (_) {}
          syncIframeRoles(frame);
        });
      }

      setStatus(state.workspaces.length ? 'Workspace ro‘yxati yuklandi.' : 'Workspace topilmadi. Yangi Workspace yarating.', state.workspaces.length ? 'ok' : 'warn');
    } catch (error) {
      renderUser();
      setStatus(`Workspace ro‘yxati xato: ${error.message}`, 'error');
    }
  }

  async function saveWorkspace(event, options = {}) {
    event?.preventDefault();
    if (state.selectedWorkspaceId && !canConfigureWorkspace()) {
      setStatus('Sizning workspace rolingiz sozlamalarni o‘zgartirishga ruxsat bermaydi.', 'warn');
      return null;
    }

    const saInput = qs('#workspaceServiceAccountInput');
    let serviceAccountBase64 = undefined;
    if (saInput && saInput.files.length > 0) {
      const file = saInput.files[0];
      try {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Faylni o‘qishda xato'));
          reader.readAsText(file);
        });
        const parsed = JSON.parse(text);
        if (!parsed.client_email || !parsed.private_key) {
          throw new Error('JSON ichida client_email yoki private_key topilmadi');
        }
        serviceAccountBase64 = btoa(unescape(encodeURIComponent(text)));
      } catch (err) {
        setStatus(`Service Account faylida xato: ${err.message}`, 'error');
        return null;
      }
    }

    const body = collectWorkspaceInput(options.extra || {});
    if (serviceAccountBase64 !== undefined) {
      body.serviceAccountBase64 = serviceAccountBase64;
    }

    if (!body.name || !body.spreadsheetUrl) {
      setStatus('Workspace nomi va Sheet URL majburiy.', 'warn');
      return;
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
    if (!canConfigureWorkspace()) {
      setStatus('Sizning workspace rolingiz ulanish testini bajarishga ruxsat bermaydi.', 'warn');
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
      if (data.ok && result.accessVerified && missing.length === 0) {
        setStatus(`Sheet test muvaffaqiyatli.\nTitle: ${result.spreadsheetTitle || ''}\nRequired tabs: mavjud`, 'ok');
      } else {
        setStatus(`Sheet test yakunlandi, lekin tekshirish kerak.\nmissingRequiredTabs: ${missing.join(', ') || 'yo‘q'}`, 'warn');
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
    if (!canConfigureWorkspace()) {
      setStatus('Sizning workspace rolingiz workspace’ni faollashtirishga ruxsat bermaydi.', 'warn');
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
    setFormWorkspace({ timeZone: DEFAULT_TIME_ZONE });
    renderWorkspaceList();
    state.members = [];
    renderWorkspaceMembers();
    renderSheetTestResult('Yangi Workspace uchun maʼlumot kiriting.');
    setStatus('Yangi Workspace yaratish rejimi.', 'info');
  }

  async function deleteWorkspace() {
    const workspace = selectedWorkspace();
    if (!workspace) return;
    const confirmed = window.confirm(`Rostdan ham "${workspace.name}" workspace'ni o'chirmoqchimisiz?\n\nBu amalni ortga qaytarib bo'lmaydi!`);
    if (!confirmed) return;
    setStatus(`Workspace o'chirilmoqda...`, 'info');
    try {
      await apiFetch(`/api/workspaces/${encodeURIComponent(workspace.id)}`, { method: 'DELETE' });
      setStatus(`Workspace muvaffaqiyatli o'chirildi.`, 'ok');
      clearWorkspaceForm();
      await loadWorkspaces();
    } catch (error) {
      setStatus(`O'chirishda xatolik: ${error.message}`, 'error');
    }
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

    qs('#workspaceLoadListButton')?.addEventListener('click', loadWorkspaces);
    qs('#workspaceNewButton')?.addEventListener('click', clearWorkspaceForm);
    qs('#workspaceSettingsForm')?.addEventListener('submit', saveWorkspace);
    qs('#workspaceDeleteButton')?.addEventListener('click', deleteWorkspace);
    qs('#workspaceTestButton')?.addEventListener('click', testWorkspaceConnection);
    qs('#workspaceActivateButton')?.addEventListener('click', activateWorkspace);
    qs('#workspaceMemberAddForm')?.addEventListener('submit', addWorkspaceMember);
    qs('#workspaceMemberList')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-member-action]');
      if (!button) return;
      const memberId = button.dataset.memberId;
      if (button.dataset.memberAction === 'save') void updateWorkspaceMemberFromRow(memberId);
      if (button.dataset.memberAction === 'remove') void removeWorkspaceMember(memberId);
    });
  }

  function setup() {
    injectStyle();
    injectMenu();
    injectPage();
    installNavigationGuards();
    attachEvents();
    renderUser();
    renderWorkspaceList();
    renderWorkspaceMembers();
  }

  // Listen for messages from iframes (save requests, workspace info requests)
  window.addEventListener('message', async (e) => {
    if (e.data && e.data.type === 'SAVE_MODULE_SETTINGS') {
      if (!canConfigureWorkspace()) {
        setStatus('Sizning workspace rolingiz sozlamalarni o\'zgartirishga ruxsat bermaydi.', 'warn');
        return;
      }
      const ws = selectedWorkspace();
      if (!ws) return;
      
      // Merge existing moduleSettings with new ones
      const updatedModuleSettings = { ...(ws.moduleSettings || {}), ...(e.data.settings || {}) };
      
      // Collect all other workspace fields so we can PUT
      const body = {
        name: ws.name,
        spreadsheetUrl: ws.spreadsheetUrl,
        timeZone: ws.timeZone,
        moduleSettings: updatedModuleSettings
      };
      // Only send driveFolderUrl if it exists (avoid clearing it)
      if (ws.driveFolderUrl || ws.driveFolderId) {
        body.driveFolderUrl = ws.driveFolderUrl || ws.driveFolderId;
      }
      
      try {
        setStatus('Module sozlamalari saqlanmoqda...', 'info');
        const data = await apiFetch(`/api/workspaces/${encodeURIComponent(ws.id)}`, { method: 'PUT', body: JSON.stringify(body) });
        if (data.workspace) {
          state.selectedWorkspaceId = data.workspace.id;
          localStorage.setItem(SELECTED_WORKSPACE_KEY, data.workspace.id);
        }
        await loadWorkspaces();
        setStatus('Module sozlamalari workspacega saqlandi!', 'ok');
        
        // Notify iframe that save succeeded
        if (e.source) {
          e.source.postMessage({ type: 'MODULE_SETTINGS_SAVED' }, '*');
        }
      } catch (err) {
        setStatus(`Module sozlamalari xato: ${err.message}`, 'error');
        // Still notify iframe so it doesn't hang
        if (e.source) {
          e.source.postMessage({ type: 'MODULE_SETTINGS_SAVED', error: err.message }, '*');
        }
      }
    }
    
    // iframe loaded after workspace was selected — respond with current workspace info
    if (e.data && e.data.type === 'REQUEST_WORKSPACE_INFO') {
      const ws = selectedWorkspace();

      document.querySelectorAll('iframe').forEach(frame => {
        if (frame.contentWindow === e.source) syncIframeRoles(frame);
      });

      if (ws && e.source) {
        e.source.postMessage({
          type: 'SEG_KIP_WORKSPACE_CHANGE',
          workspaceId: ws.id,
          workspace: ws,
          isAdmin: canConfigureWorkspace(ws)
        }, '*');
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  window.openWorkspaceSettings = openWorkspaceSettings;
  window.segWorkspaceUi = {
    open: openWorkspaceSettings,
    refresh: loadWorkspaces,
    renderWorkspaceList: renderWorkspaceList,
    selectedWorkspace: selectedWorkspace,
    canConfigureWorkspace: canConfigureWorkspace,
    state,
  };
})();
