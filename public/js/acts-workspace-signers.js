// Stage 7.4: 3. АКТЛАР ЖУРНАЛИ → 5. ИМЗО ЧЕКУВЧИЛАР professional object signer UI.
(function setupActsWorkspaceSigners(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const state = { signers: [], workspace: null, previewUrls: new Map() };

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function fromParentStorage(storageName, key){
    try { return parent?.[storageName]?.getItem(key) || ''; } catch (_) { return ''; }
  }
  function workspaceId(){ return localStorage.getItem(SELECTED_WORKSPACE_KEY) || fromParentStorage('localStorage', SELECTED_WORKSPACE_KEY) || ''; }
  function accessToken(){ return sessionStorage.getItem(ACCESS_TOKEN_KEY) || fromParentStorage('sessionStorage', ACCESS_TOKEN_KEY) || ''; }
  function workspaceRootPath(){
    const id = workspaceId();
    if (!id) throw new Error('Объект аниқланмади. Қайта login қилинг ёки администраторга мурожаат қилинг.');
    return `/api/workspaces/${encodeURIComponent(id)}`;
  }
  function workspaceBasePath(){ return `${workspaceRootPath()}/signers`; }
  function setAccessToken(token){
    const next = token || '';
    if (next) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, next);
      try { parent.sessionStorage.setItem(ACCESS_TOKEN_KEY, next); } catch (_) {}
    } else {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      try { parent.sessionStorage.removeItem(ACCESS_TOKEN_KEY); } catch (_) {}
    }
  }
  function setSignersMsg(text, cls=''){
    const el = $('signersMsg');
    if (el) el.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  }
  async function parseResponse(res){
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
  }
  async function refreshSession(){
    const res = await fetch('/api/auth/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include' });
    const data = await parseResponse(res);
    if (!res.ok) throw new Error(data.error || 'Session yangilanmadi');
    setAccessToken(data.accessToken || '');
    return data.accessToken || '';
  }
  async function workspaceFetch(path, options={}, retry=true){
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type','application/json');
    }
    const token = accessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(path, { ...options, headers, credentials:'include' });
    const data = await parseResponse(res);
    if (res.status === 401 && retry) {
      await refreshSession();
      return workspaceFetch(path, options, false);
    }
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  async function workspaceBlob(path, retry=true){
    const headers = new Headers();
    const token = accessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(path, { headers, credentials:'include' });
    if (res.status === 401 && retry) {
      await refreshSession();
      return workspaceBlob(path, false);
    }
    if (!res.ok) throw new Error(`Imzo ko‘rish xato: HTTP ${res.status}`);
    return res.blob();
  }
  function objectName(){ return state.workspace?.name || 'Fargona №-4-Цех'; }
  function folderValue(){ return state.workspace?.driveFolderId || ''; }
  function injectStyle(){
    if ($('actsWorkspaceSignersStyle')) return;
    const style = document.createElement('style');
    style.id = 'actsWorkspaceSignersStyle';
    style.textContent = `
      .object-signers-panel{margin-top:12px;border:1px solid rgba(34,211,238,.22);background:rgba(2,8,23,.38);border-radius:14px;padding:12px;display:grid;gap:10px;}
      .object-signers-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;}
      .object-chip{border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.09);color:#dffbff;border-radius:999px;padding:7px 10px;font-weight:900;font-size:12px;}
      .signature-folder-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;}
      .signature-folder-row label{display:grid;gap:6px;color:#cdeeff;font-size:12px;font-weight:900;}
      .signature-folder-row input{width:100%;background:#061120;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#fff;padding:10px;}
      .signature-preview{margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      .signature-preview img{max-width:110px;max-height:52px;background:#fff;border-radius:8px;padding:4px;border:1px solid rgba(255,255,255,.18);}
      .signature-file-name{color:#a7f3d0;font-size:11px;word-break:break-all;}
      .signature-status{font-size:11px;color:#cde7f0;}
      @media(max-width:760px){.signature-folder-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }
  function ensureObjectPanel(modal){
    if (!modal || $('objectSignersPanel')) return;
    const note = modal.querySelector('.modal-note');
    if (!note) return;
    note.insertAdjacentHTML('afterend', `
      <div id="objectSignersPanel" class="object-signers-panel">
        <div class="object-signers-head">
          <div id="objectSignerName" class="object-chip">Объект: ${esc(objectName())}</div>
          <div id="signatureFolderStatus" class="signature-status">Имзолар папкаси текширилмаган.</div>
        </div>
        <div class="signature-folder-row">
          <label>Имзолар сақланадиган Google Drive папка URL ёки ID
            <input id="signatureFolderInput" placeholder="https://drive.google.com/drive/folders/...">
          </label>
          <button id="saveSignatureFolderBtn" class="btn primary" type="button" onclick="ActsUI.saveSignatureFolder()">Папкани сақлаш</button>
        </div>
      </div>
    `);
  }
  function updateObjectPanel(){
    const name = $('objectSignerName');
    if (name) name.textContent = `Объект: ${objectName()}`;
    const input = $('signatureFolderInput');
    if (input && document.activeElement !== input) input.value = folderValue();
    const status = $('signatureFolderStatus');
    if (status) {
      status.textContent = folderValue()
        ? 'Имзолар Drive папкага сақланади. Drive ишламаса PostgreSQL захираси ишлайди.'
        : 'Папка киритилмаган: Drive ишламаса PostgreSQL захираси ишлайди.';
      status.className = `signature-status ${folderValue() ? 'ok' : 'sync'}`;
    }
  }
  async function loadWorkspaceMeta(){
    const data = await workspaceFetch(workspaceRootPath(), { method:'GET' });
    state.workspace = data.workspace || null;
    updateObjectPanel();
    return state.workspace;
  }
  async function saveSignatureFolder(){
    try {
      const value = $('signatureFolderInput')?.value.trim() || '';
      if (!value) return setSignersMsg('Имзолар папкаси Google Drive URL ёки ID киритинг.', 'bad');
      setSignersMsg('Имзолар папкаси сақланмоқда...', 'sync');
      const data = await workspaceFetch(`${workspaceBasePath()}/signature-folder`, {
        method:'PUT',
        body: JSON.stringify({ driveFolderUrl: value }),
      });
      state.workspace = data.workspace || state.workspace;
      updateObjectPanel();
      setSignersMsg('Имзолар папкаси сақланди. Кейинги PNG имзолар шу папкага юкланади.', 'ok');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
    }
  }
  function normalizeSigner(row){
    return {
      id: row.id || '',
      position: row.position || '',
      fio: row.fio || row.fullName || '',
      gmail: row.gmail || row.email || '',
      signatureUrl: row.signatureUrl || '',
      signatureFileId: row.signatureFileId || '',
      status: row.status || 'active',
    };
  }
  function signaturePreviewHtml(signer){
    const url = signer.signatureUrl || '';
    const fileId = signer.signatureFileId || '';
    if (!url && !fileId) return '<span class="signature-status">PNG tanlanmagan</span>';
    const storage = fileId.startsWith('db:') ? 'PostgreSQL zaxira' : 'Google Drive';
    const openButton = url
      ? `<button class="btn ghost small" type="button" onclick="ActsUI.previewSignerSignature('${esc(signer.id)}')">👁 Кўриш</button>`
      : '';
    return `<div class="signature-preview" data-saved-preview><span class="signature-status">${esc(storage)}</span>${openButton}</div>`;
  }
  function signerRowHtml(signer, isNew=false){
    const id = signer.id || `new_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const disabled = isNew ? '' : 'disabled';
    return `<tr data-signer-id="${esc(id)}" data-new="${isNew?'1':'0'}" data-signature-url="${esc(signer.signatureUrl||'')}" data-signature-file-id="${esc(signer.signatureFileId||'')}"><td><input data-field="position" value="${esc(signer.position||'')}" ${disabled}></td><td><input data-field="fio" value="${esc(signer.fio||'')}" ${disabled}></td><td><div data-file-info>${signaturePreviewHtml({ ...signer, id })}</div><input data-field="file" type="file" accept="image/png,.png" ${disabled}></td><td><input data-field="gmail" type="email" value="${esc(signer.gmail||'')}" placeholder="name@example.com" ${disabled}></td><td><div class="signer-actions"><button class="btn ghost small" title="Tahrirlash" onclick="ActsUI.editSigner('${esc(id)}')">✏️</button><button class="btn green small" title="Saqlash" onclick="ActsUI.saveSigner('${esc(id)}')" ${isNew?'':'disabled'}>💾</button><button class="btn red small" title="O‘chirish" onclick="ActsUI.deleteSigner('${esc(id)}')">🗑</button></div></td></tr>`;
  }
  function bindFileInputs(){
    Array.from(document.querySelectorAll('#signersRows input[data-field="file"]')).forEach((input) => {
      if (input.dataset.previewBound === 'true') return;
      input.dataset.previewBound = 'true';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        const info = input.closest('td')?.querySelector('[data-file-info]');
        if (!info) return;
        if (!file) {
          info.innerHTML = '<span class="signature-status">PNG tanlanmagan</span>';
          return;
        }
        if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
          info.innerHTML = '<span class="bad">Faqat PNG файл қабул қилинади</span>';
          return;
        }
        const url = URL.createObjectURL(file);
        state.previewUrls.set(input.closest('tr')?.dataset.signerId || file.name, url);
        info.innerHTML = `<div class="signature-preview"><img src="${esc(url)}" alt="PNG imzo preview"><span class="signature-file-name">${esc(file.name)} · ${Math.round(file.size / 1024)} KB</span></div>`;
      });
    });
  }
  function renderSigners(){
    const tb = $('signersRows');
    if (!tb) return;
    if (!state.signers.length) {
      tb.innerHTML = '<tr><td colspan="5">Бу объект учун имзо чекувчилар йўқ. “Қўшиш” тугмасини босинг.</td></tr>';
      return;
    }
    tb.innerHTML = state.signers.map(s => signerRowHtml(s, false)).join('');
    bindFileInputs();
  }
  async function loadSigners(){
    try {
      setSignersMsg('Имзо чекувчилар рўйхати юкланмоқда...', 'sync');
      await loadWorkspaceMeta();
      const data = await workspaceFetch(`${workspaceBasePath()}?includeInactive=true`, { method:'GET' });
      state.signers = (data.rows || []).map(normalizeSigner).filter(s => s.status !== 'deleted');
      renderSigners();
      setSignersMsg(`${state.signers.length} та имзо чекувчи юкланди. Объект: ${objectName()}.`, 'ok');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
      const tb = $('signersRows');
      if (tb) tb.innerHTML = `<tr><td colspan="5">${esc(err.message)}</td></tr>`;
    }
  }
  function openSigners(){
    const modal = $('signersModal');
    if (!modal) return;
    injectStyle();
    ensureObjectPanel(modal);
    const title = modal.querySelector('.modal-head h2');
    const note = modal.querySelector('.modal-head .note');
    const modalNote = modal.querySelector('.modal-note');
    if (title) title.textContent = 'ИМЗО ЧЕКУВЧИЛАР';
    if (note) note.textContent = 'Lavozim, F.I.O, PNG imzo va Gmail tanlangan obyekt ichida saqlanadi.';
    if (modalNote) modalNote.textContent = 'PNG: maksimum 2 MB. Imzolar kiritilgan Drive papkaga saqlanadi; Drive ishlamasa PostgreSQL zaxira saqlash ishlaydi.';
    modal.classList.add('show');
    updateObjectPanel();
    loadSigners();
  }
  function closeSigners(){ $('signersModal')?.classList.remove('show'); }
  function addSignerRow(){
    const tb = $('signersRows');
    if (!tb) return;
    if (tb.querySelector('td[colspan]')) tb.innerHTML = '';
    const id = `new_${Date.now()}`;
    tb.insertAdjacentHTML('beforeend', signerRowHtml({ id }, true));
    bindFileInputs();
    setSignersMsg('Янги имзо чекувчи қатори қўшилди. Майдонларни тўлдириб сақланг.', 'sync');
  }
  function rowBySignerId(id){ return Array.from($('signersRows')?.querySelectorAll('tr') || []).find(tr => tr.dataset.signerId === id); }
  function editSigner(id){
    const tr = rowBySignerId(id);
    if (!tr) return;
    tr.querySelectorAll('input').forEach(i => { i.disabled = false; });
    const save = tr.querySelector('button[title="Saqlash"]');
    if (save) save.disabled = false;
    bindFileInputs();
    setSignersMsg('Имзо чекувчини таҳрирлаш режими ёқилди.', 'sync');
  }
  async function previewSignerSignature(id){
    const signer = state.signers.find(s => s.id === id) || normalizeSigner(rowBySignerId(id)?.dataset || {});
    const url = signer.signatureUrl || rowBySignerId(id)?.dataset.signatureUrl || '';
    if (!url) return setSignersMsg('Кўриш учун имзо файли топилмади.', 'bad');
    try {
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener');
        return;
      }
      const blob = await workspaceBlob(url);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
    }
  }
  async function uploadSignerFile(file){
    if (!file) return null;
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) throw new Error('Faqat PNG файл қабул қилинади');
    if (file.size > 2 * 1024 * 1024) throw new Error('PNG hajmi 2 MB dan oshmasligi kerak');
    const form = new FormData();
    form.append('signature', file);
    const data = await workspaceFetch(`${workspaceBasePath()}/signature`, { method:'POST', body: form });
    return { signatureUrl: data.webViewLink || '', signatureFileId: data.fileId || '', storage: data.storage || '' };
  }
  function translateSaveError(err){
    const text = String(err.message || '');
    if (/already exists|SIGNER_EMAIL_ALREADY_EXISTS/i.test(text)) return 'Бу Gmail ушбу объектда аллақачон мавжуд.';
    return text;
  }
  async function saveSigner(id){
    const tr = rowBySignerId(id);
    if (!tr) return;
    const position = tr.querySelector('[data-field="position"]')?.value.trim() || '';
    const fio = tr.querySelector('[data-field="fio"]')?.value.trim() || '';
    const gmail = tr.querySelector('[data-field="gmail"]')?.value.trim() || '';
    const file = tr.querySelector('[data-field="file"]')?.files?.[0] || null;
    if (!position || !fio || !gmail) return setSignersMsg('Lavozimi, F.I.O va Gmail to‘ldirilishi shart.', 'bad');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) return setSignersMsg('Gmail/email formati noto‘g‘ri.', 'bad');
    try {
      setSignersMsg('PNG yuklanmoqda va imzo chekuvchi saqlanmoqda...', 'sync');
      let signatureUrl = tr.dataset.signatureUrl || '';
      let signatureFileId = tr.dataset.signatureFileId || '';
      const uploaded = await uploadSignerFile(file);
      if (uploaded) {
        signatureUrl = uploaded.signatureUrl;
        signatureFileId = uploaded.signatureFileId;
      }
      if (!signatureUrl && !signatureFileId) throw new Error('PNG imzo tanlanmagan');
      const payload = { position, fullName: fio, email: gmail, signatureUrl, signatureFileId, status: 'active' };
      if (tr.dataset.new === '1') {
        await workspaceFetch(workspaceBasePath(), { method:'POST', body: JSON.stringify(payload) });
      } else {
        await workspaceFetch(`${workspaceBasePath()}/${encodeURIComponent(id)}`, { method:'PUT', body: JSON.stringify(payload) });
      }
      await loadSigners();
      setSignersMsg('Имзо чекувчи сақланди.', 'ok');
    } catch (err) {
      setSignersMsg(translateSaveError(err), 'bad');
    }
  }
  async function deleteSigner(id){
    const tr = rowBySignerId(id);
    if (!tr) return;
    if (tr.dataset.new === '1') {
      tr.remove();
      return setSignersMsg('Янги қатор бекор қилинди.', 'sync');
    }
    if (!confirm('Ушбу имзо чекувчини ўчиришни тасдиқлайсизми?')) return;
    try {
      setSignersMsg('Имзо чекувчи ўчирилмоқда...', 'sync');
      await workspaceFetch(`${workspaceBasePath()}/${encodeURIComponent(id)}`, { method:'DELETE' });
      await loadSigners();
      setSignersMsg('Имзо чекувчи ўчирилди.', 'ok');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
    }
  }
  function patchActsUi(){
    if (!window.ActsUI || window.ActsUI.__workspaceSignersPatched) return false;
    Object.assign(window.ActsUI, {
      openSigners,
      closeSigners,
      loadSigners,
      addSignerRow,
      editSigner,
      saveSigner,
      deleteSigner,
      saveSignatureFolder,
      previewSignerSignature,
    });
    window.ActsUI.__workspaceSignersPatched = true;
    window.ActsWorkspaceSigners = { loadSigners, saveSignatureFolder, state };
    return true;
  }
  function boot(){
    injectStyle();
    if (patchActsUi()) return;
    const timer = setInterval(() => {
      if (patchActsUi()) clearInterval(timer);
    }, 100);
    setTimeout(() => clearInterval(timer), 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
