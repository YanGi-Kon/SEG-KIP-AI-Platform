(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  let hidden = false;
  let booting = true;
  let busy = false;

  function setStatus(message){
    const el = document.getElementById('segAppLoaderStatus');
    if (el && message) el.textContent = String(message);
  }

  function show(message){
    hidden = false;
    const el = root();
    if (!el) return;
    if (message) setStatus(message);
    el.style.display = 'grid';
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden','false');
  }

  function hide(){
    booting = false;
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

  window.addEventListener('seg:auth-ready', hide, { once:true });
  window.addEventListener('seg:login-ready', () => { busy = false; hide(); });

  window.setTimeout(() => {
    if (!hidden) hide();
  }, 12000);

  function setBusy(value){
    if (busy === Boolean(value)) return;
    // Background modules must not cover the manual login screen.
    busy = Boolean(value) && !document.getElementById('sanegLoginGate');
    if (busy) show('Sanegplatform yuklanmoqda...');
    else if (!booting) hide();
  }

  window.segAppLoader = { show, hide, setStatus, setBusy };
})();
