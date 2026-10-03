(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const MONTHS = ['', 'Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const $ = (id) => document.getElementById(id);
  const clean = (v) => String(v ?? '').trim();
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const parentStorage = (store, key) => { try { return parent?.[store]?.getItem(key) || ''; } catch (_) { return ''; } };

  function workspaceId() {
    return clean(
      window.KudukJournalWorkspace?.workspaceId?.()
      || localStorage.getItem(WORKSPACE_ID_KEY)
      || parentStorage('localStorage', WORKSPACE_ID_KEY)
    );
  }

  function authToken() {
    try {
      return sessionStorage.getItem(WORKSPACE_TOKEN_KEY)
        || parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY)
        || sessionStorage.getItem(ADMIN_TOKEN_KEY)
        || parentStorage('sessionStorage', ADMIN_TOKEN_KEY)
        || '';
    } catch (_) {
      return '';
    }
  }

  async function refreshSession() {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Workspace sessiyasi yangilanmadi');
    sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken);
    try { parent.sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken); } catch (_) {}
    return data.accessToken;
  }

  async function api(path, options = {}, retry = true) {
    const headers = new Headers(options.headers || {});
    const token = authToken();
    const wid = workspaceId();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (wid) headers.set('x-workspace-id', wid);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && retry) {
      await refreshSession();
      return api(path, options, false);
    }
    if (!response.ok || data.error) throw Object.assign(new Error(data.error || ('HTTP ' + response.status)), { data, status: response.status });
    return data;
  }

  function injectStyle() {
    if ($('kudukWorkflowStyle')) return;
    const style = document.createElement('style');
    style.id = 'kudukWorkflowStyle';
    style.textContent = `
      .kw-modal{position:fixed;inset:0;z-index:140;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.76);font-family:Arial,sans-serif;color:#eaf7ff}
      .kw-modal.show{display:flex}
      .kw-shell{width:min(1180px,100%);max-height:92vh;overflow:auto;background:#071427;border:1px solid rgba(34,211,238,.30);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.48)}
      .kw-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.09)}
      .kw-head h2{margin:0;font-size:20px}.kw-head p{margin:4px 0 0;font-size:11px;color:#9fb7c7}
      .kw-body{padding:16px}.kw-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .kw-reports-grid{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:520px}
      .kw-folders{padding:14px;border-right:1px solid rgba(255,255,255,.09);overflow:auto}
      .kw-year{margin:10px 0 7px;color:#a5f3fc;font-weight:900;font-size:13px}
      .kw-folder{width:100%;display:flex;justify-content:space-between;gap:10px;align-items:center;text-align:left;margin:0 0 8px;padding:11px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:#eaf7ff;border-radius:12px;cursor:pointer}
      .kw-folder:hover,.kw-folder.active{border-color:rgba(34,211,238,.55);background:rgba(34,211,238,.10)}
      .kw-preview{padding:16px;overflow:auto;background:#0b1628}.kw-empty{padding:28px;text-align:center;color:#9fb7c7}
      .kw-tablewrap{overflow:auto;border:1px solid rgba(255,255,255,.10);border-radius:12px}
      .kw-table{width:100%;min-width:980px;border-collapse:collapse}.kw-table th,.kw-table td{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.08);font-size:11px;text-align:left;vertical-align:top}
      .kw-table th{background:#0a2538;color:#c9f7ff;position:sticky;top:0}.kw-status{font-size:12px;color:#cdeeff}.kw-status.ok{color:#86efac}.kw-status.bad{color:#fca5a5}.kw-status.sync{color:#fde68a}
      .kw-card{padding:14px;border:1px solid rgba(34,211,238,.25);border-radius:13px;background:rgba(4,18,34,.72);margin-bottom:12px}
      .kw-card label{display:grid;gap:6px;font-size:12px;color:#cdeeff;font-weight:800}.kw-card input{width:100%;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#061120;color:#fff;padding:8px 10px}
      .kw-signers-table{width:100%;min-width:760px;border-collapse:collapse}.kw-signers-table th,.kw-signers-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.09);font-size:12px;text-align:left}.kw-signers-table th{background:#0a2538;color:#dffbff}
      .kw-add-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kw-add-grid input{width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.25);border-radius:9px;background:#091729;color:#eaf7ff;padding:9px 10px}
      @media(max-width:850px){.kw-reports-grid{grid-template-columns:1fr}.kw-folders{max-height:220px;border-right:0;border-bottom:1px solid rgba(255,255,255,.09)}.kw-add-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (!$('kudukReportsModal')) {
      const modal = document.createElement('div');
      modal.id = 'kudukReportsModal';
      modal.className = 'kw-modal';
      modal.innerHTML = `
        <div class="kw-shell">
          <div class="kw-head">
            <div><h2>3. Хисоботлар</h2><p>1. ЖУРНАЛ УЧЕТА маълумотлари 2026–2028 йиллар бўйича ойларга ажратилган.</p></div>
            <button id="kudukReportsClose" class="btn" type="button">✕</button>
          </div>
          <div class="kw-reports-grid">
            <aside id="kudukReportFolders" class="kw-folders"></aside>
            <main id="kudukReportPreview" class="kw-preview"><div class="kw-empty">Ойни танланг.</div></main>
          </div>
        </div>`;
      document.body.appendChild(modal);
      $('kudukReportsClose')?.addEventListener('click', () => modal.classList.remove('show'));
      modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
    }

    if (!$('kudukSignersModal')) {
      const modal = document.createElement('div');
      modal.id = 'kudukSignersModal';
      modal.className = 'kw-modal';
      modal.innerHTML = `
        <div class="kw-shell" style="width:min(980px,100%)">
          <div class="kw-head">
            <div><h2>5. ИМЗО ЧЕКУВЧИЛАР</h2><p>Workspace учун умумий электрон имзо реестри.</p></div>
            <button id="kudukSignersClose" class="btn" type="button">✕</button>
          </div>
          <div class="kw-body">
            <div class="kw-actions" style="justify-content:space-between;margin-bottom:12px">
              <div id="kudukSignersStatus" class="kw-status sync">Юкланмоқда...</div>
              <button id="kudukSignersRefresh" class="btn" type="button">↻ Янгилаш</button>
            </div>
            <div class="kw-card workspace-admin-only">
              <div class="kw-add-grid">
                <input id="kudukSignerPosition" placeholder="Лавозим">
                <input id="kudukSignerName" placeholder="Ф.И.О.">
                <input id="kudukSignerEmail" type="email" placeholder="Gmail">
                <input id="kudukSignerFile" type="file" accept="image/png">
              </div>
              <div class="kw-actions" style="justify-content:flex-end;margin-top:10px">
                <button id="kudukSignerAdd" class="btn green" type="button">+ Қўшиш</button>
              </div>
              <div id="kudukSignerAddStatus" class="kw-status"></div>
            </div>
            <div class="tablewrap"><table class="kw-signers-table"><thead><tr><th>№</th><th>Лавозим</th><th>Ф.И.О.</th><th>Gmail</th><th>Ҳолат</th></tr></thead><tbody id="kudukSignerRows"></tbody></table></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      $('kudukSignersClose')?.addEventListener('click', () => modal.classList.remove('show'));
      $('kudukSignersRefresh')?.addEventListener('click', () => void loadSigners());
      $('kudukSignerAdd')?.addEventListener('click', () => void addSigner());
      modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
    }

    if (!$('kudukFinalModal')) {
      const modal = document.createElement('div');
      modal.id = 'kudukFinalModal';
      modal.className = 'kw-modal';
      modal.innerHTML = `
        <div class="kw-shell" style="width:min(760px,100%)">
          <div class="kw-head">
            <div><h2>6. ЯКУНИЙ ҲУЖЖАТЛАР</h2><p>1. ЖУРНАЛ УЧЕТА учун якуний ҳужжатлар сақланадиган Google Drive папкаси.</p></div>
            <button id="kudukFinalClose" class="btn" type="button">✕</button>
          </div>
          <div class="kw-body">
            <div class="kw-card">
              <label>Google Drive папка URL ёки ID
                <input id="kudukFinalFolder" placeholder="https://drive.google.com/drive/folders/... ёки folder ID">
              </label>
              <div class="kw-actions" style="justify-content:flex-end;margin-top:12px">
                <button id="kudukFinalSave" class="btn primary workspace-admin-only" type="button">Сақлаш</button>
                <button id="kudukFinalTest" class="btn workspace-admin-only" type="button">Текшириш</button>
                <button id="kudukFinalOpen" class="btn" type="button">Drive</button>
              </div>
              <div id="kudukFinalStatus" class="kw-status sync" style="margin-top:10px">Папка ҳолати текширилмаган.</div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      $('kudukFinalClose')?.addEventListener('click', () => modal.classList.remove('show'));
      $('kudukFinalSave')?.addEventListener('click', () => void saveFinalFolder());
      $('kudukFinalTest')?.addEventListener('click', () => void testFinalFolder());
      $('kudukFinalOpen')?.addEventListener('click', openFinalFolder);
      modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
    }
  }

  function parseDate(value) {
    const raw = clean(value);
    if (!raw) return null;
    let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return { year: Number(m[1]), month: Number(m[2]) };
    m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return { year: Number(m[3]), month: Number(m[2]) };
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
    return null;
  }

  function allJournalRows() {
    const state = window.KudukJournalWorkspace?.getState?.() || {};
    const sheets = state.sheets || {};
    const out = [];
    Object.entries(sheets).forEach(([sheet, rows]) => {
      (Array.isArray(rows) ? rows : []).forEach((row) => out.push({ ...row, _sheet: sheet }));
    });
    return out;
  }

  function reportGroups() {
    const map = new Map();
    allJournalRows().forEach((row) => {
      const p = parseDate(row.date);
      if (!p || p.year < 2026 || p.year > 2028 || p.month < 1 || p.month > 12) return;
      const key = p.year + '-' + String(p.month).padStart(2, '0');
      if (!map.has(key)) map.set(key, { year:p.year, month:p.month, rows:[] });
      map.get(key).rows.push(row);
    });
    return [...map.values()].sort((a,b) => b.year-a.year || b.month-a.month);
  }

  function renderReportFolders() {
    const host = $('kudukReportFolders');
    const groups = reportGroups();
    if (!host) return;
    if (!groups.length) {
      host.innerHTML = '<div class="kw-empty">2026–2028 даври бўйича ҳисобот маълумоти топилмади.</div>';
      $('kudukReportPreview').innerHTML = '<div class="kw-empty">ЖУРНАЛ УЧЕТА маълумотларини текширинг.</div>';
      return;
    }
    let html = '', currentYear = null;
    groups.forEach((group) => {
      if (group.year !== currentYear) {
        currentYear = group.year;
        html += '<div class="kw-year">' + currentYear + '</div>';
      }
      html += '<button class="kw-folder" type="button" data-year="' + group.year + '" data-month="' + group.month + '"><span>📁 ' + esc(MONTHS[group.month]) + '</span><b>' + group.rows.length + '</b></button>';
    });
    host.innerHTML = html;
    host.querySelectorAll('.kw-folder').forEach((btn) => btn.addEventListener('click', () => {
      host.querySelectorAll('.kw-folder').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      renderReportPreview(Number(btn.dataset.year), Number(btn.dataset.month));
    }));
    host.querySelector('.kw-folder')?.click();
  }

  function renderReportPreview(year, month) {
    const group = reportGroups().find((x) => x.year === year && x.month === month);
    const host = $('kudukReportPreview');
    if (!host) return;
    const rows = group?.rows || [];
    if (!rows.length) { host.innerHTML = '<div class="kw-empty">Маълумот йўқ.</div>'; return; }
    host.innerHTML = `
      <div style="margin-bottom:12px"><b>${esc(MONTHS[month])} ${year}</b> · ${rows.length} та ёзув</div>
      <div class="kw-tablewrap"><table class="kw-table"><thead><tr>
        <th>Дата</th><th>Поз номер</th><th>Наименование СИ</th><th>Тип, марка</th><th>Заводской номер</th><th>Место установки</th><th>Журнал/варақ</th>
      </tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.pos)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.serial)}</td><td>${esc(r.location)}</td><td>${esc(r._sheet)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function openReports() {
    injectUi();
    $('kudukReportsModal')?.classList.add('show');
    renderReportFolders();
  }

  async function loadSigners() {
    const status = $('kudukSignersStatus');
    const body = $('kudukSignerRows');
    if (status) { status.textContent = 'Имзо чекувчилар юкланмоқда...'; status.className = 'kw-status sync'; }
    try {
      const wid = workspaceId();
      if (!wid) throw new Error('Workspace танланмаган');
      const data = await api('/api/workspaces/' + encodeURIComponent(wid) + '/signers?includeInactive=true');
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (body) body.innerHTML = rows.length ? rows.map((r,i) => `<tr><td>${i+1}</td><td>${esc(r.position)}</td><td>${esc(r.fullName || r.fio)}</td><td>${esc(r.email || r.gmail)}</td><td>${esc(r.status || 'active')}</td></tr>`).join('') : '<tr><td colspan="5" class="kw-empty">Имзо чекувчилар топилмади.</td></tr>';
      if (status) { status.textContent = rows.length + ' та имзо чекувчи'; status.className = 'kw-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'kw-status bad'; }
      if (body) body.innerHTML = '<tr><td colspan="5" class="kw-empty">Юклаш хатоси.</td></tr>';
    }
  }

  async function addSigner() {
    const wid = workspaceId();
    const status = $('kudukSignerAddStatus');
    const position = clean($('kudukSignerPosition')?.value);
    const fullName = clean($('kudukSignerName')?.value);
    const email = clean($('kudukSignerEmail')?.value);
    const file = $('kudukSignerFile')?.files?.[0];
    if (!wid || !position || !fullName || !email || !file) {
      if (status) { status.textContent = 'Барча майдонларни тўлдиринг ва PNG имзо танланг.'; status.className = 'kw-status bad'; }
      return;
    }
    if (file.type !== 'image/png' || file.size > 2 * 1024 * 1024) {
      if (status) { status.textContent = 'Фақат 2 MB гача PNG қабул қилинади.'; status.className = 'kw-status bad'; }
      return;
    }
    try {
      if (status) { status.textContent = 'Имзо сақланмоқда...'; status.className = 'kw-status sync'; }
      const form = new FormData();
      form.append('signature', file);
      form.append('position', position);
      form.append('fullName', fullName);
      const upload = await api('/api/workspaces/' + encodeURIComponent(wid) + '/signers/signature', { method:'POST', body:form });
      await api('/api/workspaces/' + encodeURIComponent(wid) + '/signers', {
        method:'POST',
        body:JSON.stringify({ position, fullName, email, signatureFileId: upload.fileId })
      });
      ['kudukSignerPosition','kudukSignerName','kudukSignerEmail'].forEach((id) => { if ($(id)) $(id).value=''; });
      if ($('kudukSignerFile')) $('kudukSignerFile').value='';
      if (status) { status.textContent = '✅ Имзо чекувчи қўшилди.'; status.className = 'kw-status ok'; }
      await loadSigners();
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'kw-status bad'; }
    }
  }

  function openSigners() {
    injectUi();
    $('kudukSignersModal')?.classList.add('show');
    void loadSigners();
  }

  async function loadFinalFolder() {
    const input = $('kudukFinalFolder');
    const status = $('kudukFinalStatus');
    try {
      const wid = workspaceId();
      if (!wid) throw new Error('Workspace танланмаган');
      const data = await api('/api/workspaces/' + encodeURIComponent(wid));
      const folderId = clean(data.workspace?.finalDocumentsFolderId || data.finalDocumentsFolderId);
      if (input) input.value = folderId;
      if (status) { status.textContent = folderId ? 'Drive папка созланган.' : 'Drive папка созланмаган.'; status.className = 'kw-status ' + (folderId ? 'sync' : 'bad'); }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'kw-status bad'; }
    }
  }

  async function saveFinalFolder() {
    const wid = workspaceId();
    const value = clean($('kudukFinalFolder')?.value);
    const status = $('kudukFinalStatus');
    if (!wid || !value) return;
    try {
      if (status) { status.textContent = 'Drive папка сақланмоқда...'; status.className = 'kw-status sync'; }
      const data = await api('/api/workspaces/' + encodeURIComponent(wid) + '/documents/final-folder', {
        method:'PUT',
        body:JSON.stringify({ finalDocumentsFolderUrl:value })
      });
      const folderId = clean(data.finalDocumentsFolderId || data.workspace?.finalDocumentsFolderId || value);
      if ($('kudukFinalFolder')) $('kudukFinalFolder').value = folderId;
      if (status) { status.textContent = '✅ Якуний ҳужжатлар папкаси сақланди.'; status.className = 'kw-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'kw-status bad'; }
    }
  }

  async function testFinalFolder() {
    const wid = workspaceId();
    const status = $('kudukFinalStatus');
    if (!wid) return;
    try {
      if (status) { status.textContent = 'Drive папка текширилмоқда...'; status.className = 'kw-status sync'; }
      await api('/api/workspaces/' + encodeURIComponent(wid) + '/documents/final-folder/test', { method:'POST', body:'{}' });
      if (status) { status.textContent = '✅ Drive папка ёзиш учун тайёр.'; status.className = 'kw-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'kw-status bad'; }
    }
  }

  function openFinalFolder() {
    const raw = clean($('kudukFinalFolder')?.value);
    if (!raw) return;
    const match = raw.match(/folders\/([A-Za-z0-9_-]+)/);
    const folderId = match ? match[1] : raw;
    window.open('https://drive.google.com/drive/folders/' + encodeURIComponent(folderId), '_blank', 'noopener,noreferrer');
  }

  function openFinalDocuments() {
    injectUi();
    $('kudukFinalModal')?.classList.add('show');
    void loadFinalFolder();
  }

  function init() {
    injectStyle();
    injectUi();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  window.KudukWorkflow = { openReports, openSigners, openFinalDocuments, loadSigners, renderReportFolders };
})();
