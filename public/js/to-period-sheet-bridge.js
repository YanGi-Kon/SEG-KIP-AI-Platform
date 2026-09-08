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

      // Mavjud DB davri bo‘lsa — shu davrni ochadi.
      // DB davri hali yaratilmagan bo‘lsa — endpointdan qaytgan yangi Sheets snapshotini ko‘rsatadi.
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

  function init() {
    // Davr oy/yil tanlanganda avtomatik ochiladi, shuning uchun alohida "Открыть" tugmasi kerak emas.
    $('toOpenPeriodBtn')?.remove();

    $('toPeriodMonth')?.addEventListener('change', scheduleSync);
    $('toPeriodYear')?.addEventListener('change', scheduleSync);

    // ← / → tugmalari selector qiymatini JavaScript orqali o‘zgartiradi,
    // shuning uchun change hodisasidan tashqari clickdan keyin ham sinxronlaymiz.
    $('toPrevPeriodBtn')?.addEventListener('click', scheduleSync);
    $('toNextPeriodBtn')?.addEventListener('click', scheduleSync);

    // Workspace yuklanganda oxirgi davr selectorlar orqali dasturiy o‘rnatilishi mumkin.
    // Tarmoq so‘rovi faqat qiymat real o‘zgarganida yuboriladi.
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
  };
})();