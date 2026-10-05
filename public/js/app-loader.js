(function installSegAppLoader(){
  if (window.__segAppLoaderInstalled) return;
  window.__segAppLoaderInstalled = true;

  const root = () => document.getElementById('segAppLoader');
  const PUMP_PARTS = [
    '/assets/loader/pumpjack-real-0.txt',
    '/assets/loader/pumpjack-real-1.txt',
    '/assets/loader/pumpjack-real-2.txt',
    '/assets/loader/pumpjack-real-3.txt',
  ];

  async function hydratePumpImage(){
    const img = document.getElementById('segLoaderPumpImg');
    if (!img || img.dataset.ready === '1') return;
    try {
      const chunks = await Promise.all(PUMP_PARTS.map(async (url) => {
        const res = await fetch(url, { cache:'no-store' });
        if (!res.ok) throw new Error('loader asset ' + res.status);
        return (await res.text()).trim();
      }));
      img.src = 'data:image/webp;base64,' + chunks.join('');
      img.dataset.ready = '1';
      img.classList.add('is-ready');
    } catch (error) {
      console.warn('[loader] realistic pumpjack asset failed', error);
    }
  }
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
    el.style.display = 'grid';
    el.classList.remove('is-hidden');
    el.setAttribute('aria-hidden', 'false');
    void hydratePumpImage();
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

  void hydratePumpImage();
  window.segAppLoader = { show, hide, setStatus };
})();
