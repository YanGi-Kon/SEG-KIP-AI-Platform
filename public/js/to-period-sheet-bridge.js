(() => {
  'use strict';

  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const API_PATH = '/api/to-period-bridge/select';

  let lastSyncedKey = '';
  let inFlightKey = '';
  let requestVersion = 0;
  let observedKey = '';
  let pendingEditableField = null;

  const clean = (value) => String(value ?? '').trim();
  const $ = (id) => document.getElementById(id);

  function parentStorage(store, key) {
    try {
      return parent?.[store]?.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function sessionValue(key) {
    try {
      return sessionStorage.getItem(key) || parentStorage('sessionStorage', key) || '';
    } catch (_) {
      return parentStorage('sessionStorage', key) || '';
    }
  }

  function authToken() {
    return sessionValue(WORKSPACE_TOKEN_KEY) || sessionValue(ADMIN_TOKEN_KEY);
  }

  function journalState() {
    return window.ToJournalWorkspace?.state || null;
  }

  function workspaceId() {
    const state = journalState();
    return clean(
      state?.workspaceId
      || localStorage.getItem(WORKSPACE_ID_KEY)
      || parentStorage('localStorage', WORKSPACE_ID_KEY),
    );
  }

  function selection() {
    const state = journalState();
    const year = Number($('toPeriodYear')?.value || state?.periodYear || 0);
    const month = Number($('toPeriodMonth')?.value || state?.periodMonth || 0);
    const sheetName = clean(state?.sheetName || '');
    const wsId = workspaceId();

    if (!wsId || !sheetName) return null;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;

    return {
      workspaceId: wsId,
      sheetName,
      year,
      month,
      key: `${wsId}|${sheetName}|${year}-${String(month).padStart(2, '0')}`,
    };
  }

  function periodLabel(year, month) {
    const name = $('toPeriodMonth')?.selectedOptions?.[0]?.textContent?.trim() || String(month);
    return `${name} ${year}`;
  }

  function setStatus(text, kind = 'sync') {
    const el = $('toPeriodStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `period-pill period-status${kind ? ` ${kind}` : ''}`;
  }

  async function syncSelectedPeriod({ force = false } = {}) {
    const selected = selection();
    if (!selected) return;
    if (!force && selected.key === lastSyncedKey) return;
    if (selected.key === inFlightKey) return;

    const token = authToken();
    if (!token) return;

    const currentVersion = ++requestVersion;
    inFlightKey = selected.key;
    setStatus(`${periodLabel(selected.year, selected.month)} · Sheets tanlanmoqda...`, 'sync');

    try {
      const response = await fetch(API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-workspace-id': selected.workspaceId,
        },
        body: JSON.stringify({
          year: selected.year,
          month: selected.month,
          sheetName: selected.sheetName,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (currentVersion !== requestVersion) return;

      const now = selection();
      if (!now || now.key !== selected.key) return;

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Google Sheets davrini tanlash xatosi');
      }

      const state = journalState();
      if (state) {
        state.periodYear = selected.year;
        state.periodMonth = selected.month;
        state.sheetName = clean(data.sheetName || selected.sheetName);
        state.sections = Array.isArray(data.sections) ? data.sections : [];
        state.totalItems = Number(data.totalItems) || 0;
      }

      lastSyncedKey = selected.key;
      observedKey = selected.key;

      if (window.ToJournalWorkspace?.openSelectedPeriod) {
        await window.ToJournalWorkspace.openSelectedPeriod({ fallbackToSource: true });
      } else {
        setStatus(`${periodLabel(selected.year, selected.month)} · Sheets tanlandi`, 'ok');
      }
    } catch (error) {
      if (currentVersion !== requestVersion) return;
      setStatus(`${periodLabel(selected.year, selected.month)} · ${error.message}`, 'bad');
    } finally {
      if (inFlightKey === selected.key) inFlightKey = '';
    }
  }

  function scheduleSync() {
    window.setTimeout(() => void syncSelectedPeriod(), 0);
  }

  function loadSignersPanel() {
    if (document.getElementById('toSignersPanelScript')) return;
    const script = document.createElement('script');
    script.id = 'toSignersPanelScript';
    script.src = '/js/to-signers-panel.js?v=to-signers1';
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadReportsPanel() {
    if (document.getElementById('toReportsPanelScript')) return;
    const script = document.createElement('script');
    script.id = 'toReportsPanelScript';
    script.src = '/js/to-reports-panel.js?v=to-reports1';
    script.defer = true;
    document.head.appendChild(script);
  }

  async function requestJson(path, options = {}) {
    const token = authToken();
    const wsId = workspaceId();
    if (!token) throw new Error('Workspace sessiyasi topilmadi');
    if (!wsId) throw new Error('Workspace tanlanmagan');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('x-workspace-id', wsId);
    if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(path, { ...options, headers, credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function persistPendingEditableField() {
    const target = pendingEditableField;
    pendingEditableField = null;
    const state = journalState();
    if (!state?.period || !(target instanceof HTMLElement)) return;
    const field = clean(target.dataset?.periodField);
    const row = target.closest?.('[data-period-item-id]');
    const itemId = clean(row?.dataset?.periodItemId);
    if (!field || !itemId) return;

    const data = await requestJson(
      `/api/to/periods/${state.periodYear}/${state.periodMonth}/items/${encodeURIComponent(itemId)}`,
      { method: 'PATCH', body: JSON.stringify({ [field]: target.value }) },
    );

    if (data.item && Array.isArray(state.periodItems)) {
      const index = state.periodItems.findIndex((item) => item.id === itemId);
      if (index >= 0) state.periodItems[index] = { ...state.periodItems[index], ...data.item };
    }
  }

  async function syncCurrentPeriodToSheet() {
    const state = journalState();
    if (!state?.period) return;
    await requestJson(`/api/to/periods/${state.periodYear}/${state.periodMonth}/sync-to-sheet`, {
      method: 'POST',
      body: '{}',
    });
    if (window.ToJournalWorkspace?.openSelectedPeriod) {
      await window.ToJournalWorkspace.openSelectedPeriod({ fallbackToSource: false });
    }
  }

  async function refreshReportsAfterSave(state) {
    const reports = window.ToJournalReports;
    if (!reports?.loadFolders) return;
    await reports.loadFolders();
    const modalOpen = $('toReportsModal')?.classList.contains('show');
    if (modalOpen && reports.openFolder) {
      await reports.openFolder(state.periodYear, state.periodMonth);
    }
  }

  async function saveCurrentDocument() {
    const state = journalState();
    const button = $('toDocumentSaveBtn');
    if (!state || !window.ToJournalWorkspace) return;
    if (!workspaceId()) {
      setStatus('Workspace tanlanmagan', 'bad');
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = '⏳ Сақланмоқда...';
    }

    try {
      await persistPendingEditableField();
      document.activeElement?.blur?.();

      if (!state.period) {
        await window.ToJournalWorkspace.createSelectedPeriod?.();
        if (!state.period) throw new Error('TO davri saqlanmadi');
      } else {
        await syncCurrentPeriodToSheet();
      }

      await refreshReportsAfterSave(state);
      if (button) button.textContent = '✓ Сақланди';
      setStatus(`${periodLabel(state.periodYear, state.periodMonth)} · 3. Хисоботлар га сақланди`, 'ok');
      window.setTimeout(() => {
        const current = $('toDocumentSaveBtn');
        if (current && !current.disabled) current.textContent = 'Сақлаш';
      }, 1400);
    } catch (error) {
      setStatus(`${periodLabel(state.periodYear, state.periodMonth)} · saqlash xatosi: ${error.message}`, 'bad');
      if (button) button.textContent = 'Сақлаш';
    } finally {
      if (button) button.disabled = false;
    }
  }

  function injectDocumentSaveControl() {
    if ($('toDocumentSaveBar')) return;
    const documentContainer = document.querySelector('.document-container');
    if (!documentContainer) return;

    if (!$('toDocumentSaveStyle')) {
      const style = document.createElement('style');
      style.id = 'toDocumentSaveStyle';
      style.textContent = `
        .to-document-save-bar{max-width:1400px;margin:14px auto 2px;display:flex;justify-content:flex-end;align-items:center;padding:0 2px;font-family:Arial,sans-serif}
        .to-document-save-btn{min-width:150px;padding:10px 24px;font-size:14px;box-shadow:0 8px 24px rgba(34,211,238,.18)}
        @media(max-width:760px){.to-document-save-bar{justify-content:stretch}.to-document-save-btn{width:100%}}
      `;
      document.head.appendChild(style);
    }

    const bar = document.createElement('div');
    bar.id = 'toDocumentSaveBar';
    bar.className = 'to-document-save-bar';
    const button = document.createElement('button');
    button.id = 'toDocumentSaveBtn';
    button.className = 'btn primary to-document-save-btn';
    button.type = 'button';
    button.textContent = 'Сақлаш';
    button.addEventListener('pointerdown', () => {
      const active = document.activeElement;
      pendingEditableField = active instanceof HTMLElement && active.dataset?.periodField ? active : null;
    });
    button.addEventListener('click', () => void saveCurrentDocument());
    bar.appendChild(button);
    documentContainer.insertAdjacentElement('afterend', bar);
  }

  function init() {
    $('toOpenPeriodBtn')?.remove();
    loadSignersPanel();
    loadReportsPanel();
    injectDocumentSaveControl();

    $('toPeriodMonth')?.addEventListener('change', scheduleSync);
    $('toPeriodYear')?.addEventListener('change', scheduleSync);
    $('toPrevPeriodBtn')?.addEventListener('click', scheduleSync);
    $('toNextPeriodBtn')?.addEventListener('click', scheduleSync);

    window.setInterval(() => {
      const selected = selection();
      if (!selected) return;
      if (!observedKey) {
        observedKey = selected.key;
        return;
      }
      if (selected.key !== observedKey) {
        observedKey = selected.key;
        void syncSelectedPeriod();
      }
    }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.ToPeriodSheetBridge = {
    sync: () => syncSelectedPeriod({ force: true }),
    save: saveCurrentDocument,
  };
})();