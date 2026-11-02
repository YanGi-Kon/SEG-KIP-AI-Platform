(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const MAX_LOADER_MS = 10000;
  const QUIET_RELOAD_KEY = 'seg_quiet_reload_once';
  let hidden = true;
  let booting = true;
  let busy = false;
  let suppressBusyUntilClear = false;
  let busyTimer = 0;
  let suppressReload = window.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload';
  // Some embedded browsers report a manual reload as a regular navigation.
  // Carry a one-shot marker over the navigation so it stays quiet in those browsers too.
  try {
    if (window.sessionStorage.getItem(QUIET_RELOAD_KEY) === '1') suppressReload = true;
    window.sessionStorage.removeItem(QUIET_RELOAD_KEY);
  } catch (_) {}
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    try { window.sessionStorage.setItem(QUIET_RELOAD_KEY, '1'); } catch (_) {}
  }, { once:true });

  // Refresh remains quiet until the user starts an operation.
  const resumeOperations = () => {
    suppressReload = false;
    try { window.sessionStorage.removeItem(QUIET_RELOAD_KEY); } catch (_) {}
  };
  window.addEventListener('pointerdown', resumeOperations, { once:true, passive:true });
  window.addEventListener('keydown', resumeOperations, { once:true });

  function setStatus(message){
    const el = document.getElementById('segAppLoaderStatus');
    if (el && message) el.textContent = String(message);
  }

  function show(message){
    if (suppressReload) return;
    hidden = false;
    const el = root();
    if (!el) return;
    if (message) setStatus(message);
    el.style.display = 'grid';
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden','false');
  }

  function hide(force = false){
    booting = false;
    if (force) busy = false;
    if (busy) return;
    if (hidden) return;
    hidden = true;
    const el = root();
    if (!el) return;
    el.classList.add('is-hidden');
    el.setAttribute('aria-hidden','true');
    window.setTimeout(() => {
      if (hidden) el.style.display = 'none';
    }, 420);
  }

  function clearBusyTimer(){
    if (!busyTimer) return;
    window.clearTimeout(busyTimer);
    busyTimer = 0;
  }

  function expireBusy(){
    clearBusyTimer();
    busy = false;
    suppressBusyUntilClear = true;
    hide(true);
  }

  window.addEventListener('seg:auth-ready', () => hide(), { once:true });
  window.addEventListener('seg:login-ready', () => {
    clearBusyTimer();
    busy = false;
    suppressBusyUntilClear = false;
    hide();
  });

  window.setTimeout(() => {
    if (!hidden || busy) expireBusy();
    else booting = false;
  }, MAX_LOADER_MS);

  function setBusy(value){
    if (suppressReload) { clearBusyTimer(); busy = false; hide(true); return; }
    // Background modules must not cover the manual login screen.
    const nextBusy = Boolean(value) && !document.getElementById('sanegLoginGate');
    if (!nextBusy) {
      clearBusyTimer();
      busy = false;
      suppressBusyUntilClear = false;
      if (!booting) hide();
      return;
    }
    if (busy || suppressBusyUntilClear) return;
    busy = true;
    show('Sanegplatform yuklanmoqda...');
    busyTimer = window.setTimeout(expireBusy, MAX_LOADER_MS);
  }

  window.segAppLoader = { show, hide, setStatus, setBusy };
})();
