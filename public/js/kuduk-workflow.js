(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const MONTHS = ['', 'Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  let floatingDocumentButton = null;
  const $ = (id) => document.getElementById(id) || (id === 'kudukCreateMonthlyDocument' ? floatingDocumentButton : null);
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
      body.kuduk-analysis-home{min-height:100vh;overflow:auto}
      body.kuduk-analysis-home .wrap{display:none!important}
      body.kuduk-analysis-home #kudukMonthlyModal{position:relative;inset:auto;z-index:1;display:flex;align-items:flex-start;justify-content:center;min-height:100vh;padding:12px;background:transparent}
      body.kuduk-analysis-home #kudukMonthlyModal .kw-monthly-shell{width:100%;max-width:none;max-height:none;min-height:calc(100vh - 24px);box-shadow:none}
      body.kuduk-analysis-home #kudukMonthlyClose{display:none!important}
      .kw-monthly-document-actions{min-height:48px;margin-top:12px}
      #kudukCreateMonthlyDocument{position:fixed;bottom:max(48px,env(safe-area-inset-bottom));right:154px;z-index:130;box-shadow:0 6px 24px rgba(0,0,0,.35)}
      .kw-monthly-shell{width:min(1380px,100%);max-height:96vh;display:flex;flex-direction:column;overflow:hidden}
      .kw-monthly-period{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}.kw-monthly-period select{background:#061120;color:#eaf8ff;border:1px solid rgba(255,255,255,.16);border-radius:9px;padding:8px 10px}
      .kw-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:10px}.kw-kpi{padding:12px;border:1px solid rgba(34,211,238,.22);border-radius:13px;background:rgba(2,15,28,.7)}.kw-kpi small{display:block;color:#9fb7c7;font-size:10px}.kw-kpi b{display:block;margin-top:5px;font-size:20px}
      .kw-progress{height:10px;border-radius:999px;background:rgba(148,163,184,.16);overflow:hidden;margin:0 0 12px}.kw-progress-bar{height:100%;width:0;background:linear-gradient(90deg,#14b8a6,#22c55e);transition:width .2s ease}
      .kw-monthly-table{width:100%;min-width:1400px;border-collapse:collapse;background:rgba(1,12,24,.55)}.kw-monthly-table th,.kw-monthly-table td{padding:8px;border-bottom:1px solid rgba(255,255,255,.09);border-right:1px solid rgba(255,255,255,.07);font-size:11px;text-align:left;vertical-align:top}.kw-monthly-table th{position:sticky;top:0;background:#0a3848;color:#dffbff;text-align:center}.kw-monthly-table td:last-child,.kw-monthly-table th:last-child{border-right:0}.kw-monthly-table .actions{white-space:nowrap;text-align:center}.kw-monthly-table .actions .btn{padding:7px 9px;margin:2px}.kw-monthly-table tr.kw-row-unselected td{background:transparent}.kw-monthly-table tr.kw-row-unselected:hover td{background:rgba(255,255,255,.035)}.kw-monthly-table tr.kw-row-selected td{background:rgba(245,158,11,.24);color:#fff7d6}.kw-monthly-table tr.kw-row-selected:hover td{background:rgba(245,158,11,.32)}.kw-monthly-table tr.kw-row-reported td{background:rgba(16,185,129,.12);color:#dcfce7}.kw-monthly-table tr.kw-row-reported:hover td{background:rgba(16,185,129,.18)}.kw-row-reported-badge{display:inline-flex;align-items:center;justify-content:center;padding:6px 8px;border-radius:9px;border:1px solid rgba(16,185,129,.38);background:rgba(16,185,129,.12);color:#86efac;font-weight:900;font-size:10px}.kw-row-select{display:inline-flex;align-items:center;justify-content:center;gap:4px;margin:2px;padding:6px 8px;border:1px solid rgba(34,211,238,.35);border-radius:9px;background:rgba(34,211,238,.08);color:#a5f3fc;font-weight:900;cursor:pointer}.kw-row-select input,.kw-select-all-label input{accent-color:auto;cursor:pointer}.kw-select-all-label{display:inline-flex;align-items:center;gap:4px;margin-top:5px;font-size:10px;color:#dffbff;cursor:pointer}
      body.kuduk-analysis-home #modal{z-index:180}
      .kw-doc-body{padding:14px;overflow:auto;background:#dbe4ea}.kw-doc-paper{width:297mm;min-height:210mm;margin:0 auto;background:#fff;color:#111;padding:12mm;box-shadow:0 8px 30px rgba(0,0,0,.24);font-family:"Times New Roman",Times,serif;box-sizing:border-box}.kw-doc-title{text-align:center;font-size:16pt;font-weight:700;margin-bottom:4mm}.kw-doc-subtitle{text-align:center;font-size:12pt;margin-bottom:5mm}.kw-doc-date{font-size:11pt;font-weight:700;margin:4mm 0 2mm}.kw-doc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}.kw-doc-table th,.kw-doc-table td{border:.25mm solid #000;padding:.8mm;vertical-align:middle;overflow-wrap:anywhere}.kw-doc-table th{text-align:center}
      .kw-date-shell{width:min(460px,100%)}.kw-date-input{width:100%;height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:#061120;color:#fff;padding:8px 12px;font-size:15px}.kw-date-note{margin-top:8px;color:#9fb7c7;font-size:11px;line-height:1.45}
      @media(max-width:1100px){.kw-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:850px){.kw-reports-grid{grid-template-columns:1fr}.kw-folders{max-height:220px;border-right:0;border-bottom:1px solid rgba(255,255,255,.09)}.kw-add-grid{grid-template-columns:1fr}.kw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    if (!$('kudukMonthlyModal')) {
      const modal = document.createElement('div');
      modal.id = 'kudukMonthlyModal';
      modal.className = 'kw-modal';
      modal.innerHTML = `
        <div class="kw-shell kw-monthly-shell">
          <div class="kw-head">
            <div class="kw-actions">
              <button id="kudukMonthlyBack" class="btn" type="button">← Менюга қайтиш</button>
              <div><h2>1. Ойлик анализ</h2><p>📘 ЖУРНАЛ маълумотлари танланган ой бўйича таҳлил қилинади.</p></div>
            </div>
            <div class="kw-actions">
              <button class="btn" type="button" onclick="window.KudukWorkflow?.openReports()">3. Хисоботлар</button>
              <button class="btn" type="button" onclick="window.KudukWorkflow?.openSigners()">5. ИМЗО ЧЕКУВЧИЛАР</button>
              <button class="btn" type="button" onclick="window.KudukWorkflow?.openFinalDocuments()">6. ЯКУНИЙ ҲУЖЖАТЛАР</button>
              <button id="kudukMonthlyRefresh" class="btn" type="button">↻ Янгилаш</button>
              <button id="kudukMonthlyClose" class="btn" type="button">✕</button>
            </div>
          </div>
          <div class="kw-body" style="overflow:auto">
            <div class="kw-monthly-period">
              <button id="kudukAnalysisPrev" class="btn" type="button">←</button>
              <select id="kudukAnalysisMonth"></select>
              <select id="kudukAnalysisYear"></select>
              <button id="kudukAnalysisNext" class="btn" type="button">→</button>
              <span id="kudukMonthlyStatus" class="kw-status sync">Давр танланмоқда...</span>
            </div>
            <div class="kw-kpis">
              <div class="kw-kpi"><small>Жами ёзувлар</small><b id="kudukKpiTotal">0</b></div>
              <div class="kw-kpi"><small>Ҳисоботда</small><b id="kudukKpiReported">0</b></div>
              <div class="kw-kpi"><small>Қолган</small><b id="kudukKpiRemaining">0</b></div>
              <div class="kw-kpi"><small>Ҳозир танланган</small><b id="kudukKpiSelected">0</b></div>
              <div class="kw-kpi"><small>Ҳужжат яратиш амаллари</small><b id="kudukKpiBatches">0</b></div>
              <div class="kw-kpi"><small>Бажарилиш</small><b id="kudukKpiProgress">0%</b></div>
            </div>
            <div class="kw-progress"><div id="kudukProgressBar" class="kw-progress-bar"></div></div>
            <div class="kw-tablewrap"><table class="kw-monthly-table">
              <thead><tr>
                <th>№</th><th>Дата</th><th>Поз номер</th><th>Наименование СИ</th><th>Тип, марка</th><th>Заводской номер</th><th>Предел измерения</th><th>Место установки</th><th>СКВ</th><th>Перечень в/р</th><th>Исполнитель</th><th>Подпись</th><th>Амал<br><label class="kw-select-all-label"><input id="kudukSelectAllRows" type="checkbox" title="Барчасини танлаш"> Танлаш</label></th>
              </tr></thead><tbody id="kudukMonthlyRows"></tbody>
            </table></div>
            <div class="kw-monthly-document-actions"><button id="kudukCreateMonthlyDocument" class="btn primary" type="button">Хужат яратиш</button></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      $('kudukMonthlyClose')?.addEventListener('click', () => closeMonthlyAnalysis());
      $('kudukMonthlyBack')?.addEventListener('click', () => { closeMonthlyAnalysis(); try { parent.postMessage({type:'SEG_CLOSE_MODULE'}, '*'); } catch (_) {} });
      $('kudukMonthlyRefresh')?.addEventListener('click', () => void loadMonthlyAnalysis({ forceRefresh:true }));
      $('kudukAnalysisPrev')?.addEventListener('click', () => void navigateMonthly(-1));
      $('kudukAnalysisNext')?.addEventListener('click', () => void navigateMonthly(1));
      $('kudukAnalysisMonth')?.addEventListener('change', () => void readMonthlySelectors());
      $('kudukAnalysisYear')?.addEventListener('change', () => void readMonthlySelectors());
      $('kudukCreateMonthlyDocument')?.addEventListener('click', createMonthlyDocument);
      $('kudukSelectAllRows')?.addEventListener('change', (event) => toggleSelectAll(Boolean(event.target?.checked)));
      modal.addEventListener('click', (event) => { if (event.target === modal) closeMonthlyAnalysis(); });
    }

    if (!$('kudukDateModal')) {
      const modal = document.createElement('div');
      modal.id = 'kudukDateModal';
      modal.className = 'kw-modal';
      modal.innerHTML = `
        <div class="kw-shell kw-date-shell">
          <div class="kw-head">
            <div><h2>Ҳужжат санасини танланг</h2><p id="kudukDatePeriodLabel"></p></div>
            <button id="kudukDateClose" class="btn" type="button">✕</button>
          </div>
          <div class="kw-body">
            <label style="display:grid;gap:7px;font-weight:800">Қайси кун учун
              <input id="kudukDocumentDate" class="kw-date-input" type="date">
            </label>
            <div class="kw-date-note">Танланган қаторлар шу сана билан жорий ой ҳисоботига қўшилади. Аввалги қаторлар ўчирилмайди.</div>
            <div id="kudukDateStatus" class="kw-status" style="margin-top:10px"></div>
            <div class="kw-actions" style="justify-content:flex-end;margin-top:14px">
              <button id="kudukDateCancel" class="btn" type="button">Бекор қилиш</button>
              <button id="kudukDateConfirm" class="btn primary" type="button">Ҳисоботга қўшиш</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const closeDate = () => modal.classList.remove('show');
      $('kudukDateClose')?.addEventListener('click', closeDate);
      $('kudukDateCancel')?.addEventListener('click', closeDate);
      $('kudukDateConfirm')?.addEventListener('click', () => void appendSelectedRowsToReport());
      modal.addEventListener('click', (event) => { if (event.target === modal) closeDate(); });
    }

    if (!$('kudukDocumentModal')) {
      const modal = document.createElement('div');
      modal.id = 'kudukDocumentModal';
      modal.className = 'kw-modal';
      modal.innerHTML = `
        <div class="kw-shell" style="width:min(1540px,100%);height:min(96vh,1040px)">
          <div class="kw-head"><div><h2>ЖУРНАЛ УЧЕТА — Хужат</h2><p id="kudukDocumentStatus"></p></div><button id="kudukDocumentClose" class="btn" type="button">✕</button></div>
          <div class="kw-doc-body"><div id="kudukDocumentPaper" class="kw-doc-paper"></div></div>
        </div>`;
      document.body.appendChild(modal);
      $('kudukDocumentClose')?.addEventListener('click', () => modal.classList.remove('show'));
      modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
    }

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

  const monthlyState = { year:0, month:0, route:null, rows:[], loading:false, selectedKeys:new Set(), reportedKeys:new Set(), reportBatches:0 };

  function masterRows() {
    const state = window.KudukJournalWorkspace?.getState?.() || {};
    const route = monthlyState.route || state.selectedRoute || null;
    const sheet = clean(route?.sheet);
    if (sheet && Array.isArray(state.sheets?.[sheet])) return state.sheets[sheet];
    return Array.isArray(state.rows) ? state.rows : [];
  }

  function latestPeriod(rows) {
    const state = window.KudukJournalWorkspace?.getState?.() || {};
    const stateYear = Number(state.periodYear);
    const stateMonth = Number(state.periodMonth);
    if (Number.isInteger(stateYear) && stateYear >= 2026 && stateYear <= 2028 && Number.isInteger(stateMonth) && stateMonth >= 1 && stateMonth <= 12) {
      return { year:stateYear, month:stateMonth };
    }
    const periods = rows.map((row) => parseDate(row.date)).filter(Boolean).filter((p) => p.year >= 2026 && p.year <= 2028);
    periods.sort((a,b) => b.year-a.year || b.month-a.month);
    return periods[0] || { year:2026, month:new Date().getMonth()+1 };
  }

  function fillMonthlySelectors() {
    const rows = masterRows();
    if (!monthlyState.year || !monthlyState.month) {
      const latest = latestPeriod(rows);
      monthlyState.year = latest.year;
      monthlyState.month = latest.month;
    }
    const month = $('kudukAnalysisMonth');
    const year = $('kudukAnalysisYear');
    if (!month || !year) return;
    month.innerHTML = MONTHS.slice(1).map((name,index) => '<option value="'+(index+1)+'">'+esc(name)+'</option>').join('');
    year.innerHTML = [2026,2027,2028].map((value) => '<option value="'+value+'">'+value+'</option>').join('');
    if (monthlyState.year < 2026 || monthlyState.year > 2028) monthlyState.year = 2026;
    month.value = String(monthlyState.month);
    year.value = String(monthlyState.year);
  }

  function monthlyRows() {
    return Array.isArray(monthlyState.rows) ? monthlyState.rows : [];
  }

  function monthlyRowKey(row = {}, index = 0) {
    const baseRow = Number(row._periodBaseRowNumber || row._rowNumber || 0);
    if (baseRow) return 'row:' + baseRow;
    return 'data:' + [row.date,row.pos,row.name,row.serial,row.location,index].map(clean).join('|');
  }

  function reportSourceKey(row = {}) {
    const baseRow = Number(row._periodBaseRowNumber || row._rowNumber || 0);
    if (baseRow) return 'base:' + baseRow;
    return 'data:' + [row.date,row.pos,row.name,row.brand,row.serial,row.range,row.location,row.skv,row.work].map(clean).join('|');
  }

  function isReportedRow(row, index) {
    return monthlyState.reportedKeys.has(reportSourceKey(row,index));
  }

  function selectedMonthlyRows() {
    return monthlyRows().filter((row,index) => monthlyState.selectedKeys.has(monthlyRowKey(row,index)));
  }

  function updateSelectionUi() {
    const rows = monthlyRows();
    const selectable = rows.filter((row,index) => !isReportedRow(row,index));
    const selected = selectedMonthlyRows();
    const master = $('kudukSelectAllRows');
    if (master) {
      master.disabled = !selectable.length;
      master.checked = Boolean(selectable.length && selected.length === selectable.length);
      master.indeterminate = Boolean(selected.length && selected.length < selectable.length);
    }
    const button = $('kudukCreateMonthlyDocument');
    if (button) {
      button.disabled = !selected.length;
      button.textContent = selected.length ? 'Хужат яратиш (' + selected.length + ')' : 'Хужат яратиш';
    }
  }

  function toggleMonthlyRow(index, checked) {
    const row = monthlyRows()[Number(index)];
    if (!row || isReportedRow(row, Number(index))) return;
    const key = monthlyRowKey(row, Number(index));
    if (checked) monthlyState.selectedKeys.add(key);
    else monthlyState.selectedKeys.delete(key);
    renderMonthlyAnalysis();
  }

  function toggleSelectAll(checked) {
    const rows = monthlyRows();
    monthlyState.selectedKeys.clear();
    if (checked) rows.forEach((row,index) => {
      if (!isReportedRow(row,index)) monthlyState.selectedKeys.add(monthlyRowKey(row,index));
    });
    renderMonthlyAnalysis();
  }

  async function loadMonthlyReportState() {
    monthlyState.reportedKeys.clear();
    monthlyState.reportBatches = 0;
    try {
      const reportData = await api('/api/journal-reports/' + monthlyState.year + '/' + monthlyState.month);
      const items = Array.isArray(reportData.items) ? reportData.items : [];
      monthlyState.reportedKeys = new Set(items.map((item) => clean(item.sourceKey)).filter(Boolean));
      monthlyState.reportBatches = Array.isArray(reportData.batches) ? reportData.batches.length : 0;
    } catch (error) {
      if (Number(error?.status) !== 404) throw error;
    }
  }

  async function loadMonthlyAnalysis({ forceRefresh=false } = {}) {
    fillMonthlySelectors();
    const status = $('kudukMonthlyStatus');
    if (monthlyState.loading) return;
    monthlyState.loading = true;
    if (status) {
      status.textContent = (MONTHS[monthlyState.month] || monthlyState.month) + ' ' + monthlyState.year + ' · Sheets синхронланмоқда...';
      status.className = 'kw-status sync';
    }
    try {
      const state = window.KudukJournalWorkspace?.getState?.() || {};
      const payload = {
        year: monthlyState.year,
        month: monthlyState.month,
        stateVersion: Number(state.version || 0) || 0,
        stateUpdatedAt: clean(state.updatedAt),
        ...(forceRefresh ? { forceRefresh:true } : {})
      };
      const data = await api('/api/hisobot-period/select', {
        method:'POST',
        body:JSON.stringify(payload)
      });
      monthlyState.year = Number(data?.selector?.year || monthlyState.year);
      monthlyState.month = Number(data?.selector?.month || monthlyState.month);
      monthlyState.rows = Array.isArray(data?.rows) ? data.rows : [];
      await loadMonthlyReportState();
      const availableKeys = new Set(monthlyState.rows.map((row,index) => monthlyRowKey(row,index)));
      monthlyState.selectedKeys = new Set([...monthlyState.selectedKeys].filter((key) => availableKeys.has(key)));
      monthlyState.rows.forEach((row,index) => {
        if (isReportedRow(row,index)) monthlyState.selectedKeys.delete(monthlyRowKey(row,index));
      });
      fillMonthlySelectors();
      renderMonthlyAnalysis();
    } catch (error) {
      monthlyState.rows = [];
      renderMonthlyAnalysis();
      if (status) {
        status.textContent = 'Хато: ' + error.message;
        status.className = 'kw-status bad';
      }
    } finally {
      monthlyState.loading = false;
    }
  }

  function renderMonthlyAnalysis() {
    fillMonthlySelectors();
    const rows = monthlyRows();
    const body = $('kudukMonthlyRows');
    const route = monthlyState.route || window.KudukJournalWorkspace?.getState?.()?.selectedRoute || {};
    if (body) {
      body.innerHTML = rows.length ? rows.map((r,index) => {
        const reported = isReportedRow(r,index);
        const selected = !reported && monthlyState.selectedKeys.has(monthlyRowKey(r,index));
        const checked = selected ? ' checked' : '';
        const rowClass = reported ? 'kw-row-reported' : (selected ? 'kw-row-selected' : 'kw-row-unselected');
        const selectControl = reported
          ? '<span class="kw-row-reported-badge" title="Бу қатор аввал ҳисоботга қўшилган">✓ Ҳисоботда</span>'
          : '<label class="kw-row-select" title="Хужатга қўшиш"><input type="checkbox"' + checked + ' onchange="window.KudukWorkflow?.toggleMonthlyRow(' + index + ', this.checked)">✓</label>';
        return `<tr class="${rowClass}">
        <td>${index+1}</td><td>${esc(r.date)}</td><td>${esc(r.pos)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.serial)}</td><td>${esc(r.range)}</td><td>${esc(r.location)}</td><td>${esc(r.skv)}</td><td>${esc(r.work)}</td><td>${esc(r.executor)}</td><td>${esc(r.signature)}</td>
        <td class="actions">${selectControl}<button class="btn orange workspace-operator-only" type="button" title="Таҳрирлаш" onclick="window.KudukWorkflow?.editMonthlyRow(${index})">✏️</button><button class="btn red workspace-operator-only" type="button" title="Ўчириш" onclick="window.KudukWorkflow?.deleteMonthlyRow(${index})">🗑</button></td>
      </tr>`;
      }).join('') : '<tr><td colspan="13" class="kw-empty">Танланган ой учун 📘 ЖУРНАЛ ёзувлари топилмади.</td></tr>';
      updateSelectionUi();
    }
    const reportedCount = rows.filter((row,index) => isReportedRow(row,index)).length;
    const selectedCount = rows.filter((row,index) => !isReportedRow(row,index) && monthlyState.selectedKeys.has(monthlyRowKey(row,index))).length;
    const remainingCount = Math.max(0, rows.length - reportedCount);
    const progress = rows.length ? Math.round((reportedCount / rows.length) * 1000) / 10 : 0;
    if ($('kudukKpiTotal')) $('kudukKpiTotal').textContent = String(rows.length);
    if ($('kudukKpiReported')) $('kudukKpiReported').textContent = String(reportedCount);
    if ($('kudukKpiRemaining')) $('kudukKpiRemaining').textContent = String(remainingCount);
    if ($('kudukKpiSelected')) $('kudukKpiSelected').textContent = String(selectedCount);
    if ($('kudukKpiBatches')) $('kudukKpiBatches').textContent = String(monthlyState.reportBatches || 0);
    if ($('kudukKpiProgress')) $('kudukKpiProgress').textContent = String(progress) + '%';
    if ($('kudukProgressBar')) $('kudukProgressBar').style.width = Math.max(0, Math.min(100, progress)) + '%';
    if ($('kudukMonthlyStatus')) {
      $('kudukMonthlyStatus').textContent = (MONTHS[monthlyState.month] || monthlyState.month) + ' ' + monthlyState.year + ' · ' + rows.length + ' та ёзув';
      $('kudukMonthlyStatus').className = 'kw-status ' + (rows.length ? 'ok' : 'sync');
    }
  }

  async function readMonthlySelectors() {
    const nextMonth = Number($('kudukAnalysisMonth')?.value) || monthlyState.month;
    const nextYear = Number($('kudukAnalysisYear')?.value) || monthlyState.year;
    if (nextMonth !== monthlyState.month || nextYear !== monthlyState.year) monthlyState.selectedKeys.clear();
    monthlyState.month = nextMonth;
    monthlyState.year = nextYear;
    await loadMonthlyAnalysis();
  }

  async function navigateMonthly(delta) {
    let absolute = monthlyState.year * 12 + (monthlyState.month - 1) + Number(delta || 0);
    let year = Math.floor(absolute / 12);
    let month = ((absolute % 12) + 12) % 12 + 1;
    if (year < 2026) { year = 2026; month = 1; }
    if (year > 2028) { year = 2028; month = 12; }
    if (year !== monthlyState.year || month !== monthlyState.month) monthlyState.selectedKeys.clear();
    monthlyState.year = year; monthlyState.month = month;
    await loadMonthlyAnalysis();
  }

  function openMonthlyAnalysis(route=null) {
    injectUi();
    monthlyState.route = route || window.KudukJournalWorkspace?.getState?.()?.selectedRoute || monthlyState.route;
    monthlyState.year = 0; monthlyState.month = 0; monthlyState.rows = []; monthlyState.selectedKeys.clear(); monthlyState.reportedKeys.clear(); monthlyState.reportBatches = 0;
    fillMonthlySelectors();
    document.body.classList.add('kuduk-analysis-home');
    $('kudukMonthlyModal')?.classList.add('show');
    mountFloatingDocumentButton();
    void loadMonthlyAnalysis();
  }

  function closeMonthlyAnalysis() {
    document.body.classList.remove('kuduk-analysis-home');
    $('kudukMonthlyModal')?.classList.remove('show');
  }

  function mountFloatingDocumentButton() {
    if (floatingDocumentButton || window.parent === window) return;
    try {
      const frame = window.frameElement;
      const host = parent.document;
      if (!frame || !host.body) return;
      const button = $('kudukCreateMonthlyDocument');
      if (!button) return;
      floatingDocumentButton = button;
      // A fixed element inside an iframe is confined to that frame's viewport.
      // Keep the existing button and handlers, but mount it in the outer viewport.
      button.style.cssText = 'position:fixed;bottom:max(48px,env(safe-area-inset-bottom));right:154px;z-index:130;border:0;border-radius:13px;padding:11px 14px;font:800 13px Arial,sans-serif;cursor:pointer;background:linear-gradient(135deg,#0891b2,#22d3ee);color:#00111b;box-shadow:0 6px 24px rgba(0,0,0,.35)';
      host.body.appendChild(button);
      const syncVisibility = () => {
        const analysisOpen = document.body.classList.contains('kuduk-analysis-home');
        const overlayOpen = document.querySelector('.kw-modal.show:not(#kudukMonthlyModal), #modal.show');
        button.hidden = !analysisOpen || !!overlayOpen || !frame.getClientRects().length;
      };
      const observer = new MutationObserver(syncVisibility);
      observer.observe(document.body, { attributes:true, subtree:true, attributeFilter:['class','style','hidden'] });
      const hostObserver = new MutationObserver(syncVisibility);
      for (let element = frame; element; element = element.parentElement) {
        hostObserver.observe(element, { attributes:true, attributeFilter:['class','style','hidden'] });
      }
      parent.addEventListener('resize', syncVisibility);
      window.addEventListener('pagehide', () => {
        observer.disconnect();
        hostObserver.disconnect();
        parent.removeEventListener('resize', syncVisibility);
        button.remove();
        floatingDocumentButton = null;
      }, { once:true });
      syncVisibility();
    } catch (_) {
      // Standalone and cross-origin embeds use the local fixed-position button.
    }
  }

  function waitForEditorClose() {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const modal = $('modal');
        if (!modal?.classList.contains('show') || Date.now() - started > 120000) return resolve();
        window.setTimeout(check, 250);
      };
      window.setTimeout(check, 250);
    });
  }

  async function editMonthlyRow(index) {
    const row = monthlyRows()[Number(index)];
    if (!row || typeof window.openEditor !== 'function') return;
    try {
      await window.openEditor('edit', row);
      await waitForEditorClose();
      await loadMonthlyAnalysis({ forceRefresh:true });
    } catch (error) {
      const status = $('kudukMonthlyStatus');
      if (status) {
        status.textContent = 'Хато: ' + (error?.message || 'Ёзувни таҳрирлашда хато');
        status.className = 'kw-status bad';
      }
    }
  }

  async function deleteMonthlyRow(index) {
    const row = monthlyRows()[Number(index)];
    if (!row || typeof window.removeRow !== 'function') return;
    const rowNumber = Number(row._periodBaseRowNumber || row._rowNumber || 0);
    if (!rowNumber) {
      const status = $('kudukMonthlyStatus');
      if (status) {
        status.textContent = 'Ўчириш учун База қатор рақами топилмади.';
        status.className = 'kw-status bad';
      }
      return;
    }
    await window.removeRow(rowNumber);
    await loadMonthlyAnalysis({ forceRefresh:true });
  }

  function documentDateDefault() {
    const year = Number(monthlyState.year);
    const month = Number(monthlyState.month);
    const now = new Date();
    const day = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : 1;
    return year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
  }

  function openDocumentDateDialog() {
    const rows = selectedMonthlyRows();
    const status = $('kudukMonthlyStatus');
    if (!rows.length) {
      if (status) {
        status.textContent = 'Хужат яратиш учун камида битта қаторни ✓ билан танланг.';
        status.className = 'kw-status bad';
      }
      return;
    }
    injectUi();
    if ($('kudukDatePeriodLabel')) $('kudukDatePeriodLabel').textContent =
      (MONTHS[monthlyState.month] || monthlyState.month) + ' ' + monthlyState.year + ' · ' + rows.length + ' та танланган қатор';
    const input = $('kudukDocumentDate');
    if (input) {
      const prefix = monthlyState.year + '-' + String(monthlyState.month).padStart(2,'0');
      input.min = prefix + '-01';
      const lastDay = new Date(monthlyState.year, monthlyState.month, 0).getDate();
      input.max = prefix + '-' + String(lastDay).padStart(2,'0');
      input.value = documentDateDefault();
    }
    if ($('kudukDateStatus')) $('kudukDateStatus').textContent = '';
    $('kudukDateModal')?.classList.add('show');
  }

  function reportSourceRow(row, index) {
    const sourceRowNumber = Number(row?._periodBaseRowNumber || row?._rowNumber || 0) || null;
    const sourceKey = sourceRowNumber
      ? 'base:' + sourceRowNumber
      : 'data:' + [row?.date,row?.pos,row?.name,row?.brand,row?.serial,row?.range,row?.location,row?.skv,row?.work].map(clean).join('|');
    return { ...row, sourceKey, sourceRowNumber };
  }

  function formatDocumentDate(value) {
    const raw = clean(value);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '.' + m[2] + '.' + m[1] : raw;
  }

  function renderStoredDocument(bundle) {
    const paper = $('kudukDocumentPaper');
    if (!paper) return;
    const report = bundle?.report || {};
    const batches = Array.isArray(bundle?.batches) ? bundle.batches : [];
    const items = Array.isArray(bundle?.items) ? bundle.items : [];
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));

    const body = items.map((r,index) => {
      const batch = batchById.get(r.batchId) || {};
      const documentDate = formatDocumentDate(batch.documentDate) || r.date;
      return `<tr><td>${index+1}</td><td>${esc(documentDate)}</td><td>${esc(r.pos)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.serial)}</td><td>${esc(r.range)}</td><td>${esc(r.location)}</td><td>${esc(r.skv)}</td><td>${esc(r.work)}</td><td>${esc(r.executor)}</td><td>${esc(r.signature)}</td></tr>`;
    }).join('');

    paper.innerHTML = `
      <div class="kw-doc-title">ЖУРНАЛ УЧЕТА</div>
      <div class="kw-doc-subtitle">${esc(MONTHS[Number(report.month)] || report.month)} ${esc(report.year)}</div>
      <table class="kw-doc-table"><thead><tr><th>№</th><th>Дата</th><th>Поз номер</th><th>Наименование СИ</th><th>Тип, марка</th><th>Заводской номер</th><th>Предел измерения</th><th>Место установки</th><th>СКВ</th><th>Перечень в/р</th><th>Исполнитель</th><th>Подпись</th></tr></thead><tbody>${body || '<tr><td colspan="12">Маълумот йўқ.</td></tr>'}</tbody></table>`;
    if ($('kudukDocumentStatus')) $('kudukDocumentStatus').textContent =
      (MONTHS[Number(report.month)] || report.month) + ' ' + report.year + ' · ' + items.length + ' та ёзув';
    $('kudukDocumentModal')?.classList.add('show');
  }

  async function appendSelectedRowsToReport() {
    const rows = selectedMonthlyRows();
    const date = clean($('kudukDocumentDate')?.value);
    const status = $('kudukDateStatus');
    const button = $('kudukDateConfirm');
    if (!rows.length || !date) {
      if (status) { status.textContent = 'Сана ва камида битта қатор талаб қилинади.'; status.className = 'kw-status bad'; }
      return;
    }
    try {
      if (button) button.disabled = true;
      if (status) { status.textContent = 'Ҳисоботга қўшилмоқда...'; status.className = 'kw-status sync'; }
      const route = monthlyState.route || window.KudukJournalWorkspace?.getState?.()?.selectedRoute || {};
      const data = await api('/api/journal-reports/' + monthlyState.year + '/' + monthlyState.month + '/append', {
        method:'POST',
        body:JSON.stringify({
          documentDate: date,
          sourceSheetName: clean(route.sheet || route.title),
          rows: rows.map(reportSourceRow)
        })
      });
      monthlyState.selectedKeys.clear();
      await loadMonthlyReportState();
      renderMonthlyAnalysis();
      $('kudukDateModal')?.classList.remove('show');
      if ($('kudukMonthlyStatus')) {
        const skipped = Number(data.skippedCount || 0);
        $('kudukMonthlyStatus').textContent = '✅ ' + Number(data.addedCount || 0) + ' та қатор ҳисоботга қўшилди' + (skipped ? ', ' + skipped + ' та такрорий қатор ўтказиб юборилди' : '');
        $('kudukMonthlyStatus').className = 'kw-status ok';
      }
      renderStoredDocument(data);
    } catch (error) {
      if (status) {
        status.textContent = error?.data?.recommendedFix ? error.message + ' · ' + error.data.recommendedFix : error.message;
        status.className = 'kw-status bad';
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  function createMonthlyDocument() {
    openDocumentDateDialog();
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

  async function renderReportFolders() {
    const host = $('kudukReportFolders');
    const preview = $('kudukReportPreview');
    if (!host) return;
    host.innerHTML = '<div class="kw-empty">Ҳисоботлар юкланмоқда...</div>';
    if (preview) preview.innerHTML = '<div class="kw-empty">Ойни танланг.</div>';
    try {
      const data = await api('/api/journal-reports');
      const reports = Array.isArray(data.reports) ? data.reports : [];
      if (!reports.length) {
        host.innerHTML = '<div class="kw-empty">Ҳали сақланган ойлик ҳисобот йўқ.</div>';
        if (preview) preview.innerHTML = '<div class="kw-empty">1. Ойлик анализда қаторларни танлаб, Хужат яратиш орқали биринчи ҳисоботни шакллантиринг.</div>';
        return;
      }
      let html = '', currentYear = null;
      reports.forEach((report) => {
        if (report.year !== currentYear) {
          currentYear = report.year;
          html += '<div class="kw-year">' + report.year + '</div>';
        }
        html += '<button class="kw-folder" type="button" data-year="' + report.year + '" data-month="' + report.month + '"><span>📁 ' + esc(MONTHS[report.month]) + '</span><b>' + Number(report.rowCount || 0) + '</b></button>';
      });
      host.innerHTML = html;
      host.querySelectorAll('.kw-folder').forEach((btn) => btn.addEventListener('click', () => {
        host.querySelectorAll('.kw-folder').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        void renderReportPreview(Number(btn.dataset.year), Number(btn.dataset.month));
      }));
      host.querySelector('.kw-folder')?.click();
    } catch (error) {
      host.innerHTML = '<div class="kw-empty">' + esc(error?.data?.recommendedFix ? error.message + ' · ' + error.data.recommendedFix : error.message) + '</div>';
    }
  }

  async function renderReportPreview(year, month) {
    const host = $('kudukReportPreview');
    if (!host) return;
    host.innerHTML = '<div class="kw-empty">Ҳисобот юкланмоқда...</div>';
    try {
      const data = await api('/api/journal-reports/' + year + '/' + month);
      const batches = Array.isArray(data.batches) ? data.batches : [];
      const items = Array.isArray(data.items) ? data.items : [];
      const batchMap = new Map(batches.map((batch) => [batch.id, batch]));
      host.innerHTML = `
        <div class="kw-actions" style="justify-content:space-between;margin-bottom:12px">
          <div><b>${esc(MONTHS[month])} ${year}</b> · ${items.length} та ёзув · ${batches.length} та ҳужжат яратиш амали</div>
          <button id="kudukOpenStoredDocument" class="btn primary" type="button">Хужатни очиш</button>
        </div>
        <div class="kw-tablewrap"><table class="kw-table"><thead><tr>
          <th>Дата</th><th>Поз номер</th><th>Наименование СИ</th><th>Тип, марка</th><th>Заводской номер</th><th>Место установки</th>
        </tr></thead><tbody>${items.map((r) => {
          const batch = batchMap.get(r.batchId) || {};
          const documentDate = formatDocumentDate(batch.documentDate) || r.date;
          return `<tr><td>${esc(documentDate)}</td><td>${esc(r.pos)}</td><td>${esc(r.name)}</td><td>${esc(r.brand)}</td><td>${esc(r.serial)}</td><td>${esc(r.location)}</td></tr>`;
        }).join('')}</tbody></table></div>`;
      $('kudukOpenStoredDocument')?.addEventListener('click', () => renderStoredDocument(data));
    } catch (error) {
      host.innerHTML = '<div class="kw-empty">' + esc(error.message) + '</div>';
    }
  }

  function openReports() {
    injectUi();
    $('kudukReportsModal')?.classList.add('show');
    void renderReportFolders();
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

  window.KudukWorkflow = { openMonthlyAnalysis, closeMonthlyAnalysis, loadMonthlyAnalysis, renderMonthlyAnalysis, toggleMonthlyRow, toggleSelectAll, editMonthlyRow, deleteMonthlyRow, createMonthlyDocument, openDocumentDateDialog, appendSelectedRowsToReport, openReports, openSigners, openFinalDocuments, loadSigners, renderReportFolders };
})();
