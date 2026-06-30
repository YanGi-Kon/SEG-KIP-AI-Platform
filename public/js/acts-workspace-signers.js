// Stage 7.3: Connect 3. АКТЛАР ЖУРНАЛИ → 5. ИМЗО ЧЕКУВЧИЛАР to Workspace Signers.
(function setupActsWorkspaceSigners(){
  const ACCESS_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const SELECTED_WORKSPACE_KEY = 'seg_kip_selected_workspace_id';
  const state = { signers: [] };

  function $(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function workspaceId(){ return localStorage.getItem(SELECTED_WORKSPACE_KEY) || parent?.localStorage?.getItem(SELECTED_WORKSPACE_KEY) || ''; }
  function accessToken(){ return sessionStorage.getItem(ACCESS_TOKEN_KEY) || parent?.sessionStorage?.getItem(ACCESS_TOKEN_KEY) || ''; }
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
    if (!res.ok) throw new Error(data.error || 'Workspace session yangilanmadi');
    setAccessToken(data.accessToken || '');
    return data.accessToken || '';
  }
  function workspaceBasePath(){
    const id = workspaceId();
    if (!id) throw new Error('Avval WORKSPACE SETTINGS bo‘limida Workspace tanlang.');
    return `/api/workspaces/${encodeURIComponent(id)}/signers`;
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
  function signerRowHtml(signer, isNew=false){
    const id = signer.id || `new_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const disabled = isNew ? '' : 'disabled';
    const signatureLabel = signer.signatureUrl || signer.signatureFileId;
    const fileInfo = signatureLabel
      ? `<a class="file-link" href="${esc(signer.signatureUrl || '#')}" target="_blank" rel="noopener">Workspace imzo</a>`
      : 'PNG tanlanmagan';
    return `<tr data-signer-id="${esc(id)}" data-new="${isNew?'1':'0'}" data-signature-url="${esc(signer.signatureUrl||'')}" data-signature-file-id="${esc(signer.signatureFileId||'')}"><td><input data-field="position" value="${esc(signer.position||'')}" ${disabled}></td><td><input data-field="fio" value="${esc(signer.fio||'')}" ${disabled}></td><td><div data-file-info>${fileInfo}</div><input data-field="file" type="file" accept="image/png,.png" ${disabled}></td><td><input data-field="gmail" type="email" value="${esc(signer.gmail||'')}" placeholder="name@example.com" ${disabled}></td><td><div class="signer-actions"><button class="btn ghost small" title="Tahrirlash" onclick="ActsUI.editSigner('${esc(id)}')">✏️</button><button class="btn green small" title="Saqlash" onclick="ActsUI.saveSigner('${esc(id)}')" ${isNew?'':'disabled'}>💾</button><button class="btn red small" title="O‘chirish" onclick="ActsUI.deleteSigner('${esc(id)}')">🗑</button></div></td></tr>`;
  }
  function renderSigners(){
    const tb = $('signersRows');
    if (!tb) return;
    if (!state.signers.length) {
      tb.innerHTML = '<tr><td colspan="5">Bu Workspace uchun imzo chekuvchilar yo‘q. “Қўшиш” tugmasini bosing.</td></tr>';
      return;
    }
    tb.innerHTML = state.signers.map(s => signerRowHtml(s, false)).join('');
  }
  async function loadSigners(){
    try {
      setSignersMsg('Workspace Signers dan yuklanmoqda...', 'sync');
      const data = await workspaceFetch(`${workspaceBasePath()}?includeInactive=true`, { method:'GET' });
      state.signers = (data.rows || []).map(normalizeSigner).filter(s => s.status !== 'deleted');
      renderSigners();
      setSignersMsg(`${state.signers.length} ta imzo chekuvchi yuklandi. Manba: Workspace Signers.`, 'ok');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
      const tb = $('signersRows');
      if (tb) tb.innerHTML = `<tr><td colspan="5">${esc(err.message)}</td></tr>`;
    }
  }
  function openSigners(){
    const modal = $('signersModal');
    if (!modal) return;
    const title = modal.querySelector('.modal-head h2');
    const note = modal.querySelector('.modal-head .note');
    const modalNote = modal.querySelector('.modal-note');
    if (title) title.textContent = 'ИМЗО ЧЕКУВЧИЛАР — Workspace Signers';
    if (note) note.textContent = 'Lavozim, F.I.O, PNG imzo va email tanlangan Workspace ichida saqlanadi.';
    if (modalNote) modalNote.textContent = 'PNG: maksimum 2 MB. Signer ro‘yxati endi Google Sheet global varog‘idan emas, tanlangan Workspace Signers bazasidan olinadi.';
    modal.classList.add('show');
    loadSigners();
  }
  function closeSigners(){ $('signersModal')?.classList.remove('show'); }
  function addSignerRow(){
    const tb = $('signersRows');
    if (!tb) return;
    if (tb.querySelector('td[colspan]')) tb.innerHTML = '';
    const id = `new_${Date.now()}`;
    tb.insertAdjacentHTML('beforeend', signerRowHtml({ id }, true));
    setSignersMsg('Yangi Workspace signer qatori qo‘shildi. Maydonlarni to‘ldirib saqlang.', 'sync');
  }
  function rowBySignerId(id){ return Array.from($('signersRows')?.querySelectorAll('tr') || []).find(tr => tr.dataset.signerId === id); }
  function editSigner(id){
    const tr = rowBySignerId(id);
    if (!tr) return;
    tr.querySelectorAll('input').forEach(i => { i.disabled = false; });
    const save = tr.querySelector('button[title="Saqlash"]');
    if (save) save.disabled = false;
    setSignersMsg('Workspace signer tahrirlash rejimi yoqildi.', 'sync');
  }
  async function uploadSignerFile(file){
    if (!file) return null;
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) throw new Error('Faqat PNG файл қабул қилинади');
    if (file.size > 2 * 1024 * 1024) throw new Error('PNG hajmi 2 MB dan oshmasligi kerak');
    const form = new FormData();
    form.append('signature', file);
    const data = await workspaceFetch(`${workspaceBasePath()}/signature`, { method:'POST', body: form });
    return { signatureUrl: data.webViewLink || '', signatureFileId: data.fileId || '' };
  }
  async function saveSigner(id){
    const tr = rowBySignerId(id);
    if (!tr) return;
    const position = tr.querySelector('[data-field="position"]')?.value.trim() || '';
    const fio = tr.querySelector('[data-field="fio"]')?.value.trim() || '';
    const gmail = tr.querySelector('[data-field="gmail"]')?.value.trim() || '';
    const file = tr.querySelector('[data-field="file"]')?.files?.[0] || null;
    if (!position || !fio || !gmail) return setSignersMsg('Lavozimi, F.I.O va email to‘ldirilishi shart.', 'bad');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)) return setSignersMsg('Email formati noto‘g‘ri.', 'bad');
    try {
      setSignersMsg('PNG yuklanmoqda va Workspace signer saqlanmoqda...', 'sync');
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
      setSignersMsg('Workspace signer saqlandi.', 'ok');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
    }
  }
  async function deleteSigner(id){
    const tr = rowBySignerId(id);
    if (!tr) return;
    if (tr.dataset.new === '1') {
      tr.remove();
      return setSignersMsg('Yangi qator bekor qilindi.', 'sync');
    }
    if (!confirm('Ushbu Workspace signerni o‘chirishni tasdiqlaysizmi?')) return;
    try {
      setSignersMsg('Workspace signer o‘chirilmoqda...', 'sync');
      await workspaceFetch(`${workspaceBasePath()}/${encodeURIComponent(id)}`, { method:'DELETE' });
      await loadSigners();
      setSignersMsg('Workspace signer o‘chirildi.', 'ok');
    } catch (err) {
      setSignersMsg(err.message, 'bad');
    }
  }
  function patchActsUi(){
    if (!window.ActsUI || window.ActsUI.__workspaceSignersPatched) return false;
    Object.assign(window.ActsUI, { openSigners, closeSigners, loadSigners, addSignerRow, editSigner, saveSigner, deleteSigner });
    window.ActsUI.__workspaceSignersPatched = true;
    window.ActsWorkspaceSigners = { loadSigners, state };
    return true;
  }
  function boot(){
    if (patchActsUi()) return;
    const timer = setInterval(() => {
      if (patchActsUi()) clearInterval(timer);
    }, 100);
    setTimeout(() => clearInterval(timer), 8000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
