(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const MODULE_SHEET_KEY = 'faults_sheet_name';
  const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const uiState = { analysisYear: 0, analysisMonth: 0, analysisRows: [], reports: [], signers: [], documentDraft: null, busy: false };

  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function parentStorage(store, key) {
    try { return parent?.[store]?.getItem(key) || ''; } catch (_) { return ''; }
  }

  function mainState() {
    return window.FaultsJournalWorkspace?.state || {};
  }

  function workspaceId() {
    return clean(
      mainState().workspaceId
      || localStorage.getItem(WORKSPACE_ID_KEY)
      || parentStorage('localStorage', WORKSPACE_ID_KEY),
    );
  }

  function currentWorkspace() {
    return mainState().workspace || null;
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
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.accessToken) throw new Error(data.error || 'Workspace sessiyasi yangilanmadi');
    sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken);
    try { parent.sessionStorage.setItem(WORKSPACE_TOKEN_KEY, data.accessToken); } catch (_) {}
    return data.accessToken;
  }

  async function api(path, options = {}, retry = true) {
    const id = workspaceId();
    if (!id) throw new Error('Workspace aniqlanmadi.');
    const headers = new Headers(options.headers || {});
    const token = authToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-workspace-id', id);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && retry) {
      await refreshSession();
      return api(path, options, false);
    }
    if (!response.ok || data.error) {
      throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
        code: data.code || '',
        status: response.status,
        data,
      });
    }
    return data;
  }

  function sheetName() {
    return clean(mainState().sheetName || currentWorkspace()?.moduleSettings?.[MODULE_SHEET_KEY] || currentWorkspace()?.moduleSettings?.acts_sheet_name);
  }

  function selectedPeriod() {
    const state = mainState();
    return { year: Number(state.periodYear), month: Number(state.periodMonth) };
  }

  function periodLabel(year, month) {
    return `${MONTHS[Number(month)] || month} ${Number(year)}`;
  }

  function parseJson(value, fallback = {}) {
    try { return JSON.parse(String(value || '')) || fallback; } catch (_) { return fallback; }
  }

  function injectStyle() {
    if ($('faultsWorkflowStyle')) return;
    const style = document.createElement('style');
    style.id = 'faultsWorkflowStyle';
    style.textContent = `
      .faults-wf-modal{position:fixed;inset:0;z-index:150;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.78);font-family:Arial,sans-serif;color:#eaf7ff}
      .faults-wf-modal.show{display:flex}.faults-wf-shell{width:min(1180px,100%);max-height:94vh;display:flex;flex-direction:column;overflow:hidden;background:#071427;border:1px solid rgba(34,211,238,.32);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
      .faults-wf-shell.small{width:min(760px,100%)}.faults-wf-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid rgba(255,255,255,.09)}
      .faults-wf-head h2{margin:0;font-size:20px}.faults-wf-head-actions,.faults-wf-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.faults-wf-body{padding:16px;overflow:auto;min-height:0}
      .faults-wf-period{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.faults-wf-period select,.faults-wf-input{background:#061120;color:#eaf8ff;border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:8px 10px}
      .faults-wf-status{font-size:12px;color:#cdeeff;line-height:1.5}.faults-wf-status.ok{color:#86efac}.faults-wf-status.bad{color:#fca5a5}.faults-wf-status.sync{color:#fde68a}
      .faults-wf-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.faults-wf-kpi{padding:12px;border:1px solid rgba(34,211,238,.22);border-radius:13px;background:rgba(2,15,28,.7)}
      .faults-wf-kpi small{display:block;color:#9fb7c7;font-size:10px}.faults-wf-kpi b{display:block;margin-top:5px;font-size:20px}
      .faults-wf-tablewrap{overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:13px}.faults-wf-table{width:100%;min-width:900px;border-collapse:collapse;background:rgba(1,12,24,.55)}
      .faults-wf-table th,.faults-wf-table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.09);font-size:11px;text-align:left;vertical-align:top}.faults-wf-table th{position:sticky;top:0;background:#0a3848;color:#dffbff}
      .faults-wf-empty{padding:22px;text-align:center;color:#9fb7c7}.faults-reports-grid{display:grid;grid-template-columns:270px 1fr;min-height:560px}.faults-report-folders{overflow:auto;border-right:1px solid rgba(255,255,255,.09);padding:12px}
      .faults-report-folder{display:block;width:100%;margin-bottom:7px;padding:10px;border:1px solid rgba(34,211,238,.22);border-radius:10px;background:rgba(4,22,39,.8);color:#eaf7ff;text-align:left;cursor:pointer}.faults-report-folder.active{border-color:#22d3ee;background:rgba(34,211,238,.11)}
      .faults-report-preview{overflow:auto;padding:14px}.faults-wf-card{padding:13px;border:1px solid rgba(34,211,238,.22);border-radius:13px;background:rgba(2,15,28,.7);margin-bottom:12px}
      .faults-wf-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.faults-wf-form label{display:grid;gap:5px;font-size:11px;color:#b9d6e4}.faults-wf-form input{width:100%}
      .faults-signer-preview{display:flex;align-items:center;gap:8px}.faults-signer-preview img{width:92px;height:42px;object-fit:contain;background:#fff;border-radius:5px}
      .faults-final-link{display:inline-block;margin-top:7px;color:#67e8f9;font-weight:800;text-decoration:none}
      .faults-document-shell{width:min(1540px,100%);height:min(96vh,1040px)}
      .faults-document-body{padding:14px;overflow:auto;background:#dbe4ea}
      .faults-document-paper{width:297mm;min-height:210mm;margin:0 auto;background:#fff;color:#111;padding:13.79mm 10.94mm 8.10mm 4.94mm;box-shadow:0 8px 30px rgba(0,0,0,.24);font-family:"Times New Roman",Times,serif;box-sizing:border-box}
      .faults-document-appendix{width:76mm;margin-left:auto;text-align:center;font-size:12pt;line-height:1.12}
      .faults-document-form{margin-top:10mm;border-bottom:.3mm solid #000;text-align:center;font-size:14pt;font-weight:700;line-height:1.1;padding-bottom:.3mm}
      .faults-document-title{width:176mm;margin:6mm auto 0;text-align:center;font-size:14pt;font-weight:700;line-height:1.15}
      .faults-document-year{text-align:center;font-size:12pt;margin:1.5mm 0 4.2mm}
      .faults-document-year-line{display:inline-block;width:11mm;border-bottom:.3mm solid #000;transform:translateY(-1mm)}
      .faults-document-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}
      .faults-document-table th,.faults-document-table td{border:.25mm solid #000;padding:.7mm 1mm;vertical-align:middle;word-break:normal;overflow-wrap:anywhere;font-weight:400}
      .faults-document-table th{height:12.17mm;text-align:center;line-height:1.05}
      .faults-document-table tbody td{height:5.96mm;line-height:1.05}
      .faults-document-table .pre{white-space:pre-wrap}.faults-document-signer{text-align:center}
      .faults-document-signer img{max-width:28mm;max-height:5mm;object-fit:contain;display:block;margin:auto}
      @media(max-width:820px){.faults-wf-kpis{grid-template-columns:repeat(2,1fr)}.faults-reports-grid{grid-template-columns:1fr}.faults-report-folders{max-height:220px;border-right:0;border-bottom:1px solid rgba(255,255,255,.09)}.faults-wf-form{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if ($('faultsMonthlyModal')) return;
    const host = document.createElement('div');
    host.innerHTML = `
      <div id="faultsMonthlyModal" class="faults-wf-modal"><div class="faults-wf-shell">
        <div class="faults-wf-head"><h2>1. Ойлик анализ</h2><div class="faults-wf-head-actions"><button id="faultsMonthlyRefresh" class="btn" type="button">↻ Янгилаш</button><button id="faultsMonthlyClose" class="btn" type="button">✕</button></div></div>
        <div class="faults-wf-body">
          <div class="faults-wf-period"><button id="faultsAnalysisPrev" class="btn" type="button">←</button><select id="faultsAnalysisMonth"></select><select id="faultsAnalysisYear"></select><button id="faultsAnalysisNext" class="btn" type="button">→</button><span id="faultsMonthlyStatus" class="faults-wf-status sync">Davr tanlanmoqda...</span></div>
          <div class="faults-wf-kpis"><div class="faults-wf-kpi"><small>АКТ yozuvlari</small><b id="faultsKpiTotal">0</b></div><div class="faults-wf-kpi"><small>Yakunlangan ACT</small><b id="faultsKpiCompleted">0</b></div><div class="faults-wf-kpi"><small>Nosozliklar</small><b id="faultsKpiFaults">0</b></div><div class="faults-wf-kpi"><small>ASOSIY VAROQ</small><b id="faultsKpiSheet" style="font-size:13px">—</b></div></div>
          <div class="faults-wf-tablewrap"><table class="faults-wf-table"><thead><tr><th>№</th><th>Сана</th><th>Ускуна</th><th>Поз.</th><th>Завод №</th><th>Ўлчаш чегараси</th><th>Жой</th><th>Ҳолат</th></tr></thead><tbody id="faultsMonthlyRows"></tbody></table></div>
          <div class="faults-wf-actions" style="justify-content:flex-end;margin-top:12px"><button id="faultsOpenMonthlyBtn" class="btn primary" type="button">Хужат яратиш</button></div>
        </div>
      </div></div>

      <div id="faultsReportsModal" class="faults-wf-modal"><div class="faults-wf-shell">
        <div class="faults-wf-head"><h2>3. Хисоботлар</h2><div class="faults-wf-head-actions"><button id="faultsReportsRefresh" class="btn" type="button">↻ Янгилаш</button><button id="faultsReportsClose" class="btn" type="button">✕</button></div></div>
        <div class="faults-reports-grid"><aside id="faultsReportFolders" class="faults-report-folders"></aside><main id="faultsReportPreview" class="faults-report-preview"><div class="faults-wf-empty">Oy hisobotini tanlang.</div></main></div>
      </div></div>

      <div id="faultsSignersModal" class="faults-wf-modal"><div class="faults-wf-shell">
        <div class="faults-wf-head"><h2>5. ИМЗО ЧЕКУВЧИЛАР</h2><div class="faults-wf-head-actions"><button id="faultsSignerAddToggle" class="btn" type="button">+ Қўшиш</button><button id="faultsSignersRefresh" class="btn" type="button">↻ Янгилаш</button><button id="faultsSignersClose" class="btn" type="button">✕</button></div></div>
        <div class="faults-wf-body">
          <div id="faultsSignerAddCard" class="faults-wf-card" hidden><form id="faultsSignerAddForm"><div class="faults-wf-form"><label>Лавозим<input id="faultsSignerPosition" class="faults-wf-input" required></label><label>F.I.O.<input id="faultsSignerName" class="faults-wf-input" required></label><label>Email<input id="faultsSignerEmail" class="faults-wf-input" type="email" required></label><label>PNG imzo<input id="faultsSignerFile" class="faults-wf-input" type="file" accept="image/png,.png" required></label></div><div class="faults-wf-actions" style="justify-content:flex-end;margin-top:10px"><button class="btn primary" type="submit">Сақлаш</button></div><div id="faultsSignerAddStatus" class="faults-wf-status"></div></form></div>
          <div id="faultsSignersStatus" class="faults-wf-status">Ro‘yxat yuklanmagan.</div><div class="faults-wf-tablewrap" style="margin-top:10px"><table class="faults-wf-table"><thead><tr><th>№</th><th>Lavozim</th><th>F.I.O.</th><th>Email</th><th>Holat</th><th>Imzo</th></tr></thead><tbody id="faultsSignerRows"></tbody></table></div>
        </div>
      </div></div>

      <div id="faultsFinalModal" class="faults-wf-modal"><div class="faults-wf-shell small">
        <div class="faults-wf-head"><h2>6. ЯКУНИЙ ҲУЖЖАТЛАР</h2><button id="faultsFinalClose" class="btn" type="button">✕</button></div>
        <div class="faults-wf-body"><div class="faults-wf-card"><label style="display:grid;gap:6px;font-size:11px;color:#b9d6e4">Google Drive papka URL yoki ID<input id="faultsFinalFolder" class="faults-wf-input" placeholder="https://drive.google.com/drive/folders/..."></label><div class="faults-wf-actions" style="justify-content:flex-end;margin-top:10px"><button id="faultsFinalSaveFolder" class="btn primary workspace-admin-only" type="button">Сақлаш</button><button id="faultsFinalTestFolder" class="btn workspace-admin-only" type="button">Текшириш</button><button id="faultsFinalOpenDrive" class="btn" type="button">Drive</button><button id="faultsFinalExport" class="btn primary workspace-operator-only" type="button">Joriy oy PDF</button></div><div id="faultsFinalStatus" class="faults-wf-status sync" style="margin-top:9px">Papka holati tekshirilmagan.</div><div id="faultsFinalLink"></div></div><div class="faults-wf-status">Yakuniy PDF Drive ichidagi <b>ХУЖАТЛАР</b> papkasiga A4 landscape formatida saqlanadi.</div></div>
      </div></div>

      <div id="faultsSettingsModal" class="faults-wf-modal"><div class="faults-wf-shell small">
        <div class="faults-wf-head"><h2>⚙ Созламалар</h2><button id="faultsSettingsClose" class="btn" type="button">✕</button></div>
        <div class="faults-wf-body"><div class="faults-wf-card"><label style="display:grid;gap:6px;font-size:11px;color:#b9d6e4">ASOSIY VAROQ<input id="faultsSettingsSheet" class="faults-wf-input" list="faultsSettingsSheets" placeholder="Masalan: АКТ хисоботлари"></label><datalist id="faultsSettingsSheets"></datalist><div class="faults-wf-actions" style="justify-content:flex-end;margin-top:10px"><button id="faultsSettingsRefresh" class="btn" type="button">↻ Varaq ro‘yxati</button><button id="faultsSettingsSave" class="btn primary workspace-admin-only" type="button">Сақлаш</button></div><div id="faultsSettingsStatus" class="faults-wf-status sync" style="margin-top:9px">Workspace manbasi ishlatiladi.</div></div></div>
      </div></div>

      <div id="faultsDocumentModal" class="faults-wf-modal"><div class="faults-wf-shell faults-document-shell">
        <div class="faults-wf-head"><h2>ЖУРНАЛ НЕИСПРАВНОСТЕЙ — Хужат</h2><div class="faults-wf-head-actions"><span id="faultsDocumentStatus" class="faults-wf-status"></span><button id="faultsDocumentSave" class="btn primary workspace-operator-only" type="button">💾 Сақлаш</button><button id="faultsDocumentClose" class="btn" type="button">✕</button></div></div>
        <div class="faults-document-body"><div id="faultsDocumentPaper" class="faults-document-paper"><div class="faults-wf-empty">Хужат яратилмаган.</div></div></div>
      </div></div>`;
    while (host.firstChild) document.body.appendChild(host.firstChild);

    const closers = [
      ['faultsMonthlyClose', 'faultsMonthlyModal'], ['faultsReportsClose', 'faultsReportsModal'],
      ['faultsSignersClose', 'faultsSignersModal'], ['faultsFinalClose', 'faultsFinalModal'],
      ['faultsSettingsClose', 'faultsSettingsModal'], ['faultsDocumentClose', 'faultsDocumentModal'],
    ];
    closers.forEach(([buttonId, modalId]) => $(buttonId)?.addEventListener('click', () => $(modalId)?.classList.remove('show')));
    document.querySelectorAll('.faults-wf-modal').forEach((modal) => modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('show');
    }));

    $('faultsMonthlyRefresh')?.addEventListener('click', () => void loadMonthlyAnalysis());
    $('faultsAnalysisPrev')?.addEventListener('click', () => void navigateAnalysis(-1));
    $('faultsAnalysisNext')?.addEventListener('click', () => void navigateAnalysis(1));
    $('faultsAnalysisMonth')?.addEventListener('change', () => void readAndLoadAnalysis());
    $('faultsAnalysisYear')?.addEventListener('change', () => void readAndLoadAnalysis());
    $('faultsOpenMonthlyBtn')?.addEventListener('click', () => void createMonthlyDocument());
    $('faultsReportsRefresh')?.addEventListener('click', () => void loadReports());
    $('faultsSignersRefresh')?.addEventListener('click', () => void loadSigners());
    $('faultsSignerAddToggle')?.addEventListener('click', () => {
      const card = $('faultsSignerAddCard');
      if (card) card.hidden = !card.hidden;
    });
    $('faultsSignerAddForm')?.addEventListener('submit', (event) => void saveSigner(event));
    $('faultsFinalSaveFolder')?.addEventListener('click', () => void saveFinalFolder());
    $('faultsFinalTestFolder')?.addEventListener('click', () => void testFinalFolder());
    $('faultsFinalOpenDrive')?.addEventListener('click', openFinalDrive);
    $('faultsFinalExport')?.addEventListener('click', () => void finalizeCurrentReport());
    $('faultsSettingsRefresh')?.addEventListener('click', () => void loadSheetNames());
    $('faultsSettingsSave')?.addEventListener('click', () => void saveSettings());
    $('faultsDocumentSave')?.addEventListener('click', () => void saveDocumentDraft());
  }

  function fillAnalysisSelectors() {
    const selected = selectedPeriod();
    if (!uiState.analysisYear) uiState.analysisYear = selected.year || new Date().getFullYear();
    if (!uiState.analysisMonth) uiState.analysisMonth = selected.month || new Date().getMonth() + 1;
    const month = $('faultsAnalysisMonth');
    const year = $('faultsAnalysisYear');
    if (!month || !year) return;
    month.innerHTML = MONTHS.slice(1).map((name, index) => `<option value="${index + 1}">${esc(name)}</option>`).join('');
    const current = new Date().getFullYear();
    const start = Math.min(2024, uiState.analysisYear);
    const end = Math.max(current + 5, uiState.analysisYear);
    year.innerHTML = Array.from({ length: end - start + 1 }, (_, index) => start + index).map((value) => `<option value="${value}">${value}</option>`).join('');
    month.value = String(uiState.analysisMonth);
    year.value = String(uiState.analysisYear);
  }

  function renderMonthlyRows() {
    const body = $('faultsMonthlyRows');
    if (!body) return;
    const rows = uiState.analysisRows || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="faults-wf-empty">Tanlangan oy uchun АКТ yozuvlari topilmadi.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.date)}</td><td>${esc(row.deviceName)}</td><td>${esc(row.positionNo)}</td><td>${esc(row.serialNo)}</td><td>${esc(row.measureRange)}</td><td>${esc(row.place)}</td><td>${esc(row.isCompleted ? 'Хужат якунланди' : 'Хужат яратиш')}</td></tr>`).join('');
  }

  async function loadMonthlyAnalysis() {
    const status = $('faultsMonthlyStatus');
    const sourceSheet = sheetName();
    if (!sourceSheet) {
      if (status) { status.textContent = 'ASOSIY VAROQ sozlanmagan.'; status.className = 'faults-wf-status bad'; }
      return;
    }
    if (status) { status.textContent = `${periodLabel(uiState.analysisYear, uiState.analysisMonth)} · yuklanmoqda...`; status.className = 'faults-wf-status sync'; }
    try {
      const data = await api('/api/acts/monthly-analysis', {
        method: 'POST',
        body: JSON.stringify({ sheetName: sourceSheet, year: uiState.analysisYear, month: uiState.analysisMonth }),
      });
      uiState.analysisRows = Array.isArray(data.rows) ? data.rows : [];
      const completed = uiState.analysisRows.filter((row) => row.isCompleted || clean(row.actNo)).length;
      if ($('faultsKpiTotal')) $('faultsKpiTotal').textContent = String(uiState.analysisRows.length);
      if ($('faultsKpiCompleted')) $('faultsKpiCompleted').textContent = String(completed);
      if ($('faultsKpiFaults')) $('faultsKpiFaults').textContent = String(uiState.analysisRows.length);
      if ($('faultsKpiSheet')) $('faultsKpiSheet').textContent = sourceSheet;
      renderMonthlyRows();
      if (status) { status.textContent = `${periodLabel(uiState.analysisYear, uiState.analysisMonth)} · ${uiState.analysisRows.length} ta АКТ`; status.className = 'faults-wf-status ok'; }
    } catch (error) {
      uiState.analysisRows = [];
      renderMonthlyRows();
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
    }
  }

  async function readAndLoadAnalysis() {
    uiState.analysisYear = Number($('faultsAnalysisYear')?.value) || uiState.analysisYear;
    uiState.analysisMonth = Number($('faultsAnalysisMonth')?.value) || uiState.analysisMonth;
    await loadMonthlyAnalysis();
  }

  async function navigateAnalysis(delta) {
    const absolute = uiState.analysisYear * 12 + (uiState.analysisMonth - 1) + Number(delta || 0);
    uiState.analysisYear = Math.floor(absolute / 12);
    uiState.analysisMonth = ((absolute % 12) + 12) % 12 + 1;
    fillAnalysisSelectors();
    await loadMonthlyAnalysis();
  }

  function documentFailureText(row = {}) {
    return [
      clean(row.serialNo) ? `Завод рақами: ${clean(row.serialNo)}` : '',
      clean(row.measureRange) ? `Ўлчаш чегараси: ${clean(row.measureRange)}` : '',
      clean(row.reasonText || row.failureText) ? `Рад этиш сабаби: ${clean(row.reasonText || row.failureText)}` : '',
    ].filter(Boolean).join('\n');
  }

  function documentEquipmentText(row = {}) {
    return [
      clean(row.deviceName || row.device),
      clean(row.place),
      clean(row.positionNo) ? `поз. №${clean(row.positionNo)}` : '',
    ].filter(Boolean).join(', ');
  }

  function buildDocumentDraftRows() {
    const state = mainState();
    return (Array.isArray(state.reports) ? state.reports : []).map(normalizeCurrentRow);
  }

  function renderDocumentDraft() {
    const host = $('faultsDocumentPaper');
    const draft = uiState.documentDraft;
    if (!host || !draft) return;
    const signer = draft.signer || {};
    const sourceRows = Array.isArray(draft.rows) ? draft.rows : [];
    const rows = sourceRows.slice();
    while (rows.length < 15) rows.push({});
    const body = rows.map((row, index) => {
      const hasData = Boolean(
        clean(row.sourceKey) || clean(row.actNo) || clean(row.date)
        || clean(row.deviceName) || clean(row.actionText) || clean(row.reasonText),
      );
      const signature = hasData && clean(signer.signatureUrl)
        ? `<img src="${esc(signer.signatureUrl)}" alt="${esc(signer.fio || 'Imzo')}">`
        : (hasData ? esc(signer.fio || '') : '');
      return `<tr>
        <td>${hasData ? esc(row.actNo) : ''}</td>
        <td>${hasData ? esc([row.date, row.time].filter(Boolean).join(' ')) : ''}</td>
        <td>${hasData ? esc(documentEquipmentText(row)) : ''}</td>
        <td class="pre">${hasData ? esc(documentFailureText(row)) : ''}</td>
        <td class="pre">${hasData ? esc(row.actionText) : ''}</td>
        <td>${hasData ? esc([row.actionDate, row.actionTime].filter(Boolean).join(' ')) : ''}</td>
        <td class="faults-document-signer">${signature}</td>
      </tr>`;
    }).join('');
    host.innerHTML = `
      <div class="faults-document-appendix"><b>Приложение № 3 к</b><br><b>Регламенту</b> проведения технического<br>обслуживания контрольно-<br>измерительных приборов, средств и<br>систем автоматизации<br>на объектах ИП ООО «SEG»</div>
      <div class="faults-document-form">ФОРМА</div>
      <div class="faults-document-title">Журнал учета отказов и неисправностей оборудования автоматики и<br>КИПиА ЦДНГ №… ТПП «,,,»</div>
      <div class="faults-document-year">на <span class="faults-document-year-line"></span> ${esc(draft.year)} г.</div>
      <table class="faults-document-table">
        <colgroup>
          <col style="width:6.17%"><col style="width:10.71%"><col style="width:9.56%"><col style="width:31.26%"><col style="width:21.52%"><col style="width:9.38%"><col style="width:11.42%">
        </colgroup>
        <thead><tr>
          <th>№<br>п/п</th>
          <th>Дата, время<br>возникновения<br>неисправности</th>
          <th>Наименование<br>оборудования</th>
          <th>Краткое описание неисправности</th>
          <th>Принятые меры по ликвидации<br>неисправности</th>
          <th>Дата<br>устранения<br>неисправности</th>
          <th>Подпись ответств.<br>за устранение<br>неисправности.</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  }

  async function createMonthlyDocument() {
    const button = $('faultsOpenMonthlyBtn');
    if (button) { button.disabled = true; button.textContent = '⏳ Яратилмоқда...'; }
    try {
      await window.FaultsJournalFrontend?.setPeriodAndReload?.(uiState.analysisYear, uiState.analysisMonth);
      const rows = buildDocumentDraftRows();
      if (!rows.length) throw new Error('Tanlangan oy uchun hujjat yaratishga ma’lumot topilmadi.');
      uiState.documentDraft = {
        year: uiState.analysisYear,
        month: uiState.analysisMonth,
        rows,
        signer: currentSignerSnapshot(),
        template: 'reglament-appendix-3-v1',
      };
      renderDocumentDraft();
      const documentStatus = $('faultsDocumentStatus');
      if (documentStatus) {
        documentStatus.textContent = `${periodLabel(uiState.analysisYear, uiState.analysisMonth)} · saqlanmagan`;
        documentStatus.className = 'faults-wf-status sync';
      }
      $('faultsMonthlyModal')?.classList.remove('show');
      $('faultsDocumentModal')?.classList.add('show');
    } catch (error) {
      const status = $('faultsMonthlyStatus');
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Хужат яратиш'; }
    }
  }

  function openMonthlyAnalysis() {
    fillAnalysisSelectors();
    $('faultsMonthlyModal')?.classList.add('show');
    void loadMonthlyAnalysis();
  }

  function normalizeCurrentRow(report = {}, index = 0) {
    const act = parseJson(report.a4Json, {});
    const row = $('faultsRows')?.querySelector?.(`tr[data-row="${index + 1}"]`);
    const actionText = clean(row?.querySelector?.('.faults-action-text')?.value ?? act.actionText ?? report.actionText);
    const resolution = clean(row?.querySelector?.('.faults-resolution-date')?.value);
    let actionDate = clean(act.actionDate || report.actionDate);
    let actionTime = clean(act.actionTime || report.actionTime);
    if (resolution) {
      const parts = resolution.split('T');
      actionDate = parts[0] || actionDate;
      actionTime = parts[1] || actionTime;
    }
    const workPlace = clean(act.workPlace || report.workPlace);
    const parsedPosition = workPlace.match(/поз\.?\s*№\s*([^,\s]+)/iu)?.[1] || '';
    const parts = workPlace.split(',').map((part) => part.trim());
    const serialPart = parts.find((part) => /завод рақами/i.test(part)) || '';
    const rangePart = parts.find((part) => /Ўлчаш чегараси/i.test(part)) || '';
    return {
      sourceKey: clean(report.sourceKey),
      actNo: clean(report.actNo),
      date: clean(report.date || act.date),
      time: clean(report.time || act.time),
      deviceName: clean(report.deviceName || report.device || act.deviceName || workPlace.split(',')[0]),
      place: clean(report.place || act.place),
      positionNo: clean(report.positionNo || act.positionNo || parsedPosition),
      serialNo: clean(report.serialNo || report.serial || act.serialNo || serialPart.replace(/завод рақами\s*/i, '')),
      measureRange: clean(report.measureRange || act.measureRange || rangePart.replace(/Ўлчаш чегараси\s*/i, '')),
      reasonText: clean(report.reasonText || act.reasonText),
      failureText: clean(report.failureText || act.failureText),
      actionText,
      actionDate,
      actionTime,
      status: clean(report.status),
    };
  }

  function currentSignerSnapshot() {
    const signer = mainState().responsibleSigner || {};
    return {
      id: clean(signer.id),
      fio: clean(signer.fio || signer.fullName),
      position: clean(signer.position),
      email: clean(signer.email || signer.gmail),
      signatureFileId: clean(signer.signatureFileId),
      signatureUrl: clean(signer.signatureUrl),
    };
  }

  async function saveDocumentDraft() {
    if (uiState.busy) return;
    const draft = uiState.documentDraft;
    const button = $('faultsDocumentSave');
    const status = $('faultsDocumentStatus');
    if (!draft || !Number.isInteger(Number(draft.year)) || !Number.isInteger(Number(draft.month))) {
      if (status) {
        status.textContent = 'Avval Хужат яратиш orqali blank yarating.';
        status.className = 'faults-wf-status bad';
      }
      return;
    }
    const rows = Array.isArray(draft.rows) ? draft.rows : [];
    if (!rows.length) {
      if (status) {
        status.textContent = 'Saqlanadigan hujjat qatorlari yo‘q.';
        status.className = 'faults-wf-status bad';
      }
      return;
    }

    uiState.busy = true;
    if (button) {
      button.disabled = true;
      button.textContent = '⏳ Сақланмоқда...';
    }
    if (status) {
      status.textContent = `${periodLabel(draft.year, draft.month)} · saqlanmoqda...`;
      status.className = 'faults-wf-status sync';
    }

    try {
      const data = await api(`/api/faults/reports/${draft.year}/${draft.month}`, {
        method: 'POST',
        body: JSON.stringify({
          sourceSheetName: sheetName(),
          rows,
          signer: draft.signer || currentSignerSnapshot(),
        }),
      });
      uiState.documentDraft = {
        ...draft,
        savedReportId: clean(data.report?.id),
        savedAt: clean(data.report?.updatedAt) || new Date().toISOString(),
      };
      await loadReports({ quiet: true });
      const pageStatus = $('faultsStatusSub');
      if (pageStatus) {
        pageStatus.textContent = `${periodLabel(draft.year, draft.month)} · 3. Хисоботлар га сақланди`;
      }
      if (status) {
        status.textContent = '✓ 3. Хисоботлар га сақланди';
        status.className = 'faults-wf-status ok';
      }
      if (button) button.textContent = '✓ Сақланди';
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.className = 'faults-wf-status bad';
      }
      if (button) button.textContent = '💾 Сақлаш';
    } finally {
      uiState.busy = false;
      if (button) {
        button.disabled = false;
        window.setTimeout(() => {
          if (button && button.textContent === '✓ Сақланди') button.textContent = '💾 Сақлаш';
        }, 1600);
      }
    }
  }

  async function saveCurrentReport() {
    if (uiState.busy) return;
    const state = mainState();
    const year = Number(state.periodYear);
    const month = Number(state.periodMonth);
    const rows = (Array.isArray(state.reports) ? state.reports : []).map(normalizeCurrentRow);
    if (!rows.length) {
      alert('Tanlangan oy uchun saqlanadigan nosozliklar ma’lumoti yo‘q.');
      return;
    }
    uiState.busy = true;
    const button = $('faultsSaveReportBtn');
    if (button) { button.disabled = true; button.textContent = '⏳ Сақланмоқда...'; }
    try {
      await api(`/api/faults/reports/${year}/${month}`, {
        method: 'POST',
        body: JSON.stringify({ sourceSheetName: sheetName(), rows, signer: currentSignerSnapshot() }),
      });
      const status = $('faultsStatusSub');
      if (status) status.textContent = `${periodLabel(year, month)} · 3. Хисоботлар га сақланди`;
      if (button) button.textContent = '✓ Сақланди';
      await loadReports({ quiet: true });
    } catch (error) {
      alert(error.message);
      if (button) button.textContent = '💾 Сақлаш';
    } finally {
      uiState.busy = false;
      if (button) {
        button.disabled = false;
        window.setTimeout(() => { if (button) button.textContent = '💾 Сақлаш'; }, 1200);
      }
    }
  }

  function renderReportFolders() {
    const host = $('faultsReportFolders');
    if (!host) return;
    if (!uiState.reports.length) {
      host.innerHTML = '<div class="faults-wf-empty">Hali hisobot saqlanmagan.</div>';
      return;
    }
    host.innerHTML = uiState.reports.map((report) => `<button class="faults-report-folder" type="button" data-fault-report="${report.year}-${report.month}"><b>${esc(report.label || periodLabel(report.year, report.month))}</b><br><small>${esc(report.rowCount)} ta qator · ${esc(report.status)}</small></button>`).join('');
    host.querySelectorAll('[data-fault-report]').forEach((button) => {
      button.addEventListener('click', () => {
        const [year, month] = button.dataset.faultReport.split('-').map(Number);
        void openReport(year, month, button);
      });
    });
  }

  async function loadReports({ quiet = false } = {}) {
    const host = $('faultsReportFolders');
    if (!quiet && host) host.innerHTML = '<div class="faults-wf-empty">Hisobotlar yuklanmoqda...</div>';
    try {
      const data = await api('/api/faults/reports');
      uiState.reports = Array.isArray(data.reports) ? data.reports : [];
      renderReportFolders();
      return uiState.reports;
    } catch (error) {
      if (host) host.innerHTML = `<div class="faults-wf-empty">${esc(error.message)}</div>`;
      return [];
    }
  }

  function reportRowsTable(report) {
    const rows = Array.isArray(report?.rows) ? report.rows : [];
    if (!rows.length) return '<div class="faults-wf-empty">Hisobot qatorlari yo‘q.</div>';
    return `<div class="faults-wf-tablewrap"><table class="faults-wf-table"><thead><tr><th>№</th><th>Sana</th><th>Uskuna</th><th>Nosozlik</th><th>Ko‘rilgan choralar</th><th>Bartaraf sana</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${esc(row.actNo || index + 1)}</td><td>${esc(row.date)}</td><td>${esc([row.deviceName, row.place, row.positionNo ? `poz. №${row.positionNo}` : ''].filter(Boolean).join(', '))}</td><td>${esc([row.serialNo ? `Zavod №: ${row.serialNo}` : '', row.measureRange ? `Chegara: ${row.measureRange}` : '', row.reasonText].filter(Boolean).join(' · '))}</td><td>${esc(row.actionText)}</td><td>${esc([row.actionDate, row.actionTime].filter(Boolean).join(' '))}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function openReport(year, month, button = null) {
    $('faultsReportFolders')?.querySelectorAll?.('.faults-report-folder').forEach((item) => item.classList.remove('active'));
    button?.classList.add('active');
    const preview = $('faultsReportPreview');
    if (preview) preview.innerHTML = '<div class="faults-wf-empty">Hisobot ochilmoqda...</div>';
    try {
      const data = await api(`/api/faults/reports/${year}/${month}`);
      const report = data.report;
      const finalUrl = clean(report.finalPdf?.url);
      const actions = report.status === 'draft'
        ? `<button class="btn" type="button" id="faultReportEditBtn">✏️ Tahrirlash</button><button class="btn" type="button" id="faultReportDeleteBtn">🗑️ O‘chirish</button>`
        : '<span class="faults-wf-status ok">✅ Yakunlangan</span>';
      if (preview) preview.innerHTML = `<div class="faults-wf-card"><h3 style="margin:0 0 6px">${esc(periodLabel(year, month))}</h3><div class="faults-wf-status">Holat: ${esc(report.status)} · ${esc(report.rows?.length || 0)} ta qator</div><div class="faults-wf-actions" style="margin-top:10px">${actions}</div>${finalUrl ? `<a class="faults-final-link" href="${esc(finalUrl)}" target="_blank" rel="noopener">✅ Yakuniy A4 PDF Drive'da</a>` : ''}</div>${reportRowsTable(report)}`;
      $('faultReportEditBtn')?.addEventListener('click', () => void editSavedReport(report));
      $('faultReportDeleteBtn')?.addEventListener('click', () => void deleteSavedReport(report));
    } catch (error) {
      if (preview) preview.innerHTML = `<div class="faults-wf-empty">${esc(error.message)}</div>`;
    }
  }

  async function editSavedReport(report) {
    await window.FaultsJournalFrontend?.setPeriodAndReload?.(report.year, report.month);
    const main = mainState();
    const savedByKey = new Map((report.rows || []).map((row) => [clean(row.sourceKey || row.actNo), row]));
    main.reports = (main.reports || []).map((row) => {
      const saved = savedByKey.get(clean(row.sourceKey || row.actNo));
      return saved ? { ...row, actionText: saved.actionText, actionDate: saved.actionDate, actionTime: saved.actionTime } : row;
    });
    window.FaultsJournalFrontend?.renderRows?.(main.reports);
    $('faultsReportsModal')?.classList.remove('show');
  }

  async function deleteSavedReport(report) {
    if (!confirm(`${periodLabel(report.year, report.month)} draft hisobotini o‘chirasizmi?`)) return;
    try {
      await api(`/api/faults/reports/${report.year}/${report.month}`, { method: 'DELETE' });
      await loadReports();
      if ($('faultsReportPreview')) $('faultsReportPreview').innerHTML = '<div class="faults-wf-empty">Hisobot o‘chirildi.</div>';
    } catch (error) {
      alert(error.message);
    }
  }

  function openReports() {
    $('faultsReportsModal')?.classList.add('show');
    void loadReports();
  }

  async function loadSigners() {
    const status = $('faultsSignersStatus');
    const body = $('faultsSignerRows');
    if (status) { status.textContent = 'Imzo chekuvchilar yuklanmoqda...'; status.className = 'faults-wf-status sync'; }
    try {
      const data = await api(`/api/workspaces/${encodeURIComponent(workspaceId())}/signers?includeInactive=true`);
      uiState.signers = Array.isArray(data.rows) ? data.rows : [];
      if (body) body.innerHTML = uiState.signers.length ? uiState.signers.map((row, index) => {
        const signatureFileId = clean(row.signatureFileId);
        const internalId = signatureFileId.match(/^db:([0-9a-f-]{36})$/i)?.[1] || '';
        const imageUrl = internalId ? `/api/workspaces/${encodeURIComponent(workspaceId())}/signers/signature/${encodeURIComponent(internalId)}` : clean(row.signatureUrl);
        return `<tr><td>${index + 1}</td><td>${esc(row.position)}</td><td>${esc(row.fullName || row.fio)}</td><td>${esc(row.email || row.gmail)}</td><td>${esc(row.status || 'active')}</td><td>${imageUrl ? `<button class="btn" type="button" data-signature-url="${esc(imageUrl)}">PNG</button>` : '—'}</td></tr>`;
      }).join('') : '<tr><td colspan="6" class="faults-wf-empty">Imzo chekuvchilar topilmadi.</td></tr>';
      body?.querySelectorAll?.('[data-signature-url]').forEach((button) => button.addEventListener('click', async () => {
        try {
          const response = await fetch(button.dataset.signatureUrl, { headers: { Authorization: `Bearer ${authToken()}` }, credentials: 'include' });
          if (!response.ok) throw new Error('Imzo ochilmadi');
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (error) { alert(error.message); }
      }));
      if (status) { status.textContent = `${uiState.signers.length} ta imzo chekuvchi`; status.className = 'faults-wf-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
      if (body) body.innerHTML = '<tr><td colspan="6" class="faults-wf-empty">Yuklash xatosi.</td></tr>';
    }
  }

  async function saveSigner(event) {
    event.preventDefault();
    const status = $('faultsSignerAddStatus');
    const position = clean($('faultsSignerPosition')?.value);
    const fullName = clean($('faultsSignerName')?.value);
    const email = clean($('faultsSignerEmail')?.value);
    const file = $('faultsSignerFile')?.files?.[0];
    if (!position || !fullName || !email || !file) return;
    if (file.type !== 'image/png' || file.size > 2 * 1024 * 1024) {
      if (status) { status.textContent = 'Faqat 2 MB gacha PNG qabul qilinadi.'; status.className = 'faults-wf-status bad'; }
      return;
    }
    try {
      if (status) { status.textContent = 'PNG saqlanmoqda...'; status.className = 'faults-wf-status sync'; }
      const form = new FormData();
      form.append('signature', file);
      form.append('position', position);
      form.append('fullName', fullName);
      const upload = await api(`/api/workspaces/${encodeURIComponent(workspaceId())}/signers/signature`, { method: 'POST', body: form });
      await api(`/api/workspaces/${encodeURIComponent(workspaceId())}/signers`, {
        method: 'POST',
        body: JSON.stringify({ position, fullName, email, signatureFileId: upload.fileId }),
      });
      $('faultsSignerAddForm')?.reset();
      if ($('faultsSignerAddCard')) $('faultsSignerAddCard').hidden = true;
      await loadSigners();
      await window.FaultsJournalWorkspace?.loadActReportNumbers?.(workspaceId(), currentWorkspace());
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
    }
  }

  function openSigners() {
    $('faultsSignersModal')?.classList.add('show');
    void loadSigners();
  }

  function syncFinalFolder() {
    const ws = currentWorkspace();
    const input = $('faultsFinalFolder');
    if (input) input.value = clean(ws?.finalDocumentsFolderId);
    const status = $('faultsFinalStatus');
    if (status) {
      status.textContent = clean(ws?.finalDocumentsFolderId) ? 'Drive papka sozlangan.' : 'Drive papka sozlanmagan.';
      status.className = `faults-wf-status ${clean(ws?.finalDocumentsFolderId) ? 'sync' : 'bad'}`;
    }
  }

  async function saveFinalFolder() {
    const value = clean($('faultsFinalFolder')?.value);
    const status = $('faultsFinalStatus');
    if (!value) return;
    try {
      if (status) { status.textContent = 'Drive papka saqlanmoqda...'; status.className = 'faults-wf-status sync'; }
      const data = await api(`/api/workspaces/${encodeURIComponent(workspaceId())}/documents/final-folder`, {
        method: 'PUT',
        body: JSON.stringify({ finalDocumentsFolderUrl: value }),
      });
      if (currentWorkspace()) currentWorkspace().finalDocumentsFolderId = clean(data.finalDocumentsFolderId || data.workspace?.finalDocumentsFolderId);
      syncFinalFolder();
      if (status) { status.textContent = '✅ Yakuniy hujjatlar papkasi saqlandi.'; status.className = 'faults-wf-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
    }
  }

  async function testFinalFolder() {
    const status = $('faultsFinalStatus');
    try {
      if (status) { status.textContent = 'Drive papka tekshirilmoqda...'; status.className = 'faults-wf-status sync'; }
      await api(`/api/workspaces/${encodeURIComponent(workspaceId())}/documents/final-folder/test`, { method: 'POST', body: '{}' });
      if (status) { status.textContent = '✅ Drive papka yozish uchun tayyor.'; status.className = 'faults-wf-status ok'; }
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
    }
  }

  function openFinalDrive() {
    const folderId = clean(currentWorkspace()?.finalDocumentsFolderId || $('faultsFinalFolder')?.value);
    if (!folderId) return;
    window.open(`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`, '_blank', 'noopener,noreferrer');
  }

  async function finalizeCurrentReport() {
    const { year, month } = selectedPeriod();
    const status = $('faultsFinalStatus');
    const linkHost = $('faultsFinalLink');
    try {
      if (status) { status.textContent = `${periodLabel(year, month)} PDF yaratilmoqda...`; status.className = 'faults-wf-status sync'; }
      const data = await api(`/api/faults/reports/${year}/${month}/finalize`, { method: 'POST', body: '{}' });
      const finalPdf = data.finalPdf || data.report?.finalPdf || {};
      if (status) { status.textContent = '✅ Yakuniy A4 PDF Drive\'ga saqlandi.'; status.className = 'faults-wf-status ok'; }
      if (linkHost) linkHost.innerHTML = clean(finalPdf.url) ? `<a class="faults-final-link" href="${esc(finalPdf.url)}" target="_blank" rel="noopener">PDF ni ochish</a>` : '';
      await loadReports({ quiet: true });
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
      if (linkHost) linkHost.textContent = clean(error.data?.recommendedFix);
    }
  }

  function openFinalDocuments() {
    syncFinalFolder();
    $('faultsFinalModal')?.classList.add('show');
  }

  async function loadSheetNames() {
    const status = $('faultsSettingsStatus');
    const list = $('faultsSettingsSheets');
    try {
      if (status) { status.textContent = 'Google Sheets varaqlari yuklanmoqda...'; status.className = 'faults-wf-status sync'; }
      const data = await api('/api/acts/settings/test', { method: 'POST', body: '{}' });
      const sheets = Array.isArray(data.sheets) ? data.sheets : [];
      if (list) list.innerHTML = sheets.map((name) => `<option value="${esc(name)}"></option>`).join('');
      if (status) { status.textContent = `${sheets.length} ta varaq topildi.`; status.className = 'faults-wf-status ok'; }
      return sheets;
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
      return [];
    }
  }

  function waitSettingsSaved(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Workspace sozlamasini saqlash javobi kelmadi.'));
      }, timeoutMs);
      function onMessage(event) {
        if (event.data?.type !== 'MODULE_SETTINGS_SAVED') return;
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      }
      window.addEventListener('message', onMessage);
    });
  }

  async function saveSettings() {
    const value = clean($('faultsSettingsSheet')?.value);
    const status = $('faultsSettingsStatus');
    if (!value) {
      if (status) { status.textContent = 'ASOSIY VAROQ nomini tanlang.'; status.className = 'faults-wf-status bad'; }
      return;
    }
    try {
      if (status) { status.textContent = 'Sozlama saqlanmoqda...'; status.className = 'faults-wf-status sync'; }
      const sheets = await loadSheetNames();
      const exact = sheets.find((name) => clean(name) === value);
      if (!exact) throw new Error(`Varaq topilmadi: ${value}`);
      if (parent && parent !== window) {
        const pending = waitSettingsSaved();
        parent.postMessage({ type: 'SAVE_MODULE_SETTINGS', settings: { [MODULE_SHEET_KEY]: exact } }, '*');
        await pending;
      }
      mainState().sheetName = exact;
      if (currentWorkspace()) {
        currentWorkspace().moduleSettings = { ...(currentWorkspace().moduleSettings || {}), [MODULE_SHEET_KEY]: exact };
      }
      if (status) { status.textContent = `Saqlandi: ${exact}`; status.className = 'faults-wf-status ok'; }
      await window.FaultsJournalWorkspace?.loadActReportNumbers?.(workspaceId(), currentWorkspace());
      window.setTimeout(() => $('faultsSettingsModal')?.classList.remove('show'), 500);
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'faults-wf-status bad'; }
    }
  }

  function openSettings() {
    if ($('faultsSettingsSheet')) $('faultsSettingsSheet').value = sheetName();
    $('faultsSettingsModal')?.classList.add('show');
    void loadSheetNames();
  }

  function syncWorkspace() {
    syncFinalFolder();
    if ($('faultsSettingsSheet')) $('faultsSettingsSheet').value = sheetName();
    const selected = selectedPeriod();
    uiState.analysisYear = selected.year;
    uiState.analysisMonth = selected.month;
    fillAnalysisSelectors();
  }

  function autoOpenMonthlyAnalysis() {
    const modal = $('faultsMonthlyModal');
    if (!modal || modal.classList.contains('show')) return;
    openMonthlyAnalysis();
  }

  function init() {
    injectStyle();
    injectUi();
    syncWorkspace();
    window.setTimeout(autoOpenMonthlyAnalysis, 120);
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SEG_KIP_WORKSPACE_CHANGE') {
      uiState.reports = [];
      uiState.signers = [];
      window.setTimeout(syncWorkspace, 0);
    }
    if (event.data?.type === 'SEG_KIP_FAULTS_OPEN') {
      window.setTimeout(autoOpenMonthlyAnalysis, 0);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.FaultsWorkflow = {
    openMonthlyAnalysis,
    autoOpenMonthlyAnalysis,
    openReports,
    openSigners,
    openFinalDocuments,
    openSettings,
    saveCurrentReport,
    saveDocumentDraft,
    createMonthlyDocument,
    renderDocumentDraft,
    loadReports,
    syncWorkspace,
  };
})();
