(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const PERIOD_KEY_PREFIX = 'seg_to_monthly_analysis_period_v1';
  const MONTHS = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const state = { year: 0, month: 0, source: null, period: null, busy: false, requestVersion: 0 };

  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function parentStorage(store, key) {
    try { return parent?.[store]?.getItem(key) || ''; } catch (_) { return ''; }
  }

  function workspaceId() {
    return clean(
      window.ToJournalWorkspace?.state?.workspaceId
      || localStorage.getItem(WORKSPACE_ID_KEY)
      || parentStorage('localStorage', WORKSPACE_ID_KEY),
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
      return parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY)
        || parentStorage('sessionStorage', ADMIN_TOKEN_KEY)
        || '';
    }
  }

  function sheetName() {
    return clean(window.ToJournalWorkspace?.state?.sheetName);
  }

  function periodKey(wsId = workspaceId()) {
    return `${PERIOD_KEY_PREFIX}:${clean(wsId) || 'default'}`;
  }

  function periodLabel() {
    return `${MONTHS[state.month] || state.month} ${state.year}`;
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

  async function requestJson(path, options = {}, { retry = true, allow404 = false } = {}) {
    const wsId = workspaceId();
    if (!wsId) throw new Error('Workspace tanlanmagan');
    const headers = new Headers(options.headers || {});
    const token = authToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-workspace-id', wsId);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && retry) {
      await refreshSession();
      return requestJson(path, options, { retry: false, allow404 });
    }
    if (allow404 && response.status === 404) return null;
    if (!response.ok || data.error) {
      throw Object.assign(new Error(data.error || `HTTP ${response.status}`), { status: response.status, data });
    }
    return data;
  }

  function injectStyle() {
    if ($('toMonthlyAnalysisStyle')) return;
    const style = document.createElement('style');
    style.id = 'toMonthlyAnalysisStyle';
    style.textContent = `
      .to-analysis-modal{position:fixed;inset:0;z-index:124;display:none;background:rgba(0,0,0,.78);padding:16px;font-family:Arial,sans-serif;color:#eaf7ff}
      .to-analysis-modal.show{display:flex;align-items:center;justify-content:center}
      .to-analysis-shell{width:min(1320px,100%);height:min(94vh,920px);display:flex;flex-direction:column;overflow:hidden;background:#071427;border:1px solid rgba(34,211,238,.30);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.48)}
      .to-analysis-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid rgba(255,255,255,.09)}
      .to-analysis-head h2{margin:0;font-size:20px}.to-analysis-head-actions{display:flex;gap:8px}
      .to-analysis-body{display:flex;flex-direction:column;min-height:0;flex:1;padding:16px}
      .to-analysis-titleline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .to-analysis-titleline h3{margin:0;font-size:20px}.to-analysis-note{margin:0 0 10px;color:#a9c8d8;font-size:12px}
      .to-analysis-period{display:flex;align-items:center;gap:6px;border:1px solid rgba(34,211,238,.32);background:rgba(2,13,25,.68);border-radius:11px;padding:4px 6px}
      .to-analysis-period select{background:#061120;color:#eaf8ff;border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:7px 9px;font-size:12px;font-weight:800}
      .to-analysis-period-status{border-radius:999px;padding:7px 10px;border:1px solid rgba(34,211,238,.24);font-size:11px;font-weight:800;color:#fde68a;white-space:nowrap}
      .to-analysis-period-status.ok{color:#86efac}.to-analysis-period-status.bad{color:#fca5a5}.to-analysis-period-status.sync{color:#fde68a}
      .to-analysis-summary{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:12px;align-items:start;margin-bottom:10px}
      .to-analysis-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .to-analysis-kpi>div{border:1px solid rgba(255,255,255,.12);background:rgba(1,12,24,.45);border-radius:13px;padding:10px 12px;min-width:0}
      .to-analysis-kpi small{color:#9fb7c7;font-weight:800;font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .to-analysis-kpi b{display:block;font-size:20px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .to-analysis-donutbox{border:1px solid rgba(34,211,238,.28);background:rgba(5,18,34,.72);border-radius:17px;padding:10px;text-align:center}
      .to-analysis-donutbox h4{margin:0 0 5px;font-size:12px}.to-analysis-donut{--p:0;width:82px;height:82px;border-radius:50%;margin:6px auto;display:grid;place-items:center;background:conic-gradient(#22c55e calc(var(--p)*1%),rgba(255,255,255,.12) 0);position:relative}
      .to-analysis-donut:before{content:"";position:absolute;inset:13px;border-radius:50%;background:#071427}.to-analysis-donut span{position:relative;font-size:20px;font-weight:900}
      .to-analysis-tablewrap{flex:1;min-height:0;overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:15px}
      .to-analysis-table{width:100%;border-collapse:collapse;min-width:1050px;background:rgba(1,12,24,.55)}
      .to-analysis-table th,.to-analysis-table td{padding:9px;border-bottom:1px solid rgba(255,255,255,.09);font-size:11px;text-align:left;vertical-align:top}
      .to-analysis-table th{position:sticky;top:0;z-index:2;background:rgba(10,56,72,.96);color:#dffbff}
      .to-analysis-section td{font-weight:900;color:#a5f3fc;background:rgba(34,211,238,.06)}
      .to-analysis-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
      .to-analysis-message{font-size:12px;color:#cdeeff}.to-analysis-message.bad{color:#fca5a5}.to-analysis-message.ok{color:#86efac}
      @media(max-width:900px){.to-analysis-summary{grid-template-columns:1fr}.to-analysis-kpi{grid-template-columns:repeat(2,1fr)}.to-analysis-donutbox{display:none}.to-analysis-body{padding:10px}}
      @media(max-width:600px){.to-analysis-kpi{grid-template-columns:1fr}.to-analysis-period{width:100%;flex-wrap:wrap}.to-analysis-period select{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    const actions = document.querySelector('.top-actions');
    if (actions && !$('toMonthlyAnalysisBtn')) {
      const button = document.createElement('button');
      button.id = 'toMonthlyAnalysisBtn';
      button.className = 'btn workspace-operator-only';
      button.type = 'button';
      button.textContent = '1. Ойлик анализ';
      button.addEventListener('click', open);
      const reports = $('toReportsBtn');
      const signers = $('toSignersBtn');
      const settings = $('toSettingsBtn');
      if (reports && reports.parentElement === actions) actions.insertBefore(button, reports);
      else if (signers && signers.parentElement === actions) actions.insertBefore(button, signers);
      else if (settings && settings.parentElement === actions) actions.insertBefore(button, settings);
      else actions.appendChild(button);
    }

    if ($('toMonthlyAnalysisModal')) return;
    const modal = document.createElement('div');
    modal.id = 'toMonthlyAnalysisModal';
    modal.className = 'to-analysis-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="to-analysis-shell">
        <div class="to-analysis-head">
          <h2>1. Ойлик анализ</h2>
          <div class="to-analysis-head-actions"><button id="toMonthlyAnalysisRefreshBtn" class="btn" type="button">↻ Янгилаш</button><button id="toMonthlyAnalysisCloseBtn" class="btn" type="button">✕</button></div>
        </div>
        <div class="to-analysis-body">
          <div class="to-analysis-titleline">
            <h3>📈 Ойлик анализ</h3>
            <div class="to-analysis-period">
              <button id="toAnalysisPrevBtn" class="btn" type="button" title="Олдинги ой">←</button>
              <select id="toAnalysisMonth" aria-label="Ой"></select>
              <select id="toAnalysisYear" aria-label="Йил"></select>
              <span id="toAnalysisPeriodStatus" class="to-analysis-period-status sync">Давр танланмоқда</span>
              <button id="toAnalysisNextBtn" class="btn" type="button" title="Кейинги ой">→</button>
            </div>
          </div>
          <p class="to-analysis-note">Таҳлил фақат танланган Workspace ва <b>ASOSIY VAROQ</b> маълумотларидан олинади. TO учун бир ой битта якуний бажарилган ишлар акти ҳисобланади.</p>
          <div class="to-analysis-summary">
            <div class="to-analysis-kpi">
              <div><small>Умумий TO қаторлари</small><b id="toAnalysisKpiTotal">0</b></div>
              <div><small>Бўлимлар сони</small><b id="toAnalysisKpiSections">0</b></div>
              <div><small>Яратилган ойлик хужжат</small><b id="toAnalysisKpiCreated">0</b></div>
              <div><small>Асосий варақ</small><b id="toAnalysisKpiSheet" style="font-size:15px">—</b></div>
            </div>
            <div class="to-analysis-donutbox"><h4>Ойлик хужжат тайёрлиги</h4><div id="toAnalysisDonut" class="to-analysis-donut" style="--p:0"><span>0%</span></div><p class="to-analysis-note">Яратилган хужжат / танланган ой</p></div>
          </div>
          <div class="to-analysis-tablewrap">
            <table class="to-analysis-table"><thead><tr><th>№</th><th>Бўлим</th><th>Зав. №</th><th>Наименование оборудования</th><th>Поз.</th><th>Кол-во</th><th>Техническое состояние</th><th>Вид работ</th><th>Примечание</th></tr></thead><tbody id="toAnalysisRows"><tr><td colspan="9">Ойлик маълумот юкланмоқда...</td></tr></tbody></table>
          </div>
          <div class="to-analysis-footer"><div id="toAnalysisMessage" class="to-analysis-message">Танланган ой маълумотлари ASOSIY VAROQ дан юкланади.</div><button id="toAnalysisDocumentBtn" class="btn primary" type="button" disabled>Хужатни очиш</button></div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    $('toMonthlyAnalysisCloseBtn')?.addEventListener('click', close);
    $('toMonthlyAnalysisRefreshBtn')?.addEventListener('click', () => void load());
    $('toAnalysisPrevBtn')?.addEventListener('click', () => void navigate(-1));
    $('toAnalysisNextBtn')?.addEventListener('click', () => void navigate(1));
    $('toAnalysisMonth')?.addEventListener('change', () => void selectPeriod());
    $('toAnalysisYear')?.addEventListener('change', () => void selectPeriod());
    $('toAnalysisDocumentBtn')?.addEventListener('click', () => void openOrCreateDocument());
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  }

  function setMessage(text, tone = '') {
    const el = $('toAnalysisMessage');
    if (!el) return;
    el.className = `to-analysis-message${tone ? ` ${tone}` : ''}`;
    el.textContent = text;
  }

  function setPeriodStatus(text, tone = 'sync') {
    const el = $('toAnalysisPeriodStatus');
    if (!el) return;
    el.className = `to-analysis-period-status ${tone}`;
    el.textContent = text;
  }

  function restorePeriod() {
    const main = window.ToJournalWorkspace?.state || {};
    let year = Number(main.periodYear);
    let month = Number(main.periodMonth);
    try {
      const saved = JSON.parse(localStorage.getItem(periodKey()) || 'null');
      if ((!Number.isInteger(year) || !Number.isInteger(month)) && saved) {
        year = Number(saved.year);
        month = Number(saved.month);
      }
    } catch (_) {}
    const now = new Date();
    state.year = Number.isInteger(year) && year >= 2000 ? year : now.getFullYear();
    state.month = Number.isInteger(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
    renderPeriodSelectors();
  }

  function persistPeriod() {
    try { localStorage.setItem(periodKey(), JSON.stringify({ year: state.year, month: state.month })); } catch (_) {}
  }

  function renderPeriodSelectors() {
    const month = $('toAnalysisMonth');
    const year = $('toAnalysisYear');
    if (!month || !year) return;
    month.innerHTML = MONTHS.slice(1).map((name, index) => `<option value="${index + 1}">${esc(name)}</option>`).join('');
    const now = new Date().getFullYear();
    const start = Math.min(2024, state.year);
    const end = Math.max(now + 5, state.year);
    year.innerHTML = Array.from({ length: end - start + 1 }, (_, index) => start + index)
      .map((value) => `<option value="${value}">${value}</option>`).join('');
    month.value = String(state.month);
    year.value = String(state.year);
    setPeriodStatus(`${periodLabel()} · танланган`, 'sync');
  }

  function flattenSections(sections = []) {
    const rows = [];
    for (const section of sections) {
      for (const item of section?.items || []) rows.push({ ...item, sectionName: clean(section?.name) || 'ASOSIY' });
    }
    return rows;
  }

  function renderRows(source) {
    const body = $('toAnalysisRows');
    if (!body) return;
    const rows = flattenSections(source?.sections || []);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9">Танланган ой учун TO қаторлари топилмади.</td></tr>';
      return;
    }
    let previousSection = '';
    body.innerHTML = rows.map((row, index) => {
      const section = clean(row.sectionName) || 'ASOSIY';
      const sectionRow = section !== previousSection
        ? `<tr class="to-analysis-section"><td colspan="9">${esc(section)}</td></tr>`
        : '';
      previousSection = section;
      return `${sectionRow}<tr><td>${index + 1}</td><td>${esc(section)}</td><td>${esc(row.serialNo || '')}</td><td>${esc(row.equipmentName || '')}</td><td>${esc(row.positionNo || '')}</td><td>${esc(row.quantity || '')}</td><td>${esc(row.technicalState || '')}</td><td>${esc(row.workType || '')}</td><td>${esc(row.note || '')}</td></tr>`;
    }).join('');
  }

  function renderSummary() {
    const source = state.source || {};
    const period = state.period?.period || null;
    const total = Number(source.totalItems) || 0;
    const sections = Array.isArray(source.sections) ? source.sections.length : 0;
    const created = period ? 1 : 0;
    const percent = created ? 100 : 0;
    if ($('toAnalysisKpiTotal')) $('toAnalysisKpiTotal').textContent = String(total);
    if ($('toAnalysisKpiSections')) $('toAnalysisKpiSections').textContent = String(sections);
    if ($('toAnalysisKpiCreated')) $('toAnalysisKpiCreated').textContent = String(created);
    if ($('toAnalysisKpiSheet')) $('toAnalysisKpiSheet').textContent = clean(source.sheetName || sheetName()) || '—';
    const donut = $('toAnalysisDonut');
    if (donut) {
      donut.style.setProperty('--p', String(percent));
      const span = donut.querySelector('span');
      if (span) span.textContent = `${percent}%`;
    }
    const action = $('toAnalysisDocumentBtn');
    if (action) {
      action.disabled = !total || state.busy;
      action.textContent = 'Хужат яратиш';
    }
    renderRows(source);
  }

  async function load() {
    if (state.busy) return;
    const wsId = workspaceId();
    const sourceSheet = sheetName();
    if (!wsId) { setMessage('Workspace tanlanmagan.', 'bad'); return; }
    if (!sourceSheet) { setMessage('ASOSIY VAROQ sozlanmagan. Avval Созламалар oynasida tanlang.', 'bad'); return; }

    const version = ++state.requestVersion;
    state.busy = true;
    renderSummary();
    setMessage(`${periodLabel()} маълумотлари Google Sheets дан юкланмоқда...`);
    setPeriodStatus(`${periodLabel()} · юкланмоқда...`, 'sync');
    try {
      const source = await requestJson('/api/to-period-bridge/select', {
        method: 'POST',
        body: JSON.stringify({ year: state.year, month: state.month, sheetName: sourceSheet }),
      });
      const period = await requestJson(
        `/api/to/periods/${state.year}/${state.month}`,
        { method: 'GET' },
        { allow404: true },
      );
      if (version !== state.requestVersion || wsId !== workspaceId()) return;
      state.source = source;
      state.period = period;
      renderSummary();
      const createdText = period?.period ? 'ойлик хужжат яратилган' : 'ойлик хужжат ҳали яратилмаган';
      setMessage(`${periodLabel()}: ${Number(source.totalItems) || 0} та TO қатори · ${createdText}.`, 'ok');
      setPeriodStatus(`${periodLabel()} · ${Number(source.totalItems) || 0} та қатор`, 'ok');
    } catch (error) {
      if (version !== state.requestVersion) return;
      state.source = null;
      state.period = null;
      renderSummary();
      setMessage(error.message, 'bad');
      setPeriodStatus(`${periodLabel()} · хато`, 'bad');
    } finally {
      if (version === state.requestVersion) {
        state.busy = false;
        renderSummary();
      }
    }
  }

  async function selectPeriod() {
    const year = Number($('toAnalysisYear')?.value);
    const month = Number($('toAnalysisMonth')?.value);
    if (Number.isInteger(year)) state.year = year;
    if (Number.isInteger(month) && month >= 1 && month <= 12) state.month = month;
    persistPeriod();
    await load();
  }

  async function navigate(delta) {
    let index = state.year * 12 + (state.month - 1) + Number(delta || 0);
    state.year = Math.floor(index / 12);
    state.month = ((index % 12) + 12) % 12 + 1;
    persistPeriod();
    renderPeriodSelectors();
    await load();
  }

  function applyPeriodToMainView() {
    const year = $('toPeriodYear');
    const month = $('toPeriodMonth');
    if (year && !Array.from(year.options).some((option) => Number(option.value) === state.year)) {
      const option = document.createElement('option');
      option.value = String(state.year);
      option.textContent = String(state.year);
      year.appendChild(option);
    }
    if (year) year.value = String(state.year);
    if (month) month.value = String(state.month);
    if (window.ToJournalWorkspace?.state) {
      window.ToJournalWorkspace.state.periodYear = state.year;
      window.ToJournalWorkspace.state.periodMonth = state.month;
      window.ToJournalWorkspace.state.sections = Array.isArray(state.source?.sections) ? state.source.sections : [];
      window.ToJournalWorkspace.state.totalItems = Number(state.source?.totalItems) || 0;
      window.ToJournalWorkspace.state.sheetName = clean(state.source?.sheetName || sheetName());
    }
  }

  async function openOrCreateDocument() {
    if (state.busy || !state.source?.totalItems) return;
    applyPeriodToMainView();
    const action = $('toAnalysisDocumentBtn');
    if (action) action.disabled = true;
    try {
      await window.ToJournalWorkspace?.openSelectedPeriod?.({ fallbackToSource: true });
      await window.ToJournalWorkspace?.applySignerSelectionsForCurrentPeriod?.();
      close();
    } catch (error) {
      setMessage(error.message || 'TO hujjatini ochish xatosi', 'bad');
    } finally {
      if (action) action.disabled = false;
    }
  }

  function open() {
    restorePeriod();
    $('toMonthlyAnalysisModal')?.classList.add('show');
    void load();
  }

  function close() {
    $('toMonthlyAnalysisModal')?.classList.remove('show');
  }

  function init() {
    injectStyle();
    injectUi();
    window.setTimeout(() => open(), 0);
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'SEG_KIP_WORKSPACE_CHANGE' && $('toMonthlyAnalysisModal')?.classList.contains('show')) {
      state.source = null;
      state.period = null;
      restorePeriod();
      window.setTimeout(() => void load(), 0);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.ToMonthlyAnalysis = { open, close, load, navigate, state, openOrCreateDocument };
})();
