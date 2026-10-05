(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  let hidden = false;

  function setStatus(message){
    const el = document.getElementById('segAppLoaderStatus');
    if (el && message) el.textContent = String(message);
  }

  function show(message){
    hidden = false;
    const el = root();
    if (!el) return;
    if (message) setStatus(message);
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function hide(){
    if (hidden) return;
    hidden = true;
    const el = root();
    if (!el) return;
    el.classList.add('is-hidden');
    el.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => {
      if (hidden) el.style.display = 'none';
    }, 420);
  }

  window.addEventListener('seg:auth-ready', hide, { once: true });
  window.addEventListener('seg:login-ready', hide, { once: true });

  // Failsafe: never block the interface forever if an unexpected boot error occurs.
  window.setTimeout(() => {
    if (!hidden) hide();
  }, 12000);

  window.segAppLoader = { show, hide, setStatus };
})();
