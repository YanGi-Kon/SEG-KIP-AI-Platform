// SEG KIP Workspace Signers UI
// Stage 7: workspace-scoped signer CRUD validation from browser.
(function setupWorkspaceSignersUi(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const state = { rows: [], editingId: '' };

  function qs(selector, root = document){ return root.querySelector(selector); }
  function qsa(selector, root = document){ return Array.from(root.querySelectorAll(selector)); }
  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function workspaceId(){
    return window.segWorkspaceUi?.state?.selectedWorkspaceId || localStorage.getItem(SELECTED_WORKSPACE_KEY) || '';
  }
  function token(){ return sessionStorage.getItem(ACCESS_TOKEN_KEY) || window.segWorkspaceUi?.state?.accessToken || ''; }
  function setToken(value){
    const next = value || '';
    if (next) sessionStorage.setItem(ACCESS_TOKEN_KEY, next);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    if (window.segWorkspaceUi?.state) window.segWorkspaceUi.state.accessToken = next;
  }
  function setStatus(message, tone = 'info'){
    const box = qs('#workspaceSignerStatus');
    if (!box) return;
    box.className = `workspace-status ${tone}`;
    box.textContent = message || '';
  }
  async function parseResponse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  async function refreshSession(){
    const res = await fetch('/api/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    });
    const data = await parseResponse(res);
    if (!res.ok) throw new Error(data.error || 'Session yangilanmadi');
    setToken(data.accessToken || '');
    if (window.segWorkspaceUi?.state) window.segWorkspaceUi.state.user = data.user || window.segWorkspaceUi.state.user;
    return data.accessToken || '';
  }
  async function apiFetch(path, options = {}, retry = true){
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const currentToken = token();
    if (currentToken) headers.Authorization = `Bearer ${currentToken}`;
    const res = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await parseResponse(res);
    if (res.status === 401 && retry) {
      await refreshSession();
      return apiFetch(path, options, false);
    }
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
    return data;
  }
  function injectStyle(){
    if (qs('#workspaceSignersUiStyle')) return;
    const style = document.createElement('style');
    style.id = 'workspaceSignersUiStyle';
    style.textContent = `
      .workspace-signers-card{grid-column:1 / -1;}
      .workspace-signer-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start;}
      .workspace-signer-list{display:grid;gap:10px;max-height:520px;overflow:auto;padding-right:4px;}
      .workspace-signer-item{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);border-radius:18px;padding:13px;display:grid;gap:8px;}
      .workspace-signer-item.inactive{opacity:.72;}
      .workspace-signer-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;}
      .workspace-signer-name{font-weight:900;color:#eaffff;line-height:1.35;}
      .workspace-signer-meta{font-size:12px;color:#a7c6d4;line-height:1.45;word-break:break-word;}
      .workspace-signer-actions{display:flex;flex-wrap:wrap;gap:8px;}
      .workspace-signer-empty{border:1px dashed rgba(34,211,238,.24);border-radius:18px;padding:18px;color:#9fb7c7;background:rgba(2,8,23,.42);}
      @media(max-width:980px){.workspace-signer-layout{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(style);
  }
  function injectPanel(){
    if (qs('#workspaceSignersPanel')) return;
    const page = qs('#workspaceSettingsPage');
    const grid = page?.querySelector('.workspace-grid');
    if (!grid) return;
    const card = document.createElement('div');
    card.id = 'workspaceSignersPanel';
    card.className = 'workspace-card workspace-signers-card';
    card.innerHTML = `
      <div class="workspace-hero" style="margin-bottom:16px;grid-template-columns:1fr auto;">
        <div>
          <h1 style="font-size:26px">✍️ Workspace Signers</h1>
          <p>Imzo chekuvchilar faqat tanlangan Workspace ichida saqlanadi. Global legacy <code>/api/signers</code> ishlatilmaydi.</p>
        </div>
        <div class="workspace-hero-badge">STAGE 7</div>
      </div>
      <div id="workspaceSignerStatus" class="workspace-status">Workspace tanlang va imzolovchilar ro‘yxatini yuklang.</div>
      <div class="workspace-actions">
        <button class="workspace-btn" id="workspaceSignerLoadButton" type="button">Imzolovchilarni yuklash</button>
        <button class="workspace-btn ghost" id="workspaceSignerNewButton" type="button">Yangi signer</button>
      </div>
      <div class="workspace-signer-layout" style="margin-top:16px;">
        <div>
          <h3>Ro‘yxat</h3>
          <div id="workspaceSignerList" class="workspace-signer-list"></div>
        </div>
        <form id="workspaceSignerForm" class="workspace-form">
          <h3 id="workspaceSignerFormTitle">Yangi signer</h3>
          <label class="workspace-label">Lavozimi
            <input class="workspace-input" id="workspaceSignerPosition" placeholder="Masalan: Bosh muhandis" required>
          </label>
          <label class="workspace-label">F.I.O
            <input class="workspace-input" id="workspaceSignerFullName" placeholder="Familiya Ism Sharif" required>
          </label>
          <label class="workspace-label">Email
            <input class="workspace-input" id="workspaceSignerEmail" type="email" placeholder="user@example.com" required>
          </label>
          <label class="workspace-label">Signature file ID, ixtiyoriy
            <input class="workspace-input" id="workspaceSignerFileId" placeholder="Google Drive file id">
          </label>
          <label class="workspace-label">Signature URL, ixtiyoriy
            <input class="workspace-input" id="workspaceSignerUrl" placeholder="https://drive.google.com/file/d/.../view">
          </label>
          <label class="workspace-label">Status
            <select class="workspace-select" id="workspaceSignerStatusInput">
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
          <div class="workspace-actions">
            <button class="workspace-btn primary" type="submit">Saqlash</button>
            <button class="workspace-btn ghost" id="workspaceSignerResetButton" type="button">Formani tozalash</button>
          </div>
        </form>
      </div>
    `;
    grid.appendChild(card);
    attachEvents();
  }
  function currentPath(){
    const id = workspaceId();
    if (!id) throw new Error('Avval Workspace tanlang.');
    return `/api/workspaces/${encodeURIComponent(id)}/signers`;
  }
  function clearForm(){
    state.editingId = '';
    qs('#workspaceSignerFormTitle') && (qs('#workspaceSignerFormTitle').textContent = 'Yangi signer');
    ['workspaceSignerPosition','workspaceSignerFullName','workspaceSignerEmail','workspaceSignerFileId','workspaceSignerUrl'].forEach((id) => {
      const input = qs(`#${id}`);
      if (input) input.value = '';
    });
    const status = qs('#workspaceSignerStatusInput');
    if (status) status.value = 'active';
  }
  function formData(){
    return {
      position: qs('#workspaceSignerPosition')?.value.trim() || '',
      fullName: qs('#workspaceSignerFullName')?.value.trim() || '',
      email: qs('#workspaceSignerEmail')?.value.trim() || '',
      signatureFileId: qs('#workspaceSignerFileId')?.value.trim() || '',
      signatureUrl: qs('#workspaceSignerUrl')?.value.trim() || '',
      status: qs('#workspaceSignerStatusInput')?.value || 'active',
    };
  }
  function renderList(){
    const list = qs('#workspaceSignerList');
    if (!list) return;
    if (!state.rows.length) {
      list.innerHTML = '<div class="workspace-signer-empty">Bu Workspace uchun signer hali yo‘q.</div>';
      return;
    }
    list.innerHTML = state.rows.map((row) => `
      <div class="workspace-signer-item ${escapeHtml(row.status)}" data-signer-id="${escapeHtml(row.id)}">
        <div class="workspace-signer-head">
          <div>
            <div class="workspace-signer-name">${escapeHtml(row.fullName)}</div>
            <div class="workspace-signer-meta">${escapeHtml(row.position)}<br>${escapeHtml(row.email)}</div>
          </div>
          <span class="workspace-chip ${row.status === 'active' ? 'active' : 'draft'}">${escapeHtml(row.status)}</span>
        </div>
        <div class="workspace-signer-meta">
          signatureFileId: ${escapeHtml(row.signatureFileId || '—')}<br>
          updatedAt: ${escapeHtml(row.updatedAt || '')}
        </div>
        <div class="workspace-signer-actions">
          <button class="workspace-btn ghost" type="button" data-edit-signer="${escapeHtml(row.id)}">Tahrirlash</button>
          <button class="workspace-btn danger" type="button" data-delete-signer="${escapeHtml(row.id)}">O‘chirish</button>
        </div>
      </div>
    `).join('');
    qsa('[data-edit-signer]', list).forEach((button) => button.addEventListener('click', () => editSigner(button.dataset.editSigner)));
    qsa('[data-delete-signer]', list).forEach((button) => button.addEventListener('click', () => deleteSigner(button.dataset.deleteSigner)));
  }
  async function loadSigners(){
    try {
      setStatus('Signer ro‘yxati yuklanmoqda...', 'info');
      const data = await apiFetch(`${currentPath()}?includeInactive=true`, { method: 'GET' });
      state.rows = Array.isArray(data.rows) ? data.rows : [];
      renderList();
      setStatus(`${state.rows.length} ta signer yuklandi. Workspace isolation ishlayapti.`, 'ok');
    } catch (error) {
      setStatus(`Signer ro‘yxati xato: ${error.message}`, 'error');
    }
  }
  function editSigner(id){
    const row = state.rows.find((item) => item.id === id);
    if (!row) return;
    state.editingId = id;
    qs('#workspaceSignerFormTitle') && (qs('#workspaceSignerFormTitle').textContent = 'Signer tahrirlash');
    qs('#workspaceSignerPosition') && (qs('#workspaceSignerPosition').value = row.position || '');
    qs('#workspaceSignerFullName') && (qs('#workspaceSignerFullName').value = row.fullName || '');
    qs('#workspaceSignerEmail') && (qs('#workspaceSignerEmail').value = row.email || '');
    qs('#workspaceSignerFileId') && (qs('#workspaceSignerFileId').value = row.signatureFileId || '');
    qs('#workspaceSignerUrl') && (qs('#workspaceSignerUrl').value = row.signatureUrl || '');
    qs('#workspaceSignerStatusInput') && (qs('#workspaceSignerStatusInput').value = row.status || 'active');
    setStatus(`Tahrirlash rejimi: ${row.fullName}`, 'info');
  }
  async function saveSigner(event){
    event?.preventDefault();
    const body = formData();
    if (!body.position || !body.fullName || !body.email) {
      setStatus('Lavozimi, F.I.O va Email majburiy.', 'warn');
      return;
    }
    try {
      const method = state.editingId ? 'PUT' : 'POST';
      const path = state.editingId ? `${currentPath()}/${encodeURIComponent(state.editingId)}` : currentPath();
      setStatus(state.editingId ? 'Signer yangilanmoqda...' : 'Signer yaratilmoqda...', 'info');
      await apiFetch(path, { method, body: JSON.stringify(body) });
      clearForm();
      await loadSigners();
      setStatus(method === 'POST' ? 'Signer yaratildi.' : 'Signer yangilandi.', 'ok');
    } catch (error) {
      setStatus(`Signer saqlash xato: ${error.message}`, 'error');
    }
  }
  async function deleteSigner(id){
    const row = state.rows.find((item) => item.id === id);
    if (!row) return;
    if (!confirm(`${row.fullName} signerni o‘chirishni tasdiqlaysizmi?`)) return;
    try {
      setStatus('Signer o‘chirilmoqda...', 'info');
      await apiFetch(`${currentPath()}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (state.editingId === id) clearForm();
      await loadSigners();
      setStatus('Signer o‘chirildi.', 'ok');
    } catch (error) {
      setStatus(`Signer o‘chirish xato: ${error.message}`, 'error');
    }
  }
  function attachEvents(){
    qs('#workspaceSignerLoadButton')?.addEventListener('click', loadSigners);
    qs('#workspaceSignerNewButton')?.addEventListener('click', clearForm);
    qs('#workspaceSignerResetButton')?.addEventListener('click', clearForm);
    qs('#workspaceSignerForm')?.addEventListener('submit', saveSigner);
  }
  function setup(){
    injectStyle();
    injectPanel();
    renderList();
  }
  function bootWhenReady(){
    if (qs('#workspaceSettingsPage')) setup();
    const observer = new MutationObserver(() => {
      if (qs('#workspaceSettingsPage') && !qs('#workspaceSignersPanel')) setup();
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWhenReady);
  else bootWhenReady();

  window.segWorkspaceSignersUi = { load: loadSigners, clearForm, state };
})();
