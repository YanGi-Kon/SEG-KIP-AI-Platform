(() => {
  'use strict';

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const WORKSPACE_ID_KEY = 'seg_kip_selected_workspace_id';
  const WORKSPACE_TOKEN_KEY = 'seg_kip_workspace_access_token';
  const ADMIN_TOKEN_KEY = 'seg_kip_admin_jwt';
  const API_PATH = '/api/hisobot-period/select';
  const PERIOD_STORAGE_PREFIX = 'seg_hisobot_period_v1';
  const PERIOD_CACHE_PROPERTY = '__segKipHisobotPeriodCacheV1';
  const PERIOD_CACHE_DB = 'seg-kip-hisobot-period-cache-v1';
  const PERIOD_CACHE_STORE = 'periods';
  const REQUEST_TIMEOUT_MS = 20_000;

  let canonicalSheets = null;
  let canonicalRoutes = null;
  let periodBaseSheet = '';
  let periodYear = 2026;
  let periodMonth = 1;
  let requestVersion = 0;
  let busy = false;
  let initialized = false;
  let rawFetchState = null;
  let forceNextPeriodRequest = false;
  let periodCacheDbPromise = null;

  const byId = (id) => document.getElementById(id);
  const clean = (value) => String(value ?? '').trim();
  const escHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const hardNorm = (value) => clean(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/ё/g, 'е')
    .toLowerCase()
    .replace(/[\s\-_.,:;()"'`«»№#\/]+/g, '');

  function parentStorage(store, key) {
    try {
      return parent?.[store]?.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function workspaceIdValue() {
    try {
      return clean(localStorage.getItem(WORKSPACE_ID_KEY) || parentStorage('localStorage', WORKSPACE_ID_KEY));
    } catch (_) {
      return clean(parentStorage('localStorage', WORKSPACE_ID_KEY));
    }
  }

  function authToken() {
    try {
      return clean(
        sessionStorage.getItem(WORKSPACE_TOKEN_KEY)
        || parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY)
        || sessionStorage.getItem(ADMIN_TOKEN_KEY)
        || parentStorage('sessionStorage', ADMIN_TOKEN_KEY),
      );
    } catch (_) {
      return clean(parentStorage('sessionStorage', WORKSPACE_TOKEN_KEY) || parentStorage('sessionStorage', ADMIN_TOKEN_KEY));
    }
  }

  function periodStorageKey(workspaceId = workspaceIdValue()) {
    const wid = clean(workspaceId);
    return wid ? `${PERIOD_STORAGE_PREFIX}:${wid}` : '';
  }

  function readSavedPeriod(workspaceId = workspaceIdValue()) {
    const key = periodStorageKey(workspaceId);
    if (!key) return null;
    let raw = '';
    try { raw = localStorage.getItem(key) || parentStorage('localStorage', key); } catch (_) { raw = parentStorage('localStorage', key); }
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw);
      const year = Number(saved?.year);
      const month = Number(saved?.month);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
      if (!Number.isInteger(month) || month < 1 || month > 12) return null;
      return { year, month };
    } catch (_) {
      return null;
    }
  }

  function writeSavedPeriod(year = periodYear, month = periodMonth, workspaceId = workspaceIdValue()) {
    const key = periodStorageKey(workspaceId);
    const safeYear = Number(year);
    const safeMonth = Number(month);
    if (!key || !Number.isInteger(safeYear) || !Number.isInteger(safeMonth) || safeMonth < 1 || safeMonth > 12) return;
    const value = JSON.stringify({ year: safeYear, month: safeMonth });
    try { localStorage.setItem(key, value); } catch (_) {}
    try {
      if (parent && parent !== window) parent.localStorage?.setItem(key, value);
    } catch (_) {}
  }

  function restoreSavedPeriod(workspaceId = workspaceIdValue()) {
    const saved = readSavedPeriod(workspaceId);
    if (!saved) return false;
    periodYear = saved.year;
    periodMonth = saved.month;
    updateControls();
    return true;
  }

  function periodCacheHost() {
    try {
      return parent && parent !== window ? parent : window;
    } catch (_) {
      return window;
    }
  }

  function periodCacheKey(workspaceId = workspaceIdValue(), year = periodYear, month = periodMonth) {
    const wid = clean(workspaceId);
    const safeYear = Number(year);
    const safeMonth = Number(month);
    if (!wid || !Number.isInteger(safeYear) || !Number.isInteger(safeMonth)) return '';
    return `${wid}|${safeYear}-${String(safeMonth).padStart(2, '0')}`;
  }

  function stateSignature() {
    if (typeof state === 'undefined' || !state) return '';
    const spreadsheetId = clean(state.spreadsheetId);
    const version = Number(state.version || 0);
    const updatedAt = clean(state.updatedAt);
    return spreadsheetId && updatedAt ? `${spreadsheetId}|${version}|${updatedAt}` : '';
  }

  function periodCache() {
    const host = periodCacheHost();
    try {
      if (!host[PERIOD_CACHE_PROPERTY]) host[PERIOD_CACHE_PROPERTY] = Object.create(null);
      return host[PERIOD_CACHE_PROPERTY];
    } catch (_) {
      return null;
    }
  }

  function openPeriodCacheDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (periodCacheDbPromise) return periodCacheDbPromise;
    periodCacheDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(PERIOD_CACHE_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PERIOD_CACHE_STORE)) {
          db.createObjectStore(PERIOD_CACHE_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return periodCacheDbPromise;
  }

  async function readPersistentPeriod(key) {
    const db = await openPeriodCacheDb();
    if (!db || !key) return null;
    return new Promise((resolve) => {
      const request = db.transaction(PERIOD_CACHE_STORE, 'readonly').objectStore(PERIOD_CACHE_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function writePersistentPeriod(entry) {
    const db = await openPeriodCacheDb();
    if (!db || !entry?.key) return;
    await new Promise((resolve) => {
      const request = db.transaction(PERIOD_CACHE_STORE, 'readwrite').objectStore(PERIOD_CACHE_STORE).put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  async function deletePersistentPeriods(workspaceId) {
    const db = await openPeriodCacheDb();
    const prefix = `${clean(workspaceId)}|`;
    if (!db || !clean(workspaceId)) return;
    await new Promise((resolve) => {
      const transaction = db.transaction(PERIOD_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(PERIOD_CACHE_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  function rememberPeriodData(data) {
    const key = periodCacheKey(
      workspaceIdValue(),
      Number(data?.selector?.year || periodYear),
      Number(data?.selector?.month || periodMonth),
    );
    const cache = periodCache();
    if (!key) return;
    const prefix = `${workspaceIdValue()}|`;
    if (cache) {
      Object.keys(cache).forEach((cachedKey) => {
        if (cachedKey.startsWith(prefix) && cachedKey !== key) delete cache[cachedKey];
      });
    }
    const entry = {
      key,
      workspaceId: workspaceIdValue(),
      data,
      stateSignature: stateSignature(),
    };
    if (cache) cache[key] = entry;
    void writePersistentPeriod(entry);
  }

  async function restoreCachedPeriod() {
    const key = periodCacheKey();
    const memoryCache = periodCache();
    const cached = key ? (memoryCache?.[key] || await readPersistentPeriod(key)) : null;
    if (!cached?.data) return false;
    if (!cached.stateSignature || cached.stateSignature !== stateSignature()) {
      if (memoryCache) delete memoryCache[key];
      void deletePersistentPeriods(workspaceIdValue());
      return false;
    }
    if (memoryCache) memoryCache[key] = cached;
    applyPeriodData(cached.data);
    setPeriodStatus(`✓ ${cached.data.selector?.monthName || MONTHS[periodMonth - 1]} ${cached.data.selector?.year || periodYear}`, 'ok');
    return true;
  }

  function clearPeriodCache(workspaceId = workspaceIdValue()) {
    const prefix = `${clean(workspaceId)}|`;
    const cache = periodCache();
    if (!clean(workspaceId)) return;
    if (cache) {
      Object.keys(cache).forEach((key) => {
        if (key.startsWith(prefix)) delete cache[key];
      });
    }
    void deletePersistentPeriods(workspaceId);
  }

  function isMasterRouteLocal(route) {
    return Boolean(
      route?.isMasterJournal
      || route?.kind === 'master-journal'
      || hardNorm(route?.title) === 'журнал'
      || (periodBaseSheet && hardNorm(route?.sheet) === hardNorm(periodBaseSheet)),
    );
  }

  function periodLabel() {
    return `${MONTHS[periodMonth - 1] || periodMonth} ${periodYear}`;
  }

  function setPeriodStatus(text, kind = 'sync') {
    const el = byId('hisobotPeriodStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `hisobot-period-status ${kind}`;
  }

  function ensureYearOption(year) {
    const select = byId('hisobotPeriodYear');
    if (!select) return;
    if (Array.from(select.options).some((option) => Number(option.value) === Number(year))) return;
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  }

  function updateControls() {
    const month = byId('hisobotPeriodMonth');
    const year = byId('hisobotPeriodYear');
    ensureYearOption(periodYear);
    if (month) month.value = String(periodMonth);
    if (year) year.value = String(periodYear);
  }

  function injectStyles() {
    if (byId('hisobotPeriodBridgeStyle')) return;
    const style = document.createElement('style');
    style.id = 'hisobotPeriodBridgeStyle';
    style.textContent = `
      .hisobot-period-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;border:1px solid rgba(34,211,238,.28);background:rgba(2,8,23,.74);border-radius:13px;padding:5px 7px}
      .hisobot-period-controls .btn{padding:9px 12px;min-width:40px;border-radius:10px}
      .hisobot-period-select{min-width:96px;background:#061120;color:#eaf8ff;border:1px solid rgba(255,255,255,.17);border-radius:10px;padding:9px 11px;font-size:13px;font-weight:800;outline:none;cursor:pointer}
      .hisobot-period-select.year{min-width:82px}
      .hisobot-period-status{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:7px 11px;border-radius:10px;border:1px solid rgba(34,211,238,.24);font-size:12px;font-weight:900;white-space:nowrap;color:#fde68a;background:rgba(15,23,42,.72)}
      .hisobot-period-status.ok{color:#86efac}.hisobot-period-status.bad{color:#fca5a5}.hisobot-period-status.sync{color:#fde68a}
      @media(max-width:760px){.hisobot-period-controls{width:100%}.hisobot-period-select{flex:1}.hisobot-period-status{order:5;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function injectControls() {
    const oldSelector = byId('routeSelect');
    if (oldSelector) oldSelector.remove();
    if (byId('hisobotPeriodControls')) return;

    const toolbar = document.querySelector('#menuView .toolbar');
    if (!toolbar) return;
    const host = document.createElement('div');
    host.id = 'hisobotPeriodControls';
    host.className = 'hisobot-period-controls';
    host.setAttribute('aria-label', 'HISOBOT JURNALI oylik davr boshqaruvi');

    const now = new Date();
    const startYear = Math.min(2026, now.getFullYear()) - 3;
    const endYear = Math.max(2026, now.getFullYear()) + 5;
    host.innerHTML = `
      <button id="hisobotPrevPeriodBtn" class="btn" type="button" title="Oldingi oy">←</button>
      <select id="hisobotPeriodMonth" class="hisobot-period-select" aria-label="Oy">${MONTHS.map((name, index) => `<option value="${index + 1}">${name}</option>`).join('')}</select>
      <select id="hisobotPeriodYear" class="hisobot-period-select year" aria-label="Yil">${Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index).map((year) => `<option value="${year}">${year}</option>`).join('')}</select>
      <span id="hisobotPeriodStatus" class="hisobot-period-status sync">Давр юкланмоқда...</span>
      <button id="hisobotNextPeriodBtn" class="btn" type="button" title="Keyingi oy">→</button>
    `;

    const search = byId('search');
    if (search) search.insertAdjacentElement('afterend', host);
    else toolbar.appendChild(host);

    byId('hisobotPeriodMonth')?.addEventListener('change', () => void selectFromControls());
    byId('hisobotPeriodYear')?.addEventListener('change', () => void selectFromControls());
    byId('hisobotPrevPeriodBtn')?.addEventListener('click', () => void navigatePeriod(-1));
    byId('hisobotNextPeriodBtn')?.addEventListener('click', () => void navigatePeriod(1));
  }

  function readControls() {
    const year = Number(byId('hisobotPeriodYear')?.value || periodYear);
    const month = Number(byId('hisobotPeriodMonth')?.value || periodMonth);
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) periodYear = year;
    if (Number.isInteger(month) && month >= 1 && month <= 12) periodMonth = month;
  }

  function captureCanonical(force = false) {
    if (typeof state === 'undefined' || !state) return;
    if (!force && state.__hisobotPeriodApplied) return;
    canonicalSheets = state.sheets || {};
    canonicalRoutes = Array.isArray(state.routes) ? state.routes : [];
    state.__hisobotPeriodApplied = false;
  }

  function routeLocationKeys(route) {
    const sourceRows = canonicalSheets?.[route?.sheet] || [];
    return new Set(sourceRows.map((row) => hardNorm(row?.location)).filter(Boolean));
  }

  function fallbackRouteMatch(route, row) {
    const location = hardNorm(row?.location);
    if (!location) return false;
    const routeSheet = hardNorm(route?.sheet);
    const routeTitle = hardNorm(String(route?.title || '').replace(/[📊📍📘]/g, ''));
    return Boolean(
      (routeSheet && (location.includes(routeSheet) || routeSheet.includes(location)))
      || (routeTitle && (location.includes(routeTitle) || routeTitle.includes(location))),
    );
  }

  function applyPeriodData(data) {
    if (typeof state === 'undefined' || !state) return;
    if (!canonicalSheets || !canonicalRoutes) captureCanonical(true);

    periodBaseSheet = clean(data?.baseSheet || periodBaseSheet || 'База');
    periodYear = Number(data?.selector?.year || periodYear);
    periodMonth = Number(data?.selector?.month || periodMonth);
    updateControls();
    writeSavedPeriod(periodYear, periodMonth);

    const baseRows = Array.isArray(data?.rows) ? data.rows : [];
    const routes = Array.isArray(canonicalRoutes) ? canonicalRoutes : [];
    const periodSheets = {};

    for (const route of routes) {
      let filteredRows;
      if (isMasterRouteLocal(route)) {
        filteredRows = baseRows;
      } else {
        const locations = routeLocationKeys(route);
        filteredRows = locations.size
          ? baseRows.filter((row) => locations.has(hardNorm(row?.location)))
          : baseRows.filter((row) => fallbackRouteMatch(route, row));
      }
      periodSheets[route.sheet] = filteredRows;
    }
    periodSheets[periodBaseSheet] = baseRows;

    state.sheets = periodSheets;
    state.routes = routes.map((route) => ({
      ...route,
      count: (periodSheets[route.sheet] || []).length,
      periodYear,
      periodMonth,
    }));
    state.periodYear = periodYear;
    state.periodMonth = periodMonth;
    state.periodMonthName = MONTHS[periodMonth - 1] || '';
    state.periodBaseSheet = periodBaseSheet;
    state.__hisobotPeriodApplied = true;

    if (typeof currentSheet !== 'undefined' && currentSheet) {
      state.rows = periodSheets[currentSheet] || [];
    }
    if (typeof renderAll === 'function') renderAll();
  }

  async function requestPeriod({ fromSheet = false, forceRefresh = false } = {}) {
    if (busy) return;
    const token = authToken();
    const wid = workspaceIdValue();
    if (!token || !wid) {
      setPeriodStatus('Workspace sessiyasi kutilmoqda...', 'sync');
      return;
    }

    readControls();
    const currentVersion = ++requestVersion;
    busy = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setPeriodStatus(`${periodLabel()} · Sheets синхронланмоқда...`, 'sync');

    try {
      const requestBody = {
        stateVersion: Number(typeof state !== 'undefined' ? state?.version : 0) || 0,
        stateUpdatedAt: clean(typeof state !== 'undefined' ? state?.updatedAt : ''),
        ...(fromSheet ? {} : { year: periodYear, month: periodMonth }),
        ...(forceRefresh ? { forceRefresh: true } : {}),
      };
      const response = await fetch(API_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-workspace-id': wid,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (currentVersion !== requestVersion) return;
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      applyPeriodData(data);
      rememberPeriodData(data);
      setPeriodStatus(`✓ ${data.selector?.monthName || MONTHS[periodMonth - 1]} ${data.selector?.year || periodYear}`, 'ok');
    } catch (error) {
      if (currentVersion !== requestVersion) return;
      const message = error?.name === 'AbortError'
        ? 'Google Sheets 20 soniyada javob bermadi. Qayta urinib ko‘ring.'
        : error.message;
      setPeriodStatus(`Хато: ${message}`, 'bad');
    } finally {
      window.clearTimeout(timeoutId);
      if (currentVersion === requestVersion) busy = false;
    }
  }

  async function selectFromControls() {
    readControls();
    await requestPeriod({ fromSheet: false });
  }

  async function navigatePeriod(delta) {
    readControls();
    const absolute = periodYear * 12 + (periodMonth - 1) + Number(delta || 0);
    periodYear = Math.floor(absolute / 12);
    periodMonth = ((absolute % 12) + 12) % 12 + 1;
    updateControls();
    await requestPeriod({ fromSheet: false });
  }

  function renderRoutesWithoutLegacySelector() {
    if (typeof state === 'undefined' || !state) return;
    const el = byId('routes');
    if (!el) return;
    const q = (byId('search')?.value || '').toLowerCase();
    const routes = (state.routes || []).filter((route) => !q || [route.title, route.sheet, route.sourceCell].join(' ').toLowerCase().includes(q));
    if (!state.routes?.length) {
      el.innerHTML = '<div class="panel empty">Dynamic Route Map topilmadi. Asosiy varoqdagi C9:Q49 blokida HYPERLINK yoki varoq nomi bo‘lishi kerak.</div>';
      return;
    }
    if (!routes.length) {
      el.innerHTML = '<div class="panel empty">Qidiruv bo‘yicha menyu topilmadi.</div>';
      return;
    }
    const selectedSheet = typeof currentSheet !== 'undefined' ? currentSheet : '';
    el.innerHTML = routes.map((route) => {
      const master = isMasterRouteLocal(route);
      const title = master ? '📘 ЖУРНАЛ' : route.title;
      const sub = master ? 'Умумий журнал: База' : `Варақ: <b>${escHtml(route.sheet)}</b>`;
      return `<div class="card ${route.sheet === selectedSheet ? 'active' : ''}" onclick="selectRoute('${escHtml(route.sheet)}')"><h3>${escHtml(title)}</h3><div class="small">${sub}</div><div style="margin-top:10px"><span class="badge">${Number(route.count) || 0} ta yozuv</span></div><div class="small" style="margin-top:8px">${escHtml(route.status || '')}</div></div>`;
    }).join('');
  }

  function installRouteRenderer() {
    try {
      if (typeof renderRoutes === 'function') renderRoutes = renderRoutesWithoutLegacySelector;
    } catch (_) {
      globalThis.renderRoutes = renderRoutesWithoutLegacySelector;
    }
  }

  function wrapJournalLifecycle() {
    if (typeof fetchState === 'function' && !fetchState.__hisobotPeriodWrapped) {
      const originalFetchState = fetchState;
      rawFetchState = originalFetchState;
      const wrapped = async function(...args) {
        const result = await originalFetchState(...args);
        if (typeof state === 'undefined' || !state?.connected) {
          setPeriodStatus('Workspace sessiyasi kutilmoqda...', 'sync');
          return result;
        }
        captureCanonical(true);
        const restored = restoreSavedPeriod();
        const forceRequest = forceNextPeriodRequest;
        forceNextPeriodRequest = false;
        if (!forceRequest && restored && await restoreCachedPeriod()) return result;
        await requestPeriod({ fromSheet: !restored });
        return result;
      };
      wrapped.__hisobotPeriodWrapped = true;
      fetchState = wrapped;
    }

    if (typeof syncNow === 'function' && !syncNow.__hisobotPeriodWrapped) {
      const originalSyncNow = syncNow;
      const wrapped = async function(...args) {
        const result = await originalSyncNow(...args);
        captureCanonical(true);
        await requestPeriod({ fromSheet: false });
        return result;
      };
      wrapped.__hisobotPeriodWrapped = true;
      syncNow = wrapped;
    }

    if (typeof activateWorkspace === 'function' && !activateWorkspace.__hisobotPeriodWrapped) {
      const originalActivateWorkspace = activateWorkspace;
      const wrapped = async function(...args) {
        const nextWorkspaceId = clean(args[0]);
        const currentWorkspaceId = typeof activeWorkspaceId !== 'undefined'
          ? clean(activeWorkspaceId)
          : workspaceIdValue();
        const workspaceChanged = Boolean(nextWorkspaceId && nextWorkspaceId !== currentWorkspaceId);
        if (workspaceChanged) {
          clearPeriodCache(nextWorkspaceId);
          forceNextPeriodRequest = true;
        }
        canonicalSheets = null;
        canonicalRoutes = null;
        periodBaseSheet = '';
        requestVersion += 1;
        busy = false;
        const result = await originalActivateWorkspace(...args);
        restoreSavedPeriod();
        return result;
      };
      wrapped.__hisobotPeriodWrapped = true;
      activateWorkspace = wrapped;
    }

    if (typeof saveRow === 'function' && !saveRow.__hisobotPeriodWrapped) {
      const originalSaveRow = saveRow;
      const wrapped = async function(...args) {
        const routeSheet = typeof currentSheet !== 'undefined' ? currentSheet : '';
        const row = typeof editing !== 'undefined' ? editing?.row : null;
        const baseRow = Number(row?._periodBaseRowNumber || 0);
        if (baseRow && periodBaseSheet && typeof currentSheet !== 'undefined') {
          currentSheet = periodBaseSheet;
          row._rowNumber = baseRow;
        }
        try {
          await originalSaveRow(...args);
        } finally {
          if (typeof currentSheet !== 'undefined') currentSheet = routeSheet;
        }
        if (rawFetchState) await rawFetchState(workspaceIdValue());
        captureCanonical(true);
        await requestPeriod({ fromSheet: false });
      };
      wrapped.__hisobotPeriodWrapped = true;
      saveRow = wrapped;
    }

    if (typeof removeRow === 'function' && !removeRow.__hisobotPeriodWrapped) {
      const originalRemoveRow = removeRow;
      const wrapped = async function(rowNumber, ...args) {
        const routeSheet = typeof currentSheet !== 'undefined' ? currentSheet : '';
        if (periodBaseSheet && typeof currentSheet !== 'undefined') currentSheet = periodBaseSheet;
        try {
          await originalRemoveRow(rowNumber, ...args);
        } finally {
          if (typeof currentSheet !== 'undefined') currentSheet = routeSheet;
        }
        if (rawFetchState) await rawFetchState(workspaceIdValue());
        captureCanonical(true);
        await requestPeriod({ fromSheet: false });
      };
      wrapped.__hisobotPeriodWrapped = true;
      removeRow = wrapped;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    injectStyles();
    installRouteRenderer();
    injectControls();
    wrapJournalLifecycle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.HisobotPeriodBridge = {
    refresh: () => requestPeriod({ fromSheet: false, forceRefresh: true }),
    loadFromSheet: () => requestPeriod({ fromSheet: true }),
  };
})();
